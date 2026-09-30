import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
    Chargy,
    ChargeTransparencyLiveLink as liveLink,
    ChargyInterfaces as iface,
    type ChargeTransparencyRecord
} from "@open-charging-cloud/chargy-core";
import type ChargyApp from "../src/ts/chargyApp";
import { createI18nDictionary } from "../src/ts/i18n";
import { createTestChargy } from "./chargyTestRuntime";

type TestApp = Pick<ChargyApp, "detectContentFormat" | "stopLiveLinkRefresh"> & {
    chargy: Chargy;
    currentLiveLink: liveLink.IChargeTransparencyLiveLink;
    liveLinkRefreshGeneration: number;
    liveLinkRefreshTimer: ReturnType<typeof setTimeout> | null;
    liveLinkRequestController: AbortController | null;
    liveLinkPollResult: unknown;
    liveLinkLastSuccessfulFetch: Date | null;
    liveLinkLastAppliedUpdate: Date | null;
    showLiveLink: (document: liveLink.IChargeTransparencyLiveLink,
                   meterValues: ChargeTransparencyRecord.IChargeTransparencyRecord | null,
                   preservePollState: boolean) => void;
    reloadLiveLink: (document: liveLink.IChargeTransparencyLiveLink,
                     targets: Array<{ url: URL; maxPayloadBytes: number }>,
                     headers: [], generation: number, signal: AbortSignal) => Promise<unknown>;
};

let ChargyAppClass: typeof ChargyApp;
beforeAll(async () => {
    // The runtime bundle supplies Leaflet globally; these tests never render a map.
    vi.stubGlobal("L", {});
    ChargyAppClass = (await import("../src/ts/chargyApp")).default;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(() => { vi.unstubAllGlobals(); });

function documentFixture(): liveLink.IChargeTransparencyLiveLink {
    return JSON.parse(readFileSync("tests/fixtures/ChargeTransparencyLive/ChargeTransparencyLiveLink_1.json", "utf8")) as liveLink.IChargeTransparencyLiveLink;
}

function createApp(): TestApp {
    const app = Object.create(ChargyAppClass.prototype) as TestApp;
    Object.assign(app, {
        chargy: createTestChargy(Chargy, { i18n: createI18nDictionary(), uiLanguages: ["de"] }),
        currentLiveLink: documentFixture(),
        liveLinkRefreshGeneration: 1,
        liveLinkRefreshTimer: null,
        liveLinkRequestController: null,
        liveLinkPollResult: null,
        liveLinkLastSuccessfulFetch: null,
        liveLinkLastAppliedUpdate: null,
        showLiveLink: vi.fn()
    });
    return app;
}

const targets = ["https://first.example/live", "https://second.example/live"].map(url => ({ url: new URL(url), maxPayloadBytes: 1_000_000 }));

describe("Mobile live-link reloads", () => {
    test("tries the next endpoint after a failed JSON response and keeps unchanged data", async () => {
        const app = createApp();
        const fetchMock = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(new Response("invalid JSON"))
            .mockResolvedValueOnce(new Response(JSON.stringify(app.currentLiveLink)));
        vi.stubGlobal("fetch", fetchMock);
        expect(await app.reloadLiveLink(app.currentLiveLink, targets, [], 1, new AbortController().signal))
            .toEqual({ kind: "unchanged", origin: "https://second.example" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(app.showLiveLink).not.toHaveBeenCalled();
        expect(app.liveLinkLastSuccessfulFetch).toBeInstanceOf(Date);
        expect(app.liveLinkLastAppliedUpdate).toBeNull();
    });

    test("reports failures from all endpoints without replacing the displayed document", async () => {
        const app = createApp();
        const otherSession = { ...app.currentLiveLink, "@id": "another-session" };
        vi.stubGlobal("fetch", vi.fn<typeof fetch>()
            .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(otherSession))));
        expect(await app.reloadLiveLink(app.currentLiveLink, targets, [], 1, new AbortController().signal))
            .toEqual({ kind: "failed", failures: [
                { kind: "http", origin: "https://first.example", httpStatus: 401 },
                { kind: "document", origin: "https://second.example" }
            ] });
        expect(app.showLiveLink).not.toHaveBeenCalled();
    });

    test("preserves the last update and surfaces an OCMF timestamp diagnostic on conversion failure", async () => {
        const app = createApp();
        const previousUpdate = new Date("2026-09-09T00:55:41Z");
        app.liveLinkLastAppliedUpdate = previousUpdate;
        const reloaded = documentFixture();
        reloaded.lastUpdated = "2026-09-09T00:56:41Z";
        const signed = reloaded.signedMeterValues;
        if (signed === undefined || !Array.isArray(signed.values))
            throw new Error("Fixture must contain signed meter values");
        signed.values = signed.values.map(value => typeof value === "string"
            ? value.replace(/2026-09-09T[^\"]+ S/g, "invalid-time") : value);
        vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(reloaded))));
        expect(await app.reloadLiveLink(app.currentLiveLink, targets.slice(0, 1), [], 1, new AbortController().signal))
            .toMatchObject({ kind: "failed", failures: [{ kind: "conversion", detail: expect.stringContaining("Zeitstempel") }] });
        expect(app.liveLinkLastAppliedUpdate).toBe(previousUpdate);
        expect(app.showLiveLink).not.toHaveBeenCalled();
    });

    test("leaving the view while conversion is pending prevents an obsolete response from rendering", async () => {
        const app = createApp();
        let complete!: (value: liveLink.IChargeTransparencyLiveLink) => void;
        vi.spyOn(app.chargy, "DetectAndConvertContentFormat").mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const pending = app.detectContentFormat("{}", vi.fn(), {
            liveReload: true,
            isCurrent: () => app.liveLinkRefreshGeneration === 1
        });
        app.stopLiveLinkRefresh();
        complete(documentFixture());
        expect(await pending).toBe(false);
        expect(app.showLiveLink).not.toHaveBeenCalled();
    });

    test("leaving the view while meter values are parsed prevents obsolete rendering and aborts the request", async () => {
        const app = createApp();
        vi.spyOn(app.chargy, "DetectAndConvertContentFormat").mockResolvedValue(documentFixture());
        let complete!: (value: undefined) => void;
        let markStarted!: () => void;
        const started = new Promise<void>(resolve => { markStarted = resolve; });
        vi.spyOn(app.chargy, "TryToParseLiveLinkMeterValues").mockImplementation(() => new Promise(resolve => {
            complete = resolve;
            markStarted();
        }));
        const controller = new AbortController();
        app.liveLinkRequestController = controller;
        const onError = vi.fn();
        const pending = app.detectContentFormat("{}", onError, {
            liveReload: true,
            isCurrent: () => app.liveLinkRefreshGeneration === 1
        });
        await started;
        app.stopLiveLinkRefresh();
        complete(undefined);
        expect(await pending).toBe(false);
        expect(controller.signal.aborted).toBe(true);
        expect(app.showLiveLink).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    test("uses a structured parser error before the generic result message", async () => {
        const app = createApp();
        vi.spyOn(app.chargy, "DetectAndConvertContentFormat").mockResolvedValue({
            status: iface.SessionVerificationResult.InvalidSessionFormat,
            message: { de: "Allgemeiner Fehler" },
            errors: [{ message: { de: "Konkreter Parserfehler" }, level: iface.ErrorLevel.high }],
            certainty: 0
        });
        const onError = vi.fn();
        expect(await app.detectContentFormat("{}", onError)).toBe(false);
        expect(onError).toHaveBeenCalledWith("Konkreter Parserfehler");
    });
});
