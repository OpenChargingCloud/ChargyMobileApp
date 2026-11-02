# Session and live-link use-case screenshots

These images show the real current Chargy MobileApp. They are not proposed screens
or a simulated successful POI session integration. Captions and limitations are
in [the use case](../../WWCP-POI-Session-and-Live-Trust.md).

| Image | Actual behavior |
| --- | --- |
| `01-trust-ready.png` | Real KeyStatement checks after explicitly authorizing a key of each of two holders through UI controls |
| `02-live-waiting.png` | Genuine signed live envelope without readings; endpoint permission granted for this session |
| `03-first-reading.png` | Genuine first HTTPS update processed and its single OCMF reading verified by the current Core path |

Regenerate from the repository root:

```sh
npm run docs:screenshots:poi-live
```

For an existing production build, use `npm run docs:screenshots:poi-live:capture`.
The capture command supports `--build-dir` and `--output-dir`, for example:

```sh
npm run docs:screenshots:poi-live:capture -- --output-dir artifacts/poi-live-screenshots
```

Playwright Chromium must already be installed (`npx playwright install chromium`).
CI installs Chromium and regenerates these screenshots as a downloadable artifact.
No browser dependency is downloaded by the capture script itself.

The script uses a fresh browser context, English locale, UTC, a 1280×1000 viewport,
reduced motion and a fixed clock at `2026-09-09T00:50:41.000Z`. It routes the public
test endpoint to unchanged signed fixtures. The initial live response is held
until after the empty-state capture. The script starts the request using the
actual **Retry now** control rather than waiting for the poll timer. The update follows the
normal HTTPS, conversion and verification path. Background map tiles are replaced
with a transparent image. No verification state, trust-store row or DOM success
indicator is injected. Capture metadata includes fixture hashes and browser version.

Whenever trust/KeyStatement UX, live-link layout, origin consent, update processing
or reading presentation changes, regenerate, inspect every PNG and update both
captions and `capture-info.json` as needed. Keep fixture identities separate in
the explanation until the actual POI-to-live integration exists. Do not hand-edit
images, patch outcomes or add public fixture keys to production trust roots.
