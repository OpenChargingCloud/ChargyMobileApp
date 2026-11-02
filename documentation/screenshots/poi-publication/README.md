# Publication witness captures

Run `npm run docs:screenshots:poi-publication`. Eight real-app captures show
untrusted incoming witnesses, explicit policy review, the scoped verified claim,
late and tampered receipts, withdrawal, mobile management and live completion.
The complete policy review and expanded receipt details use component captures;
the remaining images retain the app frame. No capture injects a success state.

The fixed fixture clock is 2026-11-01T00:16:21.000Z, Chromium desktop 1440×1050
and mobile 390×844, English/UTC. The two complete component captures use a taller
1440×1900 viewport so the app's scroll container and footer do not clip their
contents. Playwright is used because the Browser plugin is
unavailable. Native storage failure, explicit receipt retrieval, archive
export/reload and cross-tab withdrawal are also exercised. Regenerate and review
every image and `capture-info.json` whenever the related UI/UX changes.
