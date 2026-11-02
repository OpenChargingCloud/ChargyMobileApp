# WWCP POI Integration: Current Implementation and Remaining Plan

Status: 2 November 2026. The mobile port uses the published npm releases
WWCP POI **0.2.0** and ChargyCore **0.18.0**. Package integrity is recorded in
package-lock.json; no development tarballs are required. See the
[mobile integration and verification guide](WWCP-POI-Mobile-Port.md).
This document distinguishes implemented flows from remaining proposals.

This document distinguishes the implemented TrustAnchor workflow, station
checking, P-256/OCMF meter-key handoff and experimental session-bound prices
from the remaining independent publication and wider live-session integration. For the complete
trust chain, matching JSON examples and screenshots, see
[WWCP POI Trust Architecture](WWCP-POI-Trust-Architecture.md). Detailed storage and
management notes are in [Trust Management](TrustManagement.md) (German).
The [session and live-link use case](WWCP-POI-Session-and-Live-Trust.md) describes
the next session-driven flow, evidence sources, witness authorization and
verification of the first incoming reading, with diagrams, JSON and screenshots.

| Area | Status |
| --- | --- |
| Package integration, lockfile and SBOM | ✅ Implemented |
| Shared camera, clipboard, file and deep-link routing | ✅ Implemented |
| Content-only anchor preview, followed by explicit download | ✅ Implemented |
| KeyStatement signatures, signer trust, holder quorum and validity | ✅ Implemented |
| Shared library `TrustContext` and fresh storage-backed authorization | ✅ Implemented with published version 0.1.1 |
| Bundled JSONL keys and local key exclusions | ✅ Implemented; the production key list is currently empty |
| Optional manual trust scoped to an individual anchor policy | ✅ Implemented |
| IndexedDB storage and Trust Management, including roaming networks | ✅ Implemented |
| Drunken Bishop fingerprints and reproducible documentation screenshots | ✅ Implemented |
| Manual EVSE station proof, operational RNO certificates, qualified result and local proof cache | ✅ Implemented |
| Session/EVSE-bound proof panel and completed Drag & Drop fixture | ✅ Implemented; [guide](WWCP-POI-Session-Integration.md) |
| Historical reading-time association, RNO checkpoint inclusion and separate evidence archive | ✅ Implemented; [illustrated guide](WWCP-POI-Historical-Sessions.md) |
| CPO-signed prices, experimental session assignment, rate consistency and price checkpoint inclusion | ✅ Implemented; [illustrated guide](WWCP-POI-Session-Prices.md) |
| Durable local rollback/fork constraints, historical/current distinction and live reopening | ✅ Implemented; [illustrated guide](WWCP-POI-Observed-Versions.md) |
| Initial CPO envelope authority, document-key rotation and explicit policy/epoch succession | ✅ Implemented; compact delegation is experimental; [guide](WWCP-POI-Trust-Succession.md) |
| Independent publication/time evidence and witness-management UX | Planned |
| Proven meter-key handoff to ChargyCore | ✅ P-256/OCMF pilot; [shared API and counterexamples](WWCP-POI-Meter-Key-Handoff.md) |
| EMP contract offers | Planned |

## 1. Starting point and design decisions

The library already provides the cryptographic building blocks:

| Task | Available API | Current app use |
| --- | --- | --- |
| Read a TrustAnchor from compact text, URL or JSON | `TrustAnchor.parse`, `TrustAnchor.fromJSON` | ✅ Integrated |
| Evaluate a statement against locally authorized pins and create its trust context | `KeyStatement.parse`, `TrustContext.evaluate/create` | ✅ Integrated |
| Read public COSE keys and validate their thumbprints | `POIPublicKey.parse` | ✅ Integrated through the key and statement parsers |
| Verify a small station proof, including meters and tariffs | `verifyChargingStation` | ✅ Manual network/EVSE check |
| Verify signed runtime prices against the verified station | `verifyPriceStatements`, `verifySessionPriceEvidence` | ✅ Session-bound checks |
| Download and verify a station and its prices | `POIClient.chargingStation` | Available for a future bounded app adapter |
| Prove inclusion of a station version or price in checkpoints | `CheckpointProof`, `PriceStatementProof` | ✅ Historical station and selected price inclusion; independent pre-charge publication remains unproven |
| Verify session evidence, including witnesses | `parseEvidence`, `verifyEvidence` | Planned |

The app supplies trust policy, download controls, persistence, session binding and
presentation. Canonicalization, Merkle trees and signature algorithms remain the
library's responsibility.

**Keep four claims separate:** the meter-value signature is valid; the meter key
belongs to the station; the tariff and price are signed and applicable to this
session; publication is evidenced by checkpoints and, where required, independent
witnesses. A green meter-signature check does not establish the other claims.

### Trust foundation

Chargy initially trusts individual public keys shipped in
[`src/trust/trusted-public-keys.jsonl`](../src/trust/trusted-public-keys.jsonl).
The build validates this file and embeds it in the app bundle. Its format and
maintenance are documented in [`src/trust/README.md`](../src/trust/README.md).
It is currently empty; production roots still need to be configured. Test keys
must remain in test fixtures.

