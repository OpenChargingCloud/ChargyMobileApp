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

import {
    ChargeTransparencyRecord,
    ChargyInterfaces
} from '@open-charging-cloud/chargy-core';

export function getSessionWarnings(chargingSession: ChargeTransparencyRecord.IChargingSession): ChargyInterfaces.IWarning[] {

    const warnings: ChargyInterfaces.IWarning[] = [];

    if (chargingSession.verificationResult?.warnings)
        warnings.push(...chargingSession.verificationResult.warnings);

    if (chargingSession.ctr?.warnings)
        warnings.push(...chargingSession.ctr.warnings);

    for (const measurement of chargingSession.measurements ?? []) {

        if (measurement.verificationResult?.warnings)
            warnings.push(...measurement.verificationResult.warnings);

        for (const measurementValue of measurement.values ?? []) {

            if (measurementValue.warnings)
                warnings.push(...measurementValue.warnings);

            if (measurementValue.result?.warnings)
                warnings.push(...measurementValue.result.warnings);

        }

    }

    return warnings;

}

export function hasSessionWarnings(chargingSession: ChargeTransparencyRecord.IChargingSession): boolean {
    return getSessionWarnings(chargingSession).length > 0;
}

export function isWarningSession(chargingSession: ChargeTransparencyRecord.IChargingSession): boolean {
    return chargingSession.verificationResult?.status === ChargyInterfaces.SessionVerificationResult.InplausibleMeasurement ||
          (chargingSession.verificationResult?.status === ChargyInterfaces.SessionVerificationResult.ValidSignature &&
           hasSessionWarnings(chargingSession));
}
