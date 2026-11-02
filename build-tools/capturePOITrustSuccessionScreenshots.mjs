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
const {values}=parseArgs({options:{'build-dir':{type:'string',default:path.join(repo,'platforms/browser/www')},'output-dir':{type:'string',default:path.join(repo,'documentation/screenshots/poi-trust-succession')}}});
const build=path.resolve(values['build-dir']),output=path.resolve(values['output-dir']);await mkdir(output,{recursive:true});
const fixture=name=>readFile(path.join(repo,'tests/fixtures/POITrustTransitions',name),'utf8');
const vectors=parseJSON(await fixture('vectors.json')),anchor=TrustAnchor.parse(vectors.anchor),fixedTime=vectors.now;
const viewport={width:1440,height:1050},screenshots=['01-cpo-authority.png','02-forged-first.png','03-cpo-key-change.png','04-policy-preview.png','05-live-after-policy.png','06-epoch-preview.png','07-epoch-current.png','08-mobile.png','09-invalid-transition.png'];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(request,response)=>{
    try{const url=new URL(request.url,'http://localhost'),file=path.resolve(build,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
        assert.ok(file.startsWith(build+path.sep));response.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(file));}
    catch{if(!response.headersSent)response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser,servedProof=vectors.baseProof;const failures=[],pending=[];
try{
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport,locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*',async route=>{
        const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
        if(url.pathname.endsWith('/EVSEs/DE*POI*E1*1/proof'))return route.fulfill({body:prettyJSON(servedProof),contentType:'application/json'});
        if(url.origin==='https://chargy.charging.cloud')return route.fulfill({json:{versions:[]}});
        if(route.request().resourceType()==='image')return route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
        // Live transport is deliberately offline: reopening is backed by the exact persisted originals.
        if(url.origin==='https://live.poi.example'){const body=await new Promise(resolve=>pending.push({route,resolve}));if(body===undefined)return route.abort();try{return await route.fulfill({body,contentType:'application/json'});}catch{return;}}
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
    const live=page.locator('.livePOIResult');
    async function capture(index,locator){await page.evaluate(()=>document.fonts.ready);if(locator)await locator.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,screenshots[index]),animations:'disabled'});}
    async function enter(page,section){if(!await page.locator('#settingsPage:visible').count())await page.locator('#settingsButton').click();
        while(await page.locator('#settingsTrustManagement').isVisible())await page.locator('#settingsBackButton').click();
        await page.locator('#settingsTrustManagementEntry').click();const management=page.locator('#settingsTrustManagement');
        await management.getByRole('button',{name:section,exact:true}).click();await management.locator('.trustManagementList[aria-busy=false]').waitFor();return management;}
    const readJournal=async p=>p.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('ChargyPOIObservedHistory');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        const records=await new Promise(resolve=>{const request=db.transaction('scopes').objectStore('scopes').getAll();request.onsuccess=()=>resolve(request.result);});db.close();return records;});
    const base=name=>readFile(path.join(repo,'tests/fixtures/POILive',name+'.json'),'utf8');
    const consumeConsent=async p=>{const choices=p.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided) .trustChoice.once');while(await choices.count())await choices.first().click();};
    const stage=async(name,count,documents)=>{await page.locator('.livePOIResult[data-state=valid][data-stage='+name+']'+(documents===undefined?'':'[data-documents="'+documents+'"]')).waitFor();await page.locator('.livePOIResult [data-check=cpo-authority]').waitFor();assert.equal(await page.locator('.measurementValueRows > .measurementValue').count(),count);};
    async function send(name){const body=await fixture(name),end=Date.now()+15000;
        while(!pending.some(item=>item.route.request().failure()===null)){if(Date.now()>end)throw new Error('Missing pending live request');await consumeConsent(page);
            const retry=page.getByText('Retry now',{exact:true});if(await retry.isVisible()&&await retry.isEnabled())await retry.click();await page.waitForTimeout(20);}
        const entry=pending.findLast(item=>item.route.request().failure()===null);pending.splice(pending.indexOf(entry),1);entry.resolve(body);}
    await drop(page,await base('00-waiting'));await page.locator('#liveLinkTrustDialog:visible').waitFor();await consumeConsent(page);await authorize(page);await stage('waiting',0);
    await capture(0,live);
    await resetObservedPOIHistory(page);await drop(page,await fixture('live-forged-first.json'));await page.locator('.livePOIResult[data-state=invalid]').waitFor();await consumeConsent(page);
    assert.equal(await page.locator('.livePOIResult [data-check=cpo-authority]').count(),0);await capture(1,live);
    await resetObservedPOIHistory(page);await drop(page,await fixture('live-price-only-key.json'));await page.locator('.livePOIResult[data-state=invalid]').waitFor();await consumeConsent(page);
    assert.equal(await page.locator('.livePOIResult [data-check=cpo-authority]').count(),0);
    await resetObservedPOIHistory(page);await drop(page,await base('01-start'));await stage('start',1);await consumeConsent(page);
    for(const name of ['live-key-change-without-cosignature.json','live-key-change-without-poi.json']){await send(name);await page.locator('.liveLinkPollStatus.warning').waitFor();assert.equal(await live.getAttribute('data-stage'),'start');assert.equal(await page.locator('.measurementValueRows > .measurementValue').count(),1);}
    await send('live-key-transition.json');await stage('start',1,2);await live.locator(':scope > details').first().locator(':scope > summary').click();await capture(2,live);await live.locator(':scope > details').first().locator(':scope > summary').click();
    await send('live-after-key-transition.json');await stage('start',1,3);
    const before=await readJournal(page);assert.ok(before[0].state.points.filter(point=>point.kind==='live').length===3);
    const other=await newPage();await drop(other,await base('01-start'));await other.locator('.livePOIResult[data-state=invalid]').waitFor();await consumeConsent(other);
    async function network(p){const management=await enter(p,'Roaming networks');await management.locator('.trustNetworkEntry').click();await management.locator('.trustTransitionManager').waitFor();return management;}
    await network(page);const manager=page.locator('.trustTransitionManager'),result=manager.locator('.trustTransitionResult');
    for(const name of ['missing-old-quorum.json','missing-new-quorum.json','tampered-target-url.json','invalid-target-certificate.json']){
        await manager.locator('textarea').fill(await fixture(name));await manager.locator('[data-action=review-transition]').click();await manager.locator('.trustTransitionResult[data-state=invalid]').waitFor();assert.equal(await manager.locator('[data-action=accept-transition]').count(),0);
    }
    await capture(8,result);
    await manager.locator('[data-action=transition-file]').setInputFiles(path.join(repo,'tests/fixtures/POITrustTransitions/policy-transition.json'));
    await manager.locator('[data-action=review-transition]').click();await manager.locator('.trustTransitionResult[data-state=valid]').waitFor();await capture(3,result);
    await manager.locator('[data-action=accept-transition]').click();await page.locator('.trustTransitionManager').getByText('Accepted transitions: 1',{exact:true}).waitFor();
    await other.getByText('Verified trust succession applied. Reopen data to check again.',{exact:true}).waitFor();
    const installed=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('ChargyTrustManagement');r.onsuccess=()=>resolve(r.result);});const records=await new Promise(resolve=>{const r=db.transaction('trustAnchors').objectStore('trustAnchors').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return records;});
    assert.equal(installed.length,1);assert.equal(installed[0].trustedKeys.length,2);assert.equal(installed[0].transitions.length,1);
    await enter(page,'Observed versions');await page.locator('[data-action=open-observed-live]').click();await stage('start',1);await consumeConsent(page);
    await send('live-after-policy-transition.json');await stage('complete',3);await page.locator('.historicalSessionResult[data-state=valid]').waitFor();await page.locator('.sessionPriceResult[data-state=valid]').waitFor();await capture(4,live);
    assert.match(await page.locator('.sessionPriceResult').textContent(),/0\.35 EUR\/kWh/);
    const after=await readJournal(page);assert.equal(after[0].id,before[0].id);assert.equal(after[0].state.transitions.length,1);assert.ok(after[0].state.points.length>before[0].state.points.length);
    await page.reload({waitUntil:'networkidle'});await enter(page,'Observed versions');await page.locator('[data-action=open-observed-live]').click();await stage('complete',3);
    // A separate real installation demonstrates an independent epoch-only transition fixture world.
    const epochContext=await browser.newContext({viewport,locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce',serviceWorkers:'block'});
    await epochContext.addInitScript(() => { window.NativeFile = window.File; });
    await epochContext.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
        if(url.pathname.endsWith('/EVSEs/DE*POI*E1*1/proof'))return route.fulfill({body:prettyJSON(vectors.epochProof),contentType:'application/json'});
        if(url.origin==='https://chargy.charging.cloud')return route.fulfill({json:{versions:[]}});
        if(route.request().resourceType()==='image')return route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
        return route.abort();});
    const epochPage=await epochContext.newPage();epochPage.setDefaultTimeout(18000);epochPage.on('pageerror',error=>failures.push(error.message));await epochPage.clock.setFixedTime(new Date(fixedTime));await epochPage.goto(origin,{waitUntil:'networkidle'});
    await drop(epochPage,await base('00-waiting'));await epochPage.locator('#liveLinkTrustDialog:visible').waitFor();while(await epochPage.locator('#liveLinkTrustDialog:visible .trustChoice.deny').count())await epochPage.locator('#liveLinkTrustDialog:visible .trustChoice.deny').first().click();
    await authorize(epochPage);await epochPage.locator('.livePOIResult[data-state=valid][data-stage=waiting]').waitFor();await network(epochPage);
    const epochManager=epochPage.locator('.trustTransitionManager');await epochManager.locator('textarea').fill(await fixture('wrong-genesis.json'));await epochManager.locator('[data-action=review-transition]').click();await epochManager.locator('.trustTransitionResult[data-state=invalid]').waitFor();
    await epochManager.locator('textarea').fill(await fixture('epoch-transition.json'));await epochManager.locator('[data-action=review-transition]').click();await epochManager.locator('.trustTransitionResult[data-state=valid]').waitFor();
    await epochManager.locator('.trustTransitionResult').screenshot({path:path.join(output,screenshots[5]),animations:'disabled'});
    await epochManager.locator('[data-action=accept-transition]').click();await epochPage.locator('.trustTransitionManager').getByText('Accepted transitions: 1',{exact:true}).waitFor();
    await epochPage.reload({waitUntil:'networkidle'});const epochManagement=await network(epochPage);await epochManagement.getByRole('button',{name:'Check charging station',exact:true}).click();await epochPage.locator('#poiStationEVSE').fill('DE*POI*E1*1');
    await epochManagement.getByRole('button',{name:'Load and verify station proof',exact:true}).click();await epochManagement.locator('.poiStationVerdict[data-state=valid]').waitFor();
    const journal=await readJournal(epochPage);assert.equal(journal[0].state.heads['["station","network"]'].epoch,'2');assert.ok(journal[0].state.points.some(point=>point.kind==='station'&&point.epoch===''));
    await epochPage.screenshot({path:path.join(output,screenshots[6]),animations:'disabled'});
    await network(epochPage);await epochPage.setViewportSize({width:390,height:844});assert.ok(await epochPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await epochPage.locator('.trustTransitionManager').scrollIntoViewIfNeeded();await epochPage.screenshot({path:path.join(output,screenshots[7]),animations:'disabled'});
    assert.deepEqual(failures,[]);assert.equal(await page.locator('webpack-dev-server-client-overlay').count(),0);
    await writeFile(path.join(output,'capture-info.json'),JSON.stringify({command:'npm run docs:screenshots:poi-succession',browser:browser.version(),viewport,mobileViewport:{width:390,height:844},fixedTime,screenshots,
        checks:['real initial CPO authority','foreign self-signed first document refused','CPO key transition requires POI and old-key authorization','new CPO key used alone after co-signed bridge',
            'file and clipboard transition review','both holder quorums required','target URL tampering rejected','explicit acceptance retains local root decisions','other tab invalidated',
            'live completion across accepted policy change with original fixed price','historical per-reading old/new policy coverage','reload rechecks original live chain','exact signed epoch genesis required',
            'epoch transition retains old negative history','current epoch-2 proof after reload','mobile without horizontal overflow','no injected success flags','no app console errors']},null,2)+'\n');
    console.log('Captured nine trust-succession screenshots; real CPO authority, co-signed key rotation, explicit policy adoption, epoch continuity and live completion passed.');await epochContext.close();await context.close();
}finally{for(const item of pending)item.resolve(undefined);await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
