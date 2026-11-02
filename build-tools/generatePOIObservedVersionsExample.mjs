// PUBLIC TEST KEYS ONLY. One coherent history, not unrelated examples at the same coordinates.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,createPrivateKey,sign} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJSON,prettyJSON,clone,canonicalJSONBytes,ChargingStationProof,etagToJSON,jsonETag,cborETag,Commit,Attestation,Checkpoint,CheckpointProof,
    PriceStatement,PriceStatementProof,priceStatementsRoot,commitsRoot,leafHash,auditPath,toHex,COMMIT_CONTEXT,CHECKPOINT_CONTEXT} from '@open-charging-cloud/wwcp-poi';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'tests/fixtures/POIObservedVersions');await mkdir(out,{recursive:true});
// A commit names the json, cbor and effectiveTree ETags of its version (SPECIFICATION.md 8.3): of this demo the version is
// the roaming network its proof gives, the effectiveTree ETag the root of that proof.
const versionETags=(network,eTag)=>[etagToJSON(jsonETag(network)),etagToJSON(cborETag(network)),eTag];
const load=async file=>parseJSON(await readFile(path.join(root,file),'utf8'));
const start=await load('tests/fixtures/POILive/01-start.json'),end=await load('tests/fixtures/POILive/03-completed.json');
const original=await load('tests/fixtures/POIPrices/session-with-price.chargy');
const evidence=start.poiEvidence,proof0=parseJSON(evidence.chargingStationProof),operator=parseJSON(evidence.bootstrap.keyStatement);
const templatePrice=parseJSON(evidence.priceEvidence),network=evidence.roamingNetworkId,evse=evidence.EVSEId;
const hash=value=>createHash('sha256').update(value).digest('hex'),iso=value=>new Date(value).toISOString(),base=Date.parse('2026-11-01T00:00:00Z');
const ed=seed=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,seed)]),format:'der',type:'pkcs8'});
function station(revision,fork=false){
    const proof=clone(proof0);proof.revision=revision;
    if(fork)proof.roamingNetwork.chargingStationOperators[0].chargingPools[0].chargingStations['@leaves'][0]['@entity'].name.en='Genuinely signed competing station';
    const eTag=etagToJSON(ChargingStationProof.parse(proof).calculate().eTag);
    const eTags=versionETags(proof.roamingNetwork,eTag),content={'@context':COMMIT_CONTEXT,roamingNetworkId:network,revision,eTags},commit=Commit.parse({'@id':hash(canonicalJSONBytes(content)),...content});
    proof.commitId=commit.id;
    proof.attestations=[42,44].map((seed,index)=>{
        const value={...clone(proof0.attestations[index]),commitId:commit.id,revision,eTag,value:'placeholder'};
        return {...value,value:sign(null,Attestation.parse(value).signingBytes(),ed(seed)).toString('base64')};
    });
    return {proof,commit,eTag,eTags};
}
const versions=[0,1,2,3].map(value=>station(value)),forkStation=station(1,true);
function price(sequence,previous,fork=false){
    const value=clone(templatePrice.priceStatements[0]);value.sequence=sequence;value.validUntil='2030-01-01T00:00:00.000Z';
    value.signedAt=iso(base+(sequence===0?240000:300000+sequence*60000-15000));
    value.validFrom=iso(base+(sequence===0?270000:300000+sequence*60000));
    value.priceStatus.prices[0].elements[0].priceComponents[0].price=parseJSON(fork?'0.99':['0.35','0.40','0.45'][sequence]);
    if(previous===undefined)delete value.previous;else value.previous=PriceStatement.parse(previous).digestHex();
    return {...value,value:sign(null,PriceStatement.parse(value).signingBytes(),ed(161)).toString('base64')};
}
const prices=[price(0)];prices.push(price(1,prices[0]));prices.push(price(2,prices[1]));const forkPrice=price(1,prices[0],true);
function checkpoint(sequence,previous,statements,revision=sequence,epoch=1,fork=false){
    const commits=versions.slice(0,revision+1).map(item=>item.commit),tree=priceStatementsRoot(statements.map(item=>PriceStatement.parse(item)));
    const content={'@context':CHECKPOINT_CONTEXT,roamingNetworkId:network,epoch,sequence,commitId:versions[revision].commit.id,revision,eTags:versions[revision].eTags,
        commits:{'@merkleRoot':toHex(commitsRoot(commits,'sha256')),'@size':commits.length},priceStatements:{'@merkleRoot':toHex(tree.root),'@size':tree.size},
        createdAt:iso(base+600000+revision*60000+(fork?30000:0)),...(previous===undefined?{}:{previousId:previous.checkpoint['@id']}),
        ...(epoch===1?{}:{previous:{epoch:1,checkpointId:checkpoints[2].checkpoint['@id'],eTags:versions[2].eTags}})};
    const cp=Checkpoint.parse({'@id':hash(canonicalJSONBytes(content)),...content});
    const signed={...cp.json,signatures:[42,44].map((seed,index)=>{
        const signature={role:'roamingNetworkOperator',signer:operator['@id'],signedAt:content.createdAt,algorithm:'Ed25519',keyId:operator.signingKeyCertificates[index].signingKey['@id'],value:''};
        return {...signature,value:sign(null,cp.signingBytes({...signature,signedAt:Date.parse(signature.signedAt),json:signature}),ed(seed)).toString('base64')};
    })};
    const commitProof={'@context':'https://open.charging.cloud/contexts/wwcp/roamingNetwork/checkpointProof/v1',checkpointId:cp.id,leaf:commits[0].checkpointLeaf(),
        '@index':0,'@size':commits.length,'@auditPath':auditPath('sha256',commits.map(item=>leafHash('sha256',canonicalJSONBytes(item.checkpointLeaf()))),0).map(toHex)};
    const priceProof={'@context':'https://open.charging.cloud/contexts/wwcp/roamingNetwork/priceStatementProof/v1',checkpointId:cp.id,priceStatement:statements[0],
        '@index':0,'@size':statements.length,'@auditPath':auditPath('sha256',statements.map(item=>leafHash('sha256',PriceStatement.parse(item).digest())),0).map(toHex)};
    CheckpointProof.parse(commitProof).verify(Checkpoint.parse(signed));PriceStatementProof.parse(priceProof).verify(Checkpoint.parse(signed));
    return {checkpoint:signed,operator,commitProof,priceProof,statements};
}
const checkpoints=[];for(let index=0;index<3;index++)checkpoints.push(checkpoint(index,checkpoints.at(-1),prices.slice(0,index+1)));
const forkCheckpoint=checkpoint(1,checkpoints[0],prices.slice(0,2),1,1,true);
const priceForkCheckpoint=checkpoint(3,checkpoints[2],[prices[0],forkPrice]);
const nextEpoch=checkpoint(0,undefined,prices,3,2);
const begin=end.signedMeterValues.values[0],finish=end.signedMeterValues.values.at(-1);
const agreementContent={...clone(templatePrice.agreement),priceStatementDigest:PriceStatement.parse(prices[0]).digestHex(),startDocumentSHA256:hash(Buffer.from(begin))};delete agreementContent.value;
const agreement={...agreementContent,value:sign(null,canonicalJSONBytes(agreementContent),ed(161)).toString('base64')};
function archive(entry){
    const authorized=[{checkpoint:entry.checkpoint,operator}],history={'@context':'https://open.charging.cloud/contexts/wwcp/historicalMeterEvidence/v1',EVSEId:evse,
        versions:[{chargingStationProof:versions[0].proof,commitProof:entry.commitProof,checkpoints:authorized}]};
    return {...clone(original),ocmfBegin:begin,ocmfEnd:finish,poiEvidence:{...clone(evidence),chargingStationProof:versions[0].proof,historicalEvidence:history,
        priceEvidence:{...clone(templatePrice),chargingStationProof:versions[0].proof,priceStatements:entry.statements,agreement,priceStatementProofs:[entry.priceProof],checkpoints:authorized}}};
}
const files={'vectors.json':{evaluatedAt:'2026-11-01T00:16:21Z',evseId:evse,bootstrap:evidence.bootstrap,proofs:versions.map(item=>item.proof),forkStation:forkStation.proof,prices,forkPrice,
    checkpoints:checkpoints.map(({checkpoint,operator})=>({checkpoint,operator})),forkCheckpoint:{checkpoint:forkCheckpoint.checkpoint,operator},
    nextEpoch:{checkpoint:nextEpoch.checkpoint,operator}},
    'archive-0.chargy':archive(checkpoints[0]),'archive-1.chargy':archive(checkpoints[1]),'archive-2.chargy':archive(checkpoints[2]),
    'checkpoint-fork-1.chargy':archive(forkCheckpoint),'price-fork-1.chargy':archive(priceForkCheckpoint)};
const hashes={};for(const[name,value]of Object.entries(files)){const text=prettyJSON(value)+'\n';await writeFile(path.join(out,name),text);hashes[name]=hash(Buffer.from(text));}
await writeFile(path.join(out,'provenance.json'),JSON.stringify({generator:'build-tools/generatePOIObservedVersionsExample.mjs',evaluatedAt:'2026-11-01T00:16:21Z',
    testKeys:'PUBLIC TEST KEYS ONLY: CPO Ed25519 seed161, RNO operational42/44, identities41/43; existing P-256 meter fixture.',files:hashes},null,2)+'\n');
console.log('Generated coherent signed station, checkpoint, price histories and completed historical sessions.');
