# Station proof screenshots

Run `npm run docs:screenshots:station-proof` from the repository root, with the
existing Playwright Chromium installed (`npx playwright install chromium` only
when setting up a new environment). To capture an already built production app,
use `npm run docs:screenshots:station-proof:capture`.

The script serves the actual app on an ephemeral loopback port. Genuine public
POI fixtures are supplied at their HTTPS endpoints through Playwright routing.
Identity-key trust is explicitly accepted through the real UI for the two holders
that signed the KeyStatement. Production roots and verification outcomes are
never modified. Map tiles and version metadata are stubbed for reproducibility.

The capture fixes locale `en-US`, timezone UTC and time
`2026-10-27T17:20:48.115Z`, inside the fixture's attestation window. Desktop is
1280×1000; mobile is 390×844. `capture-info.json` records hashes and checks. The
script also verifies migration, cache, errors, cancellation and deletion. The
Browser plugin is unavailable in this environment; the existing Playwright
installation is used instead.

Whenever the UI/UX or relevant behavior changes, regenerate and visually inspect
**all three PNGs**, update captions in
[`WWCP-POI-Station-Proof.md`](../../WWCP-POI-Station-Proof.md) and include metadata
in the same change. Never hand-edit screenshots or injected green checks. CI
uploads fresh captures as `station-proof-documentation-screenshots`.
