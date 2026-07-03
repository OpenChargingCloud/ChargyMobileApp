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

export type CordovaExec = (success: (value: string) => void,
                           failure: (error: unknown) => void,
                           service: string,
                           action: string,
                           args: readonly unknown[]) => void;

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
    const text = await new Promise<string>((resolve, reject) => {
        exec(resolve, reject, "ChargyClipboard", "readText", []);
    });

    return requireClipboardText(text);
}
