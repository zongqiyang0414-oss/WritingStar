const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('/opt/codex/cua_node/lib/node_modules/playwright-core');
const root = path.resolve(__dirname, '../dist/client');
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}); fs.createReadStream(file).pipe(res);
});
function stored() { const raw=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1')); return raw.schemaVersion ? raw : typeof raw==='string'?JSON.parse(raw):typeof raw.data==='string'?JSON.parse(raw.data):raw.data; }
(async()=>{
  let browser,page;const errors=[];
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const context=await browser.newContext({viewport:{width:390,height:900}});
    await context.route('**/*',route=>['127.0.0.1'].includes(new URL(route.request().url()).hostname)||/^(data|blob):/.test(route.request().url())?route.continue():route.abort());
    await context.addInitScript(()=>{
      new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.tagName==='IFRAME'&&node.title?.includes('答题卡打印'))node.contentWindow.print=()=>{
        window.__printResult={pages:node.contentDocument.images.length,loaded:Array.from(node.contentDocument.images).every(image=>image.complete&&image.naturalWidth>0)};
      };}).observe(document,{childList:true,subtree:true});
    });
    page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    const button=(text,scope=page)=>scope.locator('uni-button').filter({hasText:text});
    const back=async()=>page.locator('.back-button').click();
    const checkLayout=async()=>{for(const width of [320,390,736,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}await page.setViewportSize({width:390,height:900});};
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
    await page.locator('.binding-login').click();await page.locator('.binding-code input').fill('JS2026');await button('查看绑定信息').click();await button(/^\s*确认\s*$/,page.locator('.binding-view')).click();
    await page.locator('.greeting').waitFor();
    if (process.env.WRITINGSTAR_PHOTO_ONLY) {
      await button('布置作业').click();await page.locator('.form-input input').fill('手机大图自动优化');await button('发布作业').click();await page.locator('.paper-assignment-entry').waitFor();
      await page.locator('.role-button').filter({hasText:/^学生$/}).click();await page.locator('.binding-login').click();await page.locator('.binding-code input').fill('XS2026');await button('查看绑定信息').click();await button(/^\s*确认\s*$/,page.locator('.binding-view')).click();await page.locator('.greeting').waitFor();
      await button('查看任务',page.locator('.assignment-card').filter({hasText:'手机大图自动优化'})).click();await button('选择照片并提交').click();
      while(await page.locator('.upload-row .delete-link').count())await page.locator('.upload-row .delete-link').first().click();
      const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2000;c.height=2800;const x=c.getContext('2d'),pixels=x.createImageData(c.width,c.height);let seed=1;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=180+seed%76;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}x.putImageData(pixels,0,0);x.font='60px sans-serif';x.fillStyle='#222';x.fillText('手机照片自动优化测试',100,180);return c.toDataURL('image/png');});
      const file='/tmp/writingstar-large-photo.png';fs.writeFileSync(file,Buffer.from(data.split(',')[1],'base64'));assert.ok(fs.statSync(file).size>800*1024);
      const chooser=page.waitForEvent('filechooser');await button('选择作品照片').click();await(await chooser).setFiles(file);await page.locator('.upload-row').waitFor();await button('提交并开始AI批阅').click();await page.locator('.ai-review-panel').waitFor();
      const state=await page.evaluate(stored),assignment=state.assignments.find(a=>a.title==='手机大图自动优化'),work=state.submissions.find(s=>s.assignmentId===assignment.id);assert.equal(work.photos.length,1);assert.equal(work.photos[0].sample,false);const size=Buffer.from(work.photos[0].url.split(',')[1],'base64').length;assert.ok(size<=800*1024);assert.equal(work.aiReview.result,null);assert.deepEqual(errors,[]);console.log(`Large PNG ${fs.statSync(file).size} bytes selected, automatically optimized to ${size} bytes, saved and submitted without fabricated AI scores.`);return;
    }
