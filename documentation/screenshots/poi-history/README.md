# Historical POI session captures

Run `npm run docs:screenshots:poi-history` or capture an existing production build
with `npm run docs:screenshots:poi-history:capture`. Existing Playwright Chromium
is used because the Browser plugin is unavailable. Locale en-US, timezone UTC,
desktop 1440×1050, mobile 390×844; the fixed evaluation time comes from fixture
provenance. Signatures, local authorization and IndexedDB operations are real.

Review all five PNGs and update the
[feature guide](../../WWCP-POI-Historical-Sessions.md) and `capture-info.json` for
UI/UX changes. Never hand-edit screenshots or inject a positive trust/crypto
result. The script tests quota failure/retry and negative withdrawal during
delayed **real** SHA-256, restoring trust only through actual user controls.
Archive reopen/export/import never restores past decisions. CI runs the same
checks and uploads `poi-history-screenshots`.
