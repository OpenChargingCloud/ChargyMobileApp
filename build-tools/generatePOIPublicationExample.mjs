// PUBLIC TEST KEYS ONLY. Experimental public retrieval/time assertions, not customer consent.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CoseKey,CoseCurves,CoseAlgorithms,signWith} from '@vanaheimr/cose';
import {canonicalJSONBytes as jcs} from '@open-charging-cloud/chargy-core';
import {parseJSON,prettyJSON,clone,canonicalJSONBytes,Checkpoint,PriceStatement,POIPublicKey,toHex,toBase64,
    PricePublicationReceipt,pricePublicationOfferHashes,PRICE_PUBLICATION_RECEIPT_CONTEXT,WITNESS_PUBLICATION_POLICY_CONTEXT} from '@open-charging-cloud/wwcp-poi';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'tests/fixtures/POIPublication');await mkdir(out,{recursive:true});
const iso=value=>new Date(value).toISOString(),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const ed=seed=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,seed)]),format:'der',type:'pkcs8'});
function key(seed,pqc=false){const secret=pqc?CoseKey.fromAkpSeed(CoseAlgorithms.MLDSA65,new Uint8Array(32).fill(seed)):ed(seed),pub=pqc?secret.publicKey():CoseKey.fromOkpPublicKey(CoseCurves.Ed25519,createPublicKey(secret).export({type:'spki',format:'der'}).subarray(-32));
    return {json:POIPublicKey.parse({'@id':toHex(pub.thumbprint()),key:toBase64(pub.toBytes()),notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2030-01-01T00:00:00.000Z'}).json,
        algorithm:pqc?'ML-DSA-65':'Ed25519',sign:bytes=>pqc?toBase64(signWith(CoseAlgorithms.MLDSA65,null,bytes,secret.privateKeyBytes())):sign(null,bytes,secret).toString('base64')};}
const a=key(181),a2=key(184),b=key(183,true),base=parseJSON(await readFile(path.join(root,'tests/fixtures/POIPrices/session-with-price.chargy'),'utf8'));
const network=base.poiEvidence.roamingNetworkId,evse=base.poiEvidence.EVSEId,start=Date.parse('2026-06-01T10:00:00Z'),now='2026-11-01T00:16:21.000Z';
const witness=(id,organization,keys,endpoint)=>({id,organization,role:'price-publication-and-time',networks:[network],keys:keys.map(key=>key.json),
    notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2030-01-01T00:00:00.000Z',clockErrorMs:2000,endpoints:[endpoint]});
const policy={'@context':WITNESS_PUBLICATION_POLICY_CONTEXT,requiredOrganizations:2,witnesses:[
    witness('DEMO-WITNESS-A','Demo independent organization A',[a,a2],'https://witness-a.example/publication-receipts'),
    witness('DEMO-WITNESS-B','Demo independent organization B',[b],'https://witness-b.example/publication-receipts')
]};
function earlyCheckpoint(evidence,time){
    const entry=evidence.checkpoints[0],previousId=entry.checkpoint['@id'];
    const {'@id':_,signatures:before,...content}=entry.checkpoint;content.createdAt=iso(time);
    const checkpoint=Checkpoint.parse({'@id':digest(canonicalJSONBytes(content)),...content});
    const signatures=before.filter(signature=>signature.role==='roamingNetworkOperator').map((original,index)=>{
        const signature={...original,signedAt:iso(time),value:'placeholder'};
        return {...signature,value:sign(null,checkpoint.signingBytes({...signature,signedAt:time,json:signature}),ed(index===0?42:44)).toString('base64')};
    });
    entry.checkpoint={...checkpoint.json,signatures};for(const proof of evidence.priceStatementProofs)if(proof.checkpointId===previousId)proof.checkpointId=checkpoint.id;
    return {previousId,checkpoint:entry.checkpoint};
}
function receipt(evidence,witness,key,at,changes={}){
    const statement=PriceStatement.parse(evidence.priceStatements[0]),tariff=evidence.chargingStationProof.roamingNetwork.chargingStationOperators[0].chargingTariffs.find(item=>item['@id']===evidence.agreement.chargingTariffId);
    const value={'@context':PRICE_PUBLICATION_RECEIPT_CONTEXT,assertion:'public-price-retrieval',roamingNetworkId:network,EVSEId:evse,
        priceStatementDigest:statement.digestHex(),...pricePublicationOfferHashes(statement,tariff),checkpointId:evidence.checkpoints[0].checkpoint['@id'],witnessId:witness.id,
        publicSourceURL:'https://prices.poi.example/EVSEs/'+evse+'/priceStatements',observedAt:iso(at),signedAt:iso(at+1000),algorithm:key.algorithm,keyId:key.json['@id'],...changes,value:'placeholder'};
    return {...value,value:key.sign(PricePublicationReceipt.parse(value).signingBytes())};
}
function enrich(source,chargingStarted){
    const raw=clone(source),evidence=typeof raw.poiEvidence.priceEvidence==='string'?parseJSON(raw.poiEvidence.priceEvidence):raw.poiEvidence.priceEvidence;
    const cp=earlyCheckpoint(evidence,chargingStarted-50000);
    const history=typeof raw.poiEvidence.historicalEvidence==='string'?parseJSON(raw.poiEvidence.historicalEvidence):raw.poiEvidence.historicalEvidence;
    for(const version of history.versions){for(const entry of version.checkpoints)if(entry.checkpoint['@id']===cp.previousId)entry.checkpoint=cp.checkpoint;
        if(version.commitProof?.checkpointId===cp.previousId)version.commitProof.checkpointId=cp.checkpoint['@id'];}
    evidence.witnessCandidates=policy.witnesses;
    evidence.publicationReceipts=[receipt(evidence,policy.witnesses[0],a,chargingStarted-40000),receipt(evidence,policy.witnesses[1],b,chargingStarted-20000)];
    raw.poiEvidence.priceEvidence=typeof source.poiEvidence.priceEvidence==='string'?prettyJSON(evidence):evidence;
    raw.poiEvidence.historicalEvidence=typeof source.poiEvidence.historicalEvidence==='string'?prettyJSON(history):history;
    return {raw,evidence};
}
const positive=enrich(base,start),files={'session-before-start.chargy':positive.raw};
function variant(name,edit){const value=clone(positive.raw);edit(value.poiEvidence.priceEvidence);files[name+'.chargy']=value;}
variant('no-receipts',e=>{delete e.publicationReceipts;});
variant('late-receipt',e=>{e.publicationReceipts[1]=receipt(e,policy.witnesses[1],b,start+1000);});
variant('clock-overlap',e=>{e.publicationReceipts[1]=receipt(e,policy.witnesses[1],b,start-2000);});
variant('wrong-price',e=>{e.publicationReceipts[1]=receipt(e,policy.witnesses[1],b,start-20000,{priceStatementDigest:'ff'.repeat(32)});});
variant('wrong-signed-price',e=>{e.publicationReceipts[1]=receipt(e,policy.witnesses[1],b,start-20000,{priceStatementSHA256:'ff'.repeat(32)});});
variant('wrong-tariff',e=>{e.publicationReceipts[1]=receipt(e,policy.witnesses[1],b,start-20000,{tariffSHA256:'ff'.repeat(32)});});
variant('wrong-checkpoint',e=>{e.publicationReceipts[1]=receipt(e,policy.witnesses[1],b,start-20000,{checkpointId:'ff'.repeat(32)});});
variant('tampered-receipt',e=>{e.publicationReceipts[1].publicSourceURL='https://substituted.example/prices';});
variant('same-organization',e=>{e.publicationReceipts[1]=receipt(e,policy.witnesses[0],a2,start-20000);});
variant('unknown-witness',e=>{e.publicationReceipts[1]=receipt(e,{id:'UNAPPROVED'},b,start-20000);});
variant('future-receipt',e=>{e.publicationReceipts[1]=receipt(e,policy.witnesses[1],b,Date.parse(now)+10000);});
variant('private-source',e=>{e.publicationReceipts[1].publicSourceURL='https://127.0.0.1/private';});
const liveNames=['00-waiting','01-start','02-intermediate','03-completed'],live=[];
const liveEvidence=enrich(JSON.parse(await readFile(path.join(root,'tests/fixtures/POILive/01-start.json'),'utf8')),Date.parse('2026-11-01T00:05:00Z')).raw.poiEvidence;
for(const [index,name] of liveNames.entries()){
    const original=JSON.parse(await readFile(path.join(root,'tests/fixtures/POILive',name+'.json'),'utf8'));
    const docBase=original;if(index<2)docBase.poiEvidence=clone(liveEvidence);let doc=docBase;
    // Core envelopes use its JCS JSON representation; POI decimal objects stay inside signed evidence strings.
    doc=JSON.parse(JSON.stringify(doc));if(index>0)doc.updates=digest(jcs(live[index-1])).toUpperCase();
    const {signatures:_,...content}=doc;
    doc={...content,signatures:doc.signatures.map(signature=>({...signature,value:sign(null,jcs(content),ed(161)).toString('hex').toUpperCase()}))};
    live.push(doc);files['live-'+name+'.json']=doc;
}
const hashes={};for(const[name,value]of Object.entries(files)){const text=name.startsWith('live-')?JSON.stringify(value,null,2)+'\n':prettyJSON(value)+'\n';await writeFile(path.join(out,name),text);hashes[name]=digest(Buffer.from(text));}
await writeFile(path.join(out,'witness-policy.json'),prettyJSON(policy)+'\n');
await writeFile(path.join(out,'vectors.json'),prettyJSON({policy,now,request:{evseId:evse,meterSerialNumber:'CHARGY-POI-METER-001',chargingStarted:start,startDocumentSHA256:digest(Buffer.from(base.ocmfBegin))},session:positive.raw,
    variants:Object.fromEntries(Object.entries(files).filter(([name])=>name.endsWith('.chargy')).map(([name,value])=>[name,value.poiEvidence.priceEvidence]))})+'\n');
await writeFile(path.join(out,'provenance.json'),JSON.stringify({generator:'build-tools/generatePOIPublicationExample.mjs',now,chargingStarted:iso(start),
    keySeeds:'PUBLIC TEST KEYS ONLY: witness A Ed25519 181/184 (one organization); witness B ML-DSA-65 183; RNO 42/44; original CPO/meter keys unchanged',
    claim:'Experimental public retrieval before signed start under explicitly approved witness organizations and clocks; actual charging time and customer agreement are not independently proven',files:hashes},null,2)+'\n');
console.log('Generated '+Object.keys(files).length+' publication and live fixtures with genuine Ed25519/ML-DSA-65 signatures.');
