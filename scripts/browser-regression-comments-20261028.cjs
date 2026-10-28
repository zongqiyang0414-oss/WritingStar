const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
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
  browser=await chromium.launch({executablePath:process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||/^(data|blob):/.test(route.request().url())?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const button=(text,scope=page)=>scope.locator('uni-button').filter({hasText:text});
  const back=()=>page.locator('.back-button').click();
  const widths=async()=>{for(const width of [320,390,736,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}await page.setViewportSize({width:390,height:900});};
  const screenShot=async name=>{await page.waitForTimeout(1900);await page.screenshot({path:path.resolve(__dirname,`../outputs/comments-${name}-2026-10-28.jpg`),type:'jpeg',quality:80,fullPage:true});};
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await page.locator('.binding-login').click();await page.locator('.binding-code input').fill('JS2026');await button('查看绑定信息').click();await button(/^\s*确认\s*$/,page.locator('.binding-view')).click();await page.locator('.greeting').waitFor();
  await page.waitForFunction(()=>{const raw=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));const state=raw.schemaVersion?raw:typeof raw==='string'?JSON.parse(raw):typeof raw.data==='string'?JSON.parse(raw.data):raw.data;return state.submissions.some(s=>s.status==='pending'&&s.aiReview?.result&&s.photos.every(p=>p.sample));});
  const state=await page.evaluate(stored), work=state.submissions.find(s=>s.status==='pending'&&s.aiReview?.result&&s.photos.every(p=>p.sample)), assignment=state.assignments.find(a=>a.id===work.assignmentId), student=state.students.find(s=>s.id===work.studentId);
  const card=page.locator('.assignment-card').filter({hasText:assignment.title});if(!await card.count())await button('已完成的作业').click();await button('查看详情',card).click();
  assert.ok(await page.locator('.ai-assignment-entry').evaluate(el=>el.getBoundingClientRect().bottom <= el.nextElementSibling.getBoundingClientRect().top));
  assert.equal(await page.locator('.ai-assignment-entry + .excellent-entry').count(),1);
  await page.locator('.student-search input').fill(student.name);await page.locator('.student-row .text-button').first().click();await page.locator('.photo-reader').waitFor();
  assert.ok(await page.locator('.photo-reader').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.ai-review-shortcut').getBoundingClientRect().top));
  assert.match(await page.locator('.review-source-note').innerText(),/AI批阅结果/);
  await button('查看AI批阅').click();await page.locator('.ai-score-grid').waitFor();
  assert.ok(await page.locator('.ai-original-work').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.ai-result-source').getBoundingClientRect().top));
  assert.equal(await page.locator('.ai-original-work .ai-work-photo').count(),1);await widths();await back();
  await button('转到写作评价').click();await page.waitForTimeout(500);
  assert.match(await page.locator('.score-overview .eyebrow').innerText(),/写作/);
  const top=await page.locator('.review-category-start').evaluate(el=>el.getBoundingClientRect().top);assert.ok(Math.abs(top-16)<5,`writing section top ${top}`);
  await widths();await screenShot('writing-review');await back();
  await button('查看全班AI批阅详情').click();await page.locator('.ai-batch-panel').waitFor();
  assert.equal(await page.locator('.ai-batch-overview .ai-progress-track').count(),0);assert.equal(await page.locator('.ai-batch-percent').count(),0);
  const counts=await page.locator('.ai-submission-counts').innerText();assert.match(counts,/已提交/);assert.match(counts,/未提交/);
  const missing=await page.locator('.ai-submission-counts > uni-view').nth(1).locator('uni-text').innerText();assert.equal(Number(missing),state.students.filter(s=>s.classId===assignment.classId&&!s.archived&&!state.submissions.some(work=>work.assignmentId===assignment.id&&work.studentId===s.id)).length);
  await widths();await screenShot('class-review');
  const publish=page.locator('.ai-batch-publish');await page.waitForFunction(()=>!document.querySelector('.ai-batch-publish').hasAttribute('disabled'));
  await publish.click();await page.locator('.slide-down-panel.is-dialog').waitFor();assert.match(await page.locator('.slide-down-panel.is-dialog').innerText(),/我已确定所有AI批阅结果无误/);
  assert.equal((await page.evaluate(stored)).submissions.find(s=>s.id===work.id).status,'pending');
  await page.locator('.modal-actions .secondary').click();assert.equal((await page.evaluate(stored)).submissions.find(s=>s.id===work.id).status,'pending');
  await publish.click();await page.locator('.modal-actions .primary').click();await page.waitForFunction(id=>{const raw=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));const state=raw.schemaVersion?raw:JSON.parse(raw.data||raw);return state.submissions.find(s=>s.id===id).status==='published';},work.id);
  const row=page.locator('.ai-batch-row').filter({hasText:student.name});await button('查看详情',row).click();await page.locator('.feedback-original-work').waitFor();
  assert.equal(await page.locator('.feedback-original-work uni-image').count(),work.photos.length);assert.equal(await button('让学生重新提交本次作业').count(),0);
  assert.ok(await page.locator('.dual-scores').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.feedback-original-work').getBoundingClientRect().top));
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.feedback-original-work img')).every(img=>img.complete&&img.naturalWidth>0));
  await widths();await screenShot('feedback-work');await back();
  assert.match(await row.locator('.ai-resubmission-row').innerText(),/请点击右侧“打回”/);await button(/^打回$/,row).click();
  await page.getByText('作业已打回，待学生重新提交',{exact:true}).first().waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.ai-batch-row')).find(row=>row.textContent.includes('小禾'))?.querySelector('.ai-resubmission-row uni-button'));
  const after=(await page.evaluate(stored)).submissions.find(s=>s.id===work.id);assert.ok(after.resubmission.allowedAt);
  await page.locator('.bottom-nav uni-button').filter({hasText:'我的'}).click();await page.locator('.logout-button').waitFor();
  const gap=await page.locator('.logout-button').evaluate(el=>el.nextElementSibling.getBoundingClientRect().top-el.getBoundingClientRect().bottom);assert.ok(gap>=19,`logout gap ${gap}`);await widths();
  await page.locator('.bottom-nav uni-button').filter({hasText:'学情'}).click();assert.equal(await page.getByText('按作业顺序，查看全班书写与写作的变化',{exact:true}).count(),0);
  await page.locator('.bottom-nav uni-button').filter({hasText:'工作台'}).click();await button('查看详情',page.locator('.assignment-card').filter({hasText:assignment.title})).click();
  await button('查看 / 打印答题卡').click();if(await button('生成全班答题卡').count())await button('生成全班答题卡').click();await page.locator('.paper-preview-image').waitFor();assert.equal(await page.locator('.paper-overline').innerText(),'题目');assert.equal(await page.locator('.paper-title').innerText(),assignment.title);
  await button('去批量扫描收件箱').click();await page.locator('.scan-empty').waitFor();assert.equal(await page.locator('.paper-overline').innerText(),'题目');assert.equal(await page.locator('.paper-title').innerText(),assignment.title);assert.equal(await page.locator('.paper-heading .small.subtle').count(),0);assert.match(await page.locator('.scan-empty').innerText(),/扫描结果会在这里按学生和页码归档/);await widths();await screenShot('scanner-empty');
  assert.deepEqual(errors,[]);console.log('19 comments passed: headings, logout gap, separate submission counts, no batch progress bar, cancel/confirm bulk review, send-back state, original images, editor/AI ordering, writing-section scroll and four widths.');
 }catch(error){if(page){await page.screenshot({path:'/tmp/writingstar28-failure.png',fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText().catch(()=>'')).slice(-3500));}console.error(error);process.exitCode=1;}
 finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
