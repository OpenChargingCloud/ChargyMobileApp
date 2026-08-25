export type ClipboardContent =
    { kind: "text"; text: string } |
    { kind: "file"; blob: Blob; fileName: string };

export interface ClipboardItemLike {
    readonly types: readonly string[];
    getType(type: string): Promise<Blob>;
}

export interface ClipboardLike {
    readText(): Promise<string>;
    read?: () => Promise<readonly ClipboardItemLike[]>;
}

export type CordovaExec = (success: (value: unknown) => void,
                           failure: (error: unknown) => void,
                           service: string,
                           action: string,
                           args: readonly unknown[]) => void;

type NativeClipboardContent =
    { kind: "text"; text: string } |
    {
        kind: "file";
        base64: string;
        fileName?: string;
        mimeType?: string;
    };

function fileNameForClipboardType(type: string): string {
    const extensionByType: Record<string, string> = {
        "application/json":  "json",
        "application/pdf":   "pdf",
        "application/xml":   "xml",
        "image/jpeg":        "jpg",
        "image/png":         "png",
        "image/svg+xml":     "svg",
        "text/xml":          "xml"
    };

    return "clipboard." + (extensionByType[type] ?? "bin");
}

function requireClipboardText(text: string): ClipboardContent {
    if (text.trim() === "")
        throw new Error("The clipboard does not contain text.");

    return { kind: "text", text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function decodeBase64(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++)
        bytes[index] = binary.charCodeAt(index);

    return bytes.buffer;
}

function parseNativeClipboardContent(value: unknown): ClipboardContent {
    // Older versions of the native plug-in returned clipboard text directly.
    if (typeof value === "string")
        return requireClipboardText(value);

    if (!isRecord(value))
        throw new Error("The native clipboard returned an unsupported value.");

    const content = value as NativeClipboardContent;
    if (content.kind === "text" && typeof content.text === "string")
        return requireClipboardText(content.text);

    if (content.kind === "file" && typeof content.base64 === "string") {
        const mimeType = typeof content.mimeType === "string" && content.mimeType !== ""
            ? content.mimeType
            : "application/octet-stream";
        const fileName = typeof content.fileName === "string" && content.fileName !== ""
            ? content.fileName
            : fileNameForClipboardType(mimeType);

        return {
            kind: "file",
            blob: new Blob([ decodeBase64(content.base64) ], { type: mimeType }),
            fileName
        };
    }

    throw new Error("The native clipboard does not contain supported content.");
}

export async function readClipboardContent(clipboard: ClipboardLike): Promise<ClipboardContent> {
    if (clipboard.read == null)
        return requireClipboardText(await clipboard.readText());

    const items = await clipboard.read();
    const preferredFileTypes = [
        "application/pdf",
        "application/json",
        "application/xml",
        "text/xml",
        "image/png",
        "image/jpeg",
        "image/svg+xml"
    ];

    for (const type of preferredFileTypes) {
        for (const item of items) {
            if (!item.types.includes(type))
                continue;

            try {
                return {
                    kind: "file",
                    blob: await item.getType(type),
                    fileName: fileNameForClipboardType(type)
                };
            }
            catch {
                // Some WebKit versions advertise native pasteboard types
                // which cannot actually be materialized as a web Blob.
            }
        }
    }

    for (const item of items) {
        if (item.types.includes("text/plain"))
            return requireClipboardText(await (await item.getType("text/plain")).text());
    }

    throw new Error("The clipboard does not contain a supported transparency record.");
}

export async function readCordovaClipboardContent(exec: CordovaExec): Promise<ClipboardContent> {
    const content = await new Promise<unknown>((resolve, reject) => {
        exec(resolve, reject, "ChargyClipboard", "readText", []);
    });

    return parseNativeClipboardContent(content);
}
