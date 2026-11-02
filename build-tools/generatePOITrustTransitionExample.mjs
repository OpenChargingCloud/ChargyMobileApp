// PUBLIC TEST KEYS ONLY. Compact experimental succession, genuine epoch genesis and authorized live key changes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CoseKey,CoseCurves} from '@vanaheimr/cose';
import {canonicalJSONBytes as jcs} from '@open-charging-cloud/chargy-core';
import {parseJSON,prettyJSON,clone,canonicalJSONBytes,POIPublicKey,KeyStatement,SigningKeyCertificate,TrustAnchor,TrustContext,TrustTransition,VerifiedTrustTransition,
    TRUST_TRANSITION_CONTEXT,trustPolicyId,trustStatementDigest,initialTrustEpoch,Commit,Checkpoint,commitsRoot,leafHash,auditPath,toHex,toBase64,ChargingStationProof,etagToJSON,jsonETag,cborETag,Attestation,COMMIT_CONTEXT,CHECKPOINT_CONTEXT} from '@open-charging-cloud/wwcp-poi';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'tests/fixtures/POITrustTransitions');await mkdir(out,{recursive:true});
// A commit names the json, cbor and effectiveTree ETags of its version (SPECIFICATION.md 8.3): of this demo the version is
// the roaming network its proof gives, the effectiveTree ETag the root of that proof.
const versionETags=(network,eTag)=>[etagToJSON(jsonETag(network)),etagToJSON(cborETag(network)),eTag];
const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8')),start=await read('tests/fixtures/POILive/01-start.json'),waiting=await read('tests/fixtures/POILive/00-waiting.json');
const baseProof=parseJSON(start.poiEvidence.chargingStationProof),oldOperator=parseJSON(start.poiEvidence.bootstrap.keyStatement),anchor=TrustAnchor.parse(start.poiEvidence.bootstrap.trustAnchor);
const hash=(bytes,algorithm='sha256')=>createHash(algorithm).update(bytes).digest('hex'),iso=value=>new Date(value).toISOString(),time=Date.parse('2026-11-01T00:00:00Z');
const ed=seed=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,seed)]),format:'der',type:'pkcs8'});
function key(seed,holder,usages){const privateKey=ed(seed),spki=createPublicKey(privateKey).export({format:'der',type:'spki'}),cose=CoseKey.fromOkpPublicKey(CoseCurves.Ed25519,spki.subarray(-32));
    return {seed,privateKey,spki,publicKey:POIPublicKey.parse({'@id':toHex(cose.thumbprint()),key:toBase64(cose.toBytes()),...(holder===undefined?{}:{holder}),...(usages===undefined?{}:{usages}),notBefore:'2026-01-01T00:00:00.000Z',notAfter:'2030-01-01T00:00:00.000Z'})};}
const oldIdentities=[key(41,'Demo holder A'),key(43,'Demo holder B')],newIdentities=[key(51,'Demo holder A'),key(53,'Demo holder B')],newOperational=[key(52,'Demo holder A'),key(54,'Demo holder B')];
const oldContext=TrustContext.create(anchor,KeyStatement.parse(oldOperator.keyStatement),{trustedIdentityKeyIds:anchor.keys,otherIdentityKeys:oldIdentities.map(item=>item.publicKey),at:time+720000});
const targetAnchor=TrustAnchor.create(anchor.id,['https://next.poi.example/RNs/'+anchor.id],newIdentities.map(item=>[item.publicKey.id]),2);
function newOperator(){const operator=clone(oldOperator),content={...clone(operator.keyStatement),identityKeys:newIdentities.map(item=>item.publicKey.json).sort((a,b)=>a['@id'].localeCompare(b['@id']))};
    const statement=KeyStatement.parse(content);content.signatures=newIdentities.map(item=>({algorithm:'Ed25519',keyId:item.publicKey.id,value:sign(null,statement.signingBytes('Ed25519',item.publicKey.id),item.privateKey).toString('base64')}));
    operator.identityKeys=newIdentities.map(item=>item.publicKey.json);operator.keyStatement=content;
    operator.signingKeyCertificates=newOperational.map((item,index)=>{const signer=newIdentities[index],certificate={roamingNetworkOperatorId:operator['@id'],signingKey:item.publicKey.json,signedAt:'2026-01-01T00:00:00.000Z',algorithm:'Ed25519',keyId:signer.publicKey.id,value:'placeholder'};
        return {...certificate,value:sign(null,SigningKeyCertificate.parse(certificate).signingBytes(),signer.privateKey).toString('base64')};});return operator;}
