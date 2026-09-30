import { afterEach, describe, expect, test, vi } from "vitest";
import { requestLiveLink } from "../src/ts/liveLinkPolling";

const url = new URL("https://operator.example/live?token=private");

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("Live-link transfer diagnostics", () => {
    test("preserves authentication and transport restrictions on a successful request", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"lastUpdated":"2026-09-30"}'));
        vi.stubGlobal("fetch", fetchMock);
        const result = await requestLiveLink(url, { "STEVE-API-KEY": "secret" }, 1024);
        expect(result).toMatchObject({ kind: "received", origin: url.origin, document: { lastUpdated: "2026-09-30" } });
        expect(fetchMock).toHaveBeenCalledWith(url.href, expect.objectContaining({
            headers: { "STEVE-API-KEY": "secret" },
            credentials: "omit", redirect: "error", cache: "no-store"
        }));
        expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });

    test.each([401, 403, 500])("reports readable HTTP %i responses", async status => {
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("error", { status })));
        expect(await requestLiveLink(url, {}, 1024)).toEqual({ kind: "http", origin: url.origin, httpStatus: status });
    });

    test("does not invent a CORS diagnosis or disclose exception URLs and keys", async () => {
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch " + url.href + " STEVE-API-KEY=secret")));
        expect(await requestLiveLink(url, {}, 1024)).toEqual({ kind: "network", origin: url.origin });
    });

    test("distinguishes invalid JSON from an interrupted body", async () => {
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>error</html>")));
        expect(await requestLiveLink(url, {}, 1024)).toEqual({ kind: "json", origin: url.origin });

        const body = new ReadableStream<Uint8Array>({
            start(controller): void { controller.error(new TypeError("broken transfer")); }
        });
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(body)));
        expect(await requestLiveLink(url, {}, 1024)).toEqual({ kind: "read", origin: url.origin });
    });

    test("enforces the payload limit even when content-length is missing", async () => {
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response('"' + "x".repeat(20) + '"')));
        expect(await requestLiveLink(url, {}, 10)).toEqual({ kind: "size", origin: url.origin });
    });

    test("cancels a response whose declared size already exceeds the limit", async () => {
        let requestSignal: AbortSignal | null | undefined;
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
            requestSignal = init?.signal;
            return Promise.resolve(new Response('{}', { headers: { 'Content-Length': '1000' } }));
        }));
        expect(await requestLiveLink(url, {}, 10)).toEqual({ kind: "size", origin: url.origin });
        expect(requestSignal?.aborted).toBe(true);
    });

    test("times out both the initial request and a stalled response body", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => { reject(new DOMException("Aborted", "AbortError")); });
        })));
        const pending = requestLiveLink(url, {}, 1024, undefined, 30_000);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(await pending).toEqual({ kind: "timeout", origin: url.origin });

        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
            const body = new ReadableStream<Uint8Array>({
                start(controller): void {
                    init?.signal?.addEventListener("abort", () => { controller.error(new DOMException("Aborted", "AbortError")); });
                }
            });
            return Promise.resolve(new Response(body));
        }));
        const stalledBody = requestLiveLink(url, {}, 1024, undefined, 30_000);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(await stalledBody).toEqual({ kind: "timeout", origin: url.origin });
    });

    test("aborts an obsolete transfer and removes its timeout", async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        let requestSignal: AbortSignal | null | undefined;
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_input, init) => new Promise((_resolve, reject) => {
            requestSignal = init?.signal;
            requestSignal?.addEventListener("abort", () => { reject(new DOMException("Aborted", "AbortError")); });
        })));
        const pending = requestLiveLink(url, {}, 1024, controller.signal);
        controller.abort();
        await pending;
        expect(requestSignal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});
