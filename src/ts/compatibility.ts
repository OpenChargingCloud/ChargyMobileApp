type Uint8ArrayPrototypeWithToHex = Uint8Array & {
    toHex?: () => string;
};

export function uint8ArrayToHex(bytes: Uint8Array): string {
    let hex = "";

    for (const byte of bytes)
        hex += byte.toString(16).padStart(2, "0");

    return hex;
}

export function installUint8ArrayToHexPolyfill(): void {
    const prototype = Uint8Array.prototype as Uint8ArrayPrototypeWithToHex;

    if (typeof prototype.toHex === "function")
        return;

    Object.defineProperty(prototype, "toHex", {
        configurable: true,
        writable:     true,
        value: function(this: Uint8Array): string {
            return uint8ArrayToHex(this);
        }
    });
}
