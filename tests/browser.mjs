import {chromium} from '/tmp/sv-browser-qa/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
const fixture=process.env.DWG_FIXTURE;
if(!fixture)throw new Error('Set DWG_FIXTURE to the private local regression DWG.');
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1120},acceptDownloads:true});const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
try{
 await page.goto(process.env.SV_URL||'http://127.0.0.1:8766/');await page.screenshot({path:'/tmp/sv-empty.png',fullPage:true});
 assert.equal(await page.locator('#download').isDisabled(),true);
 await page.locator('#file').setInputFiles(fixture);
 await page.locator('#download').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('download').disabled,{},{timeout:60000});
 console.log('Loaded:',await page.locator('#counts').textContent(),await page.locator('#dimensions').textContent());
 await page.locator('input[data-source="HEATHER"]').uncheck();await page.waitForFunction(()=>document.getElementById('counts').textContent.endsWith('→ 9')&&!document.getElementById('download').disabled);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);await download.saveAs('/tmp/sv-browser-output.txt');
 const txt=fs.readFileSync('/tmp/sv-browser-output.txt','utf8');assert.ok(txt.startsWith('"; VECTORWORKS"\n'));assert.equal((txt.match(/"Label"/g)||[]).length,9);
 await page.screenshot({path:'/tmp/sv-result.png',fullPage:true});
 await page.locator('#view-top').click();await page.locator('#units').selectOption('1');await page.waitForFunction(()=>document.getElementById('dimensions').textContent.includes('25884'));
 await page.locator('#units').selectOption('0.001');await page.locator('#merge').uncheck();await page.waitForFunction(()=>document.getElementById('counts').textContent==='28 → 28');
 await page.locator('#merge').check();await page.waitForFunction(()=>document.getElementById('counts').textContent==='28 → 9');
 await page.locator('input[data-source="Model"]').uncheck();await page.locator('#error').waitFor({state:'visible'});assert.ok(await page.locator('#download').isDisabled());
 await page.locator('input[data-source="Model"]').check();await page.waitForFunction(()=>!document.getElementById('download').disabled);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/sv-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#file').setInputFiles({name:'broken.dwg',mimeType:'application/octet-stream',buffer:Buffer.from('not a drawing')});await page.locator('#error').waitFor({state:'visible'});assert.ok(await page.locator('#download').isDisabled());
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'));console.log('PASS: upload, WASM, source filtering, merged export download, unit changes, unmerged export, empty selection recovery, mobile layout, corrupt DWG; no page errors, no upload requests.');
}finally{await browser.close();}
