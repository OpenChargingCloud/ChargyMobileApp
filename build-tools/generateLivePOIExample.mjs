// PUBLIC TEST KEYS ONLY. One genuine cumulative live series and signed counterexamples.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {canonicalJSONBytes as jcs} from '@open-charging-cloud/chargy-core';
import {parseJSON,prettyJSON,clone,canonicalJSONBytes,ChargingStationProof,etagToJSON,jsonETag,cborETag,Commit,Attestation,Checkpoint,PriceStatement,
    priceStatementsRoot,commitsRoot,toHex,COMMIT_CONTEXT,CHECKPOINT_CONTEXT} from '@open-charging-cloud/wwcp-poi';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'tests/fixtures/POILive');await mkdir(out,{recursive:true});
// A commit names the json, cbor and effectiveTree ETags of its version (SPECIFICATION.md 8.3): of this demo the version is
// the roaming network its proof gives, the effectiveTree ETag the root of that proof.
const versionETags=(network,eTag)=>[etagToJSON(jsonETag(network)),etagToJSON(cborETag(network)),eTag];
const base=parseJSON(await readFile(path.join(root,'tests/fixtures/POIPrices/session-with-price.chargy'),'utf8'));
const iso=value=>new Date(value).toISOString(),start=Date.parse('2026-11-01T00:05:00Z'),now='2026-11-01T00:16:21.000Z';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ed=seed=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,seed)]),format:'der',type:'pkcs8'});
const cpoPrivate=ed(161),cpoSPKI=createPublicKey(cpoPrivate).export({format:'der',type:'spki'}),cpoDocId=hash(cpoSPKI).toUpperCase();
const meterPrivate=createPrivateKey(await readFile(path.join(root,'tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/privateKey_energyMeter.pem')));
const proof=clone(base.poiEvidence.priceEvidence.chargingStationProof),operator=clone(base.poiEvidence.bootstrap.keyStatement);
proof.roamingNetwork.operator=operator;
proof.roamingNetwork.chargingStationOperators[0].signingKeys[0].usages=['chargeTransparencyRecords','priceStatements'];
const eTag=etagToJSON(ChargingStationProof.parse(proof).calculate().eTag),network=base.poiEvidence.roamingNetworkId,evse=base.poiEvidence.EVSEId;
const eTags=versionETags(proof.roamingNetwork,eTag),commitContent={'@context':COMMIT_CONTEXT,roamingNetworkId:network,revision:0,eTags},commit=Commit.parse({'@id':hash(canonicalJSONBytes(commitContent)),...commitContent});
proof.commitId=commit.id;proof.revision=0;
proof.attestations=[42,44].map((seed,index)=>{
    const value={...clone(proof.attestations[index]),commitId:commit.id,revision:0,eTag,signedAt:iso(start-300000),validUntil:'2026-11-02T00:00:00.000Z',
        keyId:operator.signingKeyCertificates[index].signingKey['@id'],value:'placeholder'};
    return {...value,value:sign(null,Attestation.parse(value).signingBytes(),ed(seed)).toString('base64')};
});
function reading(time,tx,value,{rate='35',serial='CHARGY-POI-METER-001'}={}){
    const payload=JSON.parse(base.ocmfBegin.split('|')[1]);payload.MS=serial;payload.TT='001;EUR;0;'+rate+';0;0';payload.PG='T81';payload.ID='ADHOC-LIVE-POI';
    payload.RD=[{...payload.RD[0],TM:iso(time).replace('.',',').replace('Z','+0000')+' S',TX:tx,RV:value}];
    const raw=JSON.stringify(payload);return 'OCMF|'+raw+'|'+JSON.stringify({SA:'ECDSA-secp256r1-SHA256',SE:'hex',SD:sign('sha256',Buffer.from(raw),meterPrivate).toString('hex').toUpperCase()});
}
const readings=[reading(start,'B',1000),reading(start+300000,'C',1005),reading(start+600000,'E',1011)];
function signedPrice(rate,sequence=0,previous){
    const value=clone(base.poiEvidence.priceEvidence.priceStatements[0]);value.priceStatus.prices[0].elements[0].priceComponents[0].price=parseJSON(rate);
    value.signedAt=iso(start-60000);value.validFrom=iso(start-30000);value.validUntil=iso(start+60000);value.sequence=sequence;
    if(previous)value.previous=previous;
    return {...value,value:sign(null,PriceStatement.parse(value).signingBytes(),cpoPrivate).toString('base64')};
}
const price=signedPrice('0.35'),priceTree=priceStatementsRoot([PriceStatement.parse(price)]);
const cpContent={'@context':CHECKPOINT_CONTEXT,roamingNetworkId:network,epoch:1,sequence:0,commitId:commit.id,revision:0,eTags,
    commits:{'@merkleRoot':toHex(commitsRoot([commit],'sha256')),'@size':1},priceStatements:{'@merkleRoot':toHex(priceTree.root),'@size':1},createdAt:iso(start+630000)};
