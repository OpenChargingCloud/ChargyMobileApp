# Complete POI live pilot screenshots

Run `npm run docs:screenshots:poi-live-pilot` after relevant UI/UX changes.
Inspect all seven PNGs and update metadata/captions in the same change.
`capture-info.json` records the browser, fixed clock, fixture hash and checks.
The script drives the real app and actual shared verifiers; no success flags or
production trust roots are injected.

The capture uses a local production build, en-US, UTC, desktop 1440×1050 and
mobile 390×844. The fixture clock is 2026-11-01T00:16:21Z. The declared live HTTPS
endpoint is routed to the genuine signed fixture versions with controllable
responses. All other external requests are explicitly routed or refused.

| Image | State |
| --- | --- |
| `01-prepared.png` | Station and key prepared before any reading |
| `02-start.png` | First signed B checked and price assigned |
| `03-intermediate.png` | Signed C admitted with original start and fixed price retained |
| `04-completed.png` | Signed E verified; polling stopped |
| `05-mobile.png` | Responsive live result |
| `06-fixed-price-retained.png` | Different signed offer visible; original fixed price retained |
| `07-rejected-update.png` | Invalid candidate rejected, previous accepted start remains |

Additional browser checks cover exact archived originals, export/reload/recheck,
an installation without local trust and withdrawal during actual crypto. This
does not establish independent envelope signer authority, customer consent,
pre-start publication, globally latest state or complete billing correctness.
