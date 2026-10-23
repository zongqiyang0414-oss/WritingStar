// Isolated H5 acceptance for submission-bound AI review, quality checks and grouped revisions.
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
    browser = await chromium.launch({ executablePath: process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => { const u = new URL(route.request().url()); return u.hostname === '127.0.0.1' || u.protocol === 'data:' ? route.continue() : route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) badAssets.push(r.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    const button = (text, scope = page) => scope.locator('uni-button').filter({ hasText: typeof text === 'string' ? new RegExp('^\\s*' + text + '\\s*$') : text });
    const role = text => button(text, page.locator('.role-picker')).click();
    const nav = text => button(new RegExp(text), page.locator('.bottom-nav')).click();
    const bind = async code => {
      await page.locator('.binding-login').click(); await page.locator('.binding-code input').fill(code);
      await button(/查看绑定信息/).click(); await button('确认', page.locator('.binding-view')).click(); await page.locator('.greeting').waitFor();
    };
    const noOverflow = async label => {
      for (const width of [320,390,736,1280]) { await page.setViewportSize({width,height:900}); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: overflow at ${width}`); }
      await page.setViewportSize({width:390,height:844});
    };
    const screenshot = async (name, target) => {
      await page.locator('.slide-down-panel:not(.is-dialog)').waitFor({state:'hidden'});
      await page.setViewportSize({width:736,height:963});
      if (target) await target.scrollIntoViewIfNeeded(); else await page.evaluate(() => scrollTo(0,0));
      await page.screenshot({path:path.join(outputs,`prototype-revision-${name}-2026-10-23.jpg`),type:'jpeg',quality:86});
      await page.setViewportSize({width:390,height:844});
    };
    const openAssignment = async title => {
      await page.locator('.assignment-card').filter({ has: page.locator('.assignment-title').filter({hasText:title}) }).locator('.compact-button').click();
      await page.locator('.task-detail').waitFor();
    };
    const writeState = async edit => page.evaluate(edit);
    const waitAi = async (id, state) => {
      await page.waitForFunction(({id,state}) => {
        const raw=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1')); const data=raw.schemaVersion?raw:typeof raw==='string'?JSON.parse(raw):typeof raw.data==='string'?JSON.parse(raw.data):raw.data;
        return data.submissions.find(s=>s.id===id)?.aiReview?.state===state;
      },{id,state},{timeout:20000});
    };
    await bind('JS2026');
    const snapshot = await page.evaluate(readState);
    const ongoing = snapshot.assignments.filter(a=>a.classId==='class-1'&&(!a.dueAt||Date.parse(a.dueAt)>Date.now())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
    assert.equal((await page.locator('.assignment-title').first().innerText()).trim(), ongoing[0].title);
    await nav('学情'); await button('作业统计').click();
    assert.equal(await page.locator('.assignment-progress').count(),0);
    assert.ok(await page.locator('.metric-number').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=26));
    await noOverflow('statistics'); await screenshot('statistics',page.locator('.assignment-report').first());
    await nav('我的');
    assert.equal(await page.locator('.organization-context').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
    await nav('工作台'); await button(/布置作业/).click();
    const composer=page.locator('.assignment-composer');
    await button('发布作业',composer).click();
    const banner=page.locator('.slide-down-panel.is-error'); await banner.waitFor();
    assert.ok((await banner.boundingBox()).y < 60,'notification must drop from top');
    await page.waitForTimeout(250); const box=await banner.boundingBox(); const dragStarted=Date.now();
    await page.mouse.move(box.x+25,box.y+box.height-12); await page.mouse.down(); await page.mouse.move(box.x+25,2,{steps:6}); await page.mouse.up();
    await banner.waitFor({state:'hidden'}); assert.ok(Date.now()-dragStarted<1000,'notification responds to upward drag');
    const start=Date.now(); await button('发布作业',composer).click(); await banner.waitFor(); await banner.waitFor({state:'hidden'});
    assert.ok(Date.now()-start<2900,'short notification lifetime');
    const create = async title => {
      await composer.locator('.form-input input').fill(title); await button('不限',composer).click(); await button('发布作业',composer).click();
      await page.locator('.task-detail').waitFor(); await page.locator('.back-button').click();
    };
    const normal='自动提交与质量审核体验', technical='学生原图重试体验';
    await create(normal); await button(/布置作业/).click(); await create(technical);
    assert.equal((await page.locator('.assignment-title').first().innerText()).trim(),technical);
    await role('学生'); await bind('XS2026');
    await nav('记录');
    const history=page.locator('.history-assignment').filter({hasText:'校园里的一次发现（订正示例）'});
    await history.waitFor(); await button(/查看提交记录/,history).click();
    assert.equal(await history.locator('.history-version').count(),3); assert.deepEqual(await history.locator('.history-version .strong').allTextContents(),['第 3 版','第 2 版','第 1 版']);
    await history.locator('.trend-canvas').waitFor(); await noOverflow('grouped revision records'); await screenshot('records',history);
    await nav('任务'); await openAssignment(normal); await button('选择照片并提交').click();
    assert.equal(await page.locator('.upload-row').count(),2,'student starts with explicit fictional photos');
    await page.locator('.back-button').click(); const dialog=page.locator('.slide-down-panel.is-dialog'); await dialog.waitFor();
    assert.ok((await dialog.boundingBox()).y<60); await page.waitForTimeout(250); const d=await dialog.boundingBox();
    await page.mouse.move(d.x+30,d.y+60); await page.mouse.down(); await page.mouse.move(d.x+30,2,{steps:6}); await page.mouse.up(); await dialog.waitFor({state:'hidden'});
    assert.equal(await page.locator('.upload-row').count(),2,'swiping away confirmation must keep selected work');
    await page.locator('.back-button').click(); await dialog.waitFor(); await page.waitForTimeout(250);
    const touchBox=await dialog.boundingBox(), cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchBox.x+touchBox.width/2,y:touchBox.y+24}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchBox.x+touchBox.width/2,y:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await dialog.waitFor({state:'hidden'}); await cdp.detach();
    assert.equal(await page.locator('.upload-row').count(),2,'touch drag also keeps work');
    await button('提交并开始AI批阅').click(); await page.locator('.ai-review-panel').waitFor();
    let data=await page.evaluate(readState); const a=data.assignments.find(a=>a.title===normal); const first=data.submissions.find(s=>s.assignmentId===a.id&&s.studentId==='student-1');
    assert.ok(first.aiReview); await waitAi(first.id,'completed'); await page.locator('.ai-result-source').waitFor(); assert.match(await page.locator('.ai-result-source').innerText(),/示例结果/);
    await screenshot('student-ai',page.locator('.ai-result-source'));
    await page.locator('.back-button').click(); await nav('任务'); await openAssignment(technical); await button('选择照片并提交').click();
    const tools=page.locator('.mobile-preview-tools'); await button(/展示设置/,tools).click();
    await tools.locator('.switch-line').filter({hasText:'测试处理失败'}).locator('uni-switch').click();
    await button(/收起设置/,tools).click(); await button('提交并开始AI批阅').click();
    data=await page.evaluate(readState); const ta=data.assignments.find(a=>a.title===technical); const failed=data.submissions.find(s=>s.assignmentId===ta.id&&s.studentId==='student-1');
    await waitAi(failed.id,'failed'); await button('使用原图重新分析').waitFor();
    data=await page.evaluate(readState); assert.equal(data.submissions.find(s=>s.id===failed.id).aiReview.autoRetryCount,1); assert.ok(data.submissions.find(s=>s.id===failed.id).aiReview.reportedAt);
    await button(/展示设置/,tools).click(); await tools.locator('.switch-line').filter({hasText:'测试下一次AI批阅失败'}).locator('uni-switch').click(); await button(/收起设置/,tools).click();
    await button('使用原图重新分析').click(); await waitAi(failed.id,'completed');
    data=await page.evaluate(readState); assert.equal(data.submissions.filter(s=>s.assignmentId===ta.id&&s.studentId==='student-1').length,1); assert.equal(data.submissions.find(s=>s.id===failed.id).version,1);
    // Isolated mock response: one low-scoring quality issue and one technical issue.
    await writeState(() => {
      const key='jiaxiu-prototype-v1',raw=JSON.parse(localStorage.getItem(key)); const s=raw.schemaVersion?raw:typeof raw==='string'?JSON.parse(raw):typeof raw.data==='string'?JSON.parse(raw.data):raw.data;
      const normal=s.assignments.find(a=>a.title==='自动提交与质量审核体验'); const item=s.submissions.find(x=>x.assignmentId===normal.id&&x.studentId==='student-1'); item.aiReview.result.handwriting.scores.imaginal=20;
      const technical=s.assignments.find(a=>a.title==='学生原图重试体验');const failure=s.submissions.find(x=>x.assignmentId===technical.id&&x.studentId==='student-1');failure.aiReview.state='failed';failure.aiReview.reportedAt=new Date().toISOString();failure.aiReview.autoRetryCount=1;failure.status='failed';
      if(raw.schemaVersion)localStorage.setItem(key,JSON.stringify(s));else if(typeof raw==='string')localStorage.setItem(key,JSON.stringify(JSON.stringify(s)));else{raw.data=typeof raw.data==='string'?JSON.stringify(s):s;localStorage.setItem(key,JSON.stringify(raw));}
    });
    await page.reload({waitUntil:'networkidle'}); await openAssignment(normal); await button(/查看全班进度与结果/).click(); const batch=page.locator('.ai-batch-panel');
    assert.equal(await button(/补跑|重试|一键AI批阅/,batch).count(),0);
    await button('需关注',batch.locator('.ai-batch-filters')).click(); assert.equal(await batch.locator('.ai-batch-row').count(),1); assert.match(await batch.locator('.ai-batch-row').innerText(),/低于60/); assert.ok(await button('暂无可发布结果',batch).evaluate(e=>e.hasAttribute('disabled'))); assert.equal(await button(/逐份审核/,batch.locator('.ai-batch-row')).count(),1);
    await noOverflow('teacher quality review'); await screenshot('quality',batch);
    await role('管理员'); await bind('MA2026'); await button(/AI服务问题/).click();
    await page.locator('.card').filter({hasText:technical}).waitFor(); assert.equal(await page.locator('.essay-image').count(),0);
    await button('安排重新分析').click(); await waitAi(failed.id,'completed');
    await page.getByText('暂无待处理的AI服务问题',{exact:true}).waitFor();
    assert.deepEqual(errors,[]); assert.deepEqual(badAssets,[]);
    console.log('Newest assignment order, large statistics, white card, top swipe notices/dialogs, grouped 3-version trend, default sample submission, automatic retry, same-version student retry, teacher quality-only attention and private admin handling passed.');
  } catch(e) {
    if(page)await page.screenshot({path:'/tmp/writingstar-revision-failure.png',fullPage:true}).catch(()=>{});
    console.error(e); process.exitCode=1;
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
})();
