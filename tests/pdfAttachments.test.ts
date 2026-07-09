import { describe, expect, test } from "vitest";
import {
    fileInfosFromPdfAttachments,
    hydratePdfAttachments
} from "../src/ts/pdfAttachments";

const xml = new TextEncoder().encode("<?xml version=\"1.0\"?><test />");

function bytes(data: ArrayBuffer | Uint8Array): number[] {
    return Array.from(data instanceof Uint8Array ? data : new Uint8Array(data));
}

describe("PDF attachment normalization", () => {

    test("accepts the Map returned by PDF.js 6.1", () => {
        const result = fileInfosFromPdfAttachments(new Map([
            [ "SAFE-Testdata.xml", {
                filename: "SAFE-Testdata.xml",
                content:  xml
            } ]
        ]), "file://receipt.pdf");

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            name: "SAFE-Testdata.xml",
            path: "file://receipt.pdf",
            type: "application/xml"
        });
        expect(bytes(result[0].data)).toEqual(Array.from(xml));
    });

    test("continues to accept the object returned by older PDF.js versions", () => {
        const result = fileInfosFromPdfAttachments({
            "session.json": {
                filename: "session.json",
                content:  new Uint8Array([ 1, 2, 3 ])
            }
        });

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("application/json");
    });

    test("loads attachment content lazily with the PDF.js 6.1 API", async () => {
        const attachments = new Map([
            [ "attachment-id", { filename: "SAFE-Testdata.xml" } ]
        ]);

        const hydrated = await hydratePdfAttachments(
            attachments,
            id => Promise.resolve(id === "attachment-id" ? xml : null)
        );
        const result = fileInfosFromPdfAttachments(hydrated);

        expect(result).toHaveLength(1);
        expect(bytes(result[0].data)).toEqual(Array.from(xml));
    });

    test("ignores unsupported or malformed attachments", () => {
        const result = fileInfosFromPdfAttachments(new Map([
            [ "readme.txt", { filename: "readme.txt", content: xml } ],
            [ "missing.xml", { filename: "missing.xml" } ]
        ]));

        expect(result).toEqual([]);
    });

});
