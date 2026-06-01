import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { formatChargeDataSummary, parseChargeDataText } from "../www.src/ts/chargeDataParser";

function readFixture(fileName: string): string {
    return readFileSync(join(__dirname, "fixtures", fileName), "utf8").trim();
}

describe("charge data parser", () => {
    test("parses PTB input text and formats the expected summary", () => {
        const input    = readFixture("ptb-simple.json");
        const expected = readFixture("ptb-simple.expected.txt");

        const summary = formatChargeDataSummary(parseChargeDataText(input));

        expect(summary).toBe(expected);
    });
});