Users can locally exclude bundled keys and restore them. They can also explicitly
trust individual pins for a saved anchor configuration. Importing an anchor does
not automatically authorize its keys or modify the bundled list. Permission to
contact a server, including an existing live-link origin decision, is not key
trust.

The downloaded KeyStatement has separate checks for **Signatures valid**,
**Signers trusted** and **Quorum met**, plus **Validity period valid**. Signer
trust indicates whether trusted holders signed; quorum determines whether there
are enough of them. Additional unknown signers do not create trusted votes.
Several keys of one holder still count as one holder. The whole check field turns
green, with the existing `fa-check-circle` icon, only when every required check
passes.

The current `WWCP/TA-2` anchor has no signatures of its own. Its initial preview
therefore shows only supplied content. The signatures displayed after loading
belong to the KeyStatement. They do not sign the anchor's URLs or display texts.
A separately signed anchor would require a specified signed format.

## 2. Implemented TrustAnchor workflow

### 2.1 Shared input routing

✅ `trustAnchorImport.ts` and `trustAnchorPreview.ts` now route recognized anchors
before the ordinary transparency reader. The camera path uses the same parser;
clipboard, file selection, drag and drop and existing deep-link data imports use
the shared detection path.

Supported representations are:

1. `WWCP/TA-2:` compact text containing Base45-encoded deterministic CBOR.
2. A network URL with `keys` and optional `minConsensus` and `alsoAt` parameters.
   Pins come from these parameters; downloads use the extracted network base URLs.
3. Standalone JSON with `TRUST_ANCHOR_CONTEXT`, read using `parseJSON` and
   `TrustAnchor.fromJSON`.
4. The supported `/trustAnchor` JSON response containing an embedded
   `trustAnchor`. A surrounding charging receipt or evidence bundle is not
   consumed merely because it includes an anchor.
5. QR images decoded through ChargyCore's `readQRCodeTextFromImage`.

Other inputs stay with the existing transparency reader. Recognized malformed
anchors produce an error instead of becoming ordinary browser links. An arbitrary
HTTPS URL is not automatically treated as an anchor or fetched as an anchor
document. A dedicated remote-anchor-document retrieval flow remains future work;
existing `verifyURL` deep links retain their own URL-allowlist rules.

TrustAnchor files must currently be selected individually. A multi-file selection
containing an anchor is rejected as a whole, so other files are not silently
discarded. General batch or archive import of anchors is not implemented.

### 2.2 First step: show only the supplied anchor

✅ After recognition, the preview displays the network ID, sources, optional
texts, holder groups, key fingerprints and quorum. **Import** and **Cancel** stay
visible in the dialog footer, including on mobile.

This step neither downloads POI data nor reads or writes the local trust store.
It shows no verification results, bundled-key counts or trust controls. Cancel
closes the preview without importing anything. Rescanning an existing anchor
starts with this same content-only preview.

QR payload capacity is limited, especially when considering large PQC keys.
The anchor contains SHA-256 COSE Key Thumbprints, represented as 32-byte values
inside CBOR, rather than complete public keys. Those pins remain unchanged
through the download and verification process.

✅ Fingerprints appear primarily as blue Drunken Bishop raster images, with a
short hash caption and an expandable, copyable full hash. Each image is derived
locally from the hash bytes. The versioned 17×9 mapping is shared by the preview,
loaded keys, confirmation dialogs and Trust Management. Colors encode visit
counts, not trust. Images are a recognition aid; exact full-thumbprint comparison
remains authoritative.

### 2.3 Import: download, verify and store

✅ The current sequence is:

**Recognize → display anchor content → Import → download KeyStatement → verify
→ store if signatures and validity pass → show results and optionally trust keys.**

Only **Import** starts `GET {networkBase}/keyStatement`. The response may be the
statement itself or a supported operator object containing it and additional
identity-key material. The app downloads no full network snapshot, station tree,
SigningKeyCertificates, prices or checkpoints at this stage.

`trustAnchorData.ts` performs the following checks:

1. Parse the original JSON using the WWCP parser and `KeyStatement.parse`.
2. Match the network ID to the anchor and, for an embedded operator response,
   check the operator ID when supplied.
3. Parse actual public-key material and validate its COSE Key Thumbprints.
4. Verify the statement signatures and the signing keys' validity at signing time;
   check the statement's validity at the evaluation time.
5. Select locally authorized pins through `trustedAnchorHolders`, preserving the
   anchor's holder groups and applying bundled-key exclusions and scoped manual
   decisions.
6. Call the library's `TrustContext.evaluate` with the authorized IDs, available
   key material and evaluation time. The library preserves the original holder
   groups, checks signatures and validity, and requires the larger quorum from
   the anchor and statement. Only a completely successful evaluation creates a
   context; the separate diagnostic fields remain available for unknown imports.

Do not substitute `verifyHolders(anchor.holders, ...)` without the app's trust
selection: the library assumes supplied trust pins have already been authorized.
A downloaded document cannot redefine which original pins are trusted or give
one holder extra votes. Additional keys may be named, but their presence alone
does not create bootstrap trust.

