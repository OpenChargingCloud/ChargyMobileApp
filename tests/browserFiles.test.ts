import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { normalizeXMLText, readQRCodeTextFromImage } from "@open-charging-cloud/chargy-core";

import {
    browserFileTypeFromName,
    normalizeDroppedSVGImageData
} from "../src/ts/browserFiles";
import {
    readClipboardContent,
    readCordovaClipboardContent
} from "../src/ts/clipboard";

describe("browser file helpers", () => {
    test("uses the native Cordova bridge for mobile clipboard access", async () => {
        const exec = (success: (value: string) => void,
                      _failure: (error: unknown) => void,
                      service: string,
                      action: string) => {
            expect(service).toBe("ChargyClipboard");
            expect(action).toBe("readText");
            success("{\"format\":\"test\"}");
        };

        await expect(readCordovaClipboardContent(exec)).resolves.toEqual({
            kind: "text",
            text: "{\"format\":\"test\"}"
        });
    });

    test("reads text from a rich clipboard item without a second clipboard request", async () => {
        let textReads = 0;
        const clipboard = {
            read: async () => [{
                types: [ "text/plain" ],
                getType: async () => new Blob([ "<record />" ], { type: "text/plain" })
            }],
            readText: async () => {
                textReads++;
                return "unused";
            }
        };

        await expect(readClipboardContent(clipboard)).resolves.toEqual({
            kind: "text",
            text: "<record />"
        });
        expect(textReads).toBe(0);
    });

    test("recognizes a dropped SVG without a browser MIME type", () => {
        expect(browserFileTypeFromName("ALFEN-Testdata-03_SAFEXMLContainer_asQRCode.svg", ""))
            .toBe("image/svg+xml");
    });

    test("adds explicit dimensions needed for browser QR decoding", () => {
        const svgData = readFileSync(
            new URL("fixtures/ALFEN/ALFEN-Testdata-03_SAFEXMLContainer_asQRCode.svg", import.meta.url)
        );
        const normalizedData = normalizeDroppedSVGImageData(
            "ALFEN-Testdata-03_SAFEXMLContainer_asQRCode.svg",
            "image/svg+xml",
            new Uint8Array(svgData).buffer
        );
        const normalizedSVG = new TextDecoder().decode(normalizedData);

        expect(normalizedSVG).toContain('width="101"');
        expect(normalizedSVG).toContain('height="101"');
        expect(normalizedSVG).toContain('image-rendering: pixelated');
    });

    test("decodes the normalized ALFEN SVG QR code", async () => {
        const svgData = readFileSync(
            new URL("fixtures/ALFEN/ALFEN-Testdata-03_SAFEXMLContainer_asQRCode.svg", import.meta.url)
        );
        const expectedXML = readFileSync(
            new URL("fixtures/ALFEN/ALFEN-Testdata-03_SAFEXMLContainer.xml", import.meta.url),
            "utf8"
        );
        const normalizedData = normalizeDroppedSVGImageData(
            "ALFEN-Testdata-03_SAFEXMLContainer_asQRCode.svg",
            "image/svg+xml",
            new Uint8Array(svgData).buffer
        );
        const qrText = await readQRCodeTextFromImage(
            normalizedData instanceof Uint8Array ? normalizedData : new Uint8Array(normalizedData),
            "image/svg+xml"
        );

        expect(normalizeXMLText(qrText)).toBe(normalizeXMLText(expectedXML));
    });
});
