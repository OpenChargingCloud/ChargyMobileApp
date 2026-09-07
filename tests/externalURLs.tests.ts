import { describe, expect, test } from "vitest";

import {
    findExternalURLRule,
    isWithinURLPrefix,
    isWithinURLPrefixAfterQueryAppend,
    parseExternalURLConfig,
    parseExternalURLConfigMode
} from "../src/ts/externalURLs";

describe("External URL helpers", () => {

    test("parses prefixes with their payload limits", () => {

        const rules = parseExternalURLConfig([
            "# a comment",
            "",
            "https://api.example.org/ctrs/ 100",
            "ftp://api.example.org/ctrs/ 100",
            "https://api.example.org/broken notanumber"
        ].join("\n"));

        expect(rules).toHaveLength(1);
        expect(rules[0]?.prefix).toBe("https://api.example.org/ctrs/");
        expect(rules[0]?.maxPayloadBytes).toBe(100 * 1024);

        expect(findExternalURLRule(new URL("https://api.example.org/ctrs/12345.json"), rules)).not.toBeNull();
        expect(findExternalURLRule(new URL("https://api.example.org/other/12345.json"), rules)).toBeNull();

        // A prefix without a trailing slash still ends at a segment boundary:
        // "/ctrs" may not cover "/ctrsevil".
        const bare = parseExternalURLConfig("https://api.example.org/ctrs 100");

        expect(findExternalURLRule(new URL("https://api.example.org/ctrs/12345.json"), bare)).not.toBeNull();
        expect(findExternalURLRule(new URL("https://api.example.org/ctrsevil/12345.json"), bare)).toBeNull();

    });

    test("reads the mode directive, the last one winning", () => {

        expect(parseExternalURLConfigMode("")).toBe("open");
        expect(parseExternalURLConfigMode("mode strict")).toBe("strict");
        expect(parseExternalURLConfigMode("mode strict\nmode open")).toBe("open");
        expect(parseExternalURLConfigMode("mode nonsense")).toBe("open");

    });

    test("prefixes end at component boundaries, not mid-segment", () => {

        expect(isWithinURLPrefix("https://example.com/api",         "https://example.com/api")).toBe(true);
        expect(isWithinURLPrefix("https://example.com/api/live",    "https://example.com/api")).toBe(true);
        expect(isWithinURLPrefix("https://example.com/api?token=1", "https://example.com/api")).toBe(true);
        expect(isWithinURLPrefix("https://example.com/api#part",    "https://example.com/api")).toBe(true);
        expect(isWithinURLPrefix("https://example.com/apievil",     "https://example.com/api")).toBe(false);
        expect(isWithinURLPrefix("https://example.com/api.evil/x",  "https://example.com/api")).toBe(false);
        expect(isWithinURLPrefix("https://example.com/api/x",       "https://example.com/api/")).toBe(true);
        expect(isWithinURLPrefix("https://example.com/apix",        "https://example.com/api/")).toBe(false);

    });

    test("an appended query parameter keeps a URL within its prefix", () => {

        // What the live-link "lastUpdated" timestamp does to a URL that was
        // already matched against a prefix.
        expect(isWithinURLPrefixAfterQueryAppend("https://example.com/api?token=1",  "https://example.com/api")).toBe(true);
        expect(isWithinURLPrefixAfterQueryAppend("https://example.com/api/x?token=1","https://example.com/api/")).toBe(true);

        // A prefix that ends inside a query string is continued by "&".
        expect(isWithinURLPrefixAfterQueryAppend("https://example.com/api?f=c&token=1", "https://example.com/api?f=c")).toBe(true);
        expect(isWithinURLPrefixAfterQueryAppend("https://example.com/api?f=c",         "https://example.com/api?f=c")).toBe(true);

        // ... but a pinned query value may not simply be extended.
        expect(isWithinURLPrefixAfterQueryAppend("https://example.com/api?f=chargyevil", "https://example.com/api?f=chargy")).toBe(false);

        // Outside a query "&" is an ordinary path character and no boundary.
        expect(isWithinURLPrefixAfterQueryAppend("https://example.com/api&evil",   "https://example.com/api")).toBe(false);
        expect(isWithinURLPrefixAfterQueryAppend("https://example.com/apievil",    "https://example.com/api")).toBe(false);
        expect(isWithinURLPrefixAfterQueryAppend("https://example.com/api.evil/x", "https://example.com/api")).toBe(false);

    });

});
