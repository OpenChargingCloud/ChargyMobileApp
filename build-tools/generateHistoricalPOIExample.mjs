// Public test keys only. All changed declarations are signed again; no expiry bypasses.
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CoseCurves, CoseKey } from '@vanaheimr/cose';
import { POIPublicKey, KeyStatement, SigningKeyCertificate, Attestation, ChargingStationProof, TrustAnchor, TrustContext,
    verifyChargingStation, Commit, Checkpoint, CheckpointProof, commitsRoot, canonicalJSONBytes,
    parseJSON, prettyJSON, toHex, toBase64, etagToJSON, jsonETag, cborETag, COMMIT_CONTEXT, CHECKPOINT_CONTEXT } from '@open-charging-cloud/wwcp-poi';

const root = fileURLToPath(new URL('../', import.meta.url));
// A commit names the json, cbor and effectiveTree ETags of its version (SPECIFICATION.md 8.3): of this demo the version is
// the roaming network its proof gives, the effectiveTree ETag the root of that proof.
const versionETags=(network,eTag)=>[etagToJSON(jsonETag(network)),etagToJSON(cborETag(network)),eTag];
const output = path.join(root, 'tests/fixtures/POIHistory'); await mkdir(output, { recursive: true });
const input = JSON.parse(await readFile(path.join(root, 'tests/fixtures/POISession/completed-session-with-evse-proof.chargy'), 'utf8'));
const historicalAt = Date.parse('2026-06-01T10:00:00.000Z');
const iso = t => new Date(t).toISOString();
const json = value => parseJSON(JSON.stringify(value));
const digest = value => createHash('sha256').update(canonicalJSONBytes(json(value))).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const base = input.poiEvidence.chargingStationProof;
const operator = input.poiEvidence.bootstrap.keyStatement;
const networkId = input.poiEvidence.roamingNetworkId;
const operatorId = operator['@id']; const evseId = input.poiEvidence.EVSEId;
const anchor = TrustAnchor.parse(input.poiEvidence.bootstrap.trustAnchor);
function key(seed, holder, before = '2026-01-01T00:00:00.000Z', after = '2030-01-01T00:00:00.000Z') {
    const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, seed)]), type: 'pkcs8', format: 'der' });
    const cose = CoseKey.fromOkpPublicKey(CoseCurves.Ed25519, createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32));
    return { publicKey: POIPublicKey.parse({ '@id': toHex(cose.thumbprint()), key: toBase64(cose.toBytes()), holder, notBefore: before, notAfter: after }),
        sign: bytes => sign(null, bytes, privateKey).toString('base64') };
}
const identities = [key(41, 'Demo holder A'), key(43, 'Demo holder B')];
const oldKeys = [key(142, 'Demo holder A', iso(historicalAt - 2 * 86400000), iso(historicalAt + 4 * 3600000)),
    key(144, 'Demo holder B', iso(historicalAt - 2 * 86400000), iso(historicalAt + 4 * 3600000))];
const checkpointKeys = [key(42, 'Demo holder A'), key(44, 'Demo holder B')];
const witness = key(151, 'Public demo witness');
let oldStatement = { ...copy(operator.keyStatement), signedAt: iso(historicalAt - 86400000), validUntil: iso(historicalAt + 4 * 3600000) };
const unsignedStatement = KeyStatement.parse(json(oldStatement));
oldStatement.signatures = identities.map(item => ({ algorithm: 'Ed25519', keyId: item.publicKey.id,
    value: item.sign(unsignedStatement.signingBytes('Ed25519', item.publicKey.id)) }));
const oldOperator = { ...copy(operator), keyStatement: oldStatement,
    signingKeyCertificates: oldKeys.map((item,index) => {
        const cert = { roamingNetworkOperatorId: operatorId, signingKey: item.publicKey.json, signedAt: iso(historicalAt - 86400000),
            algorithm: 'Ed25519', keyId: identities[index].publicKey.id, value: 'placeholder' };
        return { ...cert, value: identities[index].sign(SigningKeyCertificate.parse(json(cert)).signingBytes()) };
    }) };

