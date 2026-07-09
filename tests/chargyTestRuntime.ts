import { createRequire } from "node:module";
import type {
    Chargy,
    I18NDictionary,
    IValidationRules,
    LanguageStrings,
    ShowPKIDetailsFunction
} from "@open-charging-cloud/chargy-core";

type ChargyConstructorArguments = ConstructorParameters<typeof Chargy>;

export type ModuleRequire = (id: string) => unknown;

export type ChargyTestDependencies = {
    elliptic:      ChargyConstructorArguments[2];
    moment:        ChargyConstructorArguments[3];
    asn1:          ChargyConstructorArguments[4];
    base32Decode:  ChargyConstructorArguments[5];
};

type ChargyConstructor = new (...args: ChargyConstructorArguments) => Chargy;

type CreateTestChargyOptions = {
    i18n?:            I18NDictionary;
    uiLanguages?:     LanguageStrings;
    showPKIDetails?:  ShowPKIDetailsFunction;
    validationRules?: IValidationRules;
};

const requireModule = createRequire(import.meta.url);
const chargyDependencies = loadChargyTestDependencies(requireModule);

export function loadChargyTestDependencies(requireModule: ModuleRequire): ChargyTestDependencies {

    return {
        elliptic:      requireModule("elliptic")      as ChargyConstructorArguments[2],
        moment:        requireModule("moment")        as ChargyConstructorArguments[3],
        asn1:          requireModule("asn1.js")       as ChargyConstructorArguments[4],
        base32Decode:  requireModule("base32-decode") as ChargyConstructorArguments[5]
    };

}

export function createTestChargy(ChargyClass: ChargyConstructor,
                                 options:     CreateTestChargyOptions = {}): Chargy
{

    return new ChargyClass(
        options.i18n           ?? {},
        options.uiLanguages    ?? [ "en" ],
        chargyDependencies.elliptic,
        chargyDependencies.moment,
        chargyDependencies.asn1,
        chargyDependencies.base32Decode,
        options.showPKIDetails ?? ((): string => ""),
        options.validationRules
    );

}

export function parseI18NDictionary(json: string): I18NDictionary {
    const parsed: unknown = JSON.parse(json);
    return parsed as I18NDictionary;
}

export function parseValidationRules(json: string): IValidationRules {
    const parsed: unknown = JSON.parse(json);
    return parsed;
}
