import {openMobileSession,mobileBack} from './mobileBrowser.mjs';
// Browser plugin not available. Real app, native IndexedDB, actual signatures and explicit local trust.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import path from 'node:path';
import {chromium} from 'playwright';
import {parseJSON,prettyJSON,TrustAnchor} from '@open-charging-cloud/wwcp-poi';
import {resetObservedPOIHistory} from './observedHistoryBrowser.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
const {values}=parseArgs({options:{'build-dir':{type:'string',default:path.join(repo,'platforms/browser/www')},'output-dir':{type:'string',default:path.join(repo,'documentation/screenshots/poi-observed-versions')}}});
const build=path.resolve(values['build-dir']),output=path.resolve(values['output-dir']);await mkdir(output,{recursive:true});
const fixture=name=>readFile(path.join(repo,'tests/fixtures/POIObservedVersions',name),'utf8');
const vectors=parseJSON(await fixture('vectors.json')),anchor=TrustAnchor.parse(vectors.bootstrap.trustAnchor),fixedTime=vectors.evaluatedAt;
const viewport={width:1440,height:1050},screenshots=['01-historical-price.png','02-checkpoint-fork.png','03-price-fork.png','04-station-rollback.png','05-management.png','06-reset-warning.png','07-mobile.png','08-live-resume.png'];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(request,response)=>{
    try{const url=new URL(request.url,'http://localhost'),file=path.resolve(build,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
        assert.ok(file.startsWith(build+path.sep));response.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(file));}
    catch{if(!response.headersSent)response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser,servedProof=vectors.proofs[0];const failures=[],liveResponses=[];
try{
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport,locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*',route=>{
        const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
        if(url.href===anchor.urls[0]+'/EVSEs/'+vectors.evseId+'/proof')return route.fulfill({body:prettyJSON(servedProof),contentType:'application/json'});
        if(url.origin==='https://chargy.charging.cloud')return route.fulfill({json:{versions:[]}});
        if(route.request().resourceType()==='image')return route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
        // Live transport is deliberately offline: reopening is backed by the exact persisted originals.
        if(url.origin==='https://live.poi.example')return liveResponses.length===0?route.abort():route.fulfill({body:liveResponses.shift(),contentType:'application/json'});
        failures.push('Unexpected external request '+url.href);return route.abort();
    });
    async function newPage(){const page=await context.newPage();page.setDefaultTimeout(18000);page.on('pageerror',error=>failures.push(error.message));
        page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('net::ERR_FAILED'))failures.push(message.text());});
        await page.clock.setFixedTime(new Date(fixedTime));await page.goto(origin,{waitUntil:'networkidle'});assert.match(await page.title(),/Chargy/);return page;}
    const page=await newPage();
    async function drop(page,text){const previous=await page.$('.sessionPOI');await page.evaluate(text=>{
        const transfer=new DataTransfer();transfer.items.add(new window.NativeFile([text],'observed-history.chargy',{type:'application/json'}));
        document.querySelector('#startPage').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));},text);await openMobileSession(page);
        if(previous!==null){await page.waitForFunction(element=>!element.isConnected,previous);await previous.dispose();}await page.locator('.sessionPOI').waitFor();}
    async function authorize(page){const panel=page.locator('.sessionPOI'),details=panel.locator('.sessionPOIDetails');
        if(!await details.evaluate(element=>element.open))await details.locator(':scope > summary').click();
        await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).click();const dialog=page.locator('#qrCodeScanner'),preview=dialog.locator('#qrCodeScannerTrustAnchorPreview');
        await dialog.getByRole('button',{name:'Import',exact:true}).click();await preview.locator('.trustAnchorLoadedData').waitFor();
        for(const id of anchor.keys){const key=preview.locator('.anchorKeyTrustKey[data-key-id="'+id+'"]');if(await key.locator('[data-key-trust=manual]').count())continue;
            await key.locator('[data-action=accept-key]').click();await key.locator('[data-action=confirm-key]').click();await key.locator('[data-key-trust=manual]').waitFor();}
        await dialog.getByRole('button',{name:'Close',exact:true}).click();}
    const price=page.locator('.sessionPriceResult'),history=page.locator('.historicalSessionResult');
    const valid=async p=>p.locator('.sessionPriceResult[data-state=valid]').waitFor();
    async function capture(index,locator){await page.evaluate(()=>document.fonts.ready);if(locator)await locator.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,screenshots[index]),animations:'disabled'});}
    async function enter(page,section){if(!await page.locator('#settingsPage:visible').count())await page.locator('#settingsButton').click();
        while(await page.locator('#settingsTrustManagement').isVisible())await page.locator('#settingsBackButton').click();
        await page.locator('#settingsTrustManagementEntry').click();const management=page.locator('#settingsTrustManagement');
        await management.getByRole('button',{name:section,exact:true}).click();await management.locator('.trustManagementList[aria-busy=false]').waitFor();return management;}
    const readJournal=async p=>p.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('ChargyPOIObservedHistory');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        const records=await new Promise(resolve=>{const request=db.transaction('scopes').objectStore('scopes').getAll();request.onsuccess=()=>resolve(request.result);});db.close();return records;});
    const archive0=await fixture('archive-0.chargy'),archive1=await fixture('archive-1.chargy'),archive2=await fixture('archive-2.chargy');
    await drop(page,archive0);await authorize(page);await valid(page);
    await history.locator('[data-action=save-evidence]').click();await page.getByText('Evidence archived',{exact:true}).waitFor();
    await drop(page,archive2);await valid(page);await page.reload({waitUntil:'networkidle'});await drop(page,archive0);await valid(page);
    assert.match(await price.textContent(),/older versions are allowed/);assert.match(await price.textContent(),/0\.35 EUR\/kWh/);await capture(0,price);
    // A second tab sees the first tab's authenticated coordinates without importing its trust again.
    const other=await newPage();await drop(other,archive1);await valid(other);await drop(page,await fixture('checkpoint-fork-1.chargy'));
    await page.locator('.historicalSessionResult .poiConsistency[data-state=invalid]').waitFor();await page.locator('.sessionPriceResult .poiConsistency[data-state=invalid]').waitFor();
    assert.equal(await price.getAttribute('data-publication'),'valid');await capture(1,history);
    await page.reload({waitUntil:'networkidle'});await drop(page,archive1);await page.locator('.sessionPriceResult .poiConsistency[data-state=invalid]').waitFor();
    assert.ok((await readJournal(page))[0].state.conflicts.some(item=>item.kind==='checkpoint'));
    // Reset is an explicit user decision, never a consequence of changing source or deleting an anchor.
    await resetObservedPOIHistory(page);await drop(page,archive2);await valid(page);await drop(other,await fixture('price-fork-1.chargy'));
    await other.locator('.sessionPriceResult .poiConsistency[data-state=invalid]').waitFor();
    await drop(page,archive2);await page.locator('.sessionPriceResult .poiConsistency[data-state=invalid]').waitFor();
    assert.match(await price.textContent(),/CPO price signatures and key permissions valid/);assert.equal(await price.getAttribute('data-publication'),'valid');await capture(2,price);
    await resetObservedPOIHistory(page);
    async function enterStation(){const management=await enter(page,'Roaming networks');await management.locator('.trustNetworkEntry').click();
        await management.getByRole('button',{name:'Check charging station',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.poiStationForm button[type=submit]')?.disabled===false);return management;}
    async function loadProof(){await page.locator('#poiStationEVSE').fill(vectors.evseId);await page.getByRole('button',{name:'Load and verify station proof',exact:true}).click();
        await page.locator('.poiStationPanel[aria-busy=false]').waitFor();}
    await enterStation();await loadProof();await page.locator('.poiStationVerdict[data-state=valid]').waitFor();
    servedProof=vectors.proofs[2];await loadProof();await page.locator('.poiStationVerdict[data-state=valid]').waitFor();
    await page.reload({waitUntil:'networkidle'});await enterStation();servedProof=vectors.proofs[0];await loadProof();await page.locator('.poiStationFailure').waitFor();
    assert.match(await page.locator('.poiStationFailure').textContent(),/rollback/);assert.equal(await page.locator('.poiStationVerdict[data-state=valid]').count(),0);await capture(3,page.locator('.poiStationFailure'));
    // Genuine concurrent submissions serialize in one IndexedDB read/compare/write transaction.
    await resetObservedPOIHistory(page);await Promise.all([drop(page,archive1),drop(other,await fixture('checkpoint-fork-1.chargy'))]);
    await page.waitForFunction(()=>document.querySelector('.sessionPriceResult')?.getAttribute('data-state')!=='pending');
    await other.waitForFunction(()=>document.querySelector('.sessionPriceResult')?.getAttribute('data-state')!=='pending');
    assert.ok((await readJournal(page))[0].state.conflicts.some(item=>item.kind==='checkpoint'));
    const management=await enter(page,'Observed versions');await capture(4,management);
    await management.locator('[data-action=reset-observations]').click();await management.locator('[data-action=confirm-reset-observations]').waitFor();await capture(5,management);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture(6,management);await page.setViewportSize(viewport);
    const oldGeneration=(await readJournal(page))[0].generation;await management.locator('[data-action=confirm-reset-observations]').click();await management.getByText('No observed versions.',{exact:true}).waitFor();
    const empty=(await readJournal(page))[0];assert.notEqual(empty.generation,oldGeneration);assert.equal(empty.state.points.length,0);assert.equal(empty.state.conflicts.length,0);
    await other.getByText('Observed history reset. Reopen data to check again.',{exact:true}).waitFor();
    await page.locator('#settingsBackButton').click();await page.locator('#settingsBackButton').click();await page.locator('#settingsBackButton').click();
    await drop(page,archive0);await valid(page);const archives=await enter(page,'Session evidence');assert.equal(await archives.locator('[data-archive-id]').count(),1);
    // Storage failures retain the old committed journal and cannot silently fall back to memory.
    await page.locator('#settingsBackButton').click();await page.locator('#settingsBackButton').click();await page.locator('#settingsBackButton').click();
    const beforeQuota=JSON.stringify(await readJournal(page));await page.evaluate(()=>{window.originalHistoryPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){
        if(this.name==='scopes')throw new DOMException('Simulated version-history quota failure','QuotaExceededError');return window.originalHistoryPut.apply(this,args);};});
    await drop(page,archive2);await page.locator('.sessionPriceResult[data-state=invalid]').waitFor();assert.equal(JSON.stringify(await readJournal(page)),beforeQuota);
    await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalHistoryPut;});
    // Reset during real asynchronous meter crypto cannot be undone by a late continuation.
    await page.evaluate(()=>{window.historyDigestHeld=false;window.historyDigestFinished=false;const original=crypto.subtle.digest.bind(crypto.subtle);window.historyOriginalDigest=original;
        crypto.subtle.digest=async function(algorithm,data){const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
            let held=false;if(!window.historyDigestHeld&&document.querySelector('.sessionPriceResult[data-state=pending]')&&new TextDecoder().decode(bytes).includes('"MS":"CHARGY-POI-METER-001"')){
                held=true;window.historyDigestHeld=true;await new Promise(resolve=>{window.releaseHistoryDigest=resolve;});}
            const result=await original(algorithm,data);if(held)window.historyDigestFinished=true;return result;};});
    await drop(page,archive2);await page.waitForFunction(()=>window.historyDigestHeld===true);
    await resetObservedPOIHistory(other);await page.evaluate(()=>window.releaseHistoryDigest());await page.waitForFunction(()=>window.historyDigestFinished===true);
    await page.getByText('Observed history reset. Reopen data to check again.',{exact:true}).waitFor();
    assert.equal((await readJournal(page))[0].state.points.length,0);assert.equal(await page.locator('.sessionPriceResult[data-state=valid]').count(),0);
    await page.evaluate(()=>{crypto.subtle.digest=window.historyOriginalDigest;});
    // Store a complete live chain, reload, reject its old QR snapshot, then reopen originals with fresh authorization.
    await resetObservedPOIHistory(page);let observedLive;
    for(const name of ['01-start','02-intermediate','03-completed'])liveResponses.push(await readFile(path.join(repo,'tests/fixtures/POILive',name+'.json'),'utf8'));
    await drop(page,await readFile(path.join(repo,'tests/fixtures/POILive/00-waiting.json'),'utf8'));
    const consent=page.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided) .trustChoice.once');
    await page.locator('#liveLinkTrustDialog:visible').waitFor();while(await consent.count())await consent.first().click();
    await page.locator('.livePOIResult[data-state=valid][data-stage=complete]').waitFor({timeout:40000});
    observedLive=(await readJournal(page))[0];assert.ok(observedLive.state.points.filter(item=>item.kind==='live').length===4);
    await page.reload({waitUntil:'networkidle'});await drop(page,await readFile(path.join(repo,'tests/fixtures/POILive/00-waiting.json'),'utf8'));
    await page.locator('.livePOIResult[data-state=invalid]').waitFor();assert.match(await page.locator('.livePOIResult').textContent(),/rollback/);
    const renewedConsent=page.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided) .trustChoice.deny');
    while(await renewedConsent.count())await renewedConsent.first().click();
    await enter(page,'Observed versions');await page.locator('[data-action=open-observed-live]').click();await page.locator('.livePOIResult[data-state=valid][data-stage=complete]').waitFor();
    assert.equal(await page.locator('.measurementValueRows > .measurementValue').count(),3);await capture(7,page.locator('.livePOIResult'));
    // Deliberate local corruption is detected before even mathematically valid data can yield a success state.
    await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('ChargyPOIObservedHistory');r.onsuccess=()=>resolve(r.result);});
        await new Promise((resolve,reject)=>{const tx=db.transaction('scopes','readwrite'),store=tx.objectStore('scopes'),r=store.getAll();r.onsuccess=()=>{for(const record of r.result)store.put({...record,checksum:'00'.repeat(32)});};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();});
    await drop(page,archive0);await page.locator('.sessionPriceResult[data-state=invalid]').waitFor();assert.equal(await page.locator('.sessionPriceResult[data-state=valid]').count(),0);
    assert.equal(await page.locator('webpack-dev-server-client-overlay').count(),0);assert.deepEqual(failures,[]);
    await writeFile(path.join(output,'capture-info.json'),JSON.stringify({command:'npm run docs:screenshots:poi-observations',browser:browser.version(),origin,viewport,mobileViewport:{width:390,height:844},fixedTime,
        screenshots,fixturesSHA256:createHash('sha256').update(await fixture('vectors.json')).digest('hex'),
        checks:['actual two-holder trust','native IndexedDB across reload and tabs','historical fixed price remains valid after newer offer','checkpoint fork survives source switch/reload',
            'price fork in a later valid checkpoint','current station rollback after reload','concurrent transactions retain contradiction','explicit reset rotates generation and invalidates other tab',
            'reset retains trust and evidence archive','reset during real crypto cannot be undone by a late continuation','quota failure retains journal and fails closed','local live resume rechecks exact originals','old live QR version rejected after reload','corrupt journal fails closed','no injected success states','no app console errors']},null,2)+'\n');
    console.log('Captured eight durable-version screenshots; reload, tabs, signed contradictions, reset, quota, corruption and live resume passed.');await context.close();
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
