import { readResponseWithinLimit } from "./externalURLs";

export const liveLinkRequestTimeoutMilliseconds = 30_000;

export type LiveLinkFailureKind = "network" | "timeout" | "http" | "read" | "size" | "json" | "document" | "conversion";

export type LiveLinkPollFailure = {
    kind:        LiveLinkFailureKind;
    origin:      string;
    httpStatus?: number;
    detail?:     string;
};

export type LiveLinkResponse = {
    kind:       "received";
    origin:     string;
    document:   unknown;
    text:       string;
    receivedAt: Date;
};

// CORS/preflight, DNS, TLS and blocked redirects all reject fetch without a
// readable response. Never infer a specific one from "Failed to fetch".
export async function requestLiveLink(url:             URL,
                                      headers:         Record<string, string>,
                                      maxPayloadBytes: number,
                                      signal?:         AbortSignal,
                                      timeoutMilliseconds = liveLinkRequestTimeoutMilliseconds): Promise<LiveLinkResponse | LiveLinkPollFailure>
{
    const controller = new AbortController();
    const abort = (): void => { controller.abort(); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted === true)
        controller.abort();

    const timer = setTimeout(() => {
        controller.abort(new DOMException("Live request timed out", "TimeoutError"));
    }, timeoutMilliseconds);

    let phase: "network" | "read" | "json" = "network";
    try
    {
        const response = await fetch(url.href, {
            cache:       "no-store",
            credentials: "omit",
            redirect:    "error",
            headers,
            signal:      controller.signal
        });

        if (!response.ok)
        {
            await response.body?.cancel().catch(() => undefined);
            return { kind: "http", origin: url.origin, httpStatus: response.status };
        }

        phase = "read";
        const bytes = await readResponseWithinLimit(response, maxPayloadBytes);
        phase = "json";
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const document: unknown = JSON.parse(text);
        return { kind: "received", origin: url.origin, document, text, receivedAt: new Date() };
    }
    catch (error)
    {
        const reason: unknown = controller.signal.reason;
        if (reason instanceof DOMException && reason.name === "TimeoutError")
            return { kind: "timeout", origin: url.origin };

        if (phase === "read" && error instanceof Error && error.message === "External verification payload exceeds configured limit.")
        {
            controller.abort();
            return { kind: "size", origin: url.origin };
        }

        // Do not include raw exception messages: they can contain full URLs or
        // credentials. The UI identifies the server by its origin only.
        return { kind: phase, origin: url.origin };
    }
    finally
    {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
    }
}
