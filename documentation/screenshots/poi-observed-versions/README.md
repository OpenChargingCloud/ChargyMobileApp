# Durable observed-version screenshots

Run `npm run docs:screenshots:poi-observations` to build the production app and run
the actual Chromium/IndexedDB interaction suite. Capture metadata records the
fixed clock, viewport, browser and fixture hash. The Browser plugin is not
available; the repository's Playwright setup is used.

Nine images show historical-price compatibility, checkpoint and price forks,
current station rollback, history management, explicit reset, mobile layout and
reopening a remembered live session under current local trust. Image 09 shows an
already open tab rechecking its original evidence after another tab commits a
genuine signed fork. The suite also exercises late crypto and live responses,
unchanged/aborted write notification suppression, and retained original readings.

Regenerate and visually inspect every image whenever these flows change. Keep
PNGs, capture-info.json, captions and the observed-versions guide in the same
change. Never set positive results or inject fixture keys into production roots.
