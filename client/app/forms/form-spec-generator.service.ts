import { Injectable } from '@angular/core';
import { ValidatorFn, Validators } from '@angular/forms';

import { TableMeta } from '../common/api';
import { FormControlSpec } from './form-control-spec.interface';

/**
 * This service is responsible for generating FormControlSpecs given a
 * TableMeta.
 */
@Injectable()
export class FormSpecGeneratorService {
    /**
     * Generates one FormControlSpec for each header in the given TableMeta.
     * Does not include a submit control.
     */
    public generate(meta: TableMeta): FormControlSpec[] {
        return meta.headers.map((h): FormControlSpec => {
            const validators: ValidatorFn[] = [];
            if (!h.nullable)
                validators.push(Validators.required);
            if (h.maxCharacters)
                validators.push(Validators.maxLength(h.maxCharacters));

            return {
                type: 'text',
                formControlName: h.name,
                placeholder: h.name,
                validation: validators
            };
        });
    }
}
