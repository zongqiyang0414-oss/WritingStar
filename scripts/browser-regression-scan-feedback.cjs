// Actual Chromium touch input, camera pixels and CSS motion. No student data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {response.writeHead(404); response.end(); return;}
  response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'}); fs.createReadStream(file).pipe(response);
});
const artifactVersion=process.env.WRITINGSTAR_SCAN_ARTIFACT_VERSION||'v016';
const artifactDate=process.env.WRITINGSTAR_SCAN_ARTIFACT_DATE||'20261030';
const output = name => path.resolve(__dirname, '../outputs/' + name.replace('v016',artifactVersion).replace('20261030',artifactDate));
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({executablePath: process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox','--disable-dev-shm-usage']});
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__motionSamples = [];
      const sample = () => {
        const flying = document.querySelector('.scan-capture-flight'), thumb = document.querySelector('#scan-capture-thumb');
        if (flying && thumb) {
          const r = flying.getBoundingClientRect(), t = thumb.getBoundingClientRect();
          window.__motionSamples.push({time:Date.now()/1000,x:r.x,y:r.y,width:r.width,height:r.height,target:{x:t.x,y:t.y,width:t.width,height:t.height}});
        }
        requestAnimationFrame(sample);
      }; requestAnimationFrame(sample);
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async () => {
        const canvas=document.createElement('canvas');canvas.width=720;canvas.height=960;
        const c=canvas.getContext('2d');window.__scanScene=c;c.fillStyle='#746b57';c.fillRect(0,0,720,960);
        c.fillStyle='#e2ded4';c.fillRect(90,80,540,800);c.strokeStyle='#444';c.lineWidth=2;c.strokeRect(130,130,460,680);
        c.font='24px sans-serif';c.fillStyle='#252525';c.fillText('Scan detail test',155,175);
        for(let i=0;i<12;i++){c.font=(12+i%3)+'px sans-serif';c.fillText('Fine print and retained pen strokes '+i,155,225+i*28);}
        c.strokeStyle='#214ca6';c.lineWidth=4;c.beginPath();c.moveTo(160,650);c.lineTo(400,675);c.stroke();
        c.strokeStyle='#b62e38';c.beginPath();c.arc(470,710,25,0,Math.PI*2);c.stroke();
        const stream=canvas.captureStream(12),track=stream.getVideoTracks()[0],settings=track.getSettings.bind(track),stop=track.stop.bind(track);
        window.__torch={enabled:false,calls:[]};track.getCapabilities=()=>({torch:true});
        track.getSettings=()=>({...settings(),torch:window.__torch.enabled});
        track.applyConstraints=async options=>{if(window.__torch.failNext){window.__torch.failNext=false;throw Error('补光切换失败测试');}window.__torch.enabled=options.advanced[0].torch;window.__torch.calls.push(window.__torch.enabled);};
        track.stop=()=>{window.__torch.enabled=false;stop();};return stream;
      }});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/#/pages/scan/index?batch=paper&remaining=6`,{waitUntil:'networkidle'});
    const button = text => page.locator('uni-button').filter({hasText:text});
    const cdp=await context.newCDPSession(page), movie=[];
    cdp.on('Page.screencastFrame',frame=>{movie.push({time:frame.metadata.timestamp,data:frame.data});cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});});
    await button(/^开启相机$/).click();
    await page.locator('.scan-outline').waitFor();
    await cdp.send('Page.startScreencast',{format:'png',maxWidth:390,maxHeight:844,everyNthFrame:1});
    await page.locator('.scan-capture-flight').waitFor();
    assert.match(await page.locator('.scan-count').innerText(),/^1/);
    assert.equal(await page.locator('.scan-capture-photo img').getAttribute('src'),await page.locator('.scan-thumb img').getAttribute('src'),'flying image is the captured scan, not a placeholder');
    await page.locator('.scan-capture-flight').waitFor({state:'detached'});
    await cdp.send('Page.stopScreencast');
    const samples=await page.evaluate(()=>window.__motionSamples);
    assert.ok(samples.length>5,'animation renders intermediate frames');
    const first=samples[0],last=samples.at(-1);
    assert.ok(first.width>last.width*5 && last.y>first.y+100 && last.x>first.x+50,'photo shrinks and flies down to the right');
    assert.ok(Math.abs(last.x+last.width/2-last.target.x-last.target.width/2)<5 && Math.abs(last.y+last.height/2-last.target.y-last.target.height/2)<5,'motion lands on the measured thumbnail');
    const frames=`/workspace/scratch/scan-feedback-${artifactVersion}/movie`;fs.mkdirSync(frames,{recursive:true});
    const captured=movie.filter(frame=>frame.time>=first.time-.06&&frame.time<=last.time+.15);
    captured.forEach((frame,index)=>fs.writeFileSync(path.join(frames,`frame-${String(index).padStart(3,'0')}.png`),Buffer.from(frame.data,'base64')));
    fs.writeFileSync(path.join(frames,'timing.json'),JSON.stringify(captured.map(frame=>frame.time)));
    assert.equal(await page.locator('#scan-browser-camera video').count(),1,'auto camera stays mounted during collection');
    const flash=page.locator('.scan-flash-toggle');
    await flash.click();await page.waitForFunction(()=>window.__torch.enabled===true);
    assert.match(await flash.innerText(),/闪光灯 开/);
    await page.evaluate(()=>window.__torch.failNext=true);await flash.click();await page.locator('.scan-error').waitFor();
    assert.equal(await page.evaluate(()=>window.__torch.enabled),true);assert.match(await flash.innerText(),/闪光灯 开/,'failed off request keeps the previous on state');
    await flash.click();assert.equal(await page.evaluate(()=>window.__torch.enabled),false);
    await flash.click();await page.screenshot({path:output('v016-photo-flash-20261030.png')});
    await page.locator('.scan-side-action').filter({hasText:'已拍摄'}).click();
    const viewer=page.locator('.scan-image-viewer');await viewer.waitFor();assert.equal(await page.evaluate(()=>window.__torch.enabled),false,'review/track stop extinguishes the light');
    const image=page.locator('.scan-zoom-image');
    await page.waitForFunction(()=>document.querySelector('.scan-zoom-image img')?.naturalWidth>0);
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id,radiusX:3,radiusY:3}))});
    const matrix=()=>image.evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return {scale:m.a,x:m.e,y:m.f};});
    let box=await viewer.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
    await touch('touchStart',[[x-35,y,1],[x+35,y,2]]);
    for(let i=1;i<=6;i++){await touch('touchMove',[[x-35-i*12,y,1],[x+35+i*12,y,2]]);await page.waitForTimeout(25);}
    await touch('touchEnd',[]);
    let zoomed=await matrix();assert.ok(zoomed.scale>2.9&&zoomed.scale<3.2,'actual two-finger input enlarges the scan');
    await touch('touchStart',[[x,y,1]]);
    await touch('touchMove',[[x+75,y+85,1]]);await touch('touchEnd',[]);
    const panned=await matrix();assert.ok(panned.x-zoomed.x>60&&panned.y-zoomed.y>70,'one finger pans enlarged paper');
    await page.screenshot({path:output('v016-scan-zoom-20261030.png')});
    await page.waitForTimeout(450);await viewer.tap();
    const preview=page.locator('#u-a-p > div');await preview.waitFor();
    assert.ok(await preview.isVisible(),'tap opens full image preview');
    await preview.click({position:{x:360,y:20}});await preview.waitFor({state:'detached'});await viewer.waitFor();
    await page.setViewportSize({width:844,height:390});
    await page.waitForFunction(()=>new DOMMatrix(getComputedStyle(document.querySelector('.scan-zoom-image')).transform).a===1);
    await page.setViewportSize({width:390,height:844});
    await button('继续拍照').click();await page.locator('.scan-outline').waitFor();
    await page.locator('.scan-mode-toggle').click();
    await page.locator('.scan-shutter').click();
    await page.locator('.scan-capture-flight').waitFor();
    assert.match(await page.locator('.scan-count').innerText(),/^2/);
    await button('删除此页').waitFor();
    assert.equal((await matrix()).scale,1,'new page starts at whole-page size');
    await button('上一页').click();assert.equal((await matrix()).scale,1,'page switching resets view');
    await button('继续拍照').click();await page.locator('.scan-outline').waitFor();
    await page.locator('.scan-mode-toggle').click();
    await page.evaluate(()=>{const c=window.__scanScene;c.strokeStyle='#333';c.lineWidth=7;for(let i=0;i<6;i++){c.beginPath();c.moveTo(160,240+i*35);c.lineTo(450,255+i*35);c.stroke();}});
    await page.locator('.scan-capture-flight').waitFor();
    await page.locator('.scan-side-action').filter({hasText:'已拍摄'}).click();await viewer.waitFor();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.scan-capture-flight').count(),0,'entering review cancels in-flight feedback without a late image');
    assert.match(await page.locator('.scan-count').innerText(),/^3/,'cancelling feedback preserves the acquired page');
    assert.deepEqual(errors,[]);
    console.log('Capture flight, measured thumbnail landing, live auto camera, actual two-finger pinch, pan, full image preview, rotation/page-switch reset, manual collection and feedback cancellation passed.',{frames:samples.length,movieFrames:captured.length,zoomed,panned});
  } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
