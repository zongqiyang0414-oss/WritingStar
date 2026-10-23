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
    const importFiles=async files=>{const chooser=page.waitForEvent('filechooser');await button('批量导入照片').click();await(await chooser).setFiles(files);await page.waitForFunction(()=>!Array.from(document.querySelectorAll('uni-button')).some(e=>e.textContent.includes('正在处理…')));};
    const noOverflow=async()=>{for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}await page.setViewportSize({width:390,height:900});};
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await bind('JS2026');
    await button('布置作业').click();await page.locator('.form-input input').fill('学生码与纸质作业流程验收');await page.locator('.form-card textarea').fill('记录一次秋天里的发现，写清楚观察的经过和自己的感受。');await button('发布作业').click();await page.locator('.paper-assignment-entry').waitFor();
    const state=await page.evaluate(stored), assignment=state.assignments.find(a=>a.title==='学生码与纸质作业流程验收');assert.equal(assignment.paperPacket.pages,2);assert.equal(assignment.paperPacket.cards.length,53);
    await button('查看 / 打印答题卡').click();await page.locator('.paper-preview-image').waitFor();
    const popupPromise=page.waitForEvent('popup');await button('打印全班').click();const popup=await popupPromise;await popup.locator('img').nth(3).waitFor();
    assert.equal(await popup.locator('img').count(),106);
    const images=await popup.locator('img').evaluateAll(imgs=>imgs.slice(0,4).map(img=>img.src));await popup.close();
    const files=images.map((url,i)=>{const file=`/tmp/writingstar-card-${i+1}.png`;fs.writeFileSync(file,Buffer.from(url.split(',')[1],'base64'));return file;});
    const downloadPromise=page.waitForEvent('download');await button('保存第 1 页图片').click();await(await downloadPromise).saveAs('/tmp/writingstar-downloaded-card.png');assert.ok(fs.statSync('/tmp/writingstar-downloaded-card.png').size>10000);
    await noOverflow();await page.screenshot({path:path.resolve(__dirname,'../outputs/prototype-answer-cards-2026-10-23.jpg'),type:'jpeg',quality:85,fullPage:true});
    await button('去批量扫描收件箱').click();await page.locator('.scan-capture-card').waitFor();
    await importFiles([files[1],files[0],files[2]]);await page.locator('.scan-page-card').nth(2).waitFor();
    assert.match(await page.locator('.scan-student-group').first().innerText(),/小禾[\s\S]*可提交/);assert.match(await page.locator('.scan-student-group').nth(1).innerText(),/缺少第 2 页/);
    assert.match(await page.locator('.scan-page-card').first().innerText(),/小禾 · 第 2 页/);
    assert.match(await page.locator('.scan-page-card').first().innerText(),/已自动校正/);
    await importFiles([files[0]]);assert.equal(await page.locator('.scan-page-card').count(),3);assert.match(await page.locator('.paper-error').innerText(),/未能添加/);
    await page.reload({waitUntil:'networkidle'});await button('查看作业',page.locator('.assignment-card').filter({hasText:assignment.title})).click();
    await button('批量扫描上传').click();await page.locator('.scan-page-card').nth(2).waitFor();
    await importFiles([files[3]]);assert.equal(await page.locator('.scan-student-group').filter({hasText:'可提交'}).count(),2);
    await noOverflow();await page.screenshot({path:path.resolve(__dirname,'../outputs/prototype-scan-inbox-2026-10-23.jpg'),type:'jpeg',quality:85,fullPage:true});
    await button('统一提交并开始AI批阅').click();await confirm();await page.locator('.scan-empty').waitFor();
    const submitted=(await page.evaluate(stored)).submissions.filter(s=>s.assignmentId===assignment.id);assert.equal(submitted.length,2);assert.ok(submitted.every(s=>s.paper.source==='teacher-scan'&&s.photos.every(p=>p.sample===false)));assert.deepEqual(submitted[0].paper.pages.map(p=>p.page),[1,2]);
    await button('查看全班AI批阅进度').click();await page.locator('.ai-batch-panel').waitFor();
    await page.locator('.back-button').click();await button('批量扫描上传').click();
    // Exercise getUserMedia, stable-frame capture, duplicate lock, and track cleanup.
    await page.evaluate(async image=>{
      const canvas=document.createElement('canvas');canvas.width=794;canvas.height=1123;const ctx=canvas.getContext('2d');ctx.fillStyle='#555';ctx.fillRect(0,0,794,1123);
      const img=new Image();await new Promise(resolve=>{img.onload=resolve;img.src=image;});ctx.drawImage(img,0,0,794,1123);
      const stream=canvas.captureStream(8);window.__paperCamera={canvas,stream};Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>stream});
      window.__paperCamera.timer=setInterval(()=>{ctx.drawImage(img,0,0,794,1123);},120);
    },images[0]);
    await button('开启相机扫描').click();await page.locator('.scan-page-card').waitFor();assert.match(await page.locator('.scan-page-card').innerText(),/小禾/);
    await page.waitForFunction(()=>document.querySelector('.scan-camera-status')?.textContent.includes('本页已保存'));
    assert.equal(await page.locator('.scan-page-card').count(),1);
    await button('关闭相机').click();assert.ok(await page.evaluate(()=>window.__paperCamera.stream.getTracks().every(t=>t.readyState==='ended')));await page.evaluate(()=>clearInterval(window.__paperCamera.timer));
    await page.locator('.back-button').click();
    await page.locator('.role-button').filter({hasText:/^学生$/}).click();await bind('XS2026');await button('查看任务',page.locator('.assignment-card').filter({hasText:assignment.title})).click();await button('下载 / 打印答题卡').click();assert.equal(await page.locator('.paper-card-controls uni-picker').count(),0);assert.equal(await button('打印全班').count(),0);
    await button('已完成，上传答题卡').click();await importFiles([files[2]]);assert.match(await page.locator('.scan-page-card').innerText(),/其他学生/);assert.ok(await button('提交答题卡并开始AI批阅').evaluate(el=>el.hasAttribute('disabled')||el.getAttribute('aria-disabled')==='true'||el.className.includes('disabled')));
    await page.locator('.role-button').filter({hasText:/^教师$/}).click();await button('布置作业').click();
    const parentTitle='家长协助打印与提交验收';await page.locator('.form-input input').fill(parentTitle);await page.locator('.form-card textarea').fill('纸上完成后上传两页答题卡。');await button('发布作业').click();await button('查看 / 打印答题卡').click();
    const ownPopup=page.waitForEvent('popup');await button('打印 / 下载此生 PDF').click();const ownPrint=await ownPopup;await ownPrint.locator('img').nth(1).waitFor();assert.equal(await ownPrint.locator('img').count(),2);
    const ownImages=await ownPrint.locator('img').evaluateAll(imgs=>imgs.map(img=>img.src));await ownPrint.close();
    const ownFiles=ownImages.map((url,i)=>{const file=`/tmp/writingstar-parent-card-${i+1}.png`;fs.writeFileSync(file,Buffer.from(url.split(',')[1],'base64'));return file;});
    await page.locator('.role-button').filter({hasText:/^学生$/}).click();await button('查看任务',page.locator('.assignment-card').filter({hasText:parentTitle})).click();await button('上传答题卡',page.locator('.paper-assignment-entry')).click();await page.locator('.scan-empty').waitFor();
    await importFiles(ownFiles.reverse());assert.equal(await page.locator('.scan-student-group').filter({hasText:'可提交'}).count(),1);await button('提交答题卡并开始AI批阅').click();await confirm();await page.locator('.ai-review-panel').waitFor();
    const parentState=await page.evaluate(stored), parentAssignment=parentState.assignments.find(a=>a.title===parentTitle), parentSubmission=parentState.submissions.find(s=>s.assignmentId===parentAssignment.id);
    assert.equal(parentSubmission.actor,'student');assert.equal(parentSubmission.paper.source,'student-paper');assert.equal(parentSubmission.aiReview.result,null);assert.equal(parentSubmission.photos.length,2);
    await page.screenshot({path:path.resolve(__dirname,'../outputs/prototype-paper-student-ai-2026-10-23.jpg'),type:'jpeg',quality:85,fullPage:true});
    assert.deepEqual(errors,[]);console.log('Paper cards/PDF, real QR matching, perspective correction, page order/missing/duplicates, persistent drafts, atomic class submission, parent-assisted student submission and AI queue, continuous camera, camera cleanup, student isolation and responsive layouts passed.');
  }catch(error){if(page){await page.screenshot({path:'/tmp/writingstar-paper-failure.png',fullPage:true}).catch(()=>{});console.error(await page.locator('body').innerText().catch(()=>''));}console.error(error);process.exitCode=1;}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
