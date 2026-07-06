import { ChargyInterfaces as iface } from "@open-charging-cloud/chargy-core";

type PdfAttachment = {
    filename?:    unknown;
    rawFilename?: unknown;
    content?:     unknown;
};

function attachmentValues(attachments: unknown): unknown[] {
    if (attachments instanceof Map)
        return Array.from(attachments.values());

    if (attachments != null && typeof attachments === "object" && !Array.isArray(attachments))
        return Object.values(attachments);

    return [];
}

function attachmentType(fileName: string): string | null {
    const lowerFileName = fileName.toLowerCase();

    if (lowerFileName.endsWith(".chargy"))
        return "application/chargy";
    if (lowerFileName.endsWith(".xml"))
        return "application/xml";
    if (lowerFileName.endsWith(".json"))
        return "application/json";
    if (lowerFileName.endsWith(".csv"))
        return "text/csv";

    return null;
}

function attachmentBytes(content: unknown): Uint8Array | null {
    if (content instanceof ArrayBuffer)
        return new Uint8Array(content);

    if (ArrayBuffer.isView(content))
        return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);

    return null;
}

export function fileInfosFromPdfAttachments(attachments: unknown,
                                            sourcePath?: string): iface.IFileInfo[] {
    const fileInfos: iface.IFileInfo[] = [];

    for (const attachmentUnknown of attachmentValues(attachments)) {
        if (attachmentUnknown == null || typeof attachmentUnknown !== "object")
            continue;

        const attachment = attachmentUnknown as PdfAttachment;
        const fileName = typeof attachment.filename === "string"
            ? attachment.filename
            : typeof attachment.rawFilename === "string"
                ? attachment.rawFilename
                : null;

        if (fileName == null)
            continue;

        const type = attachmentType(fileName);
        const data = attachmentBytes(attachment.content);

        if (type == null || data == null)
            continue;

        fileInfos.push({
            name: fileName,
            path: sourcePath,
            type,
            data,
            info: "File extracted from a PDF/A-3 or newer attachment"
        });
    }

    return fileInfos;
}

export async function hydratePdfAttachments(
    attachments:          unknown,
    getAttachmentContent: (id: string) => Promise<unknown>
): Promise<unknown> {
    if (!(attachments instanceof Map))
        return attachments;

    const hydratedAttachments = new Map<string, unknown>();

    for (const [ id, attachmentUnknown ] of attachments.entries()) {
        if (attachmentUnknown != null &&
            typeof attachmentUnknown === "object" &&
            attachmentBytes((attachmentUnknown as PdfAttachment).content) == null) {
            hydratedAttachments.set(id, {
                ...attachmentUnknown,
                content: await getAttachmentContent(id)
            });
        }
        else
            hydratedAttachments.set(id, attachmentUnknown);
    }

    return hydratedAttachments;
}

export async function expandPdfAttachments(fileInfos: iface.IFileInfo[]): Promise<iface.IFileInfo[]> {
    const expandedFileInfos: iface.IFileInfo[] = [];

    for (const fileInfo of fileInfos) {
        const isPdf = fileInfo.type.toLowerCase() === "application/pdf" ||
                      fileInfo.name.toLowerCase().endsWith(".pdf");

        if (!isPdf) {
            expandedFileInfos.push(fileInfo);
            continue;
        }

        const [ pdfjsLib ] = await Promise.all([
            import("pdfjs-dist"),
            import("pdfjs-dist/build/pdf.worker.mjs")
        ]);
        const source = fileInfo.data != null
            ? { data: fileInfo.data }
            : { url: fileInfo.path };
        const loadingTask = pdfjsLib.getDocument(source);
        const pdfDocument = await loadingTask.promise;

        try {
            const attachments = await hydratePdfAttachments(
                await pdfDocument.getAttachments(),
                id => pdfDocument.getAttachmentContent(id)
            );

            expandedFileInfos.push(...fileInfosFromPdfAttachments(
                attachments,
                fileInfo.path
            ));
        }
        finally {
            await loadingTask.destroy();
        }
    }

    return expandedFileInfos;
}
