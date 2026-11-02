# Completed POI session captures

Run `npm run docs:screenshots:poi-session`, or use
`npm run docs:screenshots:poi-session:capture` for an existing production build.
The installed Playwright Chromium runs the real app on an ephemeral loopback
server. Locale is en-US, timezone UTC, desktop 1440×1050, mobile 390×844.

`tests/fixtures/POISession/provenance.json` provides the fixed fixture evaluation
time. Genuine signatures and explicit UI trust decisions are exercised. The
bootstrap path makes no network request; only the explicit fresh-proof action is
served a fixture response at the saved HTTPS source. Version metadata/map images
are stubbed for reproducibility. The Browser plugin is unavailable; Playwright
is used for the browser checks.

The checks include original-reading verification with the proven EVSE key,
source-key conflicts, genuinely re-signed foreign/wrong/ambiguous meter proofs,
export/reimport and trust withdrawal while real SHA-256 work is delayed. The
withdrawal removes an existing decision from IndexedDB; restoring trust uses
the actual UI. No positive verification or trust outcome is injected.

Regenerate and inspect all seven PNGs after relevant UI changes. Keep captions in
[`WWCP-POI-Session-Integration.md`](../../WWCP-POI-Session-Integration.md) and
`capture-info.json` current. Never hand-edit screenshots, insert verification
outcomes or add demo keys to production trust roots. CI uploads the captures as
`poi-completed-session-screenshots`.
