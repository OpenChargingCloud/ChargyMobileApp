// PUBLIC TEST KEYS. Experimental CPO price assignment; no production trust roots are modified.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPrivateKey,createPublicKey,sign,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CoseKey,CoseCurves,CoseAlgorithms,signWith} from '@vanaheimr/cose';
import {parseJSON,prettyJSON,clone,canonicalJSONBytes,toHex,toBase64,etagToJSON,jsonETag,cborETag,POIPublicKey,ChargingStationProof,
    Attestation,Commit,Checkpoint,CheckpointProof,PriceStatement,PriceStatementProof,priceStatementsRoot,commitsRoot,COMMIT_CONTEXT,CHECKPOINT_CONTEXT} from '@open-charging-cloud/wwcp-poi';
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'tests/fixtures/POIPrices');await mkdir(output,{recursive:true});
// A commit names the json, cbor and effectiveTree ETags of its version (SPECIFICATION.md 8.3): of this demo the version is
// the roaming network its proof gives, the effectiveTree ETag the root of that proof.
const versionETags=(network,eTag)=>[etagToJSON(jsonETag(network)),etagToJSON(cborETag(network)),eTag];
const original=parseJSON(await readFile(path.join(root,'tests/fixtures/POIHistory/archived-session.chargy'),'utf8'));
const start=Date.parse('2026-06-01T10:00:00.000Z'),iso=t=>new Date(t).toISOString(),hash=value=>createHash('sha256').update(value).digest('hex');
const networkId=original.poiEvidence.roamingNetworkId,evseId=original.poiEvidence.EVSEId,cpoId='DE*POI',tariffId='DE*POI*T1';
const baseVersion=original.poiEvidence.historicalEvidence.versions[0],baseProof=baseVersion.chargingStationProof,checkpointOperator=baseVersion.checkpoints[0].operator;
const edPrivate=seed=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,seed)]),type:'pkcs8',format:'der'});
function cpoKey(pqc=false,usages=['priceStatements']){
    const privateKey=pqc?CoseKey.fromAkpSeed(CoseAlgorithms.MLDSA65,new Uint8Array(32).fill(163)):edPrivate(161);
    const publicCose=pqc?privateKey.publicKey():CoseKey.fromOkpPublicKey(CoseCurves.Ed25519,createPublicKey(privateKey).export({type:'spki',format:'der'}).subarray(-32));
    return {algorithm:pqc?'ML-DSA-65':'Ed25519',publicKey:POIPublicKey.parse({'@id':toHex(publicCose.thumbprint()),key:toBase64(publicCose.toBytes()),
        usages,notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2030-01-01T00:00:00.000Z'}),
        sign:bytes=>pqc?toBase64(signWith(CoseAlgorithms.MLDSA65,null,bytes,privateKey.privateKeyBytes())):sign(null,bytes,privateKey).toString('base64')};
}
const meterPrivate=createPrivateKey(await readFile(path.join(root,'tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/privateKey_energyMeter.pem')));
function meterReading(raw,rate='35'){
    const payload=JSON.parse(raw.substring(raw.indexOf('|')+1,raw.lastIndexOf('|')));
    payload.IT='NONE';payload.ID='ADHOC-PRICE-DEMO';payload.TT='001;EUR;0;'+rate+';0;0';
    const text=JSON.stringify(payload);return 'OCMF|'+text+'|'+JSON.stringify({SA:'ECDSA-secp256r1-SHA256',SE:'hex',SD:sign('sha256',Buffer.from(text),meterPrivate).toString('hex').toUpperCase()});
}
function price(key,changes={}){
    const value={'@context':'https://open.charging.cloud/contexts/wwcp/roamingNetwork/priceStatement/v1',roamingNetworkId:networkId,entityType:'EVSE',entityId:evseId,
        priceStatus:{prices:[{chargingTariffId:tariffId,elements:[{priceComponents:[{type:'ENERGY',price:parseJSON('0.35'),stepSize:1}]}]}]},
        signedAt:iso(start-300000),validFrom:iso(start-60000),validUntil:iso(start+300000),sequence:0,role:'chargingStationOperator',signer:cpoId,
        algorithm:key.algorithm,keyId:key.publicKey.id,...changes,value:'placeholder'};
    return {...value,value:key.sign(PriceStatement.parse(value).signingBytes())};
}
function assignment(key,statement,begin,changes={}){
    const value={'@context':'https://open.charging.cloud/contexts/wwcp/sessionPriceAgreement/v1',roamingNetworkId:networkId,EVSEId:evseId,
        meterSerialNumber:'CHARGY-POI-METER-001',chargingStarted:iso(start),startDocumentSHA256:hash(Buffer.from(begin)),chargingMode:'adhoc',
        chargingTariffId:tariffId,priceStatementDigest:PriceStatement.parse(statement).digestHex(),priceBinding:'fixed-at-start',pricingProfile:'chargy-gross-rates/v1',
        role:'chargingStationOperator',signer:cpoId,signedAt:iso(start+60000),algorithm:key.algorithm,keyId:key.publicKey.id,...changes};
    return {...value,value:key.sign(canonicalJSONBytes(value))};
}
function publication(key,statements){
    const proof=clone(baseProof);proof.roamingNetwork.chargingStationOperators[0].signingKeys=[key.publicKey.json];
    const eTag=etagToJSON(ChargingStationProof.parse(proof).calculate().eTag);
    const eTags=versionETags(proof.roamingNetwork,eTag),content={'@context':COMMIT_CONTEXT,roamingNetworkId:networkId,revision:0,eTags};
    const commit=Commit.parse({'@id':hash(canonicalJSONBytes(content)),...content});proof.commitId=commit.id;proof.revision=0;
    proof.attestations=baseProof.attestations.map((item,index)=>{
        const value={...item,commitId:commit.id,revision:0,eTag,value:'placeholder'};
        return {...value,value:sign(null,Attestation.parse(value).signingBytes(),edPrivate(index===0?142:144)).toString('base64')};
    });
    const psTree=priceStatementsRoot(statements.map(PriceStatement.parse));
    const cpContent={'@context':CHECKPOINT_CONTEXT,roamingNetworkId:networkId,epoch:1,sequence:0,commitId:commit.id,revision:0,eTags,
        commits:{'@merkleRoot':toHex(commitsRoot([commit],'sha256')),'@size':1},priceStatements:{'@merkleRoot':toHex(psTree.root),'@size':psTree.size},createdAt:iso(start+86400000)};
    const cp=Checkpoint.parse({'@id':hash(canonicalJSONBytes(cpContent)),...cpContent});
    const signatures=[42,44,151].map((seed,index)=>{
        const keyId=index<2?checkpointOperator.signingKeyCertificates[index].signingKey['@id']:baseVersion.checkpoints[0].checkpoint.signatures[2].keyId;
        const role=index<2?'roamingNetworkOperator':'witness',signer=index<2?checkpointOperator['@id']:'CHARGY-DEMO-WITNESS';
        const signature={role,signer,signedAt:start+86400000,algorithm:'Ed25519',keyId,value:'',json:{role,signer,signedAt:iso(start+86400000),algorithm:'Ed25519',keyId,value:''}};
        return {...signature.json,value:sign(null,cp.signingBytes(signature),edPrivate(seed)).toString('base64')};
    });
    const checkpoint={...cp.json,signatures},commitProof={'@context':'https://open.charging.cloud/contexts/wwcp/roamingNetwork/checkpointProof/v1',
        checkpointId:cp.id,leaf:commit.checkpointLeaf(),'@index':0,'@size':1,'@auditPath':[]};
    CheckpointProof.parse(commitProof).verify(Checkpoint.parse(checkpoint));
    return {proof,commitProof,checkpoints:[{checkpoint,operator:clone(checkpointOperator)}]};
}
function make({pqc=false,usages,statements:editStatements,agreement:editAgreement,missingAgreement=false,rate='35',missingProof=false,tamperedProof=false,fork=false}={}){
    const key=cpoKey(pqc,usages),begin=meterReading(original.ocmfBegin,rate),end=meterReading(original.ocmfEnd,rate);
    let statements=[price(key)];if(editStatements)statements=editStatements(statements,key);
    const pub=publication(key,statements),selected=statements[0];
    const priceProofs=statements.length===1?[{'@context':'https://open.charging.cloud/contexts/wwcp/roamingNetwork/priceStatementProof/v1',checkpointId:pub.checkpoints[0].checkpoint['@id'],
        priceStatement:selected,'@index':0,'@size':1,'@auditPath':[]}]:[];
    if(priceProofs[0])PriceStatementProof.parse(priceProofs[0]).verify(Checkpoint.parse(pub.checkpoints[0].checkpoint));
    if(tamperedProof)priceProofs[0].priceStatement={...selected,value:selected.value.slice(0,-4)+'AAAA'};
    const evidence={'@context':'https://open.charging.cloud/contexts/wwcp/sessionPriceEvidence/v1',EVSEId:evseId,chargingStationProof:pub.proof,priceStatements:statements,
        ...(missingAgreement?{}:{agreement:assignment(key,selected,begin,editAgreement)}),...(missingProof?{}:{priceStatementProofs:priceProofs,checkpoints:pub.checkpoints})};
    const history={...clone(original.poiEvidence.historicalEvidence),versions:[{chargingStationProof:pub.proof,commitProof:pub.commitProof,checkpoints:pub.checkpoints}]};
    if(fork){const cp=clone(pub.checkpoints[0].checkpoint);delete cp.priceStatements;delete cp['@id'];delete cp.signatures;
        const bare=Checkpoint.parse({'@id':hash(canonicalJSONBytes(cp)),...cp});
        const changed={...bare.json,signatures:pub.checkpoints[0].checkpoint.signatures.filter(s=>s.role==='roamingNetworkOperator').map((s,i)=>({...s,value:sign(null,bare.signingBytes({...s,signedAt:Date.parse(s.signedAt),json:s}),edPrivate(i===0?42:44)).toString('base64')}))};
        history.versions[0].commitProof={...pub.commitProof,checkpointId:bare.id};history.versions[0].checkpoints=[{checkpoint:changed,operator:clone(checkpointOperator)}];
    }
    return {...clone(original),ocmfBegin:begin,ocmfEnd:end,poiEvidence:{...clone(original.poiEvidence),historicalEvidence:history,priceEvidence:evidence}};
}
const reprice=(statement,key,changes)=>price(key,{...statement,...changes});
const files={
    'session-with-price.chargy':make(),
    'pqc-price.chargy':make({pqc:true}),
    'missing-agreement.chargy':make({missingAgreement:true}),
    'empty-prices.chargy':make({missingAgreement:true,missingProof:true,statements:()=>[]}),
    'decimal-price.chargy':make({statements:(items,key)=>{const status=clone(items[0].priceStatus);status.prices[0].elements[0].priceComponents[0].price=parseJSON('0.3500');return [reprice(items[0],key,{priceStatus:status})];}}),
    'missing-publication.chargy':make({missingProof:true}),
    'invalid-signature.chargy':make({statements:items=>[{...items[0],value:items[0].value.slice(0,-4)+'AAAA'}],missingAgreement:true,missingProof:true}),
    'wrong-evse.chargy':make({statements:(items,key)=>[reprice(items[0],key,{entityId:'DE*POI*E9*1'})],missingProof:true}),
    'expired-price.chargy':make({statements:(items,key)=>[reprice(items[0],key,{validUntil:iso(start-1)})]}),
    'foreign-tariff.chargy':make({statements:(items,key)=>{const status=clone(items[0].priceStatus);status.prices[0].chargingTariffId='DE*POI*FOREIGN';return [reprice(items[0],key,{priceStatus:status})];}}),
    'unauthorized-key.chargy':make({usages:['infrastructure']}),
    'wrong-session.chargy':make({agreement:{startDocumentSHA256:'ff'.repeat(32)}}),
    'contract-mode.chargy':make({agreement:{chargingMode:'contract'}}),
    'variable-binding.chargy':make({agreement:{priceBinding:'variable'}}),
    'signed-rate-conflict.chargy':make({rate:'65'}),
    'tampered-publication.chargy':make({tamperedProof:true}),
    'checkpoint-fork.chargy':make({fork:true}),
    'split-price-chain.chargy':make({missingProof:true,statements:(items,key)=>{const status=clone(items[0].priceStatus);status.prices[0].elements[0].priceComponents[0].price=parseJSON('0.45');return [...items,reprice(items[0],key,{priceStatus:status})];}}),
    'broken-price-chain.chargy':make({missingProof:true,statements:(items,key)=>[...items,reprice(items[0],key,{sequence:1,previous:'ff'.repeat(32),validFrom:iso(start-1000)})]}),
    'ambiguous-offers.chargy':make({missingProof:true,missingAgreement:true,statements:(items,key)=>[...items,reprice(items[0],key,{entityType:'ChargingPool',entityId:'DE*POI*P1'})]}),
    'conditional-price.chargy':make({statements:(items,key)=>{const status=clone(items[0].priceStatus);status.prices[0].elements[0].restrictions={max_kwh:5};return [reprice(items[0],key,{priceStatus:status})];}})
};
const hashes={};for(const[name,value]of Object.entries(files)){const text=prettyJSON(value)+'\n';await writeFile(path.join(output,name),text);hashes[name]=hash(Buffer.from(text));}
await writeFile(path.join(output,'provenance.json'),JSON.stringify({generator:'build-tools/generatePOIPriceExample.mjs',evaluatedAt:'2026-11-01T00:16:21.000Z',chargingStarted:iso(start),checkpointAt:iso(start+86400000),evseId,
    keySeeds:'PUBLIC TEST KEYS ONLY: CPO Ed25519=161; CPO ML-DSA-65=163; RNO identities 41/43, historical keys 142/144, checkpoint 42/44, witness151',
    profile:'Experimental CPO confirmation bound to original start bytes; gross rates fixed at start, not customer consent or pre-start publication',files:hashes},null,2)+'\n');
console.log('Generated '+Object.keys(files).length+' genuinely signed POI price sessions, including ML-DSA-65 and counterexamples.');
