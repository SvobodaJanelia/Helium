import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { cloneDeep } from 'lodash';
import { BehaviorSubject ,  NEVER, Observable, timer } from 'rxjs';
import { distinctUntilChanged, map, mapTo, switchMap, tap } from 'rxjs/operators';
import { SessionPing } from '../../common/api';
import { AuthData } from '../auth-data/auth-data.interface';
import { StorageService } from '../storage/storage.service';

/**
 * A service that manages the current API key and its expiration.
 */
@Injectable()
export class AuthService {
    public static readonly KEY_API_KEY = 'apiKey';
    public static readonly KEY_EXPIRATION = 'expiration';
    public static readonly KEY_USERNAME = 'username';
    public static readonly KEY_HOST = 'host';

    protected authData$: BehaviorSubject<AuthData | null> = new BehaviorSubject(null);

    private _lastValidAuthData: AuthData | null = null;

    /** The last valid auth data, or null if the user has never logged in */
    public get lastValidAuthData() { return this._lastValidAuthData; }

    /** Emits false when the session expires */
    private expiration$: Observable<boolean>;

    public constructor(private http: HttpClient, private storage: StorageService) {
        // Load previously stored data
        if (this.storage.hasAll(AuthService.KEY_API_KEY,
            AuthService.KEY_EXPIRATION, AuthService.KEY_HOST, AuthService.KEY_USERNAME)) {

            // Parse the expiration key as a base 10 int
            const expiration = parseInt(this.storage.get(AuthService.KEY_EXPIRATION)!!, 10);

            // Create a null AuthData if the stored data is already expired,
            // otherwise pull data from the storage provider
            const data: AuthData | null = expiration < Date.now() ? null : {
                apiKey: this.storage.get(AuthService.KEY_API_KEY)!!,
                expiration: new Date(parseInt(this.storage.get(AuthService.KEY_EXPIRATION)!!, 10)),
                username: this.storage.get(AuthService.KEY_USERNAME)!!,
                host: this.storage.get(AuthService.KEY_HOST)!!
            };

            // Update the BehaviorSubject. If data is null, will also remove the
            // stored data from the storage provider
            this.update(data);
        }

        this.expiration$ = this.authData$.pipe(
            map((data) => data === null ? null : data.expiration),
            distinctUntilChanged(),
            // Switch to a new timer Observable every time we get a new
            // expiration. Never emit when not authenticated.
            switchMap((exp: Date | null) => exp === null ? NEVER : timer(exp)),
            // Always emits false
            mapTo(false)
        );
    }

    /** Returns true if there is an unexpired API key on file */
    public get loggedIn(): boolean {
        const data = this.authData$.getValue();

        // No stored key
        if (data === null)
            return false;

        // There is a stored key, but its expired
        if (data.expiration.getTime() < Date.now()) {
            this.update(null);
            return false;
        }

        // There's an unexpired key
        return true;
    }

    public get current(): AuthData | null { return this.authData$.getValue(); }

    /** The current API key, or null if there is none */
    public get apiKey(): string | null {
        const data = this.authData$.getValue();
        return data === null ? null : data.apiKey;
    }

    /** The expiration date of the API key, or null if there is none */
    public get expiration(): Date | null {
        const data = this.authData$.getValue();
        return data === null ? null : data.expiration;
    }

    /** Returns the API key, or throws an Error if there is none. */
    public requireApiKey(): string {
        if (this.apiKey === null)
            throw new Error('Expected an API key, found nothing');
        return this.apiKey;
    }

    /** Attempts to log in using the given connection configuration */
    public login(data: { username: string, password: string, host: string }) {
        // Make a copy of the given data
        const postData: any = cloneDeep(data);

        // Try to detect a port provided in the host. Data should already be
        // validated from the LoginComponent
        if (postData.host.indexOf(':') > 0) {
            const parts = postData.host.split(':');
            postData.host = parts[0];
            postData.port = parts[1];
        }

        // Specify observe: 'response' to get the full response, not just the
        // body
        return this.http.post('/api/v1/login', postData, { observe: 'response' }).pipe(
            map((res: HttpResponse<{ apiKey: string }>): AuthData => {
                // This is the unix epoch time at which the session expires
                const expiration = res.headers.get('X-Session-Expiration');

                if (expiration === null)
                    throw new Error('X-Session-Expiration header not present');

                return {
                    apiKey: res.body!!.apiKey,
                    expiration: new Date(parseInt(expiration, 10)),
                    username: data.username,
                    host: data.host
                };
            }),
            tap((parsed) => this.update(parsed))
        );
    }

    /**
     * Pings the API to test if the session is still active. Updates the current
     * auth data with the expiration returned.
     */
    public ping(): Observable<SessionPing> {
        return (this.http.get('/api/v1/ping', {
            headers: {
                'X-API-Key': this.requireApiKey()
            }
        }) as Observable<SessionPing>).pipe(
            tap((ping: SessionPing) => {
                // The session has expired underneath our noses
                if (!ping.validApiKey && this.apiKey !== null)
                    this.update(null);

                // Sync the expiration time if necessary
                if (ping.validApiKey &&
                    ping.expiresAt &&
                    this.expiration &&
                    this.expiration.getTime() !== ping.expiresAt)

                    this.updateExpiration(ping.expiresAt);
            })
        );
    }

    /** Removes all stored authentication data */
    public logout() {
        this.update(null);
    }

    /**
     * Returns an observable that listens to changes in the API key and its
     * expiration. When the user logs in, the Observable with yield true, and
     * the opposite when the user logs out.
     */
    public watchAuthState(): Observable<boolean> {
        // Each response received by ApiService updates the expiration, and
        // therefore updates the observable. Make sure to only listen for
        // distinct values to prevent an infinite loop.
        return this.authData$.pipe(
            map((data) => data !== null),
            distinctUntilChanged()
        );
    }

    /** Emits false when the session expires */
    public expirationTimer() { return this.expiration$; }

    /** Updates the storage service and the BehaviorSubject */
    public update(data: AuthData | null) {
        if (data === null) {
            // Might have to change this if we start storing other data
            this.storage.clear();
            const keys = [
                AuthService.KEY_API_KEY,
                AuthService.KEY_EXPIRATION,
                AuthService.KEY_HOST,
                AuthService.KEY_USERNAME
            ];
            for (const key of keys)
                this.storage.delete(key);
        } else {
            this.storage.set(AuthService.KEY_API_KEY, data.apiKey);
            this.storage.set(AuthService.KEY_EXPIRATION, String(data.expiration.getTime()));
            this.storage.set(AuthService.KEY_HOST, data.host);
            this.storage.set(AuthService.KEY_USERNAME, data.username);
            this._lastValidAuthData = data;
        }

        this.authData$.next(data);
    }

    public updateExpiration(unixTime: number) {
        if (!this.loggedIn)
            throw new Error('not logged in, refusing to update expiration');
        this.update({
            apiKey: this.apiKey!!,
            expiration: new Date(unixTime),
            username: this.storage.get(AuthService.KEY_USERNAME)!!,
            host: this.storage.get(AuthService.KEY_HOST)!!,
        });
    }
}
