// Isolated H5 acceptance for one submission and teacher-controlled replacement uploads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const buildRoot = path.resolve(__dirname, '../dist/build/h5');
const outputs = path.resolve(__dirname, '../outputs');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filename = path.resolve(buildRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(buildRoot + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(filename).pipe(res);
});
function readState() {
  const raw = JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));
  return raw.schemaVersion ? raw : typeof raw === 'string' ? JSON.parse(raw) : typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
}
(async () => {
  let browser, page;
  const errors = [], badAssets = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport:{width:390,height:844},hasTouch:true });
    await context.route('**/*', route => { const u=new URL(route.request().url()); return u.hostname==='127.0.0.1'||u.protocol==='data:' ? route.continue() : route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message)); page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))badAssets.push(r.url());});
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
    const button=(text,scope=page)=>scope.locator('uni-button').filter({hasText:typeof text==='string'?new RegExp('^\\s*'+text+'\\s*$'):text});
    const role=text=>button(text,page.locator('.role-picker')).click();
    const nav=text=>button(new RegExp(text),page.locator('.bottom-nav')).click();
    const bind=async code=>{await page.locator('.binding-login').click();await page.locator('.binding-code input').fill(code);await button(/查看绑定信息/).click();await button('确认',page.locator('.binding-view')).click();await page.locator('.greeting').waitFor();};
    const open=async title=>{await page.locator('.assignment-card').filter({has:page.locator('.assignment-title').filter({hasText:title})}).locator('.compact-button').click();await page.locator('.task-detail,.feedback-intro').first().waitFor();};
    const noOverflow=async()=>{for(const width of [320,390,846,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}await page.setViewportSize({width:390,height:844});};
    const shot=async(name,target)=>{await page.locator('.slide-down-panel:not(.is-dialog)').waitFor({state:'hidden'});await page.setViewportSize({width:846,height:963});await target.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(outputs,`prototype-review-return-${name}-2026-10-23.jpg`),type:'jpeg',quality:86});await page.setViewportSize({width:390,height:844});};
    const noCorrection=async()=>assert.ok(!/订正|第\s*\d+\s*版/.test(await page.locator('.app-shell').innerText()),'removed correction and version UI');
    const waitAi=async id=>page.waitForFunction(id=>{const raw=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));const s=raw.schemaVersion?raw:typeof raw==='string'?JSON.parse(raw):typeof raw.data==='string'?JSON.parse(raw.data):raw.data;return s.submissions.find(x=>x.id===id)?.aiReview?.state==='completed';},id,{timeout:15000});
    await bind('JS2026');
    assert.equal((await page.evaluate(readState)).assignments.filter(x=>x.id==='assignment-xiaohe-revision-example').length,0);
    await button(/布置作业/).click(); const composer=page.locator('.assignment-composer'), title='审核与重新提交验收';
    await composer.locator('.form-input input').fill(title);await button('不限',composer).click();await button('发布作业',composer).click();await page.locator('.task-detail').waitFor();
    assert.ok(await button('暂无可审核作业').evaluate(e=>e.hasAttribute('disabled'))); await noCorrection();
    await role('学生');await bind('XS2026');await open(title);await button('选择照片并提交').click();await button('提交并开始AI批阅').click();await page.locator('.ai-review-panel').waitFor();
    let state=await page.evaluate(readState),assignment=state.assignments.find(x=>x.title===title),first=state.submissions.find(x=>x.assignmentId===assignment.id&&x.studentId==='student-1');
    await waitAi(first.id); await noCorrection(); await page.locator('.back-button').click();
    assert.equal(await button('重新提交本次作业').count(),0); await noCorrection();
    await role('教师');await open(title);await button(/教师一键审核/).click();
    const row=page.locator('.student-row').filter({has:page.locator('.strong').filter({hasText:/^\s*小禾\s*$/})});
    await button(/查看详情/,row).waitFor(); assert.equal(await button(/代交/,row).count(),0); await noCorrection();
    await button('设为优秀作业',row).click(); await button('同意重新提交',row).click();await row.locator('.resubmission-agreed').waitFor();assert.equal(await button(/取消重新提交|许可/,row).count(),0);
    await noOverflow();await shot('teacher-agreed',row);
    await page.reload({waitUntil:'networkidle'});await open(title);await row.locator('.resubmission-agreed').waitFor();assert.equal(await button('同意重新提交',row).count(),0);
    await role('学生');await open(title);await button('重新提交本次作业').click();await button('提交并开始AI批阅').click();await page.locator('.ai-review-panel').waitFor();
    state=await page.evaluate(readState);const second=state.submissions.find(x=>x.assignmentId===assignment.id&&x.studentId==='student-1'&&x.id!==first.id);
    assert.ok(second);assert.equal(second.version,2);assert.ok(!second.resubmission);assert.ok(state.submissions.find(x=>x.id===first.id).resubmission.consumedAt);
    await waitAi(second.id);await page.locator('.back-button').click();assert.equal(await button('重新提交本次作业').count(),0);
    await nav('记录');const record=page.locator('.submission-record').filter({hasText:title});await record.waitFor();
    assert.equal(await record.count(),1);assert.equal(await record.locator('.record-score').innerText(),'等待老师审核');
    assert.equal(await page.locator('.history-version,.history-record-toggle').count(),0);await noCorrection();
    await role('教师');await open(title);assert.equal(await row.locator('.excellent-badge').count(),0);assert.equal(await button(/代交/,row).count(),0);await button(/查看详情/,row).click();await button(/查看AI批阅/).click();
    await page.locator('.ai-review-panel').waitFor();await button('修改评价').click();const score=page.locator('.dimension-editor input').first();await score.fill('9');await button('完成审核').click();await page.locator('.feedback-intro').waitFor();await noCorrection();
    state=await page.evaluate(readState);assert.equal(state.submissions.filter(x=>x.assignmentId===assignment.id&&x.studentId==='student-1').length,2);
    assert.equal(state.submissions.find(x=>x.id===second.id).published.handwriting.scores.intuitive,9);assert.equal(state.submissions.find(x=>x.id===first.id).published.handwriting.scores.intuitive,8);
    await role('学生');await nav('记录');await record.waitFor();assert.equal(await record.count(),1);assert.match(await record.locator('.record-score').innerText(),/书写 82 \/ 100/);await noCorrection();await noOverflow();await shot('latest-records',record);
    await nav('成长');await page.locator('.student-growth-heading').waitFor();await noCorrection();await noOverflow();
    const uniqueAssignments=new Set(state.submissions.filter(x=>x.studentId==='student-1').map(x=>x.assignmentId));assert.equal(await page.locator('.attempt-score').count(),uniqueAssignments.size);
    assert.equal(await page.locator('.attempt-score').filter({hasText:title}).count(),1);
    // A second completed assignment exposes accidental reuse of the original feedback route.
    await role('教师');await button(/布置作业/).click();const secondTitle='另一份审核与返回验收';
    await composer.locator('.form-input input').fill(secondTitle);await button('不限',composer).click();await button('发布作业',composer).click();await page.locator('.task-detail').waitFor();
    await role('学生');await open(secondTitle);await button('选择照片并提交').click();await button('提交并开始AI批阅').click();
    state=await page.evaluate(readState);const secondAssignment=state.assignments.find(x=>x.title===secondTitle),other=state.submissions.find(x=>x.assignmentId===secondAssignment.id&&x.studentId==='student-1');await waitAi(other.id);
    await role('教师');await open(secondTitle);await button(/教师一键审核/).click();
    assert.ok(await button('暂无可审核作业').evaluate(e=>e.hasAttribute('disabled')));
    assert.match(await page.locator('.ai-entry-counts').innerText(),/已审核 1/);assert.ok(!/发布|待批阅|许可/.test(await page.locator('.task-detail').innerText()));
    await role('学生');await open(secondTitle);await page.locator('.feedback-intro').waitFor();assert.match(await page.locator('.feedback-intro').innerText(),/已审核/);
    await noOverflow();await shot('student-feedback',page.locator('.feedback-intro'));
    await role('教师');await open(title);await button(/查看详情/,row).click();await page.locator('.feedback-intro').waitFor();
    await button(/查看作业记录/).click();
    for(const [index,currentTitle] of [secondTitle,title,secondTitle].entries()){
      const currentRecord=page.locator('.submission-record').filter({hasText:currentTitle});await button(/查看作品与反馈/,currentRecord).click();
      assert.match(await page.locator('.feedback-intro').innerText(),new RegExp(currentTitle));
      if(index===0)await button(/查看作业记录/).click();else await page.locator('.back-button').click();
      await page.locator('.submission-record').first().waitFor();
    }
    await shot('records',page.locator('.submission-record').first());
    await page.locator('.back-button').click();await page.locator('.feedback-intro').waitFor();assert.match(await page.locator('.feedback-intro').innerText(),new RegExp(title));
    await page.locator('.back-button').click();await page.locator('.task-detail').waitFor();assert.match(await page.locator('.task-detail').innerText(),new RegExp(title));
    await page.locator('.back-button').click();await page.locator('.greeting').waitFor();
    await role('学生');await nav('我的');await nav('记录');await button(/查看作品与反馈/,page.locator('.submission-record').filter({hasText:title})).click();
    await page.locator('.back-button').click();await page.locator('.submission-record').first().waitFor();await nav('我的');await page.locator('.profile-card').waitFor();
    assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
    console.log('Teacher review wording, immediate student feedback, one-time agreement without revoke controls, latest-only records and repeated feedback/records return paths with original work restored passed at 4 widths.');
  } catch(e) {if(page)await page.screenshot({path:'/tmp/writingstar-resubmission-failure.png',fullPage:true}).catch(()=>{});console.error(e);console.error({errors,badAssets});process.exitCode=1;}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
