import * as chargyLib  from '@open-charging-cloud/chargy-core';
import coreI18n        from '@open-charging-cloud/chargy-core/i18n.json';
import mobileAppI18n   from '../../src/i18n.json';

export const supportedLanguages = [ "de", "en" ] as const;

export type SupportedLanguage = typeof supportedLanguages[number];

export function isSupportedLanguage(language: string|null|undefined): language is SupportedLanguage {
    return supportedLanguages.includes(language as SupportedLanguage);
}

export function resolveInitialUILanguage(storedLanguage:  string|null,
                                         browserLanguages: readonly string[]): SupportedLanguage {

    if (isSupportedLanguage(storedLanguage))
        return storedLanguage;

    const normalizedBrowserLanguages = browserLanguages.map(language => language.toLowerCase());

    for (const supportedLanguage of supportedLanguages)
        if (normalizedBrowserLanguages.includes(supportedLanguage))
            return supportedLanguage;

    for (const supportedLanguage of supportedLanguages)
        if (normalizedBrowserLanguages.some(language => language.startsWith(supportedLanguage + "-")))
            return supportedLanguage;

    return "en";

}

export function createI18nDictionary(): chargyLib.I18NDictionary {
    return Object.assign({}, coreI18n, mobileAppI18n) as chargyLib.I18NDictionary;
}
