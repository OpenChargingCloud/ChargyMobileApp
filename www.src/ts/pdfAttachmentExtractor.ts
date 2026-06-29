export interface PdfTransparencyRecord {
    attachmentName: string;
    content: any;
}

interface PdfAttachment {
    filename?: string;
    content?: Uint8Array | null;
}

type PdfAttachments = Map<string, PdfAttachment> | Record<string, PdfAttachment>;

interface PdfDocument {
    getAttachments: () => Promise<PdfAttachments | null>;
    getAttachmentContent?: (id: string) => Promise<Uint8Array | null>;
}

type PdfJsLib = {
    getDocument: (options: any) => {
        promise: Promise<PdfDocument>;
    };
    GlobalWorkerOptions?: {
        workerSrc: string;
    };
};

async function loadPdfJs(): Promise<PdfJsLib> {
    const dynamicImport = new Function("moduleUrl", "return import(moduleUrl)") as (moduleUrl: string) => Promise<PdfJsLib>;
    const testPdfJs = (globalThis as any).__chargyPdfJs as PdfJsLib | undefined;

    if (testPdfJs)
        return testPdfJs;

    if (typeof document === "undefined")
        return dynamicImport("pdfjs-dist/legacy/build/pdf.mjs");

    const pdfJsUrl      = new URL("lib/pdfjs/pdf.mjs", document.baseURI).href;
    const pdfWorkerUrl  = new URL("lib/pdfjs/pdf.worker.mjs", document.baseURI).href;
    const pdfjs = await dynamicImport(pdfJsUrl);

    if (pdfjs.GlobalWorkerOptions)
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    return pdfjs;
}

function isJsonAttachment(name: string): boolean {
    return /\.(json|chargy)$/i.test(name);
}

function isXmlAttachment(name: string): boolean {
    return /\.xml$/i.test(name);
}

function decodeAttachment(content: Uint8Array): string {
    const bytes = content instanceof Uint8Array
        ? content
        : new Uint8Array(content);

    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function extractTransparencyRecordsFromPdf(pdfData: ArrayBuffer): Promise<PdfTransparencyRecord[]> {
    const pdfjs = await loadPdfJs();
    const loadingTask = pdfjs.getDocument({
        data: pdfData,
        disableWorker: true
    });
    const pdf = await loadingTask.promise;
    const attachments = await pdf.getAttachments();

    if (!attachments)
        throw new Error("PDF enthält keine Anhänge.");

    const records: PdfTransparencyRecord[] = [];
    const xmlAttachmentNames: string[] = [];

    const attachmentEntries = attachments instanceof Map
        ? attachments.entries()
        : Object.entries(attachments);

    for (const [attachmentKey, attachment] of attachmentEntries) {
        const attachmentName = attachment.filename || attachmentKey;

        if (isJsonAttachment(attachmentName)) {
            const content = attachment.content ??
                            await pdf.getAttachmentContent?.(attachmentKey);

            if (!content)
                throw new Error("PDF-Anhang konnte nicht gelesen werden: " + attachmentName);

            records.push({
                attachmentName: attachmentName,
                content: JSON.parse(decodeAttachment(content))
            });
        }
        else if (isXmlAttachment(attachmentName)) {
            xmlAttachmentNames.push(attachmentName);
        }
    }

    if (records.length === 0 && xmlAttachmentNames.length > 0)
        throw new Error(
            "PDF enthält XML-Anhänge, aber XML-Transparenzdaten werden noch nicht ausgewertet: " +
            xmlAttachmentNames.join(", ")
        );

    if (records.length === 0)
        throw new Error("PDF enthält keine auswertbaren JSON/Chargy-Anhänge.");

    return records;
}