const checkpoint=Checkpoint.parse({'@id':hash(canonicalJSONBytes(cpContent)),...cpContent});
const cp={...checkpoint.json,signatures:[42,44].map((seed,index)=>{
    const signature={role:'roamingNetworkOperator',signer:operator['@id'],signedAt:iso(start+630000),algorithm:'Ed25519',keyId:operator.signingKeyCertificates[index].signingKey['@id'],value:''};
    return {...signature,value:sign(null,checkpoint.signingBytes({...signature,signedAt:Date.parse(signature.signedAt),json:signature}),ed(seed)).toString('base64')};
})};
const checkpoints=[{checkpoint:cp,operator}],commitProof={'@context':'https://open.charging.cloud/contexts/wwcp/roamingNetwork/checkpointProof/v1',checkpointId:checkpoint.id,leaf:commit.checkpointLeaf(),'@index':0,'@size':1,'@auditPath':[]};
const history={'@context':'https://open.charging.cloud/contexts/wwcp/historicalMeterEvidence/v1',EVSEId:evse,versions:[{chargingStationProof:proof,commitProof,checkpoints}]};
function agreement(statement){
    const value={...clone(base.poiEvidence.priceEvidence.agreement),chargingStarted:iso(start),startDocumentSHA256:hash(Buffer.from(readings[0])),
        priceStatementDigest:PriceStatement.parse(statement).digestHex(),signedAt:iso(start+1000)};delete value.value;
    return {...value,value:sign(null,canonicalJSONBytes(value),cpoPrivate).toString('base64')};
}
const prices={'@context':'https://open.charging.cloud/contexts/wwcp/sessionPriceEvidence/v1',EVSEId:evse,chargingStationProof:proof,priceStatements:[price],agreement:agreement(price),
    priceStatementProofs:[{'@context':'https://open.charging.cloud/contexts/wwcp/roamingNetwork/priceStatementProof/v1',checkpointId:checkpoint.id,priceStatement:price,'@index':0,'@size':1,'@auditPath':[]}],checkpoints};
const initialEvidence={'@context':base.poiEvidence['@context'],EVSEId:evse,roamingNetworkId:network,bootstrap:{trustAnchor:base.poiEvidence.bootstrap.trustAnchor,keyStatement:prettyJSON(operator)},chargingStationProof:prettyJSON(proof)};
const fullEvidence={...initialEvidence,historicalEvidence:prettyJSON(history),priceEvidence:prettyJSON(prices)};
const documentKey={keyUsage:['signCTRs'],algorithm:'EdDSA-Ed25519',encodings:['SubjectPublicKeyInfo','DER','hex'],value:cpoSPKI.toString('hex').toUpperCase()};
function signedDocument(document,key=cpoPrivate){
    const {signatures:_,...remaining}=document;const signed=Object.fromEntries(Object.entries(remaining).filter(([,value])=>value!==undefined));
    return {...signed,signatures:[{keyId:cpoDocId,algorithm:'EdDSA-Ed25519',signedData:{excludedProperties:['signatures'],encodings:['JSON','JCS','UTF-8']},encodings:['hex'],value:sign(null,jcs(signed),key).toString('hex').toUpperCase()}]};
}
const first={ '@id':'CHARGY-LIVE-POI-81','@context':'https://open.charging.cloud/contexts/chargeTransparency/live/link/1.0',
    created:iso(start-10000),lastUpdated:iso(start-10000),description:{en:'POI verified live charging session',de:'POI-geprüfter Live-Ladevorgang'},
    keyIdGeneration:['SubjectPublicKeyInfo','DER','SHA-256','hex'],docRefIdGeneration:['SHA-256','hex'],chargingSessionId:'ADHOC-LIVE-POI',
    chargingStationOperator:{'@id':'DE*POI',name:{en:'Demo CPO'},publicKeys:[documentKey]},
    chargingStation:{'@id':'DE*POI*S1',geoLocation:{lat:50.9271,lng:11.5892},EVSE:{'@id':evse,energyMeter:{serialNumber:'CHARGY-POI-METER-001',publicKeys:[{
        algorithm:'ECDSA-secp256r1',encodings:['SubjectPublicKeyInfo','DER','base64'],value:base.publicKey,keyUsage:['signEnergyMeterValues']}]}}},
    liveTransports:[{type:'https',urls:['https://live.poi.example/sessions/CHARGY-LIVE-POI-81'],refresh:5}],poiEvidence:initialEvidence};
