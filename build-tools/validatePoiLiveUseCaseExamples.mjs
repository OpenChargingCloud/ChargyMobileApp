import assert from 'node:assert/strict';
import { createHash, createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TrustAnchor, TrustContext, KeyStatement, canonicalJSON, parseJSON, parseEvidence,
    parseTrustedWitnesses, verifyEvidence, verifyChargingStation, PriceStatement } from '@open-charging-cloud/wwcp-poi';

// Documentation fixtures, explicitly trusted for this test only. Never used by production bootstrap code.
const root = fileURLToPath(new URL('../documentation/examples/poi-session-live/', import.meta.url));
const provenance = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
for (const [file, metadata] of Object.entries(provenance.files))
    assert.equal(createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'), metadata.sha256, file);
const pinned = TrustAnchor.parse(await readFile(path.join(root, 'trusted-anchor.txt'), 'utf8'));
const raw = parseJSON(await readFile(path.join(root, 'evidence.json'), 'utf8'));
const evidence = parseEvidence(raw);
const embedded = TrustAnchor.parse(evidence.trustAnchor);
assert.equal(canonicalJSON(pinned.toJSON()), canonicalJSON(embedded.toJSON()), 'Fixture evidence must match separately pinned test anchor');
const witnesses = parseTrustedWitnesses(parseJSON(await readFile(path.join(root, 'trusted-witnesses.json'), 'utf8')));
const operator = evidence.chargingStationProof.roamingNetwork.operator;
const statement = KeyStatement.parse(operator.keyStatement);
const trust = TrustContext.create(pinned, statement, {
    trustedIdentityKeyIds: pinned.keys, at: evidence.chargingStarted
});
assert.equal(TrustContext.evaluate(pinned, statement, {
    trustedIdentityKeyIds: [], at: evidence.chargingStarted
}).context, undefined, 'An embedded anchor cannot authorize its own pins');
const station = verifyChargingStation(trust, evidence.chargingStationProof, { evseId: evidence.evseId });
const verified = verifyEvidence(evidence, { witnesses, requiredWitnesses: 2 });
assert.throws(() => verifyEvidence(evidence, { witnesses: [], requiredWitnesses: 2 }),
    'RNO signatures cannot satisfy the independent-witness requirement');
assert.equal(station.roamingNetwork.id, 'QA');
assert.equal(evidence.evseId, 'DE*GEF*E1*1');
assert.ok(verified.versionCheckpoint);
assert.equal(verified.prices.size, 1);
for (const { digest } of verified.prices.values()) assert.ok(verified.statementCheckpoints.has(digest));
for (const { signatures } of verified.checkpoints) assert.equal(signatures.witnessedBy.length, 2);
const meter = station.energyMeters.find(item => item['@id'] === 'DE*GEF*M1*1');
assert.ok(meter);
assert.equal(meter.serialNumber, 'DCM-2026-001-1');
const key = meter.publicKeys[0];
const bytes = Buffer.from(key.key, 'base64');
assert.equal(createHash('sha256').update(bytes).digest('hex'), key['@id']);
assert.equal(createPublicKey({ key: bytes, format: 'der', type: 'spki' }).asymmetricKeyType, 'ec');
assert.equal(createPublicKey({ key: bytes, format: 'der', type: 'spki' }).asymmetricKeyDetails.namedCurve, 'prime256v1');
const documentPath = path.resolve(root, '../../WWCP-POI-Session-and-Live-Trust.md');
const markdown = await readFile(documentPath, 'utf8');
let jsonExamples = 0;
let signedPriceExamples = 0;
for (const match of markdown.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)) {
    const value = parseJSON(match[1]);
    jsonExamples++;
    if (Array.isArray(value) && value[0]?.witness !== undefined) {
        const shown = parseTrustedWitnesses(value);
        assert.deepEqual(shown.map(item => [item.witness, item.key.id, item.key.json.key]),
            witnesses.map(item => [item.witness, item.key.id, item.key.json.key]));
    }
    if (value?.['@context'] === 'https://open.charging.cloud/contexts/wwcp/roamingNetwork/priceStatement/v1') {
        const price = PriceStatement.parse(value);
        price.verify(station.roamingNetwork.id, station.operator['@id'], station.operatorSigningKeys);
        assert.ok(verified.prices.get(`EVSE:${evidence.evseId}`)?.digest === price.digestHex());
        signedPriceExamples++;
    }
    if (value?.hashAlgorithm !== undefined) {
        assert.equal(value.commitId, evidence.chargingStationProof.commitId);
        assert.equal(value.revision, evidence.chargingStationProof.revision);
    }
    if (value?.['@leaves'] !== undefined) {
        const pools = evidence.chargingStationProof.roamingNetwork.chargingStationOperators['@leaves'][0]['@entity'].chargingPools;
        assert.equal(value['@size'], pools['@size']);
        assert.equal(value['@leaves'][0]['@entity']['@id'], pools['@leaves'][0]['@entity']['@id']);
        assert.equal(canonicalJSON(value['@leaves'][0]['@auditPath']), canonicalJSON(pools['@leaves'][0]['@auditPath']));
    }
    if (value?.energyMeter !== undefined) {
        assert.equal(value['@id'], evidence.evseId);
        assert.equal(value.energyMeter.serialNumber, meter.serialNumber);
        assert.equal(value.energyMeter.publicKeys[0].key, key.key);
        assert.equal(value.energyMeter.publicKeys[0]['@id'], key['@id']);
    }
}
assert.ok(jsonExamples >= 7);
assert.equal(signedPriceExamples, 1);
for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(match[1]) || match[1].startsWith('#')) continue;
    await readFile(path.resolve(path.dirname(documentPath), decodeURIComponent(match[1].split('#')[0])));
}
console.log(JSON.stringify({ network: station.roamingNetwork.id, evse: evidence.evseId, meters: station.energyMeters.length,
    priceStatements: verified.prices.size, witnessedCheckpoints: verified.checkpoints.length,
    requiredWitnesses: 2, meterKeyEncoding: 'DER-SPKI / SHA-256(SPKI)', at: evidence.chargingStarted,
    jsonExamples, signedPriceExamples, localLinks: 'valid' }, null, 2));