const meterPrivate = createPrivateKey(await readFile(path.join(root, 'tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/privateKey_energyMeter.pem')));
const rotatedPrivate = createPrivateKey(await readFile(path.join(root, 'tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/privateKey_cpo_signCTRs.pem')));
const meterKey = privateKey => { const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    return { '@id': createHash('sha256').update(spki).digest('hex'), key: spki.toString('base64') }; };
function version(from, until, privateKey = meterPrivate, revision = 0) {
    const tree = copy(base.roamingNetwork); tree.operator = copy(oldOperator);
    tree.chargingStationOperators[0].chargingPools[0].chargingStations['@leaves'][0]['@entity'].EVSEs[0].energyMeter.publicKeys = [meterKey(privateKey)];
    const incomplete = { ...copy(base), roamingNetwork: tree, attestations: [], revision };
    const eTag = etagToJSON(ChargingStationProof.parse(json(incomplete)).calculate().eTag), eTags = versionETags(json(tree), eTag);
    const content = { '@context': COMMIT_CONTEXT, roamingNetworkId: networkId, revision, eTags };
    const commit = Commit.parse(json({ '@id': digest(content), ...content }));
    const proof = { ...incomplete, commitId: commit.id, attestations: oldKeys.map(item => {
        const attestation = { roamingNetworkId: networkId, commitId: commit.id, revision, eTag, role: 'roamingNetworkOperator',
            signer: operatorId, signedAt: iso(from), validUntil: iso(until), algorithm: 'Ed25519', keyId: item.publicKey.id, value: 'placeholder' };
        return { ...attestation, value: item.sign(Attestation.parse(json(attestation)).signingBytes()) };
    }) };
    const checkpointContent = { '@context': CHECKPOINT_CONTEXT, roamingNetworkId: networkId, epoch: 1, sequence: 0,
        commitId: commit.id, revision, eTags, commits: { '@merkleRoot': toHex(commitsRoot([commit], 'sha256')), '@size': 1 },
        createdAt: iso(historicalAt + 86400000) };
    const checkpoint = Checkpoint.parse(json({ '@id': digest(checkpointContent), ...checkpointContent }));
    const signatures = [...checkpointKeys.map(item => ({ item, role: 'roamingNetworkOperator', signer: operatorId })),
        { item: witness, role: 'witness', signer: 'CHARGY-DEMO-WITNESS' }].map(({item,role,signer}) => {
        const signature = { role, signer, signedAt: historicalAt + 86400000, algorithm: 'Ed25519', keyId: item.publicKey.id,
            value: '', json: { role, signer, signedAt: iso(historicalAt + 86400000), algorithm: 'Ed25519', keyId: item.publicKey.id, value: '' } };
        return { ...signature.json, value: item.sign(checkpoint.signingBytes(signature)) };
    });
    const signedCheckpoint = { ...checkpoint.json, signatures };
    const commitProof = { '@context': 'https://open.charging.cloud/contexts/wwcp/roamingNetwork/checkpointProof/v1',
        checkpointId: checkpoint.id, leaf: commit.checkpointLeaf(), '@index': 0, '@size': 1, '@auditPath': [] };
    const parsedCheckpoint = Checkpoint.parse(json(signedCheckpoint));
    CheckpointProof.parse(json(commitProof)).verify(parsedCheckpoint);
    ChargingStationProof.parse(json(proof)).verifyAgainstCommitProof(CheckpointProof.parse(json(commitProof)));
    for (const [index,item] of checkpointKeys.entries()) parsedCheckpoint.verifySignature(parsedCheckpoint.signatures[index], item.publicKey);
    const at = Math.max(from, historicalAt);
    const context = TrustContext.create(anchor, KeyStatement.parse(json(oldStatement)), { trustedIdentityKeyIds: anchor.keys, at });
    verifyChargingStation(context, json(proof), { evseId });
    return { chargingStationProof: proof, commitProof, checkpoints: [{ checkpoint: signedCheckpoint, operator: copy(operator) }] };
}
function reading(original, time, privateKey = meterPrivate) {
    const payload = JSON.parse(original.split('|')[1]); payload.RD[0].TM = iso(time).replace('.', ',').replace('Z', '+0000') + ' S';
    const text = JSON.stringify(payload);
    return 'OCMF|' + text + '|' + JSON.stringify({ SA: 'ECDSA-secp256r1-SHA256', SE: 'hex', SD: sign('sha256', Buffer.from(text), privateKey).toString('hex').toUpperCase() });
}
const v = version(historicalAt - 60000, historicalAt + 3600000);
const evidence = versions => ({ '@context': 'https://open.charging.cloud/contexts/wwcp/historicalMeterEvidence/v1', EVSEId: evseId, versions });
const make = versions => ({ ...copy(input), ocmfBegin: reading(input.ocmfBegin, historicalAt), ocmfEnd: reading(input.ocmfEnd, historicalAt + 1800000),
    poiEvidence: { ...copy(input.poiEvidence), chargingStationProof: undefined, historicalEvidence: evidence(versions) } });
