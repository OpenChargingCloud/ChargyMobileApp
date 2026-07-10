import { readFileSync } from "node:fs";
import {
    Chargy,
    IsAChargeTransparencyLiveLink,
    type IFileInfo
} from "@open-charging-cloud/chargy-core";
import { describe, expect, test } from "vitest";
import { createTestChargy } from "./chargyTestRuntime";

function readFixture(fileName: string): Uint8Array {
    return new Uint8Array(readFileSync(new URL(`fixtures/${fileName}`, import.meta.url)));
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

async function detectFixture(fileName: string): Promise<unknown> {
    const fileInfo: IFileInfo = {
        name: fileName,
        type: fixtureType(fileName),
        data: readFixture(fileName)
    };

    return createTestChargy(Chargy).DetectAndConvertContentFormat([ fileInfo ]);
}

describe("Charge Transparency LiveLink", () => {

    test.each([
        "ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json",
        "ChargeTransparencyLive/ChargeTransparencyLiveLink_2.json"
    ])("loads %s", async fileName => {
        const result = await detectFixture(fileName);

        expect(IsAChargeTransparencyLiveLink(result)).toBe(true);
    });

    test.each([
        "ChargeTransparencyLive/ChargeTransparencyLiveLink_2.svg",
        "ChargeTransparencyLive/ChargeTransparencyLiveLink_2.png"
    ])("decodes the QR code in %s", async fileName => {
        const result = await detectFixture(fileName);

        expect(IsAChargeTransparencyLiveLink(result)).toBe(true);
    });

});