const targetOperator=newOperator();
function signedTransition(content,oldKeys=oldIdentities,newKeys=newIdentities){const parsed=TrustTransition.parse({...content,signatures:[]});return {...content,signatures:[...oldKeys.map(item=>({item,side:'old'})),...newKeys.map(item=>({item,side:'new'}))].map(({item,side})=>({side,algorithm:'Ed25519',keyId:item.publicKey.id,value:sign(null,parsed.signingBytes(side,'Ed25519',item.publicKey.id),item.privateKey).toString('base64')}))};}
const policy=signedTransition({'@context':TRUST_TRANSITION_CONTEXT,sequence:0,fromPolicyId:trustPolicyId(anchor),fromStatementDigest:trustStatementDigest(KeyStatement.parse(oldOperator.keyStatement)),toAnchor:targetAnchor.toQRCode(),toOperator:targetOperator,signedAt:iso(time+945000),validUntil:'2030-01-01T00:00:00.000Z',checkpoints:[]});
VerifiedTrustTransition.verify(oldContext,oldOperator,TrustTransition.parse(policy),{acceptedAt:time+981000,epoch:initialTrustEpoch(),sequence:0});
function proofFor(operator=oldOperator,revision=0,cpoKeys,commitId,signedAt=time){const proof=clone(baseProof);proof.roamingNetwork.operator=operator;proof.revision=revision;
    if(cpoKeys!==undefined)proof.roamingNetwork.chargingStationOperators[0].signingKeys=cpoKeys;
    const eTag=etagToJSON(ChargingStationProof.parse(proof).calculate().eTag),content={'@context':COMMIT_CONTEXT,roamingNetworkId:anchor.id,revision,eTags:versionETags(proof.roamingNetwork,eTag)};
    proof.commitId=commitId??hash(canonicalJSONBytes(content));
    const operational=operator===targetOperator?newOperational:[key(42,'Demo holder A'),key(44,'Demo holder B')];
    proof.attestations=operational.map((item,index)=>{const attestation={...clone(baseProof.attestations[index]),commitId:proof.commitId,revision,eTag,keyId:item.publicKey.id,signedAt:iso(signedAt),value:'placeholder'};
        return {...attestation,value:sign(null,Attestation.parse(attestation).signingBytes(),item.privateKey).toString('base64')};});return proof;}
const targetProof=proofFor(targetOperator,2,[key(161,undefined,['chargeTransparencyRecords','priceStatements']).publicKey.json,key(162,undefined,['chargeTransparencyRecords']).publicKey.json],undefined,time+945000);
function checkpoint(content,operational=[key(42,'Demo holder A'),key(44,'Demo holder B')]){const withContext={'@context':CHECKPOINT_CONTEXT,...content},cp=Checkpoint.parse({'@id':hash(canonicalJSONBytes(withContext)),...withContext});
    return {...cp.json,signatures:operational.map(item=>{const signature={role:'roamingNetworkOperator',signer:oldOperator['@id'],signedAt:withContext.createdAt,algorithm:'Ed25519',keyId:item.publicKey.id,value:''};
        return {...signature,value:sign(null,cp.signingBytes({...signature,signedAt:Date.parse(signature.signedAt),json:signature}),item.privateKey).toString('base64')};})};}