If signatures and validity pass, the app automatically saves the anchor and
original downloaded document. Unknown signers or an unfulfilled trusted quorum
do not prevent this storage. **Saved** and **trusted** are different outcomes.
No second save confirmation is currently required after Import.

Invalid signatures or expired data are shown but not saved. A failed refresh
preserves an earlier cached document. Malformed or incorrectly bound responses
are rejected, and failed sources can fall back to listed mirrors. If no usable
source succeeds, the preview remains available for retry. Cancel during loading
aborts the import; generation checks prevent late results from replacing a
closed or changed view. Storage errors are reported explicitly.

The loaded view offers **Reload record** and **Close**. Verification of the
KeyStatement establishes neither a station's data version nor an attested network
name. Display texts from the QR remain supplied labels. A future verified station
proof should expose differences from its attested network name and description.

### 2.4 Optional manual key trust

✅ After a valid download, users can choose **Trust this key …** for an unknown
or locally excluded pin whose actual key material is available. A separate
confirmation displays the fingerprint image, network ID, sources, holder assignment
and quorum. Canceling this confirmation grants no trust and leaves the already
imported anchor intact.

Each decision applies only to the exact anchor configuration, including its pins,
holder grouping, quorum and normalized sources. It does not become a global root
or transfer to another configuration. Confirming or withdrawing trust recalculates
signer trust and quorum locally, without another download. It cannot repair bad
signatures or invalid validity periods. Known expired bundled keys cannot bypass
their validity through this action.

Removing a bundled key records a global local exclusion. Explicit manual trust
may separately authorize that pin for one anchor configuration. Withdrawing that
scoped decision does not remove independent bundled trust if the bundled key is
still active.

### 2.5 Download controls and original documents

✅ KeyStatement downloads reuse `readResponseWithinLimit` from `deepLinks.ts`
and `pollTargetProblem` from `liveLinkTrust.ts`. Current controls are:

- HTTPS and structurally permitted public targets in production; explicitly
  relaxed test-bench builds may use otherwise restricted HTTP/private targets.
- No URL credentials, `credentials: "omit"`, `redirect: "error"` and
  `cache: "no-store"`.
- A 1 MiB response limit, including streamed data, and a 15-second timeout per
  source, with cancellation.
- Fallback only to sources listed in the original anchor, checked against the
  same pins and policy. CORS must permit the MobileApp to read the response.

The original JSON text, source URL and download time are retained. Signed POI
documents must use `parseJSON` or `parseJSONBytes`, rather than `response.json()`
or a JSON round trip: decimal representations and duplicate properties matter.

✅ The manual station download uses the same transport policy with a 2 MiB
response limit, 15 seconds per source and 30 seconds overall. It tries the next
saved source after download or verification failure and records per-source
diagnostics. Explicit session-price retrieval now follows the same bounds in
its separate [price panel](WWCP-POI-Session-Prices.md); a missing price does not
hide a correctly verified station. `POIClient` itself does not
supply all these app transport limits.

### 2.6 Current local storage

✅ IndexedDB **`ChargyTrustManagement`**, schema version **2**, currently has
three object stores; migration preserves version-1 records:

| Store | Persisted data |
| --- | --- |
| `trustAnchors` | `id` derived from the normalized policy; canonical anchor in `qrCode`; original `sourceText`; UTC `importedAt`; optional `downloadedData` containing `sourceURL`, `downloadedAt` and original JSON `text`; optional `trustedKeys` containing key `id` and UTC `acceptedAt` |
| `deletedBundledKeys` | IDs of bundled keys excluded for this installation |
| `poiStationProofs` | Original verified proof text, exact anchor policy/QR, EVSE, source, retrieval/evaluation time; content-derived ID, no stored authorization verdict |

Duplicate checking and insertion are atomic. Equivalent compact/URL forms,
display-text changes and mirror ordering do not create duplicate policies.
Different pins, holder grouping, quorum or sources create separate configurations.
Refreshing a saved configuration updates its downloaded document while preserving
manual decisions. Decisions for individual keys are updated atomically.

The store contains original documents and decisions, not authoritative green
verification flags. Stored anchors are checked against their local identity, and
cached statements are reparsed and reevaluated against current trust and time.
Old records without downloaded data remain explicitly unverified.

Storage is specific to the browser origin and profile. Browser-data deletion or
eviction can remove it. Errors and quota failures must remain visible. Durable
storage requests, export/import of stored evidence and historical retention
policies are not yet implemented.

Saved proofs are a cache: deleting the selected anchor/network removes its
associated cache atomically. Reopening a proof reevaluates current trust and time.
The [station-proof guide](WWCP-POI-Station-Proof.md) specifies the record shape
and cache behavior; future historical session evidence needs separate retention.

### 2.7 Trust Management and remaining lifecycle work

✅ **Settings → Trust Management** contains **Roaming networks**, **Trust
Anchors** and **Bundled public keys**. Users can inspect and delete anchors,
withdraw manual decisions and locally exclude or restore bundled keys. Opening
management reevaluates cached statements without downloading POI data.

