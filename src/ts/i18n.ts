/*
 * Copyright (c) 2018-2026 GraphDefined GmbH <achim.friedland@graphdefined.com>
 * This file is part of Chargy MobileApp <https://github.com/OpenChargingCloud/ChargyMobileApp>
 *
 * Licensed under the Affero GPL license, Version 3.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.gnu.org/licenses/agpl.html
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
