# CPO authority and trust-succession captures

Run `npm run docs:screenshots:poi-succession`. Nine real-app captures show initial
CPO authority, rejection of a foreign first signer, CPO key rotation, explicit
policy review, live completion across that policy change, epoch review/current
proof, mobile layout and rejected transition evidence. Playwright is used because
the Browser plugin is unavailable.

Regenerate and review every image and capture-info.json when these flows change.
Keep them with the implementation and guide. Never inject positive results or
production fixture roots. Related packets retain their negative journal; the
independent epoch-only world uses a separate real browser context.
