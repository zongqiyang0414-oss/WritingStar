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
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
function stored() {
  const raw = JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));
  return raw.schemaVersion ? raw : typeof raw === 'string' ? JSON.parse(raw) : typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
}
(async()=>{
  let browser,page; const errors=[];
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({executablePath:process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const context=await browser.newContext({viewport:{width:390,height:900},acceptDownloads:true});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||route.request().url().startsWith('data:')?route.continue():route.abort());
    page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
    const button=(text,scope=page)=>scope.locator('uni-button').filter({hasText:text});
    const confirm=async()=>{await page.locator('.modal-actions .primary').click();await page.locator('.slide-down-panel.is-dialog').waitFor({state:'hidden'});};
    const bind=async code=>{await page.locator('.binding-login').click();await page.locator('.binding-code input').fill(code);await button('查看绑定信息').click();await button(/^\s*确认\s*$/,page.locator('.binding-view')).click();await page.locator('.greeting').waitFor();};
    const noOverflow=async()=>{for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}await page.setViewportSize({width:390,height:900});};
    await page.addInitScript(() => {
      window.__capture = { paper: '', present: true, streams: [], slowOutline: true, livePngExports: 0 };
      const encode=HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL=function(type,...args){
        // Reproduce an outline export exceeding the old 650ms reset. The
        // physical page stays still; rendering must not prevent the shutter.
        if(type==='image/png' && window.__capture.slowOutline){if(window.__capture.streams.length)window.__capture.livePngExports++;const until=performance.now()+680;while(performance.now()<until){}}
        return encode.call(this,type,...args);
      };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable:true, value: async () => {
        // A landscape camera in a portrait viewport catches preview/outline crop mismatches.
        const state=window.__capture, canvas=document.createElement('canvas'); canvas.width=960;canvas.height=720;
        const ctx=canvas.getContext('2d'), img=new Image();
        await new Promise(resolve=>{img.onload=resolve;img.src=state.paper;});
        let loaded=state.paper;
        const draw=()=>{if(loaded!==state.paper){loaded=state.paper;img.src=loaded;}ctx.fillStyle='#544d41';ctx.fillRect(0,0,960,720);if(state.present&&img.complete&&img.naturalWidth)ctx.drawImage(img,280,77,400,566);};
        draw(); const timer=setInterval(draw,80),stream=canvas.captureStream(12); state.streams.push(stream);
        const track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};
        return stream;
      }});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await bind('JS2026');
    await button('布置作业').click();await page.locator('.form-input input').fill('学生码与纸质作业流程验收');await page.locator('.form-card textarea').fill('记录一次秋天里的发现，写清楚观察的经过和自己的感受。');await button('发布作业').click();await page.locator('.paper-assignment-entry').waitFor();
    const state=await page.evaluate(stored), assignment=state.assignments.find(a=>a.title==='学生码与纸质作业流程验收');assert.equal(assignment.paperPacket.pages,2);assert.equal(assignment.paperPacket.cards.length,53);
    await button('查看 / 打印答题卡').click();await page.locator('.paper-preview-image').waitFor();
    const first = await page.locator('.paper-preview-image img').getAttribute('src');
    await button('下一页 ›').click();
    await page.waitForFunction(previous=>document.querySelector('.paper-preview-image img')?.src!==previous,first);
    const images = [first, await page.locator('.paper-preview-image img').getAttribute('src')];
    await button(/去.*扫描/).click();
    await page.evaluate(image=>{window.__capture.paper=image;}, images[0]);
    await button('开启相机扫描').click();await page.locator('.scanner-page').waitFor();
    assert.equal(await page.locator('#scan-browser-camera video').count(),0,'opening the page does not request camera permission');
    assert.match(await page.locator('.scan-mode-toggle').innerText(),/已开启/,'automatic scanning is on by default');
    const autoStarted=Date.now();
    await button(/^开启相机$/).click();await page.locator('.scan-outline').waitFor();
    assert.equal(await page.locator('#scan-browser-camera video').evaluate(el=>getComputedStyle(el).objectFit),'contain');
    // The rendered outline must follow the full camera image, including letterboxing.
    const outline = await page.locator('.scan-outline img').evaluate(async el => {
      const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=el.src;});
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let left=canvas.width,right=0,top=canvas.height,bottom=0;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>40){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      const scale=Math.min(canvas.width/960,canvas.height/720),offsetX=(canvas.width-960*scale)/2,offsetY=(canvas.height-720*scale)/2;
      return {actual:[left,top,right,bottom],expected:[offsetX+280*scale,offsetY+77*scale,offsetX+680*scale,offsetY+643*scale]};
    });
    outline.actual.forEach((value,i)=>assert.ok(Math.abs(value-outline.expected[i])<8,`outline ${i}: ${value} vs ${outline.expected[i]}`));
    await page.waitForFunction(()=>document.querySelector('.scan-count')?.textContent.startsWith('1'));
    const firstCaptureMs=Date.now()-autoStarted;
    assert.ok(firstCaptureMs<8000,'outline export must not keep resetting a stationary page');
    assert.equal(await page.evaluate(()=>window.__capture.livePngExports),0,'live border uses vectors, never per-frame PNG encoding');
    await page.evaluate(()=>window.__capture.slowOutline=false);
    console.log(`Stationary page captured with vector outline: ${firstCaptureMs}ms including opening camera and processing; no per-frame PNG export.`);
    assert.match(await page.locator('.scan-count').innerText(),/1 \/ 60/);
    await page.waitForTimeout(1800);
    assert.match(await page.locator('.scan-count').innerText(),/^1/,'the same paper must not be captured again');
    assert.equal(await page.locator('#scan-browser-camera video').count(),1,'automatic capture keeps the camera live');
    await page.screenshot({path:path.resolve(__dirname,'../outputs/v014-scan-auto-20261030.png')});
    // Removing a page and introducing the next page automatically rearms capture.
    await page.evaluate(()=>window.__capture.present=false);await page.waitForTimeout(1500);
    await page.evaluate(image=>window.__capture.paper=image,images[1]);
    await page.evaluate(()=>window.__capture.present=true);
    await page.waitForFunction(()=>document.querySelector('.scan-count')?.textContent.startsWith('2'));
    await page.waitForTimeout(1800);
    assert.match(await page.locator('.scan-count').innerText(), /^2/);
    await page.locator('.scan-side-action').filter({hasText:'已扫描'}).click();
    await button('调整边角').waitFor();
    assert.ok((await page.locator('.scan-result img').getAttribute('src')).startsWith('data:image/jpeg;'));
    await page.screenshot({path:path.resolve(__dirname,'../outputs/v014-scan-result-20261030.png')});
    // The manual switch stops automatic capture; the shutter still creates a page.
    await button('继续扫描').click();await page.locator('.scan-outline').waitFor();
    await page.locator('.scan-mode-toggle').click();assert.match(await page.locator('.scan-mode-toggle').innerText(),/已关闭/);
    await page.evaluate(()=>window.__capture.present=false);await page.waitForTimeout(1500);
    await page.evaluate(()=>window.__capture.present=true);await page.waitForTimeout(2200);
    assert.match(await page.locator('.scan-count').innerText(),/^2/,'manual mode must not capture automatically');
    await page.locator('.scan-shutter').click();await button('调整边角').waitFor();
    assert.match(await page.locator('.scan-count').innerText(),/^3/);
    await button('删除此页').click();assert.match(await page.locator('.scan-count').innerText(),/^2/);
    // Both processed pages must retain the original card identifiers.
    await button(/^完成 \d+ 页$/).click();await page.locator('.scan-page-card').first().waitFor();
    assert.equal(await page.locator('.scan-page-card').count(),2);
    assert.match(await page.locator('.scan-page-card').first().innerText(),/小禾.*第 1 页/);
    assert.match(await page.locator('.scan-page-card').first().innerText(),/已自动校正/);
    assert.ok(await page.evaluate(()=>window.__capture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
    // Album enhancement must retain QR duplicate rejection.
    const sourceFile='/tmp/writingstar-v0120-page2.png';fs.writeFileSync(sourceFile,Buffer.from(images[1].split(',')[1],'base64'));
    const chooser=page.waitForEvent('filechooser');await button('批量导入照片').click();await(await chooser).setFiles(sourceFile);
    await page.waitForFunction(()=>document.querySelector('.paper-error')?.textContent.includes('未能添加'));
    assert.equal(await page.locator('.scan-page-card').count(),2);
    assert.match(await page.locator('.scan-student-group').first().innerText(),/可提交/);
    await page.screenshot({path:path.resolve(__dirname,'../outputs/v014-scan-inbox-20261030.png'),fullPage:true});
    await button('统一提交并开始AI批阅').click();await confirm();await page.locator('.scan-empty').waitFor();
    const submissions=(await page.evaluate(stored)).submissions.filter(s=>s.assignmentId===assignment.id);
    assert.equal(submissions.length,1);assert.equal(submissions[0].paper.source,'teacher-scan');
    assert.deepEqual(submissions[0].paper.pages.map(p=>p.page),[1,2]);assert.ok(submissions[0].photos.every(p=>!p.sample));
    await noOverflow();assert.deepEqual(errors,[]);
    console.log('Scan default automatic capture, full-camera outline alignment, same-page lock, next-page rearm, manual capture, QR identity, duplicate protection, 60-page inbox, ordered submission and camera release passed.');
  } finally { await browser?.close();server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
