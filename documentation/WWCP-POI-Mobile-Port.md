# WWCP POI in Chargy Mobile

This port follows ChargyWebApp commit `e38dd50` (2026-11-02), including the POI
changes introduced after `2cff36b`. Shared verification modules, public signed
fixtures, fixture generators and architecture guides have been carried over.
The mobile integration retains Cordova startup, native clipboard/camera support,
its separate session/measurement/crypto pages and Android's duplicate-back guard.

## Dependencies and trust

- `@open-charging-cloud/wwcp-poi`: published npm **0.2.0**.
- `@open-charging-cloud/chargy-core`: published npm **0.18.0**.
- COSE and Metrological CBOR: aligned `^0.12.0` dependencies.
- TypeScript remains pinned to **6.0.3**; minimum Node.js remains **22.18**.

The bundled anchor key list and publication-witness policy start empty. Importing
a document never authorizes its keys or witness recommendations. Verification
reconstructs current local decisions; archive audit snapshots never restore trust.

Both shared libraries use registry dependencies and lockfile integrity hashes.
No local development tarballs or sibling source checkouts are needed.

## Included flows

| Flow | Mobile entry and behavior |
| --- | --- |
| TrustAnchor import | Camera, clipboard, file and inline `verify` input share detection, preview, KeyStatement verification and explicit key authorization. Camera capture stops before preview. |
| Trust management | Settings → Trust Management: anchors, key exclusions, roaming networks, station proofs, evidence archives, observed versions, verified succession and publication witnesses. |
| Completed sessions | Open a session card to see its EVSE proof, static tariffs, meter-key association and original-reading recheck. Source-key conflicts remain visible. |
| Historical evidence | Per-reading key assignments and checkpoint inclusion remain separate from current association. Archive export/reopen rechecks original data under current trust. |
| Prices and publication | Signed CPO offers, fixed-at-start binding, exact rate comparison, explicit bounded retrieval and separately authorized witness organization/time policy. |
| Live sessions | Preparation, authorized original CPO envelopes, cumulative readings, fixed-price retention, rejection before adoption, completion, original-envelope archive and durable resume. |
| Consistency and succession | Persistent rollback/fork observations, explicit reset, dual-quorum policy transitions and epoch continuation. Negative history survives source changes and anchor deletion. |

All transport requests retain the app's existing scheme/host constraints. POI
retrieval does not reuse live-link origin consent as cryptographic authorization.
Independent station, reading, price and witness verdicts stay distinct. A signed
timestamp is not proof of actual physical time or globally latest publication.

## Reproduce checks

```sh
npm ci
npm run verify
npm run lint
npm run build
npm run bundle:production
npm run docs:validate:poi-live
npm run docs:screenshots
npm run docs:screenshots:station-proof
npm run docs:screenshots:poi-session
npm run docs:screenshots:poi-history
npm run docs:screenshots:poi-prices
npm run docs:screenshots:poi-live
npm run docs:screenshots:poi-live-pilot
npm run docs:screenshots:poi-observations
npm run docs:screenshots:poi-succession
npm run docs:screenshots:poi-publication
```

The production preparation uses the existing Cordova browser hook. Capture scripts
serve `platforms/browser/www` on ephemeral loopback ports and use Playwright
Chromium because the Browser plugin is unavailable. Install its browser with
`npx playwright install chromium` when needed. Captures use genuine signed
fixtures, fixed locale/time and explicit UI trust actions. They exercise native
IndexedDB persistence/failures and mobile session-card/back navigation rather
than injecting verification outcomes. `capture-info.json` files record provenance.

The browser checks cover a desktop viewport and 390×844 mobile layouts. Android
and iOS device builds, physical camera permissions and platform-specific file
download handling require native-device QA; browser captures do not establish
those platform results.

CI repeats all ten browser suites on its Ubuntu/Node 26 leg and uploads the
generated screenshots and capture metadata as an artifact.

Validation on 2026-11-02 used Node.js 26.12.1: 602 tests passed and three were
skipped; both TypeScript projects passed. Lint reported no errors and 214 warnings.
The ten browser suites produced 58 screenshots, which were visually reviewed.
Fixture validation also checked the documentation examples and local links.
The production browser build also imported the existing SAFE PDF/A-3 fixture:
all three readings verified successfully, with no browser errors. Named dynamic
chunks preserve the existing PDF.js worker minimization exclusion.

The npm audit comparison against the unchanged starting lockfile reported the
same 40 affected packages before and after the port: 38 moderate development
dependency reports and two low reports. Runtime-only audit contains the two
known low reports involving elliptic; there is no available package fix.
