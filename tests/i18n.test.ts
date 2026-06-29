import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import {
    createI18nDictionary,
    resolveInitialUILanguage
} from '../src/ts/i18n';

describe('mobile app i18n', () => {

    test('merges ChargyCore messages with MobileApp overrides', () => {
        const i18n = createI18nDictionary();

        expect(i18n.UnknownOrInvalidChargeTransparencyRecord.en)
            .toBe('Unknown or invalid charge transparency record!');
        expect(i18n.inputHelp.en)
            .toContain('scan it as a QR code');
        expect(i18n.mobileAppHeadline.de)
            .toBe('Transparenz-Software');
    });

    test('provides German and English text for every annotated HTML key', () => {
        const i18n = createI18nDictionary();
        const html = readFileSync('src/index.html', 'utf8');
        const keys = Array.from(html.matchAll(/data-i18n-(?:key|title-key|placeholder-key|aria-label-key)="([^"]+)"/g), match => match[1]);

        for (const key of new Set(keys)) {
            expect(i18n[key], `missing i18n key: ${key}`).toBeDefined();
            expect(i18n[key].de, `missing German text: ${key}`).toBeTypeOf('string');
            expect(i18n[key].en, `missing English text: ${key}`).toBeTypeOf('string');
        }
    });

    test('prefers persisted language, then browser language, then English', () => {
        expect(resolveInitialUILanguage('de', [ 'en-US' ])).toBe('de');
        expect(resolveInitialUILanguage(null, [ 'de-DE' ])).toBe('de');
        expect(resolveInitialUILanguage(null, [ 'fr-FR' ])).toBe('en');
    });

});
