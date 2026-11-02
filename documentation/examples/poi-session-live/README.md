# Public POI session evidence examples

These unchanged documents come from the WWCP_POI.TS `csharp-33447ac` conformance
run. They describe network `QA`, EVSE `DE*GEF*E1*1` and two test witnesses.
`provenance.json` records original paths and SHA-256 hashes. Upstream license:
AGPL-3.0-only. These are public test identities, not production trust roots.
Their `.gitattributes` entries preserve the exact source bytes across platforms,
including the upstream CRLF line endings, so provenance hashes remain stable.

| File | Purpose |
| --- | --- |
| `evidence.json` | Complete signed station/price evidence, commit inclusion, price inclusion and two witnessed checkpoints |
| `trusted-anchor.txt` | Separately pinned test trust basis; not automatically accepted from the evidence |
| `trusted-witnesses.json` | Separately configured test witness identity/key bindings |
| `provenance.json` | Source paths, licensing and immutable fixture hashes |

Run `npm run docs:validate:poi-live` from the repository root. It verifies the
genuine documents with WWCP/POI 0.1.1, including the required two witnesses and
both kinds of checkpoint inclusion. It also checks the meter's DER-SPKI encoding,
P-256 curve and SHA-256(SPKI) identifier, and the complete signed inline price
example in the [use case](../../WWCP-POI-Session-and-Live-Trust.md).

The live screenshots use the existing, independently signed `OCMF-Test-01`
fixtures, which have a different EVSE and key. They show current UI behavior;
they do not demonstrate an implemented association between these fixture sets.
The new session-to-POI integration is described as proposed work.

When refreshing examples, use a complete coherent upstream fixture set, preserve
the original signed documents and update provenance deliberately. Never change
a timestamp, key, decimal or signature just to make a document pass. Keep its
historical evaluation time. Recheck all inline excerpts after a refresh.