const series=[signedDocument(first)];
function next(previous,values,evidence,time){return signedDocument({...previous,lastUpdated:iso(time),updates:hash(jcs(previous)).toUpperCase(),
    signedMeterValues:{encodings:['OCMF'],values},poiEvidence:evidence});}
series.push(next(series[0],readings.slice(0,1),fullEvidence,start+1000));
series.push(next(series[1],readings.slice(0,2),undefined,start+301000));delete series[2].poiEvidence;series[2]=signedDocument(series[2]);
series.push(next(series[2],readings,undefined,start+601000));delete series[3].poiEvidence;series[3]=signedDocument(series[3]);
const bad=(changes,prev=series[1])=>signedDocument({...series[2],updates:hash(jcs(prev)).toUpperCase(),...changes});
const changedPrice=signedPrice('0.45',1,PriceStatement.parse(price).digestHex()),changedPrices={...prices,priceStatements:[price,changedPrice],agreement:agreement(changedPrice),priceStatementProofs:[],checkpoints:[]};
const files={'00-waiting.json':series[0],'01-start.json':series[1],'02-intermediate.json':series[2],'03-completed.json':series[3],
    'same-time-fork.json':signedDocument({...series[1],description:{en:'Conflicting same-time document'}}),
    'replayed-waiting.json':series[0],
    'bad-predecessor.json':bad({updates:'FF'.repeat(32)}),
    'wrong-evse.json':bad({chargingStation:{...series[2].chargingStation,EVSE:{...series[2].chargingStation.EVSE,'@id':'DE*POI*E9*1'}}}),
    'replaced-start.json':bad({signedMeterValues:{encodings:['OCMF'],values:[reading(start,'B',1001),readings[1]]}}),
    'removed-start.json':bad({signedMeterValues:{encodings:['OCMF'],values:[readings[1]]}}),
    'invalid-intermediate.json':bad({signedMeterValues:{encodings:['OCMF'],values:[readings[0],readings[1].replace('"RV":1005','"RV":1006')]}}),
    'foreign-meter.json':bad({signedMeterValues:{encodings:['OCMF'],values:[readings[0],reading(start+300000,'C',1005,{serial:'FOREIGN-METER'})]}}),
    'rate-conflict.json':bad({signedMeterValues:{encodings:['OCMF'],values:[readings[0],reading(start+300000,'C',1005,{rate:'65'})]}}),
    'repriced.json':bad({poiEvidence:{...fullEvidence,priceEvidence:prettyJSON(changedPrices)}}),
    'repriced-completed.json':next(bad({poiEvidence:{...fullEvidence,priceEvidence:prettyJSON(changedPrices)}}),readings,undefined,start+601000),
    'invalid-document.json':{...series[2],signatures:series[2].signatures.map(signature=>({...signature,value:'00'.repeat(64)}))}};
const hashes={};for(const[name,value]of Object.entries(files)){const text=JSON.stringify(value,null,2)+'\n';await writeFile(path.join(out,name),text);hashes[name]=hash(Buffer.from(text));}
await writeFile(path.join(out,'provenance.json'),JSON.stringify({generator:'build-tools/generateLivePOIExample.mjs',evaluatedAt:now,chargingStarted:iso(start),evseId:evse,
    priceDigest:PriceStatement.parse(price).digestHex(),testKeys:'PUBLIC TEST KEYS: meter existing P-256 fixture; CPO Ed25519 seed161; RNO42/44',files:hashes},null,2)+'\n');
console.log('Generated one signed four-stage POI live series and '+String(Object.keys(files).length-4)+' counterexample/continuation documents.');
