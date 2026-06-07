import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, test } from "vitest";
import {
    formatChargeDataVerificationReport,
    parseChargeDataText,
    verifyChargeData
} from "../www.src/ts/chargeDataParser";
import {
    extractTransparencyRecordsFromPdf
} from "../www.src/ts/pdfAttachmentExtractor";

(globalThis as any).__chargyPdfJs = pdfjs;

function readFixture(fileName: string): string {
    return readFileSync(join(__dirname, "fixtures", fileName), "utf8").trim();
}

function wrapText(line: string, maxLineLength: number): string[] {
    if (line.length <= maxLineLength)
        return [line];

    const lines: string[] = [];
    let remaining = line;

    while (remaining.length > maxLineLength) {
        let breakAt = remaining.lastIndexOf(" ", maxLineLength);

        if (breakAt < Math.floor(maxLineLength / 2))
            breakAt = maxLineLength;

        lines.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt).replace(/^\s+/, "");
    }

    if (remaining.length > 0)
        lines.push(remaining);

    return lines;
}

async function createChargyTransparencyPdf(chargyText: string, attachmentName: string): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const headingFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
    const codeFont = await pdf.embedFont(StandardFonts.Courier);

    pdf.setTitle("Chargy Transparenz PDF/A-3");
    pdf.setSubject("Chargy transparency data with embedded " + attachmentName);
    pdf.setAuthor("ChargyMobileApp test suite");
    pdf.setCreator("ChargyMobileApp test suite");
    pdf.setProducer("pdf-lib");

    const margin = 48;
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const codeSize = 7.5;
    const lineHeight = 10;
    const maxCodeLineLength = 118;
    let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawText("Chargy Transparenz PDF/A-3", {
        x: margin,
        y: y,
        size: 22,
        font: headingFont,
        color: rgb(0.04, 0.16, 0.36)
    });
    y -= 30;

    page.drawText("Sichtbarer Inhalt: " + attachmentName, {
        x: margin,
        y: y,
        size: 11,
        font: bodyFont,
        color: rgb(0.15, 0.15, 0.15)
    });
    y -= 24;

    const formattedChargy = JSON.stringify(JSON.parse(chargyText), null, 2);
    const visibleLines: string[] = [];

    for (const line of formattedChargy.split(/\r?\n/))
        visibleLines.push(...wrapText(line, maxCodeLineLength));

    for (const line of visibleLines) {
        if (y < margin) {
            page = pdf.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
        }

        page.drawText(line, {
            x: margin,
            y: y,
            size: codeSize,
            font: codeFont,
            color: rgb(0.08, 0.08, 0.08)
        });
        y -= lineHeight;
    }

    await pdf.attach(new TextEncoder().encode(chargyText), attachmentName, {
        mimeType: "application/json",
        description: "Chargy transparency data",
        creationDate: new Date("2026-06-03T00:00:00Z"),
        modificationDate: new Date("2026-06-03T00:00:00Z"),
        afRelationship: "Data" as any
    });

    return pdf.save({ useObjectStreams: false });
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
    return data.slice().buffer as ArrayBuffer;
}

async function readPdfText(pdfData: Uint8Array): Promise<string> {
    const loadingTask = (pdfjs as any).getDocument({
        data: toArrayBuffer(pdfData),
        disableWorker: true,
        useSystemFonts: true
    });
    const pdf = await loadingTask.promise;
    const texts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        texts.push(content.items.map((item: any) => item.str).join("\n"));
    }

    return texts.join("\n");
}

describe("charge data parser", () => {

    function expectReportLines(summary: string, expected: string) {
        const summaryLines  = summary.split(/\r?\n/);
        const expectedLines = expected.split(/\r?\n/);
        const maxLength     = Math.max(summaryLines.length, expectedLines.length);

        for (let i = 0; i < maxLength; i++)
            expect.soft(summaryLines[i], "verification report line " + (i + 1)).toBe(expectedLines[i]);
    }

    async function expectVerificationReport(inputFixture: string, expectedFixture: string) {
        const input    = readFixture(inputFixture);
        const expected = readFixture(expectedFixture);

        const report   = await verifyChargeData(parseChargeDataText(input));
        const summary  = formatChargeDataVerificationReport(report);

        expectReportLines(summary, expected);
    }

    async function expectPdfVerificationReport(inputFixture: string, expectedFixture: string, attachmentName: string) {
        const input    = readFixture(inputFixture);
        const expected = readFixture(expectedFixture);
        const pdfData  = await createChargyTransparencyPdf(input, attachmentName);

        const visiblePdfText = await readPdfText(pdfData);
        expect(visiblePdfText).toContain("Chargy Transparenz PDF/A-3");
        expect(visiblePdfText).toContain(attachmentName);
        expect(visiblePdfText).toContain(Object.keys(JSON.parse(input))[0]);

        const records = await extractTransparencyRecordsFromPdf(toArrayBuffer(pdfData));

        expect(records).toHaveLength(1);
        expect(records[0].attachmentName).toBe(attachmentName);

        const report  = await verifyChargeData(parseChargeDataText(JSON.stringify(records[0].content)));
        const summary = formatChargeDataVerificationReport(report);

        expectReportLines(summary, expected);
    }

    test("PTB input", async () => {
        await expectVerificationReport(
            "PTB/ptb-simple.json",
            "PTB/ptb-simple.expected.txt"
        );
    });

    test("PTB input as Chargy transparency PDF/A-3 attachment", async () => {
        await expectPdfVerificationReport(
            "PTB/ptb-simple.json",
            "PTB/ptb-simple.expected.txt",
            "ptb-simple.json"
        );
    });

    test("PTB input - must fail!", async () => {
        await expectVerificationReport(
            "PTB/ptb-simple-signature_invalid.json",
            "PTB/ptb-simple-signature_invalid.expected.txt"
        );
    });

    test("chargeIT-Testdatensatz-02", async () => {
        await expectVerificationReport(
            "chargeIT/chargeIT-Testdatensatz-02.chargy",
            "chargeIT/chargeIT-Testdatensatz-02.expected.txt"
        );
    });

    test("chargeIT-Testdatensatz-02 as Chargy transparency PDF/A-3 attachment", async () => {
        await expectPdfVerificationReport(
            "chargeIT/chargeIT-Testdatensatz-02.chargy",
            "chargeIT/chargeIT-Testdatensatz-02.expected.txt",
            "chargeIT-Testdatensatz-02.chargy"
        );
    });

});