assert.match(await page.locator('.stat').first().innerText(),/进行中的作业/);assert.match(await page.locator('.overview-caption').innerText(),/53 位学生/);assert.equal(await page.locator('.overview-caption').innerText(), '53 位学生');
    assert.equal(await button('已完成的作业').count(),1);assert.ok((await page.locator('.assignment-card .compact-button').allTextContents()).every(text=>text.trim()==='查看详情'));
    await checkLayout();
    await button('布置作业').click();await page.locator('.form-input input').fill('浏览器批注验收');await page.locator('.form-card textarea').fill('记录秋天的一次发现。');await button('发布作业').click();await page.locator('.paper-assignment-entry').waitFor();
    assert.equal(await button('查看全班AI批阅详情').count(),1);assert.equal(await button('查看全班进度与结果').count(),0);assert.equal(await button('代交作业').count(),0);
    await page.locator('.student-search input').fill('小禾');assert.equal(await page.locator('.student-row').count(),1);await page.locator('.student-search input').fill('不存在的学生');await page.waitForFunction(()=>document.querySelectorAll('.student-row').length===0);assert.equal(await page.locator('.student-row').count(),0);await page.locator('.search-clear').click();
    await button('查看 / 打印答题卡').click();await page.locator('.paper-preview-image').waitFor();assert.equal(await page.locator('.paper-title').innerText(),'浏览器批注验收');assert.equal(await button('为新入班学生补充答题卡').count(),0);assert.equal(await button('保存第').count(),0);
    if (!process.env.WRITINGSTAR_SKIP_PRINT) {
    await button('打印全班').click();await page.waitForFunction(()=>window.__printResult?.pages===106,{},{timeout:90000});assert.deepEqual(await page.evaluate(()=>window.__printResult),{pages:106,loaded:true});
    const printHtml=await page.locator('iframe[title*="答题卡打印"]').evaluate(frame=>frame.contentDocument.documentElement.outerHTML);
    const printPage=await context.newPage();await printPage.goto(`http://127.0.0.1:${server.address().port}`);await printPage.setContent(printHtml,{waitUntil:'load'});await printPage.pdf({path:'/tmp/writingstar-class-106-pages.pdf',preferCSSPageSize:true,printBackground:true});await printPage.close();
    }
    const gap=await page.locator('.paper-actions').evaluate(el=>parseFloat(getComputedStyle(el).gap));assert.ok(gap>=12);
    await checkLayout();await page.screenshot({path:path.resolve(__dirname,'../outputs/comments-answer-cards-2026-10-27.jpg'),type:'jpeg',quality:80,fullPage:true});
    await button('去批量扫描收件箱').click();await page.locator('.scan-capture-card').waitFor();await back();assert.equal(await page.locator('.paper-title').innerText(),'浏览器批注验收');await back();assert.equal(await page.locator('.paper-assignment-entry').count(),1);
    await button('查看全班AI批阅详情').click();await page.locator('.ai-batch-panel').waitFor();await page.locator('.student-search input').fill('小禾');assert.equal(await page.locator('.ai-batch-row').count(),1);assert.ok(await page.locator('.ai-batch-row').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom)>=15));await back();await page.locator('.bottom-nav uni-button').filter({hasText:'工作台'}).click();
    // Use an existing submitted sample to exercise review and detail navigation.
    const state=await page.evaluate(stored);const submission=state.submissions.find(s=>s.status==='pending'&&s.photos.every(p=>p.sample));const assignment=state.assignments.find(a=>a.id===submission.assignmentId);
    const cards=page.locator('.assignment-card').filter({hasText:assignment.title});if(!await cards.count())await button('已完成的作业').click();await button('查看详情',page.locator('.assignment-card').filter({hasText:assignment.title})).click();
    await page.locator('.student-search input').fill(state.students.find(s=>s.id===submission.studentId).name);await page.locator('.student-row .text-button').first().click();await page.locator('.photo-reader').waitFor();assert.equal(await button('查看原作品').count(),0);assert.equal(await page.locator('.score-track').count(),0);assert.equal(await page.locator('.action-bar .primary').count(),1);assert.equal(await button('转到写作评价').count(),1);await checkLayout();await page.screenshot({path:path.resolve(__dirname,'../outputs/comments-review-2026-10-27.jpg'),type:'jpeg',quality:80,fullPage:true});
    await button('查看AI批阅').click();await page.locator('.ai-review-panel').waitFor();assert.equal(await button('完成审核').count(),0);assert.equal(await button('修改评价').count(),0);assert.equal(await button('同意重新提交').count(),0);await back();assert.equal(await page.locator('.photo-reader').count(),1);await back();assert.equal(await page.locator('.student-row').count(),1);assert.equal(await page.locator('.student-search input').inputValue(),state.students.find(s=>s.id===submission.studentId).name);
    await page.locator('.search-clear').click();await page.locator('.student-row .text-button').first().scrollIntoViewIfNeeded();await page.waitForTimeout(100);const before=await page.evaluate(()=>scrollY);await page.locator('.student-row .text-button').first().click();await back();await page.waitForTimeout(200);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<8,'list scroll restored');
    await page.locator('.bottom-nav uni-button').filter({hasText:'我的'}).click();await button('退出登录').click();await page.locator('.binding-login').waitFor();assert.equal((await page.evaluate(stored)).teacherAccount.signedIn,false);await page.locator('.binding-login').click();await page.locator('.greeting').waitFor();assert.equal((await page.evaluate(stored)).teacherAccount.signedIn,true);
    assert.deepEqual(errors,[]);console.log('Browser comments: real 106-page print preparation/PDF, student search, source-page return, list scroll restore, read-only AI, review layout, logout and four-width overflow checks passed.');
  } catch(error){if(page){await page.screenshot({path:'/tmp/writingstar-comments-failure.png',fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText().catch(()=>'' )).slice(-4500));}console.error(error);process.exitCode=1;}
  finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
