import { readFileSync } from "node:fs";
import {
    Chargy,
    IsAURL,
    IsValidURL,
    URLContext,
    type IFileInfo,
    type IURL
} from "@open-charging-cloud/chargy-core";
import { describe, expect, test, vi } from "vitest";
import { createTestChargy } from "./chargyTestRuntime";

function readFixture(fileName: string): Uint8Array {
    return new Uint8Array(readFileSync(new URL(`fixtures/SimpleURLs/${fileName}`, import.meta.url)));
}

async function detectText(text: string): Promise<unknown> {
    const fileInfo: IFileInfo = {
        name: "url.txt",
        type: "text/plain",
        data: new TextEncoder().encode(text)
    };

    return createTestChargy(Chargy).DetectAndConvertContentFormat([ fileInfo ]);
}

describe("Simple URLs", () => {

    test("recognizes HTTP and HTTPS URLs", () => {
        expect(IsValidURL("https://chargy.charging.cloud/charging-session?id=123#details")).toBe(true);
        expect(IsValidURL("http://example.com/path")).toBe(true);
        expect(IsValidURL("chargy.charging.cloud")).toBe(false);
        expect(IsValidURL("javascript:alert(1)")).toBe(false);
        expect(IsValidURL("ordinary text")).toBe(false);
    });

    test("converts a URL string into an IURL object", async () => {
        const result = await detectText("https://chargy.charging.cloud/charging-session?id=123#details");

        expect(result).toEqual({
            "@context": URLContext,
            "url":      "https://chargy.charging.cloud/charging-session?id=123#details"
        });
        expect(IsAURL(result)).toBe(true);
    });

    test("validates the optional IURL properties", () => {
        expect(IsAURL({
            "@context":   URLContext,
            "url":        "https://chargy.charging.cloud/",
            "method":     "GET",
            "acceptType": "application/json",
            "actions":    [ "open", "copy" ],
            "serviceTypes": [ "chargy" ],
            "serviceData":  { "version": 1 }
        })).toBe(true);
        expect(IsAURL({
            "@context": URLContext,
            "url":      "https://chargy.charging.cloud/",
            "actions":  [ "open", 42 ]
        })).toBe(false);
    });

    test("resolves URLs as application/chargy when enabled", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
            JSON.stringify({ name: "Chargy service", version: 1 }),
            {
                status: 200,
                headers: { "Content-Type": "application/chargy; charset=utf-8" }
            }
        ));
        vi.stubGlobal("fetch", fetchMock);

        try {
            const result = await createTestChargy(Chargy, { resolveURLs: true }).
                DetectAndConvertContentFormat([{
                    name: "url.txt",
                    type: "text/plain",
                    data: new TextEncoder().encode("https://chargy.charging.cloud/service")
                }]);

            expect(fetchMock).toHaveBeenCalledWith(
                "https://chargy.charging.cloud/service",
                { method: "GET", headers: { Accept: "application/chargy" } }
            );
            expect(result).toEqual({
                "@context": URLContext,
                "url":      "https://chargy.charging.cloud/service",
                "serviceTypes": [ "chargy" ],
                "serviceData":  { name: "Chargy service", version: 1 }
            });
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    test("does not request detected URLs by default", async () => {
        const fetchMock = vi.fn<typeof fetch>();
        vi.stubGlobal("fetch", fetchMock);

        try {
            await detectText("https://chargy.charging.cloud/service");
            expect(fetchMock).not.toHaveBeenCalled();
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    test("allows URL resolution to be replaced", async () => {
        const fetchMock = vi.fn<typeof fetch>();
        vi.stubGlobal("fetch", fetchMock);
        const urlResolver = vi.fn((url: IURL): IURL => ({
            ...url,
            serviceTypes: [ "chargy" ],
            serviceData:  { source: "static lookup" }
        }));

        try {
            const result = await createTestChargy(Chargy, {
                resolveURLs: true,
                urlResolver
            }).DetectAndConvertContentFormat([{
                name: "url.txt",
                type: "text/plain",
                data: new TextEncoder().encode("https://chargy.charging.cloud/service")
            }]);

            expect(urlResolver).toHaveBeenCalledWith({
                "@context": URLContext,
                "url":      "https://chargy.charging.cloud/service"
            });
            expect(fetchMock).not.toHaveBeenCalled();
            expect(result).toEqual({
                "@context":    URLContext,
                "url":         "https://chargy.charging.cloud/service",
                "serviceTypes": [ "chargy" ],
                "serviceData":  { source: "static lookup" }
            });
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    test.each([
        "chargy.charging.cloud_QRCode.png",
        "chargy.charging.cloud_QRCode.svg"
    ])("recognizes a URL from the %s QR fixture", async fileName => {
        const result = await createTestChargy(Chargy).DetectAndConvertContentFormat([{
            name: fileName,
            type: fileName.endsWith(".png") ? "image/png" : "image/svg+xml",
            data: readFixture(fileName)
        }]);

        expect(result).toEqual({
            "@context": URLContext,
            "url":      "https://chargy.charging.cloud/"
        });
    });

});
