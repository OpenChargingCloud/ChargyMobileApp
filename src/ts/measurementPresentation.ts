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

import Decimal from 'decimal.js';
import {
    ChargeTransparencyRecord,
    ChargyInterfaces
} from '@open-charging-cloud/chargy-core';

export interface MeasurementDisplayValue {
    value: Decimal;
    text:  string;
    unit:  string;
}

function isKiloWattHourUnit(unit: string | undefined): boolean {
    return unit === 'kWh' || unit === 'KILO_WATT_HOURS';
}

function displayUnit(prefix: ChargyInterfaces.DisplayPrefixes | undefined,
                     nativeUnit: string | undefined): string {

    if (prefix !== undefined && prefix !== null) {
        switch (prefix) {
            case ChargyInterfaces.DisplayPrefixes.KILO: return 'kWh';
            case ChargyInterfaces.DisplayPrefixes.MEGA: return 'MWh';
            case ChargyInterfaces.DisplayPrefixes.GIGA: return 'GWh';
            default:                                     return  'Wh';
        }
    }

    return isKiloWattHourUnit(nativeUnit) ? 'kWh' : 'Wh';

}

export function getMeasurementDisplayValue(measurement:      ChargeTransparencyRecord.IMeasurement,
                                           measurementValue: ChargeTransparencyRecord.IMeasurementValue): MeasurementDisplayValue {

    let value = measurementValue.value.times(Math.pow(10, measurement.scale));

    // Some formats prescribe a display prefix and precision independently of
    // the meter's native unit. Keep this aligned with the ChargyWebApp logic.
    if (measurementValue.value_displayPrefix !== undefined &&
        measurementValue.value_displayPrefix !== null      &&
        measurementValue.value_displayPrecision !== undefined &&
        measurementValue.value_displayPrecision !== null)
    {
        const precision = measurementValue.value_displayPrecision;

        if (isKiloWattHourUnit(measurement.unit)) {
            switch (measurementValue.value_displayPrefix) {
                case ChargyInterfaces.DisplayPrefixes.KILO:
                    value = new Decimal(value.toFixed(precision));
                    break;
                case ChargyInterfaces.DisplayPrefixes.MEGA:
                    value = new Decimal(value.div(1000).toFixed(precision));
                    break;
                case ChargyInterfaces.DisplayPrefixes.GIGA:
                    value = new Decimal(value.div(1000000).toFixed(precision));
                    break;
                default:
                    value = new Decimal(value.times(1000).toFixed(precision));
                    break;
            }
        }
        else {
            switch (measurementValue.value_displayPrefix) {
                case ChargyInterfaces.DisplayPrefixes.KILO:
                    value = new Decimal(value.div(1000).toFixed(precision));
                    break;
                case ChargyInterfaces.DisplayPrefixes.MEGA:
                    value = new Decimal(value.div(1000000).toFixed(precision));
                    break;
                case ChargyInterfaces.DisplayPrefixes.GIGA:
                    value = new Decimal(value.div(1000000000).toFixed(precision));
                    break;
                default:
                    value = new Decimal(value.toFixed(precision));
                    break;
            }
        }
    }

    return {
        value,
        text: value.toString(),
        unit: displayUnit(measurementValue.value_displayPrefix, measurement.unit)
    };

}

export function getMeasurementDifferenceText(current:   Decimal,
                                             previous:  Decimal | undefined,
                                             precision: number | undefined): string {

    if (previous === undefined)
        return '0';

    const difference = current.minus(previous);
    const text       = precision !== undefined && precision !== null
                           ? new Decimal(difference.toFixed(Math.abs(precision))).toString()
                           : difference.toString();

    return difference.isPositive() ? '+' + text : text;

}

export function getMeasurementValueInKWh(measurement:      ChargeTransparencyRecord.IMeasurement,
                                         measurementValue: ChargeTransparencyRecord.IMeasurementValue): Decimal {

    const value = measurementValue.value.times(Math.pow(10, measurement.scale));
    return isKiloWattHourUnit(measurement.unit)
               ? value
               : value.div(1000);

}

export function shouldShowMeasurementChart(numberOfValues: number): boolean {
    return numberOfValues > 2;
}
