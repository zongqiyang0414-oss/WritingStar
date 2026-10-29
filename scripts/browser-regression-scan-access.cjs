// Current source H5 workflow, real QR pixels, local files and a synthetic camera.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.' + (new URL(req.url,'http://localhost').pathname === '/' ? '/index.html' : decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  if(req.url.includes('cameraBlocked=1'))res.setHeader('Permissions-Policy','camera=()');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
function stored() {
  const raw = JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));
  return raw.schemaVersion ? raw : typeof raw === 'string' ? JSON.parse(raw) : typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
}
// Exercise Chromium's real media API (virtual device), not a getUserMedia stub.
(async()=>{
  let browser; const failures=[];
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({executablePath:process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream']});
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    await context.grantPermissions(['camera'],{origin:base});
    const observe=async page=>{
      page.on('pageerror',error=>failures.push(error.message));
      await page.addInitScript(()=>{
        window.__mediaCalls=[];window.__streams=[];
        const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=function(options){
          window.__mediaCalls.push({active:navigator.userActivation.isActive});
          return original(options).then(stream=>{window.__streams.push(stream);return stream;});
        };
      });
    };
    const page=await context.newPage();await observe(page);
    const button=(name,p=page)=>p.locator('uni-button').filter({hasText:name});
    await page.goto(base+'/#/pages/scan/index?batch=paper&remaining=60',{waitUntil:'networkidle'});
    assert.equal(await page.evaluate(()=>window.__mediaCalls.length),0,'navigation must not open the camera');
    await button(/^开启相机$/).click();
    await page.waitForFunction(()=>document.querySelector('#scan-browser-camera video')?.videoWidth>0);
    await page.waitForFunction(()=>!document.querySelector('.scan-shutter').hasAttribute('disabled'));
    assert.equal(await page.evaluate(()=>window.__mediaCalls[0].active),true,'real getUserMedia begins in the click gesture');
    await page.locator('.scan-shutter').click();await button('确认并处理').or(button('调整边角')).first().waitFor();
    assert.ok(await page.evaluate(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),'review/corners releases the real media tracks');
    await page.close();await context.close();

    const denied=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const blockedPage=await denied.newPage();await observe(blockedPage);
    const session=await denied.newCDPSession(blockedPage);
    await session.send('Browser.setPermission',{permission:{name:'camera'},setting:'denied',origin:base});
    await blockedPage.goto(base+'/#/pages/scan/index?batch=paper&remaining=60',{waitUntil:'networkidle'});
    await button(/^开启相机$/,blockedPage).click();await blockedPage.locator('.scan-error').waitFor();
    assert.match(await blockedPage.locator('.scan-error').innerText(),/Chrome.*相机/);
    assert.ok(await blockedPage.locator('.scan-shutter').getAttribute('disabled'));
    // An attached file input can still open while camera permission is denied.
    const picker=blockedPage.waitForEvent('filechooser');await button('从相册扫描',blockedPage).click();
    const chosen=await picker;
    assert.equal(await chosen.element().evaluate(e=>e.isConnected),true);
    assert.equal(await chosen.element().getAttribute('capture'),null);
    await chosen.setFiles(path.resolve(__dirname,'../src/static/essay-1.png'));
    await button('确认并处理',blockedPage).waitFor();
    assert.equal(await blockedPage.evaluate(()=>window.__mediaCalls.length),1,'album never retries camera authorization');
    await button('确认并处理',blockedPage).click();await button('调整边角',blockedPage).waitFor();
    assert.ok((await blockedPage.locator('.scan-result img').getAttribute('src')).startsWith('data:image/jpeg;'));
    await blockedPage.screenshot({path:path.resolve(__dirname,'../outputs/scan-access-album-recovered-20261029.png')});
    await button('删除此页',blockedPage).click();await blockedPage.locator('.scan-empty').waitFor();
    const systemPicker=blockedPage.waitForEvent('filechooser');await button('使用系统相机拍摄',blockedPage).click();
    const system=await systemPicker;assert.equal(await system.element().getAttribute('capture'),'environment');
    await system.setFiles([]);
    await blockedPage.waitForFunction(()=>document.querySelectorAll('input[type=file]').length===0);
    await denied.close();
    const policyContext=await browser.newContext({viewport:{width:390,height:844}});
    await policyContext.grantPermissions(['camera'],{origin:base});
    const embedded=await policyContext.newPage();await observe(embedded);
    await embedded.goto(base+'/?cameraBlocked=1#/pages/scan/index',{waitUntil:'networkidle'});
    await button(/^开启相机$/,embedded).click();await embedded.locator('.scan-error').waitFor();
    assert.match(await embedded.locator('.scan-error').innerText(),/嵌入页面禁止/);
    assert.equal(await embedded.evaluate(()=>window.__mediaCalls.length),0,'policy denial is identified before requesting device permission');
    const independent=embedded.waitForEvent('filechooser');await button('从相册扫描',embedded).click();await(await independent).setFiles([]);
    await policyContext.close();
    assert.deepEqual(failures,[]);
    console.log('Real Chromium media permission/gesture, denied camera, independent album processing, system capture input, Permissions-Policy restriction and track cleanup passed.');
  } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
