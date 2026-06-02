import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
    formatChargeDataVerificationReport,
    parseChargeDataText,
    verifyChargeData
} from "../www.src/ts/chargeDataParser";

function readFixture(fileName: string): string {
    return readFileSync(join(__dirname, "fixtures", fileName), "utf8").trim();
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

    test("PTB input", async () => {
        await expectVerificationReport(
            "PTB/ptb-simple.json",
            "PTB/ptb-simple.expected.txt"
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

});
