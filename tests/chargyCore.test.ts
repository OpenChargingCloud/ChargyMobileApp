import { readFileSync } from "node:fs";
import { join }         from "node:path";
import {
    Chargy,
    IsAChargeTransparencyRecord,
    IsAURL,
    SessionVerificationResult
}                            from "@open-charging-cloud/chargy-core";
import coreI18n              from "@open-charging-cloud/chargy-core/i18n.json";
import * as asn1              from "asn1.js";
import base32Decode           from "base32-decode";
import elliptic               from "elliptic";
import moment                 from "moment";
import { describe, expect, test } from "vitest";

type ChargyAsn1 = ConstructorParameters<typeof Chargy>[4];

function createChargy(): Chargy {
    return new Chargy(
        coreI18n,
        ["de", "en"],
        elliptic,
        moment,
        asn1 as ChargyAsn1,
        base32Decode,
        () => undefined
    );
}

async function detectFixture(fileName: string) {
    const path = join(__dirname, "fixtures", fileName);

    return createChargy().DetectAndConvertContentFormat([{
        name: fileName,
        type: "application/json",
        data: new Uint8Array(readFileSync(path))
    }]);
}

async function detectText(fileName: string, text: string) {
    return createChargy().DetectAndConvertContentFormat([{
        name: fileName,
        type: "text/plain",
        data: new TextEncoder().encode(text)
    }]);
}

describe("chargy-core integration", () => {

    test("validates a chargeIT transparency record", async () => {
        const result = await detectFixture("chargeIT/chargeIT-Testdata-02.chargy");

        expect(IsAChargeTransparencyRecord(result)).toBe(true);

        if (!IsAChargeTransparencyRecord(result))
            return;

        expect(result.chargingSessions).toHaveLength(1);
        expect(result.chargingSessions?.[0]?.verificationResult?.status)
            .toBe(SessionVerificationResult.ValidSignature);
    });

    test("detects plain URLs as SimpleURL results", async () => {
        const result = await detectText("qr-url.txt", "https://open.charging.cloud/");

        expect(IsAURL(result)).toBe(true);

        if (!IsAURL(result))
            return;

        expect(result.url).toBe("https://open.charging.cloud/");
    });

});
