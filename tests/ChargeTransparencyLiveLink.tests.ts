import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";

import type {
    IChargeTransparencyLiveLink,
    IFileInfo
} from "@open-charging-cloud/chargy-core";
import {
    Chargy,
    IsAChargeTransparencyLiveLink,
    IsAChargeTransparencyRecord,
    verifyDocumentSignatures
} from "@open-charging-cloud/chargy-core";
import coreI18n  from "@open-charging-cloud/chargy-core/i18n.json";
import localI18n from "../src/i18n.json";
import {
    createTestChargy,
    mergeI18NDictionaries,
    parseJSONRecord
} from "./chargyTestRuntime";
import {
    documentSignatureState,
    measurementValueState,
    meterValueSessionState,
    worstLiveLinkState
} from "../src/ts/liveLinkStatus";

vi.stubGlobal("window", {
    navigator: {
        language: "en"
    }
});

const currentDirectory = fileURLToPath(new URL(".",  import.meta.url));
type DetectionResult   = ReturnType<Chargy["DetectAndConvertContentFormat"]>;

function readFixture(fileName: string): string {
    return readFileSync(join(currentDirectory, "fixtures", fileName), "utf8").trim();
}

function readBinaryFixture(fileName: string): Uint8Array {
    return new Uint8Array(readFileSync(join(currentDirectory, "fixtures", fileName)));
}

function fixtureType(fileName: string): string {
    if (fileName.endsWith(".json"))
        return "application/json";
    if (fileName.endsWith(".png"))
        return "image/png";
    if (fileName.endsWith(".svg"))
        return "image/svg+xml";
    return "application/octet-stream";
}

function createChargy(): Chargy {
    return createTestChargy(Chargy, { i18n: mergeI18NDictionaries(coreI18n, localI18n) });
}

function readLiveLink(fileName: string): IChargeTransparencyLiveLink {

    const liveLink = parseJSONRecord(readFixture(fileName));

    if (!IsAChargeTransparencyLiveLink(liveLink))
        throw new Error("'" + fileName + "' is not a charge transparency live link!");

    return liveLink;

}

async function verifyChargeTransparencyLiveLink(fileName: string): DetectionResult {

    const fileInfo: IFileInfo = {
        name: fileName,
        type: "application/json",
        data: new TextEncoder().encode(readFixture(fileName))
    };

    return createChargy().DetectAndConvertContentFormat([ fileInfo ]);

}