const etag=etagToJSON(ChargingStationProof.parse(baseProof).calculate().eTag),etags=versionETags(baseProof.roamingNetwork,etag),commit=Commit.parse({'@id':baseProof.commitId,'@context':COMMIT_CONTEXT,roamingNetworkId:anchor.id,revision:0,eTags:etags});
const head=checkpoint({roamingNetworkId:anchor.id,epoch:1,sequence:0,commitId:commit.id,revision:0,eTags:etags,commits:{'@merkleRoot':toHex(commitsRoot([commit],'sha256')),'@size':1},createdAt:iso(time+600000)});
const profiles={canonicalization:'styx-canonical-json-v1',identificationHash:'sha256',commit:COMMIT_CONTEXT,checkpoint:CHECKPOINT_CONTEXT,priceStatement:'https://open.charging.cloud/contexts/wwcp/roamingNetwork/priceStatement/v1',signatureAlgorithms:['Ed25519']};
const final=checkpoint({roamingNetworkId:anchor.id,epoch:1,sequence:1,previousId:head['@id'],commitId:commit.id,revision:0,eTags:etags,commits:head.commits,createdAt:iso(time+660000),final:true,next:{epoch:2,profiles}});
const genesis=Commit.genesisOf(anchor.id,etags,Checkpoint.parse(final).next);
const first=checkpoint({roamingNetworkId:anchor.id,epoch:2,sequence:0,commitId:genesis.id,revision:0,eTags:etags,commits:{'@merkleRoot':toHex(commitsRoot([genesis],'sha256')),'@size':1},createdAt:iso(time+700000),previous:{epoch:1,checkpointId:final['@id'],eTags:etags}});
const epoch=signedTransition({...clone(policy),toAnchor:anchor.toQRCode(),toOperator:oldOperator,checkpoints:[head,final],epochChange:{genesis:genesis.json,firstCheckpoint:first}},oldIdentities,oldIdentities);
VerifiedTrustTransition.verify(oldContext,oldOperator,TrustTransition.parse(epoch),{acceptedAt:time+981000,epoch:initialTrustEpoch(),sequence:0});
const epochProof=proofFor(oldOperator,0,undefined,genesis.id,time+720000);
const rotated=key(162,undefined,['chargeTransparencyRecords']),oldCPO=key(161,undefined,['chargeTransparencyRecords','priceStatements']);
function live(document,signers=[oldCPO]){const {signatures:_,...json}=document;json.chargingStationOperator.publicKeys=signers.map(item=>({algorithm:'EdDSA-Ed25519',encodings:['SubjectPublicKeyInfo','DER','hex'],value:item.spki.toString('hex').toUpperCase(),keyUsage:['signCTRs']}));
    return {...json,signatures:signers.map(item=>({keyId:hash(item.spki).toUpperCase(),algorithm:'EdDSA-Ed25519',signedData:{excludedProperties:['signatures'],encodings:['JSON','JCS','UTF-8']},encodings:['hex'],value:sign(null,jcs(json),item.privateKey).toString('hex').toUpperCase()}))};}
const rotationProof=proofFor(oldOperator,1,[oldCPO.publicKey.json,rotated.publicKey.json],undefined,time+360000);
const cross=live({...clone(start),lastUpdated:iso(time+360000),updates:hash(jcs(start)).toUpperCase(),poiEvidence:{...clone(start.poiEvidence),chargingStationProof:prettyJSON(rotationProof)}},[oldCPO,rotated]);
const post=live({...clone(cross),lastUpdated:iso(time+420000),updates:hash(jcs(cross)).toUpperCase()},[rotated]);
const commitOf=proof=>Commit.parse({'@id':proof.commitId,'@context':COMMIT_CONTEXT,roamingNetworkId:anchor.id,revision:proof.revision,eTags:versionETags(proof.roamingNetwork,etagToJSON(ChargingStationProof.parse(proof).calculate().eTag))});
const laterCommits=[commitOf(rotationProof),commitOf(targetProof)],oldHistory=parseJSON(start.poiEvidence.historicalEvidence),oldCheckpoint=oldHistory.versions[0].checkpoints[0].checkpoint;
const laterCheckpoint=checkpoint({roamingNetworkId:anchor.id,epoch:1,sequence:1,previousId:oldCheckpoint['@id'],commitId:targetProof.commitId,revision:2,eTags:laterCommits[1].json.eTags,
    commits:{'@merkleRoot':toHex(commitsRoot(laterCommits,'sha256')),'@size':2},createdAt:iso(time+975000)},newOperational);
const historyAfter={...clone(oldHistory),versions:[...clone(oldHistory.versions),{chargingStationProof:targetProof,commitProof:{'@context':'https://open.charging.cloud/contexts/wwcp/roamingNetwork/checkpointProof/v1',
    checkpointId:laterCheckpoint['@id'],leaf:laterCommits[1].checkpointLeaf(),'@index':1,'@size':2,'@auditPath':auditPath('sha256',laterCommits.map(commit=>leafHash('sha256',canonicalJSONBytes(commit.checkpointLeaf()))),1).map(toHex)},
    checkpoints:[{checkpoint:laterCheckpoint,operator:targetOperator}]}]};
