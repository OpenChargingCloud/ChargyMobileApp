import { describe, expect, test } from "vitest";
import {
    installUint8ArrayToHexPolyfill,
    uint8ArrayToHex
} from "../src/ts/compatibility";

describe("JavaScript runtime compatibility", () => {

    test("encodes bytes as the lowercase hexadecimal form expected by PDF.js", () => {
        expect(uint8ArrayToHex(new Uint8Array([ 0x00, 0x01, 0x0f, 0x10, 0xab, 0xff ])))
            .toBe("00010f10abff");
    });

    test("provides Uint8Array.toHex without replacing a native implementation", () => {
        const previousImplementation = (Uint8Array.prototype as Uint8Array & { toHex?: () => string }).toHex;

        installUint8ArrayToHexPolyfill();

        const currentImplementation = (Uint8Array.prototype as Uint8Array & { toHex?: () => string }).toHex;
        expect(currentImplementation?.call(new Uint8Array([ 0xde, 0xad, 0xbe, 0xef ]))).toBe("deadbeef");

        if (previousImplementation != null)
            expect(currentImplementation).toBe(previousImplementation);
        else
            expect(typeof currentImplementation).toBe("function");
    });

});