describe("Charge Transparency LiveLink", () => {

    test("recognizes live links by their JSON-LD context", () => {

        const liveLink = parseJSONRecord(readFixture("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json"));

        expect(IsAChargeTransparencyLiveLink(liveLink)).toBe(true);
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, "@context": "https://example.com/other" })).toBe(false);
        expect(IsAChargeTransparencyLiveLink(undefined)).toBe(false);

        // A malformed optional field does not un-recognise a live link: the
        // context identifies it, and a broken transport is dropped where the
        // transports are read, not by turning the whole document into an
        // "unknown format".
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, liveTransports: [ { type: "ftp", url: "https://example.com" } ] })).toBe(true);
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, liveTransports: "not an array" })).toBe(true);
        expect(IsAChargeTransparencyLiveLink({ ...liveLink, connector: 42 })).toBe(true);

    });

    test.each([
        "ChargeTransparencyLive/ChargeTransparencyLiveLink_2.svg",
        "ChargeTransparencyLive/ChargeTransparencyLiveLink_2.png"
    ])("decodes the QR code in %s", async fileName => {

        const fileInfo: IFileInfo = {
            name: fileName,
            type: fixtureType(fileName),
            data: readBinaryFixture(fileName)
        };

        const result = await createChargy().DetectAndConvertContentFormat([ fileInfo ]);

        expect(IsAChargeTransparencyLiveLink(result)).toBe(true);

    });

    test("stays a live link, whether it carries meter values or not", async () => {

        // A live link describes a charging session that is still running, a
        // charge transparency record a collection of finished ones. Carrying
        // meter values does not turn the one into the other: the application
        // shows the live link's card and its meter values right below it.
        const withMeterValues    = await verifyChargeTransparencyLiveLink("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json");

        expect(IsAChargeTransparencyLiveLink(withMeterValues)).toBe(true);
        expect(IsAChargeTransparencyRecord  (withMeterValues)).toBe(false);

        const withoutMeterValues = await verifyChargeTransparencyLiveLink("ChargeTransparencyLive/OCMF-Test-01/OCMF-Test-01__0000.json");

        expect(IsAChargeTransparencyLiveLink(withoutMeterValues)).toBe(true);

        if (IsAChargeTransparencyLiveLink(withoutMeterValues))
        {
            expect(withoutMeterValues.created).toBe("2026-08-28T11:59:59Z");
            expect(withoutMeterValues.liveTransports).toHaveLength(3);
        }

    });

    test("parses the signed meter values of a live link into a verified CTR", async () => {

        const ctr = await createChargy().TryToParseLiveLinkMeterValues(
                              readLiveLink("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json")
                          );

        expect(IsAChargeTransparencyRecord(ctr)).toBe(true);

        expect(ctr?.chargingSessions).toHaveLength(1);

        const chargingSession = ctr?.chargingSessions?.[0];

        expect(chargingSession?.EVSEId).toBe("DE*GEF*E12345678*1");
        expect(chargingSession?.measurements).toHaveLength(1);

        const measurement = chargingSession?.measurements?.[0];

        // 19 OCMF documents, but the end document repeats the start value.
        expect(measurement?.name).toBe("ENERGY_TOTAL");
        expect(measurement?.values).toHaveLength(20);

        // The live link carries the public keys, so unlike a bare OCMF file
        // every meter value can actually be verified here.
        for (const measurementValue of measurement?.values ?? [])
            expect(measurementValue.result?.status).toBe("ValidSignature");

    });

    test("reports no meter values for a live link that has none yet", async () => {

        const ctr = await createChargy().TryToParseLiveLinkMeterValues(
                              readLiveLink("ChargeTransparencyLive/OCMF-Test-01/OCMF-Test-01__0000.json")
                          );

        expect(ctr).toBeUndefined();

    });

    test("carries the verification of the signatures over the whole document", async () => {

        // ChargyCore verifies the operator's signatures over the live link
        // itself - the ones that tie its transport URLs and public keys to
        // whoever signed them - and hands the outcome on with the document.
        const liveLink = await verifyChargeTransparencyLiveLink("ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json");

        expect(IsAChargeTransparencyLiveLink(liveLink)).toBe(true);

        if (IsAChargeTransparencyLiveLink(liveLink))
        {
            expect(liveLink.signatureVerification?.status).toBe("allValid");
            expect(liveLink.signatureVerification?.validCount).toBe(2);
            expect(liveLink.warnings ?? []).toHaveLength(0);
        }

    });

    test("treats the first document of a series as valid, not as broken", async () => {

        // The first meter value of a running session is a start value, and a
        // single one of them is perfectly legal in a live link: there is simply
        // nothing to compute a consumption from yet. ChargyCore says so with
        // "AtLeastTwoMeasurementsRequired", which for a finished record would be
        // a defect - here it must not make the document look invalid, because
        // every signature it carries verified.
        const liveLink = readLiveLink("ChargeTransparencyLive/OCMF-Test-01/OCMF-Test-01__0001.json");
        const chargy   = createChargy();
        const ctr      = await chargy.TryToParseLiveLinkMeterValues(liveLink);

        const chargingSession = ctr?.chargingSessions?.[0];

        expect(chargingSession?.verificationResult?.status).toBe("AtLeastTwoMeasurementsRequired");
        expect(meterValueSessionState(chargingSession?.verificationResult?.status)).toBeNull();

        const measurementValues = chargingSession?.measurements?.[0]?.values ?? [];

        expect(measurementValues).toHaveLength(1);

        const states = [
            documentSignatureState(verifyDocumentSignatures(liveLink)),
            ...measurementValues.map(value => measurementValueState(value.result?.status))
        ];

        expect(worstLiveLinkState(states)).toBe("valid");

    });

    test("adds the current UTC timestamp when a live link has none", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-13T10:11:12.000Z"));

        try
        {
            const report = await verifyChargeTransparencyLiveLink("ChargeTransparencyLive/ChargeTransparencyLiveLink_2.json");

            expect(IsAChargeTransparencyLiveLink(report)).toBe(true);

            if (IsAChargeTransparencyLiveLink(report))
                expect(report.created).toBe("2026-06-13T10:11:12.000Z");
        }
        finally
        {
            vi.useRealTimers();
        }
    });

});
