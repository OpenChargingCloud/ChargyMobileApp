# Session price screenshots

Regenerate with `npm run docs:screenshots:poi-prices`. The script drives the real
app through Drag & Drop, two explicit test-key decisions, shared signature and
proof verifiers, selected-anchor downloads, archive export/reload/recheck and
trust withdrawal during actual Core crypto. It never injects a success state.

The source fixture is `tests/fixtures/POIPrices/session-with-price.chargy`.
`capture-info.json` records its SHA-256, evaluation clock, viewport, browser and
tested paths. Desktop uses 1440×1050; complete price-component captures use a
taller 1440×1900 viewport to avoid clipping by the app's scroll container/footer.
The mobile frame uses 390×844; locale is en-US and
timezone UTC. All external requests are explicitly routed or blocked.

| Image | Content |
| --- | --- |
| `01-before-trust.png` | Unknown bootstrap before local authorization |
| `02-price-verified.png` | Qualified fixed-at-start assignment and separate limits |
| `03-pqc-details.png` | Actual ML-DSA-65 CPO signature, fingerprint and originals |
| `04-mobile.png` | Responsive price result |
| `05-signed-rate-conflict.png` | Two genuine signed sources disagree on rates |
| `06-publication-pending.png` | Valid assignment without price inclusion |

Renew all captures and their metadata whenever related UI/UX changes, inspect
every PNG and update the guide's captions. CI captures fresh artifacts too.
These images do not assert customer consent, pre-charge publication, final
billing correctness or globally latest/sole offers.
