# Durable observed-version screenshots

Run `npm run docs:screenshots:poi-observations` to build the production app and run
the actual Chromium/IndexedDB interaction suite. Capture metadata records the
fixed clock, viewport, browser and fixture hash. The Browser plugin is not
available; the repository's Playwright setup is used.

Eight images show historical-price compatibility, checkpoint and price forks,
current station rollback, history management, explicit reset, mobile layout and
reopening a remembered live session under current local trust.

Regenerate and visually inspect every image whenever these flows change. Keep
PNGs, capture-info.json, captions and the observed-versions guide in the same
change. Never set positive results or inject fixture keys into production roots.