const completed=await read('tests/fixtures/POILive/03-completed.json');
const endPayload=JSON.parse(completed.signedMeterValues.values[2].split('|')[1]);endPayload.RD[0].TM=iso(time+970000).replace('.',',').replace('Z','+0000')+' S';
const meterPrivate=createPrivateKey(await readFile(path.join(root,'tests/fixtures/ChargeTransparencyLive/OCMF-Test-01/privateKey_energyMeter.pem'))),endText=JSON.stringify(endPayload);
completed.signedMeterValues.values[2]='OCMF|'+endText+'|'+JSON.stringify({SA:'ECDSA-secp256r1-SHA256',SE:'hex',SD:sign('sha256',Buffer.from(endText),meterPrivate).toString('hex').toUpperCase()});
const afterPolicy=live({...clone(post),lastUpdated:iso(time+976000),updates:hash(jcs(post)).toUpperCase(),signedMeterValues:completed.signedMeterValues,
    poiEvidence:{...clone(start.poiEvidence),chargingStationProof:prettyJSON(targetProof),historicalEvidence:prettyJSON(historyAfter)}},[rotated]);
const forged=live(clone(waiting),[key(199)]),wrongCPO=live({...clone(waiting),chargingStationOperator:{...clone(waiting.chargingStationOperator),'@id':'FOREIGN-CPO'}});
const badPolicy=clone(policy);badPolicy.signatures=badPolicy.signatures.filter(item=>item.side==='new');
const missingNew=clone(policy);missingNew.signatures=missingNew.signatures.filter(item=>item.side==='old');
const invalidCertificate=clone(policy);invalidCertificate.toOperator.signingKeyCertificates[0].value='AA==';const signedInvalidCertificate=signedTransition(invalidCertificate);
const priceOnly=live({...clone(waiting),poiEvidence:{...clone(waiting.poiEvidence),chargingStationProof:prettyJSON(proofFor(oldOperator,0,[key(161,undefined,['priceStatements']).publicKey.json]))}});
const changedURL=clone(policy);changedURL.toAnchor=TrustAnchor.create(anchor.id,['https://attacker.example/RNs/'+anchor.id],targetAnchor.holders,2).toQRCode();
const falseGenesis=clone(epoch);falseGenesis.epochChange.genesis=commit.json;
const files={'vectors.json':{now:'2026-11-01T00:16:21.000Z',anchor:anchor.toQRCode(),operator:oldOperator,baseProof,targetOperator,targetAnchor:targetAnchor.toQRCode(),targetProof,epochProof,policy,epoch,head,final,first,invalidCertificate:signedInvalidCertificate},
    'policy-transition.json':policy,'epoch-transition.json':epoch,'missing-old-quorum.json':badPolicy,'missing-new-quorum.json':missingNew,'tampered-target-url.json':changedURL,'wrong-genesis.json':signedTransition(falseGenesis,oldIdentities,oldIdentities),
    'invalid-target-certificate.json':signedInvalidCertificate,'live-price-only-key.json':priceOnly,'live-forged-first.json':forged,'live-wrong-cpo.json':wrongCPO,'live-key-transition.json':cross,'live-after-key-transition.json':post,'live-after-policy-transition.json':afterPolicy,
    'live-key-change-without-cosignature.json':live({...clone(cross),updates:hash(jcs(start)).toUpperCase()},[rotated]),
    'live-key-change-without-poi.json':live({...clone(cross),poiEvidence:clone(start.poiEvidence)},[oldCPO,rotated])};
const hashes={};for(const[name,value]of Object.entries(files)){const text=(name.startsWith('live-')?JSON.stringify(value,null,2):prettyJSON(value))+'\n';await writeFile(path.join(out,name),text);hashes[name]=hash(Buffer.from(text));}
await writeFile(path.join(out,'provenance.json'),JSON.stringify({generator:'build-tools/generatePOITrustTransitionExample.mjs',publicTestSeeds:'RNO old identities41/43, operations42/44; new51/53 and52/54; CPO161/162; forged199',files:hashes},null,2)+'\n');
console.log('Generated genuine signed compact policy/epoch transitions and live authority/key-rotation counterexamples.');