The roaming-network list uses the authenticated network ID, RNO and exact anchor
policy as its local identity. Unverified imports remain isolated by policy,
including when they claim the same network ID. Keys and quorums are never merged.
Deleting an entry removes only the policy IDs displayed there, including their
cached documents, manual decisions and station proofs. Other operators or policies claiming the
same network ID, bundled keys and exclusions are retained.

The exact anchor policy is a conservative bootstrap lineage, not a permanent
identity derived from one current key. **Still needed:** explicit lineage links
through verified key succession and revocation, and standalone certificate
management. Historical per-reading evidence, session export/import and durable
observed versions are now implemented in the pilots. Merely importing a new
server-supplied anchor is not proof of key rotation. `OperatorTrust.followedBy`
requires a correctly followed version history.

Current storage separates authorization, public historical evidence and local
negative knowledge:

| Storage | Purpose |
| --- | --- |
| `ChargyTrustManagement` | Trust decisions and bounded original station-proof cache, with source/receipt time and policy association |
| `ChargySessionEvidence` | Original session/POI evidence exports and audit snapshots; reopening rechecks today's local permission |
| `ChargyPOIObservedHistory` / `scopes` | Authenticated station revisions, price sequences, checkpoint/epoch positions and live originals; persistent rollback/fork constraints |

Deleting current trust retains historical evidence and observed-version knowledge,
but removes its authorization. See the [observed-versions guide](WWCP-POI-Observed-Versions.md)
for explicit reset, current/historical selection and remaining succession limits.

### 2.8 Shared authorization belongs in the POI library

`TrustContext` and `TrustEvaluation` live in **WWCP_POI.TS**, so web, desktop and
mobile consumers share the same signature, holder, quorum and statement-binding
rules. The library has no app storage, UI, fetch, DOM or Node dependency.

The app's `poiTrustContext.ts` only selects local authorization inputs, reparses
original cached evidence, associates the result with its local policy identity
and calls the library. `POITrustService` reads the selected anchor and deleted
bundled-key IDs in one IndexedDB transaction for every operation. It then creates
a fresh library context. Missing or corrupt records, storage errors, expiry and
insufficient trust fail closed. There is no fallback to all bundled keys and no
cached authorization token.

The library context is bound to RN, RNO, canonical signed KeyStatement content
and one evaluation time. A proof cannot silently substitute another statement,
even genuinely signed. Embedded JSON-LD context omission and signature ordering
do not change content identity; all supplied signatures and the quorum are still
checked. A changed statement must first be imported and reevaluated, and this
does not implement historical succession.

Operator, version, station and station-checkpoint verification accept this
context directly. The app service exposes operator verification and the station
verification used by the manual network/EVSE check. Retrieval, qualified results,
progressive details, cache, rechecking, session/EVSE association and an explicit
local-policy selector are implemented.
P-256/OCMF meter-key handoff is now implemented. Existing library APIs accepting a
raw `TrustAnchor` still mean that its pins are already trusted; `POIClient` and
`verifyEvidence` must not bypass the app's authorization policy.

Never persist a green context as authority or reuse one after a local policy
change. Its evidence and evaluation time describe a snapshot. Removing a bundled
bootstrap key removes its initial vote; it is not a global revocation of every
key delegated by an otherwise authorized KeyStatement.

## 3. Planned data contract with CPOs, EMPs and roaming networks

The manual and session-bound station path is implemented. The following price
and publication paths remain future session integration work; their library
APIs and required provider contracts are described here.
Here `{base}` means the selected network URL ending in `/RNs/{networkId}`.

### 3.1 A particular station

The app needs an authorized anchor policy and an unambiguous `evseId` or
`chargingStationId`, for example from a live link, transparency record or station
QR code. An anchor alone selects no station. An imported ID is initially a lookup
request; the returned proof must match it. Missing or ambiguous identity should
lead to a focused selection step, not downloading a whole station directory.

| Required data | Retrieval or contents |
| --- | --- |
| Station proof | `GET {base}/EVSEs/{id}/proof`, alternatively `/CSs/{id}/proof` |
| Attested data version | `hashAlgorithm`, `commitId`, `revision`, pruned `roamingNetwork` tree and root attestations |
| Trust chain | RNO KeyStatement, certified operational signing keys and enough valid root attestations from authorized distinct holders |
| Station context | CPO and pool skeletons; complete effective station/EVSEs; referenced tariffs, meters and keys; models and certificates where provided |
| Inclusion data | Merkle roots of omitted subtrees, or relevant leaves with index, size and audit path |
| Session binding | EVSE, meter identity, charging start and original measurements, matched to signed identity fields where available |

`verifyChargingStation(anchor, proof, { evseId, at })` reconstructs the root and
checks its attestations. Only the station and its dependencies are transferred;
omitted regions remain hashes. Transfer size also depends on the station, tariffs
and key material, not only the logarithmic audit-path length.

Use `POITrustService.verifyStation(policyId, proof, { evseId })` for the app path.
It rereads local decisions and passes a library `TrustContext`, never an arbitrary
imported anchor, to the verifier. Manual retrieval and display are implemented;
session-bound display, explicit retrieval and P-256/OCMF key handoff are now
implemented. Fully automatic discovery/refresh remains a subsequent step. See the
[station-proof guide](WWCP-POI-Station-Proof.md) for screenshots, transport, cache
and current limitations.