// Two non-overlapping RNO-attested assignments; checkpoint/succession evidence is deliberately still absent here.
const rotation = make([version(historicalAt - 60000, historicalAt + 600000), version(historicalAt + 600001, historicalAt + 3600000, rotatedPrivate, 1)]
    .map(item => ({ chargingStationProof: item.chargingStationProof })));
rotation.ocmfEnd = reading(input.ocmfEnd, historicalAt + 1800000, rotatedPrivate);
const badCheckpoint = copy(v); badCheckpoint.commitProof.leaf.commitId = 'ff'.repeat(32);
const files = {
    'archived-session.chargy': make([v]),
    'expired-bootstrap-session.chargy': { ...make([v]),poiEvidence:{ ...make([v]).poiEvidence,
        bootstrap:{...input.poiEvidence.bootstrap,keyStatement:copy(oldOperator)} } },
    'missing-checkpoint.chargy': make([{ chargingStationProof: v.chargingStationProof }]),
    'wrong-period.chargy': make([version(historicalAt + 1, historicalAt + 3600000)]),
    'key-rotation.chargy': rotation,
    'conflicting-assignments.chargy': make([v, version(historicalAt - 60000, historicalAt + 3600000, rotatedPrivate)]),
    'tampered-checkpoint.chargy': make([badCheckpoint])
};
const hashes = {};
for (const [name,value] of Object.entries(files)) { const text = prettyJSON(json(value)) + '\n';
    await writeFile(path.join(output,name),text); hashes[name] = createHash('sha256').update(text).digest('hex'); }
await writeFile(path.join(output,'trusted-witnesses.json'), prettyJSON(json([{ witness: 'CHARGY-DEMO-WITNESS', key: witness.publicKey.json }])) + '\n');
await writeFile(path.join(output,'provenance.json'), JSON.stringify({ generator: 'build-tools/generateHistoricalPOIExample.mjs',
    evaluatedAt: '2026-11-01T00:16:21.000Z', begin: iso(historicalAt), end: iso(historicalAt + 1800000), checkpointAt: iso(historicalAt + 86400000),
    attestationUntil: iso(historicalAt + 3600000), historicalStatementUntil: oldStatement.validUntil, evseId,
    keys: 'PUBLIC TEST KEYS ONLY; identities 41/43, old operational keys 142/144, checkpoint keys 42/44, witness 151', files: hashes },null,2) + '\n');
assert.ok(Date.parse(oldStatement.validUntil) < Date.parse('2026-11-01T00:16:21.000Z'));
console.log('Generated archived POI sessions with expired historical statements/certificates, real checkpoints and counterexamples.');
