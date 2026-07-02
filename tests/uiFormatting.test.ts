import { describe, expect, test } from 'vitest';

import { formatOBISForDisplay } from '../src/ts/uiFormatting';

describe('UI formatting', () => {
    test('keeps chargeIT OBIS identifiers visible when strict parsing rejects them', () => {
        expect(formatOBISForDisplay('1-0:1.17.0*255')).toBe('1-0:1.17.0*255');
    });

    test('formats supported OBIS identifiers through Chargy Core', () => {
        expect(formatOBISForDisplay('0100010800FF')).toBe('1-0:1.8.0*255');
    });
});
