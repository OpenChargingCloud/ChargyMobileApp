import Decimal from 'decimal.js';
import { describe, expect, test } from 'vitest';
import {
    ChargeTransparencyRecord,
    ChargyInterfaces
} from '@open-charging-cloud/chargy-core';
import {
    getMeasurementDifferenceText,
    getMeasurementDisplayValue,
    getMeasurementValueInKWh,
    shouldShowMeasurementChart
} from '../src/ts/measurementPresentation';

function measurement(unit: string, scale = 0): ChargeTransparencyRecord.IMeasurement {
    return {
        name:          'ENERGY_TOTAL',
        obis:          '1-0:1.8.0*255',
        unit,
        scale,
        energyMeterId: 'meter',
        values:        []
    } as ChargeTransparencyRecord.IMeasurement;
}

function value(rawValue: string,
               prefix?: ChargyInterfaces.DisplayPrefixes,
               precision?: number): ChargeTransparencyRecord.IMeasurementValue {
    return {
        timestamp:              '2026-06-19T10:00:00.000Z',
        value:                  new Decimal(rawValue),
        value_displayPrefix:    prefix,
        value_displayPrecision: precision
    } as ChargeTransparencyRecord.IMeasurementValue;
}

describe('measurement presentation', () => {

    test('keeps ALFEN meter values and their difference in native Wh', () => {
        const nativeMeasurement = measurement('WATT_HOURS');
        const start             = getMeasurementDisplayValue(nativeMeasurement, value('123456'));
        const stop              = getMeasurementDisplayValue(nativeMeasurement, value('2223456'));

        expect(start.text).toBe('123456');
        expect(start.unit).toBe('Wh');
        expect(stop.text).toBe('2223456');
        expect(stop.unit).toBe('Wh');
        expect(getMeasurementDifferenceText(stop.value, start.value, undefined)).toBe('+2100000');
        expect(getMeasurementValueInKWh(nativeMeasurement, value('2223456')).toString()).toBe('2223.456');
    });

    test('keeps native kWh and supports a prescribed display prefix', () => {
        const nativeKWh = getMeasurementDisplayValue(measurement('KILO_WATT_HOURS'), value('12.5'));
        const shownKWh  = getMeasurementDisplayValue(
            measurement('WATT_HOURS'),
            value('12345', ChargyInterfaces.DisplayPrefixes.KILO, 2)
        );

        expect(nativeKWh).toMatchObject({ text: '12.5', unit: 'kWh' });
        expect(shownKWh).toMatchObject({ text: '12.35', unit: 'kWh' });
    });

    test('shows a chart only for more than two meter values', () => {
        expect(shouldShowMeasurementChart(0)).toBe(false);
        expect(shouldShowMeasurementChart(2)).toBe(false);
        expect(shouldShowMeasurementChart(3)).toBe(true);
    });

});