This verifier establishes the RNO-attested station version. It does not replay
the entire history of CPO-signed changes. Claim independent verification of a CPO
signature only when that additional evidence has actually been checked. Inspect
warnings and ensure all dependencies needed for the displayed claim are present.

### 3.2 Tariff definitions and runtime ad hoc prices

The [implemented session price workflow](WWCP-POI-Session-Prices.md) adds genuine
CPO signatures, explicit experimental session assignments, start-rate comparison
and separate checkpoint inclusion. Contract/variable profiles, customer consent,
pre-start publication and full billing evaluation remain unproven.

Static tariff definitions and their EVSE references are part of the station
proof. Dynamic ad hoc prices additionally use signed `PriceStatement` documents
from `GET {base}/EVSEs/{id}/priceStatements`, covering pool, station and EVSE.

Use the library's fields: `roamingNetworkId`, `entityType`, `entityId`,
`priceStatus.prices` with `chargingTariffId` and `elements`, `validFrom`, optional
`validUntil`, `sequence`, `previous`, `after`, `role`, `signer`, `signedAt`,
`algorithm`, `keyId`, `value` and the specified context. Do not invent another
signature container.

Check the responsible CPO, key usage (`priceStatements`), signature, key validity,
network/entity binding, EVSE tariff references and applicability at charging
start. Compare chains and contradictions against already observed statements.
The library permits gaps between supplied sequences; successful verification
does not prove completeness or guaranteed freshness. An empty result is not a
verified price, and unsigned runtime price status is not price evidence.

Pool, station and EVSE price statements remain separate. The implemented resolver
requires an explicit CPO-signed digest/tariff selection and never guesses scope
precedence. More complex tariff-element overrides need their own profile. Do not present a
verified final price while applicability is ambiguous. Compare a billed tariff,
including one embedded in OCMF, against the selected published version and its
conditions, not merely an equal tariff ID.

### 3.3 Publication evidence and later verification

A correct CPO signature alone does not establish **Publication proven**.
Retrieve and associate the following with the original session documents:

1. A commit inclusion proof for the station version:
   `GET {base}/history/commits/{commitId}/proof`.
2. Its enclosing checkpoint and checkpoint signatures.
3. A `PriceStatementProof` for every price actually used:
   `GET {base}/history/checkpoints/{checkpointId}/priceStatements/{digest}/proof`.
4. Any earlier checkpoint referenced through `after` and the required connected
   checkpoint line.
5. Independently configured witnesses and their keys, with an explicit minimum
   witness count. A witness named only by the document being checked does not
   acquire independent trust from that document.

Call `verifyEvidence` with this witness policy, then assert completeness for the
claim: `versionCheckpoint` exists, each relevant price digest has an entry in
`statementCheckpoints`, and the required witnesses were counted. Success without
optional evidence is insufficient. The library defaults to zero required
witnesses; do not silently adopt that as a publication policy.

Authorize the anchor embedded in an evidence package against the local policy.
An imported evidence bundle cannot establish its own trust foundation.

A new price can be available before the next checkpoint. The UI should then say
**Price signed and associated; publication evidence pending**. Retry within
bounded limits while the app runs and resume when reopened; a closed browser
does not guarantee background jobs.

Inclusion establishes membership and temporal relationships in the checked
history. It does not by itself prove worldwide visibility, the absence of other
views or publication before an earlier charging start. Preserve observed heads,
use independent witnesses and compare sources to detect conflicting views.

### 3.4 EMP and contractual tariffs

The price verifier checks price statements in the `chargingStationOperator`
role. It is not a generic EMP-offer verifier. Do not relabel an EMP signature as
a CPO statement.

Contract pricing additionally requires a verified EMP key relationship, the
particular offer or contract version, binding to customer/contract, EVSE and
time, and suitable publication or acceptance evidence. Agree the format and
verifier with the library and provider. Until supported, show **EMP tariff not
supported/not evidenced** and draw no conclusion about the public ad hoc price.

## 4. Shared meter-key handoff to ChargyCore

✅ The local library candidates implement an additive P-256/OCMF path, with
rules shared across web, desktop and mobile rather than duplicated in an app
adapter. See [the handoff guide](WWCP-POI-Meter-Key-Handoff.md) for the contract,
diagram, original-data policy, screenshots and counterexamples.

WWCP/POI `verifyMeterKey(context, proof, request)` re-verifies the proof and
selects only the requested EVSE's explicitly associated meter. It requires an
exact serial and one unambiguous key, or an explicit key ID. No global key search,
flat meter-list fallback or RNO/CPO signing-key substitution occurs.
`parseMeasurementPublicKey` validates an explicitly selected SPKI or COSE profile,
its declared ID and P-256 point, preserving the original scheme and producing a
canonical material identity. Equal keys with different SPKI/COSE IDs compare by
material, never by guessing an encoding from a hash.

