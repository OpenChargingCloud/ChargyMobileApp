import {openMobileSession,mobileBack} from './mobileBrowser.mjs';
import {resetObservedPOIHistory} from './observedHistoryBrowser.mjs';
// Browser plugin not available: Playwright captures the actual app and genuine signed fixtures.
import assert from 'node:assert/strict';
import { createHash,createPrivateKey,sign } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import {canonicalJSONBytes as jcs} from '@open-charging-cloud/chargy-core';
import { parseJSON, prettyJSON, TrustAnchor } from '@open-charging-cloud/wwcp-poi';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
    'build-dir': { type: 'string', default: path.join(repo, 'platforms/browser/www') },
    'output-dir': { type: 'string', default: path.join(repo, 'documentation/screenshots/poi-live-pilot') }
} });
const build = path.resolve(values['build-dir']);
const output = path.resolve(values['output-dir']);
const fixturePaths = { session: 'tests/fixtures/POILive/00-waiting.json',
    provenance: 'tests/fixtures/POILive/provenance.json' };
const fixtures = Object.fromEntries(await Promise.all(Object.entries(fixturePaths).map(async ([key, file]) =>
    [key, await readFile(path.join(repo, file), 'utf8')])));
const input = parseJSON(fixtures.session);
const metadata = JSON.parse(fixtures.provenance);
const anchor = TrustAnchor.parse(input.poiEvidence.bootstrap.trustAnchor);
const viewport = { width: 1440, height: 1050 };
const fixedTime = metadata.evaluatedAt;
const imageNames = ['01-prepared.png','02-start.png','03-intermediate.png','04-completed.png','05-mobile.png','06-fixed-price-retained.png','07-rejected-update.png'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.map': 'application/json' };
await readFile(path.join(build, 'index.html'));
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/blank.html') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Storage migration</title>'); return; }
        const file = path.resolve(build, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(build + path.sep)) {
            response.writeHead(403).end();
            return;
        }
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(await readFile(file));
    }
    catch { if (!response.headersSent) response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
let browser;
const pending=[];let liveRequests=0;let priceRequests=0;
try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1,
        colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const failures = [];
    let proofRequests = 0;
    let statementRequests = 0;
    await context.addInitScript(() => { window.NativeFile = window.File; });
    await context.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if(url.origin==='https://live.poi.example'){
            liveRequests++;const body=await new Promise(resolve=>pending.push({route,resolve}));
            if(body===undefined)return route.abort();
            try{return await route.fulfill({body,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'}});}catch{return;}
        }

        if(url.href===anchor.urls[0]+'/EVSEs/'+metadata.evseId+'/priceStatements'){
            priceRequests++;return route.fulfill({body:JSON.parse(await readFile(path.join(repo,'tests/fixtures/POILive/01-start.json'),'utf8')).poiEvidence.priceEvidence,contentType:'application/json'});
        }
        if (url.href === anchor.urls[0] + '/keyStatement') { statementRequests++; return route.abort(); }
        if (url.href === anchor.urls[0] + '/EVSEs/' + metadata.evseId + '/proof') {
            proofRequests++;
            return route.fulfill({ body: prettyJSON(input.poiEvidence.chargingStationProof), contentType: 'application/json' });
        }
        if (url.origin === 'https://chargy.charging.cloud')
            return route.fulfill({ json: { versions: [] }, headers: { 'Access-Control-Allow-Origin': '*' } });
        if (request.resourceType() === 'image')
            return route.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), contentType: 'image/png' });
        failures.push(`Unexpected external request: ${url.href}`); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error'||message.type()==='warning'||message.type()==='warn') failures.push(message.text()); });
    await page.clock.setFixedTime(new Date(fixedTime));
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.match(await page.title(), /Chargy/);
    const panel=page.locator('.sessionPOI'),live=page.locator('.livePOIResult');
    const fixture=name=>readFile(path.join(repo,'tests/fixtures/POILive',name+'.json'),'utf8');
    async function drop(text){ await resetObservedPOIHistory(page);
        const previous=await page.$('.sessionPOI');
        await page.evaluate(text=>{const transfer=new DataTransfer();transfer.items.add(new window.NativeFile([text],'poi-live.json',{type:'application/json'}));
            document.querySelector('#startPage').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));},text);await openMobileSession(page);
        if(previous!==null){await page.waitForFunction(element=>!element.isConnected,previous);await previous.dispose();}
        await panel.waitFor();

    }
    async function authorize(){
        const controls=panel.locator('.sessionPOIDetails');if(!await controls.evaluate(element=>element.open))await controls.locator(':scope > summary').click();
        await panel.getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).click();
        const dialog=page.locator('#qrCodeScanner'),preview=dialog.locator('#qrCodeScannerTrustAnchorPreview');
        await dialog.getByRole('button',{name:'Import',exact:true}).click();await preview.locator('.trustAnchorLoadedData').waitFor();
        for(const id of anchor.keys){const key=preview.locator('.anchorKeyTrustKey[data-key-id="'+id+'"]');if(await key.locator('[data-key-trust=manual]').count())continue;
            await key.locator('[data-action=accept-key]').click();await key.locator('[data-action=confirm-key]').click();await key.locator('[data-key-trust=manual]').waitFor();}
        await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.livePOIResult[data-state=valid][data-stage=waiting]').waitFor();
    }
    async function send(name,supplied){
        const body=supplied??await fixture(name);
        const until=Date.now()+12000;
        while(!pending.some(entry=>entry.route.request().failure()===null)){
            if(Date.now()>until)throw new Error('No pending live request for '+name);
            const choices=page.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided) .trustChoice.once');
            if(await choices.count())await choices.first().click();
            else {
                const retry=page.getByText('Retry now',{exact:true});
                if(await retry.isVisible()&&await retry.isEnabled())await retry.click({timeout:1000});
            }
            await new Promise(resolve=>setTimeout(resolve,20));
        }
        const entry=pending.findLast(entry=>entry.route.request().failure()===null);pending.splice(pending.indexOf(entry),1);entry.resolve(body);
    }
    async function stage(name,count,checkPrice=true){
        await page.locator('.livePOIResult[data-state=valid][data-stage='+name+']').waitFor();
        assert.equal(await page.locator('.measurementValueRows > .measurementValue').count(),count);
        if(count>0&&checkPrice)await page.locator('.sessionPriceResult[data-state=valid]').waitFor();
    }
    async function archives(){await page.locator('#settingsButton').click();await page.locator('#settingsTrustManagementEntry').click();
        await page.locator('#settingsTrustManagement').getByRole('button',{name:'Session evidence',exact:true}).click();}
    await drop(fixtures.session);
    // A live transport consent is distinct from key/POI authorization.
    await page.locator('#liveLinkTrustDialog:visible').waitFor();
    while(await page.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided)').count())await page.locator('#liveLinkTrustDialog:visible .trustOrigin:not(.decided) .trustChoice.once').first().click();
    assert.equal(await page.locator('.livePOIResult[data-state=valid]').count(),0);
    await authorize();await stage('waiting',0);await page.locator('.sessionMeterKeyResult[data-check=prepared]').waitFor();
    assert.match(await page.locator('.sessionPriceResult').textContent(),/No session price is confirmed yet/);
    await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(output,imageNames[0]),animations:'disabled',scale:'css'});
    await send('01-start');await stage('start',1);await live.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,imageNames[1]),animations:'disabled',scale:'css'});
    // Signed but contradictory data and broken signatures keep the exact previous accepted UI.
    for(const name of ['same-time-fork','replayed-waiting','bad-predecessor','wrong-evse','replaced-start','removed-start','invalid-intermediate','foreign-meter','rate-conflict','invalid-document']){
        await send(name);await page.locator('.liveLinkPollStatus.warning').waitFor();
        assert.equal(await live.getAttribute('data-stage'),'start',name);assert.equal(await page.locator('.measurementValueRows > .measurementValue').count(),1,name);
        assert.match(await page.locator('.liveLinkPollStatus').textContent(),/Live update rejected/);
        if(['same-time-fork','wrong-evse'].includes(name)){
            // Genuine document equivocation is now durable. An independent test starts only after explicit reset.
            await drop(fixtures.session);await stage('waiting',0);await send('01-start');await stage('start',1);
        }
    }
    await page.locator('.liveLinkPollStatus details > summary').click();
    await page.screenshot({path:path.join(output,imageNames[6]),animations:'disabled',scale:'css'});
    await page.locator('.liveLinkPollStatus details > summary').click();
    await send('02-intermediate');await stage('charging',2);await live.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,imageNames[2]),animations:'disabled',scale:'css'});
    await send('03-completed');await stage('complete',3);await live.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,imageNames[3]),animations:'disabled',scale:'css'});
    const endRequests=liveRequests;await page.waitForTimeout(5500);assert.equal(liveRequests,endRequests);
    await page.setViewportSize({width:390,height:844});await live.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,imageNames[4]),animations:'disabled',scale:'css'});await page.setViewportSize(viewport);
    await page.locator('.historicalSessionResult [data-action=save-evidence]').click();await page.getByText('Evidence archived',{exact:true}).waitFor();
    await archives();const card=page.locator('[data-archive-id]');await card.waitFor();
    const download=page.waitForEvent('download');await card.locator('[data-action=export-archive]').click();
    const exported=await readFile(await(await download).path(),'utf8'),archive=JSON.parse(exported);
    assert.equal(archive.poiEvidence.liveDocuments.length,4);assert.equal(archive.poiEvidence.liveDocuments[0],fixtures.session);
    assert.equal(archive.poiEvidence.priceEvidence,JSON.parse(await fixture('01-start')).poiEvidence.priceEvidence);
    assert.equal(archive.chargingSessions[0].measurements[0].values.length,3);
    await card.locator('[data-action=open-archive]').click();await page.locator('.historicalSessionResult[data-state=valid]').waitFor();await page.locator('.sessionPriceResult[data-state=valid]').waitFor();
    await page.reload({waitUntil:'networkidle'});await archives();await card.locator('[data-action=open-archive]').click();await page.locator('.sessionPriceResult[data-state=valid]').waitFor();
    // Exercise a real explicit price download after live preparation made immutable evidence copies.
    const oldArchiveId=await card.getAttribute('data-archive-id');
    const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,161)]),format:'der',type:'pkcs8'});
    function resign(document){const {signatures,...signed}=document;return {...signed,signatures:signatures.map(signature=>({...signature,value:sign(null,jcs(signed),key).toString('hex').toUpperCase()}))};}
    const downloadStart=JSON.parse(await fixture('01-start'));delete downloadStart.poiEvidence.priceEvidence;
    const downloadSeries=[resign(downloadStart)];
    for(const name of ['02-intermediate','03-completed']){const next=JSON.parse(await fixture(name));next.updates=createHash('sha256').update(jcs(downloadSeries.at(-1))).digest('hex').toUpperCase();downloadSeries.push(resign(next));}
    await drop(fixtures.session);await stage('waiting',0);await send('01-start',JSON.stringify(downloadSeries[0]));await stage('start',1,false);
    await page.locator('.sessionPriceResult[data-state=idle]').waitFor();assert.equal(priceRequests,0);
    await panel.locator('[data-action=load-prices]').click();await page.locator('.sessionPriceResult[data-state=valid]').waitFor();assert.equal(priceRequests,1);
    await send('02-intermediate',JSON.stringify(downloadSeries[1]));await stage('charging',2);
    await send('03-completed',JSON.stringify(downloadSeries[2]));await stage('complete',3);assert.equal(priceRequests,1);
    await page.locator('.historicalSessionResult [data-action=save-evidence]').click();await page.getByText('Evidence archived',{exact:true}).waitFor();await archives();
    const downloadedArchive=page.locator('[data-archive-id]:not([data-archive-id="'+oldArchiveId+'"])');await downloadedArchive.waitFor();
    const networkDownload=page.waitForEvent('download');await downloadedArchive.locator('[data-action=export-archive]').click();
    const networkExport=JSON.parse(await readFile(await(await networkDownload).path(),'utf8'));
    assert.equal(networkExport.poiEvidence.liveDocuments[1],JSON.stringify(downloadSeries[0]));
    assert.equal(networkExport.poiEvidence.sessionId,networkExport.chargingSessions[0]['@id']);
    await downloadedArchive.locator('[data-action=open-archive]').click();await page.locator('.historicalSessionResult[data-state=valid]').waitFor();await page.locator('.sessionPriceResult[data-state=valid]').waitFor();
    await archives();await downloadedArchive.locator('[data-action=delete-archive]').click();await downloadedArchive.waitFor({state:'detached'});assert.equal(await card.count(),1);
    // A different genuine price offer cannot silently rebind this fixed-price session.
    await drop(fixtures.session);await stage('waiting',0);await send('01-start');await stage('start',1);
    await send('repriced');await page.locator('.livePOIResult[data-state=warning][data-stage=charging]').waitFor();
    assert.match(await live.textContent(),/original fixed price assignment is retained/);assert.match(await page.locator('.sessionPriceResult').textContent(),/0\.35 EUR\/kWh/);
    await live.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,imageNames[5]),animations:'disabled',scale:'css'});
    await send('repriced-completed');await page.locator('.livePOIResult[data-state=warning][data-stage=complete]').waitFor();
    // No historical success from an exported audit snapshot on a new installation.
    const clean=await browser.newContext({viewport,locale:'en-US',timezoneId:'UTC',serviceWorkers:'block'});
    await clean.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({body:'{}',contentType:'application/json'}));
    const other=await clean.newPage();await other.clock.setFixedTime(new Date(fixedTime));await other.goto(origin,{waitUntil:'networkidle'});
    await other.locator('#fileInput').setInputFiles({name:'live-archive.chargy',mimeType:'application/json',buffer:Buffer.from(exported)}); await openMobileSession(other);
    await other.locator('.sessionPOI').getByRole('button',{name:'Inspect supplied TrustAnchor …',exact:true}).waitFor();assert.equal(await other.locator('.sessionPriceResult[data-state=valid]').count(),0);await clean.close();
    // Real asynchronous crypto is held, authorization is withdrawn, then the original computation continues.
    await drop(fixtures.session);await stage('waiting',0);await send('01-start');await stage('start',1);
    await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    await page.evaluate(()=>{
        const original=crypto.subtle.digest.bind(crypto.subtle);window.liveOriginalDigest=original;window.liveHeld=false;
        crypto.subtle.digest=async function(algorithm,data){const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
            let held=false;
            if(!window.liveHeld&&new TextDecoder().decode(bytes).includes('"MS":"CHARGY-POI-METER-001"')){held=true;window.liveHeld=true;await new Promise(resolve=>{window.releaseLiveDigest=resolve;});}
            const result=await original(algorithm,data);if(held)window.liveDigestFinished=true;return result;};
        window.liveDelayedDigest=crypto.subtle.digest;
    });
    await send('02-intermediate');await page.waitForFunction(()=>window.liveHeld===true);
    await page.evaluate(async id=>{const db=await new Promise(resolve=>{const r=indexedDB.open('ChargyTrustManagement');r.onsuccess=()=>resolve(r.result);});
        await new Promise((resolve,reject)=>{const tx=db.transaction('trustAnchors','readwrite'),store=tx.objectStore('trustAnchors'),r=store.getAll();
            r.onsuccess=()=>{for(const record of r.result)store.put({...record,trustedKeys:record.trustedKeys.filter(key=>key.id!==id)});};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();},anchor.keys[0]);
    await page.evaluate(()=>window.releaseLiveDigest());await page.locator('.liveLinkPollStatus.warning').waitFor();
    assert.equal(await live.getAttribute('data-stage'),'start');assert.equal(await page.locator('.measurementValueRows > .measurementValue').count(),1);
    await page.evaluate(()=>{crypto.subtle.digest=window.liveOriginalDigest;});
    // Changing the selected local policy while a candidate is being checked prevents its adoption.
    await drop(fixtures.session);await authorize();await send('01-start');await stage('start',1);
    const selectedPolicy=await page.locator('#poiSessionPolicy').inputValue();
    await page.locator('.sessionMeterKeyResult[data-check=verified]').waitFor();
    await page.evaluate(()=>{window.liveHeld=false;window.liveDigestFinished=false;crypto.subtle.digest=window.liveDelayedDigest;});
    await send('02-intermediate');await page.waitForFunction(()=>window.liveHeld===true);
    const controls=panel.locator('.sessionPOIDetails');if(!await controls.evaluate(element=>element.open))await controls.locator(':scope > summary').click();
    await page.locator('#poiSessionPolicy').selectOption('');await page.evaluate(()=>window.releaseLiveDigest());
    await page.locator('.liveLinkPollStatus.warning').waitFor();assert.equal(await page.locator('.measurementValueRows > .measurementValue').count(),1);
    assert.equal(await page.locator('.livePOIResult[data-state=valid]').count(),0);
    await page.evaluate(()=>{crypto.subtle.digest=window.liveOriginalDigest;});await page.locator('#poiSessionPolicy').selectOption(selectedPolicy);await stage('start',1);
    // Opening a different completed record cancels work for the old live session.
    await page.locator('.sessionMeterKeyResult[data-check=verified]').waitFor();
    await page.evaluate(()=>{window.liveHeld=false;window.liveDigestFinished=false;crypto.subtle.digest=window.liveDelayedDigest;});
    await send('02-intermediate');await page.waitForFunction(()=>window.liveHeld===true);
    await archives();await card.locator('[data-action=open-archive]').click();await page.locator('.historicalSessionResult[data-state=valid]').waitFor();
    await page.evaluate(()=>window.releaseLiveDigest());await page.waitForFunction(()=>window.liveDigestFinished===true);
    assert.equal(await live.count(),0);assert.equal(await page.locator('.measurementValueRows > .measurementValue').count(),3);
    await page.evaluate(()=>{crypto.subtle.digest=window.liveOriginalDigest;});
    assert.equal(proofRequests,0);assert.equal(statementRequests,0);assert.equal(await page.locator('webpack-dev-server-client-overlay').count(),0);assert.deepEqual(failures,[]);
    await writeFile(path.join(output,'capture-info.json'),JSON.stringify({command:'npm run docs:screenshots:poi-live-pilot',locale:'en-US',timezone:'UTC',viewport,mobileViewport:{width:390,height:844},
        fixedTime,browser:browser.version(),screenshots:imageNames,fixture:{path:fixturePaths.session,sha256:createHash('sha256').update(fixtures.session).digest('hex')},
        checks:['real signed four-stage live series','explicit transport consent and two-holder trust','prepare before first reading','verify before update adoption',
            'strict predecessor and append-only originals','all ten rejection fixtures preserve previous UI','genuine live forks require explicit history reset before an independent scenario','all live tariff texts compared','fixed price retained with visible change warning',
            'polling stops after verified end','mobile layout','archive/export/reload/recheck with four exact live originals','export grants no trust','withdrawal during actual crypto','policy selection changed during crypto','different record cancels pending candidate',
            'no POI requests for embedded evidence','explicit price download retained across updates and archived under the completed record identity','no console errors'],scope:'P-256/OCMF cumulative live pilot; imported envelope-key continuity, separately POI-authorized meter and price evidence. Every envelope additionally requires independently POI-authorized CPO keys. No customer consent or pre-start publication claim.'},null,2)+'\n');
    console.log('Captured seven live-pilot screenshots; genuine sequence, rejection, price pinning, archive and withdrawal checks passed.');await context.close();
}
finally{for(const entry of pending)entry.resolve(undefined);await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
