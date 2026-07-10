import { describe, expect, test, vi } from 'vitest';
import { readFileSync }           from 'node:fs';
import { DOMParser }              from '@oozcitak/dom';
import {
    Chargy,
    ChargeTransparencyRecord,
    ChargyInterfaces,
    IsAChargeTransparencyRecord
}                                from '@open-charging-cloud/chargy-core';
import coreI18n                   from '@open-charging-cloud/chargy-core/i18n.json';
import * as asn1                  from 'asn1.js';
import base32Decode               from 'base32-decode';
import elliptic                   from 'elliptic';
import moment                     from 'moment';
import {
    getSessionWarnings,
    isWarningSession
}                                from '../src/ts/sessionPresentation';

type ChargyAsn1 = ConstructorParameters<typeof Chargy>[4];

describe('charging session presentation', () => {

    test('presents implausibly high but validly signed ALFEN data as a warning', async () => {

        vi.stubGlobal('window', {
            navigator: {
                language: 'en-US'
            }
        });
        vi.stubGlobal('DOMParser', DOMParser);
        vi.stubGlobal('DOMMatrix', class DOMMatrix {
            toString(): string {
                return 'matrix(1, 0, 0, 1, 0, 0)';
            }
        });

        const fileName = 'ALFEN-Testdata-04_2_1MWh_SAFEXMLContainer.xml';
        const input    = readFileSync(
            new URL('fixtures/ALFEN/' + fileName, import.meta.url),
            'utf8'
        );
        const chargy   = new Chargy(
            coreI18n,
            [ 'de', 'en' ],
            elliptic,
            moment,
            asn1 as ChargyAsn1,
            base32Decode,
            () => undefined
        );
        const report   = await chargy.DetectAndConvertContentFormat([{
            name: fileName,
            type: 'application/xml',
            data: new TextEncoder().encode(input)
        }]);

        expect(IsAChargeTransparencyRecord(report)).toBe(true);

        const chargingSession = (report as ChargeTransparencyRecord.IChargeTransparencyRecord).chargingSessions?.[0];
        expect(chargingSession?.verificationResult?.status)
            .toBe(ChargyInterfaces.SessionVerificationResult.InplausibleMeasurement);
        expect(isWarningSession(chargingSession)).toBe(true);
        expect(getSessionWarnings(chargingSession)).toEqual([
            expect.objectContaining({
                level:   ChargyInterfaces.WarningLevel.low,
                message: expect.objectContaining({
                    en: 'The charged energy amount is implausibly high.'
                })
            })
        ]);

    });

});