Core `verifyOCMFSessionWithMeterKey` accepts a neutral `IMeterKeyBinding` from
an authorized caller. It reparses the original signed OCMF with exactly that key,
checks signed EVSE/meter identity, algorithm and displayed measurement values,
and reports signature results, source-key conflicts and expired observations.
Core has no POI or storage dependency. The app reads current local authorization
before and after asynchronous work and keeps original/container and proven-key
results separate. Export preserves the original key description and signed text.

The observation expires at the earliest relevant statement, attestation or
certified-key bound; it is not a lease on local trust. **Current association does
not prove historical association**, even when old reading signatures are valid.
Historical signed-reading-time association, RNO checkpoint inclusion and an
independent evidence archive are now implemented in the
[historical path](WWCP-POI-Historical-Sessions.md). Broader formats, complete
identity/owner-signed succession, station-owned measurement keys,
fully automatic discovery and a complete matching live-series pilot remain
separate work. These candidates are not published to npm by this change.

## 5. UX: implemented trust views and planned session details

✅ The anchor flow already provides staged loading, separate verification rows,
visual fingerprints, expandable signed documents, manual trust and management.
Its screenshots and JSON examples are in the
[architecture document](WWCP-POI-Trust-Architecture.md#2-user-journey-anchor-preview-download-verification-and-storage).

The session-bound station/static-tariff panel is now implemented, with a complete
[Drag & Drop example](WWCP-POI-Session-Integration.md). The combined
price/publication views below are still planned. Current key association
and proven-key measurement checks already have their own result and details.
Existing meter details
(`showMeasurementCryptoDetails`) and the PKI dialog are the model for progressive
disclosure. `showChargingTariffDetails` currently opens a placeholder overlay;
it does not yet implement POI tariff verification or evidence presentation.

### Level 1: charging session or live link

Below the existing measurement result, add a compact evidence card:

```text
Evidence for this charging session                         Details >
✓ Measurements              Signatures valid
✓ Station and meter key     Proven in the trusted network
✓ Tariff and price          Applicable at charging start
◷ Publication               Awaiting checkpoint evidence
```

Each row has its own status and opens the relevant details. Do not present an
overall verified result while required evidence is missing. Existing measurement
verification and imports remain usable without POI data. An invalid station proof
invalidates station/key association, but does not retroactively change a
mathematically correct meter-value signature.

Use both symbols and text for verified, missing/pending, expired, conflicting or
invalid, unsupported and in-progress states. Missing evidence differs from false
evidence. Label historical evaluation with **at charging start** and the evaluation
time. Show later revocations without silently reinterpreting earlier time-bound
evidence as if it were current validation.

### Level 2: domain details

- **Station:** CPO, location, EVSE, meter/serial number, assigned key, trusted
  network, data version and outcome. Add manufacturer, model, firmware,
  certificates and transparency software where evidenced.
- **Tariff:** ad hoc or contractual, issuer, version/digest, validity, currency,
  tax basis, energy/time/start charges and restrictions. Explain which price
  statement replaces which definition and whether the bill matches it. Identify
  missing or ambiguous conditions explicitly.
- **Publication:** checkpoint, time, witnesses and missing evidence, with
  **Recheck** and **Export evidence** actions.
- **Trust:** anchor, source, signature verification, authorized signers and quorum,
  with a link to management that preserves the charging-session context.

### Level 3: cryptographic verification path

Expose an expandable chain, with an individual outcome per step:

```text
Authorized TrustAnchor policy
  -> KeyStatement / pinned holders / quorum
  -> certified RNO signing keys / root attestations
  -> effectiveTree / audit paths / station version
  -> EVSE / meter / measurement key -> meter-value signature
  -> CPO key / tariff association -> PriceStatement
  -> commit and price inclusion proofs -> checkpoint / witnesses
```

Details can include algorithm, full fingerprint, signed bytes/hash, signature,
index/size/audit path, validity, source and error reason. Provide original-data
export for independent verification. Reuse visual fingerprints with expandable,
copyable full values. Support keyboard operation, focus management, screen readers
and English/German labels. On mobile, open details progressively rather than
requiring a wide persistent tree.

Documentation screenshots must follow UI/UX changes. Use
`npm run docs:screenshots` and review the resulting PNGs. The capture recipe,
fixed test setup and automatic CI artifact are documented in the
[screenshot maintenance instructions](screenshots/trust-anchor/README.md).

## 6. Delivery roadmap

| Step | Status and scope | Acceptance criteria |
| --- | --- | --- |
| 0 | ✅ Package, lockfile and SBOM | Existing project checks pass with the dependency |
| 1 | ✅ Core anchor workflow: shared routing, content-only preview, bounded KeyStatement download, real checks, scoped manual trust, IndexedDB, management and fingerprint images | Equivalent inputs use the same policy; no download before Import; errors, cancellation, refresh, persistence and offline management work |
| 1a | ✅ Shared authorization, authenticated RN/RNO/policy grouping and experimental verified succession | Fresh local decisions gate all app service checks; explicit dual-quorum policy/epoch transitions retain negative history and historical authority intervals. Authenticated compromise/revocation handling and full History owner/change-set replay remain outstanding |
| 2a | ✅ Manual station proof per EVSE, qualified station status, details, cache and current-trust recheck | Genuine proof succeeds; wrong EVSE/tampering/expiry fail; migration, cancellation and storage errors are tested |
| 2b.1 | ✅ Session/EVSE binding, embedded proofs, explicit policy choice, offline bootstrap and completed OCMF example | Genuine Drag & Drop checks two original signatures and the matching station/tariff proof; wrong/competing EVSE associations fail |
| 2b.2 | ✅ Shared POI meter-key binding and additive Core verification API for P-256/OCMF; cumulative live pilot, initial CPO authority and document-key transitions implemented | Original envelopes require independently authorized CPO keys; meter association is checked at signed measurement timestamps. Independent actual time, wider automatic discovery and other meter-format adapters remain outstanding |
| 3 | ✅ CPO prices, experimental fixed-at-start ad-hoc assignment, rate consistency and price details | 21 signed fixtures; exact session selection, missing/expired/foreign/conflicting prices, ambiguous scopes and publication states tested; contract/variable/conditional and independent publication claims remain qualified |
| 4 | ✅ RNO checkpoint inclusion, historical evidence archive and exchange; independent witness/time policy planned | Original evidence is rechecked offline under current trust; missing evidence remains visible |
| 5 | Planned further Core formats and agreed EMP-offer verification | Consistent trust and association rules cover supported formats and contract cases |

The shared import, transport and storage foundation is already implemented under
its actual module names. Future modules may include `poiVerification.ts`,
`poiMeterKeys.ts` and `poiEvidence.ts`; their names are proposals, not existing
files. Keep `chargyApp.ts` as the coordinator and retain links to original
documents in result data. Consider workers and lazy POI loading if profiling
shows that verification or initial bundle cost warrants them; neither is
currently implemented for this integration.

Step 3 uses an explicit signed selection and never guesses pool/station/EVSE precedence.
Before step 4, define trusted witnesses, their minimum count and evidence retry
windows. Before step 5, agree the EMP-offer format and contract binding. Earlier
steps can proceed independently of these decisions.

### Current next priorities

1. **Production publication witnesses and time assurance:** the
   [experimental publication pilot](WWCP-POI-Price-Publication.md) now implements
   separate local organization/key/network/clock decisions, explicit receipt
   retrieval and the scoped pre-signed-start claim. Next agree the producer
   contract, deploy independent witnesses and define stronger actual-meter-time
   evidence and authorized automatic discovery. An RNO recommendation or a later
   checkpoint alone still grants neither independent trust nor earlier publication.
2. **Compromise and revocation:** distinguish a legitimate key transition from
   an authorized statement that a key must no longer be used. Define effective
   times, historical consequences, retrieval and persistent replay protection.
3. **Backup and recovery:** export/import original accepted succession evidence
   and the observed-version journal, including contradictions. Define explicit
   profile migration and corrupt-storage recovery; an evidence archive must not
   silently restore trust or erase newer local negative knowledge.
4. **Automatic bounded proof discovery and refresh:** extend the explicit
   EVSE-based retrieval flow to sessions/live links while retaining historical
   originals, source permissions, cancellation and freshness qualifications.
5. **Interoperability and release:** agree the experimental assignment/delegation
   formats with producers and the shared libraries, exercise a real POI server,
   and prepare the library releases. Extend EMP/contract, variable-price and
   meter-format coverage in separately scoped steps. Package publication still
   requires a separate release decision.

**Optional future OCCApp integration:** receiving and displaying evidence of
agreement to the specific price offer is deferred. Capturing that agreement is
not part of Chargy's current purpose and its absence is no blocker for the
existing verification workflow. See the
[OCCApp TODO and evidence boundaries](WWCP-POI-Session-Prices.md#future-todo-optional-evidence-of-agreement-to-a-specific-price-offer).

## 7. Verification and regression coverage

✅ Current repository tests and public fixtures cover anchor representations,
malformed input, equivalent-policy identity, holder grouping, unknown signers,
scoped acceptance/withdrawal, local exclusions, signature tampering, validity,
source fallback, payload/transport limits, cancellation and the stable Drunken
Bishop mapping. Fixtures include QR images and a genuinely multiply signed
KeyStatement: see [TrustAnchor fixtures](../tests/fixtures/TrustAnchors/README.md).

Recorded browser QA covers desktop 1280×900 and mobile 390×844: real clipboard
text, file selection, drag and drop, QR image imports, a simulated camera stream,
manual confirmation/cancellation, refresh, persistence, management, concurrent
decisions and unavailable IndexedDB. Controlled endpoint responses exercise
download timing, failure, mirror fallback and invalid/expired statements. A
separate local demo also exercised an actual local KeyStatement HTTP download
under an explicit test-bench build.

Documentation captures use their own fixed 1280×1000 English/UTC setup. The
capture script asserts that step 1 makes no POI request or trust-store access and
that the downloaded test statement has valid signatures but no trusted quorum
before user acceptance. It does not inject verification outcomes. Two local
capture runs produced identical PNGs. CI is configured to regenerate captures
on its Ubuntu/Node 26 leg and upload the images as an artifact.

Latest recorded project checks: `npm run verify` passed app/test typechecking,
ESLint, **505 tests with 3 skipped**, and the production build with updated SBOM.
The build reports three size/performance warnings. This is a dated verification
record, not a claim that future test counts remain unchanged.

Additional browser QA exercises real IndexedDB snapshots, scoped manual trust,
withdrawal, bundled-key exclusions, two policies claiming one network ID and
deletion of only the selected identity, at 1280×900 and 390×844. The shared
library also passes its Node, npm-bundle and Chromium suites; this includes
genuine signatures and real station proofs using the new context API.

The initial package evaluation also checked the installed library against public
`csharp-33447ac` vectors from the neighboring library checkout: an ML-DSA anchor,
station `DE*GEF*S1`, two meters and prices for EVSE `DE*GEF*E1*1` verified;
a foreign EVSE and modified station proof were rejected. That was library-level
validation. The repository now also contains genuine public vectors and a
manual station-check UI/browser regression path. The new P-256/OCMF handoff has
its own real matching session and counterexamples; it does not change those
earlier ML-DSA vectors into a supported PQC measurement format.

Station retrieval tests now cover wrong EVSE, tampered data, expired attestations,
trust withdrawal, mirror fallback, transport limits, abort and deadlines. Browser
checks cover real v1 migration, reload/recheck, deduplication, quota failure/retry,
expiry, cancellation, navigation and cache deletion. Meter binding, original
signature rechecks, source-key conflicts, ambiguity and withdrawal during crypto
are now covered by the handoff tests. Still add session/price/evidence tests for
historical key succession, decimal price handling, empty price
sets, sequence rollback, split views, expired attestations and optional evidence
missing despite a successful `verifyEvidence` call. Include evidence bundles
with unauthorized embedded anchors, redirects, CORS failures and session switches
during ongoing verification. Import suitable public vectors with their provenance
and a fixed evaluation clock.

Physical-camera testing, a live production POI-server integration, a complete
matching live-series handoff, dynamic-price and publication UX are not covered
by the current browser QA. The completed-session P-256/OCMF handoff is covered,
including export/reimport and local withdrawal during real asynchronous crypto.

## 8. Sources and implementation entry points

- [WWCP POI TS library, APIs and limitations](https://github.com/OpenChargingCloud/WWCP_POI.TS#readme)
- [WWCP POI specification: station proofs, sections 8.4–8.6](https://github.com/OpenChargingCloud/WWCP_POI/blob/master/SPECIFICATION.md#84-proofs)
- [WWCP POI specification: prices and publication, section 12](https://github.com/OpenChargingCloud/WWCP_POI/blob/master/SPECIFICATION.md#12-prices-at-runtime)
- Current input and views: [`trustAnchorImport.ts`](../src/ts/trustAnchorImport.ts),
  [`trustAnchorPreview.ts`](../src/ts/trustAnchorPreview.ts),
  [`trustAnchorData.ts`](../src/ts/trustAnchorData.ts),
  [`trustAnchorDataView.ts`](../src/ts/trustAnchorDataView.ts).
- Trust and storage: [`trustStore.ts`](../src/ts/trustStore.ts),
  [`poiTrustContext.ts`](../src/ts/poiTrustContext.ts),
  [`anchorKeyTrust.ts`](../src/ts/anchorKeyTrust.ts),
  [`anchorKeyTrustView.ts`](../src/ts/anchorKeyTrustView.ts),
  [`trustManagement.ts`](../src/ts/trustManagement.ts),
  [`roamingNetworks.ts`](../src/ts/roamingNetworks.ts),
  [`trustedPublicKeys.ts`](../src/ts/trustedPublicKeys.ts),
  [`bundledTrustedPublicKeys.ts`](../src/ts/bundledTrustedPublicKeys.ts).
- Fingerprints: [`securityFingerprint.ts`](../src/ts/securityFingerprint.ts),
  [`securityFingerprintView.ts`](../src/ts/securityFingerprintView.ts).
- App coordination and existing detail dialogs: [`chargyApp.ts`](../src/ts/chargyApp.ts).
  Layout: [`src/index.html`](../src/index.html); labels:
  [`src/i18n.json`](../src/i18n.json); styles:
  [`src/scss/defaults.scss`](../src/scss/defaults.scss).
- Installed POI types under `node_modules/@open-charging-cloud/wwcp-poi/dist/`:
  `client.d.ts`, `keys.d.ts`, `proofs/trustAnchor.d.ts`, `proofs/trustContext.d.ts`,
  `verifier/chargingStation.d.ts` and `verifier/evidence.d.ts`.
- Installed Core types under `node_modules/@open-charging-cloud/chargy-core/dist/`:
  `chargy.d.ts`, `OCMF.d.ts` and `interfaces/IPublicKeyInfo.d.ts`.

The [complete live pilot](WWCP-POI-Live-Pilot.md) now prepares before readings,
checks each cumulative candidate before adoption, retains the fixed price, stops
after a verified end and archives exact original envelopes.
