# TrustAnchor documentation screenshots

These images illustrate the actual app in
[WWCP POI Trust Architecture](../../WWCP-POI-Trust-Architecture.md):

- `step-1-preview.png`: anchor content, three Drunken Bishop images grouped by
  holder, and Import/Cancel; no verification or POI download yet.
- `step-2-key-statement.png`: the downloaded KeyStatement with valid signatures
  and validity, but unknown signers and trusted quorum 0/2. No keys have been
  manually accepted in this capture.

## Regeneration

After installing project dependencies, install the pinned Chromium once:

```sh
npx playwright install chromium
npm run docs:screenshots
```

The command builds the current production UI and captures both dialog frames.
`npm run docs:screenshots:capture` reuses an already built `build/` directory;
use it only when that build is current. The capture script also accepts
`--build-dir` and `--output-dir` for CI or isolated output directories.

The script serves the local app on an ephemeral loopback port and supplies the
public test KeyStatement only when the app requests the fixture's HTTPS endpoint.
It uses a fresh browser context, English locale, UTC, a 1280×1000 viewport, a
fixed clock within the fixture's validity period and the pinned Playwright
Chromium. External map images are replaced because only the opaque dialog is
captured. No live POI server or production trust configuration is needed.
Signatures and quorum are evaluated by the app, not injected as UI results.
The script checks each state, waits for fonts, disables screenshot animations
and crops the actual dialog frame. `capture-info.json` records the setup and
fixture digest for reproducibility.

## Maintenance rule

**Regenerate and visually review these screenshots whenever relevant UI/UX
changes.** This includes layout, text, localization, buttons, fingerprint images,
verification status presentation and the import flow. Commit updated images with
the UI changes and keep their captions accurate. This requirement is also in the
repository's `AGENTS.md` so it applies to subsequent coding work.

The Ubuntu/Node 26 CI leg automatically captures the current UI and uploads it as
the `trust-anchor-documentation-screenshots` artifact. CI leaves source commits
to the author; its fresh artifact does not replace reviewing and updating the
PNGs embedded in the repository documentation. Rendering fonts can differ
between Windows and Linux, so visual review is used rather than byte equality.
