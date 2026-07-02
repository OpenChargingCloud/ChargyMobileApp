import { parseOBIS } from '@open-charging-cloud/chargy-core';

export function formatOBISForDisplay(obis: string | undefined): string {
    if (obis == null || obis.trim() === '')
        return '';

    try {
        return parseOBIS(obis);
    }
    catch {
        return obis;
    }
}
