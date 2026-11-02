import {openMobileSession,mobileBack} from './mobileBrowser.mjs';
// Browser plugin not available. Real app, native IndexedDB, genuine signatures and explicit trust decisions.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import path from 'node:path';
import {chromium} from 'playwright';
import {parseJSON,prettyJSON,TrustAnchor} from '@open-charging-cloud/wwcp-poi';
import {resetObservedPOIHistory} from './observedHistoryBrowser.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const {values}=parseArgs({options:{'build-dir':{type:'string',default:path.join(repo,'platforms/browser/www')},'output-dir':{type:'string',default:path.join(repo,'documentation/screenshots/poi-publication')}}});
const build=path.resolve(values['build-dir']),output=path.resolve(values['output-dir']);await mkdir(output,{recursive:true});
const fixture=name=>readFile(path.join(repo,'tests/fixtures/POIPublication',name),'utf8'),vectors=parseJSON(await fixture('vectors.json')),anchor=TrustAnchor.parse(vectors.session.poiEvidence.bootstrap.trustAnchor);
const viewport={width:1440,height:1050},mobile={width:390,height:844},names=['01-no-witness-trust.png','02-policy-review.png','03-witnessed-before-start.png','04-too-late.png','05-tampered.png','06-withdrawn.png','07-mobile.png','08-live-completed.png'];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(request,response)=>{try{const url=new URL(request.url,'http://localhost'),file=path.resolve(build,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    assert.ok(file.startsWith(build+path.sep));response.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(file));}catch{if(!response.headersSent)response.writeHead(404);response.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser,receiptMode='good';const failures=[],requests=[],pending=[];
try{
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport,locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();
        if(['witness-a.example','witness-b.example'].includes(url.hostname)){
            requests.push(url.href);assert.deepEqual([...url.searchParams.keys()].sort(),['EVSEId','checkpointId','priceStatementDigest','priceStatementSHA256','roamingNetworkId','tariffSHA256']);
            assert.equal(url.searchParams.get('priceStatementDigest'),vectors.session.poiEvidence.priceEvidence.agreement.priceStatementDigest);
            const evidence=vectors.variants[receiptMode==='good'?'session-before-start.chargy':'wrong-price.chargy'];
            return route.fulfill({body:prettyJSON({publicationReceipts:[evidence.publicationReceipts[url.hostname==='witness-a.example'?0:1]]}),contentType:'application/json'});
        }
        if(url.origin==='https://live.poi.example'){const body=await new Promise(resolve=>pending.push({route,resolve}));if(body===undefined)return route.abort();try{return await route.fulfill({body,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'}});}catch{return;}}
        if(url.origin==='https://chargy.charging.cloud')return route.fulfill({json:{versions:[]}});
        if(request.resourceType()==='image')return route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
        failures.push('Unexpected external request '+url.href);return route.abort();
    });
    async function newPage(){const p=await context.newPage();p.setDefaultTimeout(18000);p.on('pageerror',error=>failures.push(error.message));p.on('console',message=>{if(message.type()==='error'&&!message.text().includes('net::ERR_FAILED'))failures.push(message.text());});
        await p.clock.setFixedTime(new Date(vectors.now));await p.goto(origin,{waitUntil:'networkidle'});assert.match(await p.title(),/Chargy/);return p;}
    const page=await newPage(),price=page.locator('.sessionPriceResult');
    async function drop(p,text){const previous=await p.$('.sessionPOI');await p.evaluate(text=>{const transfer=new DataTransfer();transfer.items.add(new window.NativeFile([text],'publication.chargy',{type:'application/json'}));document.querySelector('#startPage').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));},text);await openMobileSession(p);
        if(previous!==null){await p.waitForFunction(element=>!element.isConnected,previous);await previous.dispose();}await p.locator('.sessionPOI').waitFor();}
    async function enter(p,section){if(!await p.locator('#settingsPage').isVisible())await p.locator('#settingsButton').click();while(await p.locator('#settingsTrustManagement').isVisible())await p.locator('#settingsBackButton').click();
        await p.locator('#settingsTrustManagementEntry').click();const management=p.locator('#settingsTrustManagement');await management.getByRole('button',{name:section,exact:true}).click();await management.locator('.trustManagementList[aria-busy=false]').waitFor();return management;}
    async function capture(index,locator){
        const detail=index===1||index===2;if(detail)await page.setViewportSize({width:1440,height:1900});
        if(locator)await locator.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
        if(detail)await locator.screenshot({path:path.join(output,names[index]),animations:'disabled'});else await page.screenshot({path:path.join(output,names[index]),animations:'disabled'});
        if(detail)await page.setViewportSize(viewport);
    }
    async function nativePolicy(p){return p.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ChargyPOIWitnessTrust');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const records=await new Promise(resolve=>{const r=db.transaction('configuration').objectStore('configuration').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return records;});}
    await drop(page,await fixture('session-before-start.chargy'));
    const panel=page.locator('.sessionPOI'),controls=panel.locator('.sessionPOIDetails');if(!await controls.evaluate(element=>element.open))await controls.locator(':scope > summary').click();
    await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).click();const dialog=page.locator('#qrCodeScanner'),preview=dialog.locator('#qrCodeScannerTrustAnchorPreview');
    await dialog.getByRole('button',{name:'Import',exact:true}).click();await preview.locator('.trustAnchorLoadedData').waitFor();
    for(const id of anchor.keys){const key=preview.locator('.anchorKeyTrustKey[data-key-id="'+id+'"]');await key.locator('[data-action=accept-key]').click();await key.locator('[data-action=confirm-key]').click();await key.locator('[data-key-trust=manual]').waitFor();}
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.sessionPriceResult[data-state=valid][data-before-start=not-proven]').waitFor();assert.equal(requests.length,0);await capture(0,price.locator('.poiPricePublication'));
    const manager=await enter(page,'Publication witnesses');assert.equal((await nativePolicy(page)).length,0);
    await manager.locator('[data-action=witness-policy-file]').setInputFiles(path.join(repo,'tests/fixtures/POIPublication/witness-policy.json'));
    await page.waitForFunction(()=>document.querySelector('[data-action=witness-policy-text]').value.includes('DEMO-WITNESS-B'));
    await manager.locator('[data-action=review-witness-policy]').click();await manager.locator('.poiWitnessPolicyPreview[data-state=review]').waitFor();assert.equal((await nativePolicy(page)).length,0);await capture(1,manager.locator('.poiWitnessPolicyPreview'));
    // A native storage failure must leave the reviewed policy unapplied.
    await page.evaluate(()=>{window.witnessOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='configuration')throw new DOMException('Simulated quota failure','QuotaExceededError');return window.witnessOriginalPut.apply(this,args);};});
    await manager.locator('[data-action=accept-witness-policy]').click();await manager.locator('.poiWitnessPolicyPreview[data-state=invalid]').waitFor();assert.equal((await nativePolicy(page)).length,0);
    await page.evaluate(()=>{IDBObjectStore.prototype.put=window.witnessOriginalPut;});await manager.locator('[data-action=review-witness-policy]').click();await manager.locator('[data-action=accept-witness-policy]').click();
    await manager.locator('.trustManagementList[aria-busy=false] [data-witness-id="DEMO-WITNESS-B"]').waitFor();assert.equal((await nativePolicy(page)).length,1);
    await drop(page,await fixture('session-before-start.chargy'));await page.locator('.sessionPriceResult[data-before-start=witnessed]').waitFor();
    await price.locator('.poiPricePublication > details > summary').click();await capture(2,price.locator('.poiPricePublication'));assert.equal(requests.length,0);
    await page.reload({waitUntil:'networkidle'});await drop(page,await fixture('session-before-start.chargy'));await page.locator('.sessionPriceResult[data-before-start=witnessed]').waitFor();
    for(const [name,index]of [['late-receipt',3],['clock-overlap',null],['same-organization',null],['wrong-signed-price',null],['wrong-tariff',null],['tampered-receipt',4]]){await drop(page,await fixture(name+'.chargy'));await page.locator('.sessionPriceResult[data-before-start='+(['tampered-receipt','wrong-tariff','wrong-signed-price'].includes(name)?'invalid':'not-proven')+']').waitFor();if(index!==null)await capture(index,price.locator('.poiPricePublication'));}
    // Retrieval is opt-in and cannot replace the selected price when a witness supplies a foreign digest.
    await drop(page,await fixture('no-receipts.chargy'));await page.locator('.sessionPriceResult[data-state=valid][data-before-start=not-proven]').waitFor();receiptMode='bad';
    await price.locator('[data-action=load-publication]').click();await price.locator('.poiPricePublication [role=alert]').waitFor();assert.equal(await price.getAttribute('data-before-start'),'not-proven');
    receiptMode='good';await price.locator('[data-action=load-publication]').click();await page.locator('.sessionPriceResult[data-before-start=witnessed]').waitFor();assert.equal(requests.length,4);
    await page.locator('.historicalSessionResult [data-action=save-evidence]').click();await page.locator('.historicalSessionResult [data-action=save-evidence]').getByText('Evidence archived',{exact:true}).waitFor();
    const archives=await enter(page,'Session evidence');const downloadPromise=page.waitForEvent('download');await archives.locator('[data-action=export-archive]').click();const download=await downloadPromise,exported=await readFile(await download.path(),'utf8');
    assert.match(exported,/public-price-retrieval/);await page.reload({waitUntil:'networkidle'});await enter(page,'Session evidence');await page.locator('[data-action=open-archive]').click();await page.locator('.sessionPriceResult[data-before-start=witnessed]').waitFor();
    const other=await newPage();await drop(other,await fixture('session-before-start.chargy'));await other.locator('.sessionPriceResult[data-before-start=witnessed]').waitFor();
    await enter(page,'Publication witnesses');await page.setViewportSize(mobile);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture(6,page.locator('.poiWitnessManagement'));await page.setViewportSize(viewport);
    await page.locator('[data-witness-id="DEMO-WITNESS-B"] [data-action=remove-witness]').click();await other.getByText('Witness policy changed. Reopen data to check again.',{exact:true}).waitFor();assert.equal(await other.locator('.sessionPriceResult[data-before-start=witnessed]').count(),0);
    await drop(page,exported);await page.locator('.sessionPriceResult[data-state=valid][data-before-start=not-proven]').waitFor();await capture(5,price.locator('.poiPricePublication'));await other.close();
    const policyManager=await enter(page,'Publication witnesses');await policyManager.locator('[data-action=witness-policy-text]').fill(await fixture('witness-policy.json'));await policyManager.locator('[data-action=review-witness-policy]').click();await policyManager.locator('[data-action=accept-witness-policy]').click();await policyManager.locator('[data-witness-id="DEMO-WITNESS-B"]').waitFor();
    // Separate station-revision fixture world: explicit history reset retains witness and anchor decisions.
    await resetObservedPOIHistory(page);const live=await fixture('live-00-waiting.json');await drop(page,live);await page.locator('.livePOIResult[data-state=valid][data-stage=waiting]').waitFor();
    const consume=async()=>{const choices=page.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided) .trustChoice.once');while(await choices.count())await choices.first().click();};await consume();
    for(const [name,stage]of [['01-start','start'],['02-intermediate','charging'],['03-completed','complete']]){
        const text=await fixture('live-'+name+'.json'),until=Date.now()+15000;
        while(!pending.some(item=>item.route.request().failure()===null)){
            if(Date.now()>until)throw new Error('Missing pending live request');await consume();const retry=page.getByText('Retry now',{exact:true});if(await retry.isVisible()&&await retry.isEnabled())await retry.click();await page.waitForTimeout(20);
        }
        const entry=pending.findLast(item=>item.route.request().failure()===null);pending.splice(pending.indexOf(entry),1);entry.resolve(text);
        await page.locator('.livePOIResult[data-state=valid][data-stage='+stage+']').waitFor({timeout:40000});
    }
    await page.locator('.sessionPriceResult[data-before-start=witnessed]').waitFor();await capture(7,price.locator('.poiPricePublication'));
    // Switch back to the independent completed-session fixture world through the real reset UI.
    await resetObservedPOIHistory(page);
    // Corrupt policy storage is not interpreted as an empty/default configuration or restored from archived receipts.
    await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('ChargyPOIWitnessTrust');r.onsuccess=()=>resolve(r.result);});
        await new Promise(resolve=>{const tx=db.transaction('configuration','readwrite'),store=tx.objectStore('configuration'),r=store.get('current');r.onsuccess=()=>store.put({...r.result,text:'{}'});tx.oncomplete=resolve;});db.close();});
    await page.reload({waitUntil:'networkidle'});await drop(page,await fixture('session-before-start.chargy'));
    await page.locator('.sessionPriceResult[data-state=invalid]').waitFor();assert.match(await page.locator('.sessionPriceResult').textContent(),/Unsupported witness publication policy/);
    assert.equal(await page.locator('.sessionPriceResult[data-before-start=witnessed]').count(),0);
    assert.equal(await page.locator('webpack-dev-server-client-overlay').count(),0);assert.deepEqual(failures,[]);
    await writeFile(path.join(output,'capture-info.json'),JSON.stringify({command:'npm run docs:screenshots:poi-publication',browser:browser.version(),origin,viewport,detailViewport:{width:1440,height:1900},mobileViewport:mobile,fixedTime:vectors.now,screenshots:names,
        fixturesSHA256:createHash('sha256').update(await fixture('vectors.json')).digest('hex'),checks:['actual anchor and witness decisions','no automatic witness/source trust','file and paste policy review','native storage failure does not grant trust','two organization quorum with Ed25519 and ML-DSA-65','clock uncertainty, late, duplicate and tampered receipts','explicit bounded receipt retrieval; no customer data','archive export/reload rechecks current witness policy','withdrawal invalidates another tab','mobile without horizontal overflow','genuine cumulative live completion','no injected success states','no app console errors']},null,2)+'\n');
    console.log('Captured eight publication screenshots; real organization/time policy, retrieval, storage, archive, withdrawal and live checks passed.');
    await context.close();
}finally{for(const item of pending)item.resolve();if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
