import { readFileSync } from "node:fs";
import {
    Chargy,
    IsAChargeTransparencyRecord,
    PTB,
    SessionVerificationResult,
    VerificationResult,
    type IOCMFMeasurementValue,
    type IPTBContainer,
    type IPTBValidationError
} from "@open-charging-cloud/chargy-core";
import { describe, expect, test } from "vitest";
import { createTestChargy } from "./chargyTestRuntime";

function readPTBFixture(fileName: string): IPTBContainer {
    const content: unknown = JSON.parse(
        readFileSync(new URL(`fixtures/PTBContainer/${fileName}`, import.meta.url), "utf8")
    );

    return content as IPTBContainer;
}

async function detectPTBContainer(container: IPTBContainer): Promise<unknown> {
    return createTestChargy(Chargy).DetectAndConvertContentFormat([{
        name: "ptb.json",
        type: "application/json",
        data: new TextEncoder().encode(JSON.stringify(container))
    }]);
}

describe("PTB containers", () => {

    test("converts a valid PTB container into a CTR", async () => {
        const container = readPTBFixture("ptb-ocmf-testdata-01.json");
        const result = await detectPTBContainer(container);

        expect(IsAChargeTransparencyRecord(result)).toBe(true);
        if (!IsAChargeTransparencyRecord(result))
            return;

        expect(result.chargingStations).toMatchObject([{
            "@id":       container.chargeboxIdentifier,
            address:     {
                city:       "Berlin",
                street:     "Teststrasse 1",
                postalCode: "10115",
                country:    "DE"
            },
            geoLocation: {
                lat: 52.5,
                lng: 13.4
            }
        }]);

        const session = result.chargingSessions?.[0];
        const measurement = session?.measurements?.[0];
        const values = measurement?.values as IOCMFMeasurementValue[] | undefined;

        expect(session?.EVSEId).toBe(container.chargeboxIdentifier);
        expect(measurement?.energyMeterId).toBe("******240084S");
        expect(measurement?.unit).toBe("kWh");
        expect(values).toHaveLength(2);
        expect(values?.map(value => value.result?.status)).toEqual([
            VerificationResult.ValidSignature,
            VerificationResult.ValidSignature
        ]);
        expect(values?.map(value => value.ocmfDocument?.raw)).toEqual([
            container.ocmfBegin,
            container.ocmfEnd
        ]);
    });

    test("returns all PTB schema violations as a structured error", async () => {
        const original = readPTBFixture("ptb-simple.json");
        const invalidContainer: unknown = {
            ...original,
            formatVersion: "2.0",
            publicKey: "not base64!",
            address: {
                street: "",
                town: ""
            },
            geoLocation: {
                lat: 91,
                lng: "13.4",
                altitude: 34
            },
            ocmfBegin: "changed"
        };

        const result = await new PTB(createTestChargy(Chargy)).TryToParsePTBContainer(invalidContainer);

        expect(IsAChargeTransparencyRecord(result)).toBe(false);
        expect(result.status).toBe(SessionVerificationResult.InvalidSessionFormat);

        const validationError = result as IPTBValidationError;
        expect(validationError.format).toBe("ptb");
        expect(validationError.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([
            "$.formatVersion",
            "$.publicKey",
            "$.address.street",
            "$.address",
            "$.geoLocation.lat",
            "$.geoLocation.lng",
            "$.geoLocation.altitude",
            "$.ocmfBegin"
        ]));
    });

});
