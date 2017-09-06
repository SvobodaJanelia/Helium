#!/usr/bin/env node
'use strict';

import * as fs from 'fs';
import * as path from 'path';

import * as chalk from 'chalk';
import { Application } from 'express';
import * as listEndpoints from 'express-list-endpoints';
import * as _ from 'lodash';
import * as yargs from 'yargs';

import { Database, Mode } from './database.helper';
import { createServer } from './server';

// Catch unhandled Promises
process.on('unhandledRejection', (reason) => {
    log("Unhandled Promise rejection: ");
    throw reason;
});

// Parse optstring and handle --help with yargs
const argv = yargs
    .usage('Usage: $0 --port [port]')
    .alias('p', 'port')
    .describe('port', 'HTTP port. Defaults to 3000. Overrides $PORT')
    .help()
    .argv;

// --port takes priority over $PORT
if (!argv.port && process.env.PORT)
    argv.port = process.env.PORT;
// Default to 3000
if (!argv.port)
    argv.port = 3000;

/** Shape of the JSON document generated by gulp-about */
interface AppMeta {
    name: string;
    version: string;
}

const bootstrap = async (options: any, metadata: AppMeta) => {
    log(chalk.bold(`Starting ${metadata.name} v${metadata.version}`));

    try {
        const db = Database.get();
        await db.connect(Mode.PROD);
    } catch (ex) {
        fatalError('Could not connect to database: ' + ex.message);
    }

    const app = await createServer() as Application;
    app.listen(options.port, () => {
        logEndpoints(app);
        log('\nMagic is happening on port ' + chalk.bold(options.port.toString()));
    }).on('error', fatalError);
};

/**
 * Logs a list of available endpoints to stdout
 *
 * @param  {object} app Express app
 */
const logEndpoints = (app) => {
    log('Available endpoints:\n');
    const endpoints = _.sortBy(listEndpoints(app), (e: any) => e.path);
    for (const e of endpoints) {
        log(`  ${_.join(e.methods, ', ')} ${e.path}`);
    }
};

const log = (str: string) => {
    process.stdout.write(str + '\n');
};

const loadMetadata = (): AppMeta => {
    let contents: string;
    try {
        contents = fs.readFileSync(path.resolve(__dirname, 'about.json'), 'utf8');
    } catch (ex) {
        fatalError(`Could not read ${path.resolve(__dirname, 'about.json')}` +
            `, try running 'gulp server:about'`);
        // fatalError calls process.exit(), this is just for the compiler
        throw ex;
    }

    return JSON.parse(contents) as AppMeta;
};

const fatalError = (err: any) => {
    process.stderr.write(chalk.red(err) + '\n');
    process.exit(1);
};

bootstrap(argv, loadMetadata());
