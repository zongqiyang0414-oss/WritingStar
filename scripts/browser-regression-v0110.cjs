// Uses isolated local storage and serves only the current H5 build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const output = path.resolve(__dirname, '../outputs');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
function readState() {
  const raw = JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));
  return raw.schemaVersion ? raw : typeof raw === 'string' ? JSON.parse(raw) : typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
}
function installState(state) {
  const key = 'jiaxiu-prototype-v1', raw = JSON.parse(localStorage.getItem(key));
  if (raw.schemaVersion) localStorage.setItem(key, JSON.stringify(state));
  else if (typeof raw === 'string') localStorage.setItem(key, JSON.stringify(JSON.stringify(state)));
  else { raw.data = typeof raw.data === 'string' ? JSON.stringify(state) : state; localStorage.setItem(key, JSON.stringify(raw)); }
}
(async () => {
  let browser, page;
  const errors = [], assets = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' || url.protocol === 'data:' ? route.continue() : route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) assets.push(response.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    const button = (name, scope = page) => scope.locator('uni-button').filter({ hasText: name });
    const role = name => page.locator('.role-button').filter({ hasText: new RegExp(`^${name}$`) }).click();
    const nav = name => button(name, page.locator('.bottom-nav')).click();
    const confirm = async () => { await page.locator('.modal-actions .primary').click(); await page.locator('.modal-card').waitFor({ state: 'hidden' }); };
    const bind = async (name, code) => {
      await role(name); await page.locator('.binding-login').click(); await confirm();
      await page.locator('.binding-code input').fill(code); await button('查看绑定信息').click();
      await button('确认绑定，进入').click(); await page.locator('.greeting').waitFor();
    };
    const task = async title => page.locator('.assignment-card').filter({ has: page.locator('.assignment-title').filter({ hasText: new RegExp(`^\\s*${title}\\s*$`) }) }).locator('.compact-button').click();
    const tools = page.locator('.mobile-preview-tools');
    const expandTools = async () => { if (!await tools.locator('.prototype-tools-body').isVisible()) await tools.locator('.prototype-tools-heading .text-button').click(); };
    const collapseTools = async () => { if (await tools.locator('.prototype-tools-body').isVisible()) await tools.locator('.prototype-tools-heading .text-button').click(); };
    const samples = async () => { await expandTools(); await button('装载两页练习作品', tools).click(); await collapseTools(); };
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const screenshot = async (name, height = 1200) => {
      await page.locator('.toast').waitFor({ state: 'hidden' });
      await page.setViewportSize({ width: 390, height }); await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, name), type: 'jpeg', quality: 85 });
      await page.setViewportSize({ width: 390, height: 844 });
    };

    await bind('学生', 'XS2026'); await task('我想感谢的一个人');
    await button('选择照片并提交', page.locator('.page-body')).click(); await samples();
    await button('提交并开始AI批阅', page.locator('.page-body')).click(); await confirm();
    await page.locator('.ai-progress-card').waitFor();
    assert.equal(await page.locator('.ai-score-grid').count(), 0);
    await screenshot('prototype-student-ai-progress-v0.11.0.jpg', 1100);
    await page.locator('.ai-score-grid').waitFor();
    assert.equal(await page.locator('.ai-score-value').count(), 2);
    assert.match(await page.locator('.ai-example-tag').innerText(), /示例结果/);
    const state = await page.evaluate(readState);
    const firstStudentAi = state.submissions.find(item => item.assignmentId === 'assignment-plan-1' && item.studentId === 'student-1');
    assert.equal(firstStudentAi.published, null); assert.equal(firstStudentAi.aiReview.result.handwriting.scores.intuitive, 8);
    await button('写作评价', page.locator('.ai-category-switch')).click();
    assert.equal(await page.locator('.ai-dimension-toggle').count(), 5);
    await button('书写评价', page.locator('.ai-category-switch')).click();
    await page.locator('.ai-original-toggle').click(); assert.equal(await page.locator('.ai-photo-pages uni-button').count(), 2);
    await page.locator('.ai-original-toggle').click(); await noOverflow();
    await screenshot('prototype-student-ai-result-v0.11.0.jpg');
    await nav('记录'); await button('查看这一版AI建议', page.locator('.history-card').filter({ hasText: '我想感谢的一个人' })).click();
    await page.locator('.ai-score-grid').waitFor();
    await page.reload({ waitUntil: 'networkidle' }); await role('学生'); await nav('记录');
    await button('查看这一版AI建议', page.locator('.history-card').filter({ hasText: '我想感谢的一个人' })).click();
    assert.match(await page.locator('.ai-score-value').first().innerText(), /81/);
    console.log('student submission, visible progress, two-category AI result, original photos, records and reload passed');

    await bind('教师', 'JS2026');
    // Four isolated fixture submissions exercise a whole-class queue and one real-photo waiting result.
    const fixture = await page.evaluate(readState), copy = value => JSON.parse(JSON.stringify(value));
    const assignment = { id: 'ai-batch-fixture', classId: 'class-1', className: '四年级（1）班', title: '把一次小事写具体', requirements: '写清楚一件小事，注意动作、语言和真实感受。', createdAt: new Date().toISOString(), dueAt: new Date(Date.now() + 86400000 * 7).toISOString() };
    fixture.assignments.unshift(assignment);
    const pupils = fixture.students.filter(item => item.classId === 'class-1').slice(0, 4);
    const draft = copy(fixture.submissions[0].draft);
    for (const category of ['handwriting', 'composition']) { draft[category].summary = ''; for (const id of Object.keys(draft[category].scores)) { draft[category].scores[id] = null; draft[category].comments[id] = ''; } }
    draft.nextSteps = '';
    const realPhoto = { id: 'real-fixture', name: '自选照片.png', sample: false, url: 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/local-image.png')).toString('base64') };
    const fixtureIds = pupils.map((pupil, index) => {
      const id = `ai-fixture-${pupil.id}`;
      fixture.submissions.push({ id, studentId: pupil.id, assignmentId: assignment.id, version: 1, photos: index === 3 ? [realPhoto] : copy(firstStudentAi.photos), note: '', actor: 'student', submittedAt: new Date().toISOString(), status: 'pending', draft: copy(draft), published: null, publishedAt: null });
      return id;
    });
    await page.evaluate(installState, fixture); await page.reload({ waitUntil: 'networkidle' }); await task(assignment.title);
    await button('一键AI批阅', page.locator('.ai-assignment-entry')).click();
    await page.locator('.ai-batch-panel').waitFor();
    const queued = (await page.evaluate(readState)).submissions.filter(item => fixtureIds.includes(item.id));
    assert.equal(queued.filter(item => item.aiReview).length, 4);
    await screenshot('prototype-teacher-ai-batch-progress-v0.11.0.jpg');
    await page.locator('.ai-batch-row').filter({ hasText: pupils[3].name }).locator('.ai-row-status').filter({ hasText: '等待批阅结果' }).waitFor();
    const completed = (await page.evaluate(readState)).submissions.filter(item => fixtureIds.includes(item.id));
    assert.equal(completed.filter(item => item.aiReview.state === 'completed').length, 3);
    assert.equal(completed.find(item => item.id === fixtureIds[3]).aiReview.result, null);
    await noOverflow(); await screenshot('prototype-teacher-ai-batch-result-v0.11.0.jpg');
    await button('仅重试失败与等待结果的作品').click();
    await page.locator('.ai-batch-row').filter({ hasText: pupils[3].name }).locator('.ai-row-status').filter({ hasText: '等待批阅结果' }).waitFor();
    assert.equal((await page.evaluate(readState)).submissions.find(item => item.id === fixtureIds[0]).aiReview.attempt, 1);
    await page.locator('.student-search input').fill(pupils[3].name);
    await button('查看批阅', page.locator('.ai-batch-row')).click(); await page.locator('.ai-empty-result').waitFor();
    assert.equal(await page.locator('.ai-score-grid').count(), 0);
    await button('返回作业批阅').click();
    await page.locator('.student-search input').fill('小禾'); await button('查看结果', page.locator('.ai-batch-row')).click();
    await button('应用AI建议并复核').click(); await confirm();
    await page.locator('.score-input-wrap input').first().fill('3'); await page.locator('.action-bar .secondary').click();
    const aiSnapshot = (await page.evaluate(readState)).submissions.find(item => item.id === fixtureIds[0]).aiReview.result;
    await role('学生'); await nav('记录');
    await button('查看这一版AI建议', page.locator('.history-card').filter({ hasText: assignment.title })).click();
    assert.match(await page.locator('.ai-score-value').first().innerText(), /81/);
    assert.equal(await button('查看老师正式反馈').count(), 0);
    console.log('one-click whole-class queue, mixed results, retry isolation, teacher draft isolation and student-visible AI passed');

    await role('教师'); await task(assignment.title); await button('查看全班进度与结果').click();
    await page.locator('.student-search input').fill('小禾'); await button('查看结果', page.locator('.ai-batch-row')).click();
    await button('保留当前草稿，进入复核').click();
    assert.equal(await page.locator('.score-input-wrap input').first().inputValue(), '3');
    await page.locator('.action-bar .primary').click(); await confirm();
    await role('学生'); await nav('记录'); await button('查看这一版AI建议', page.locator('.history-card').filter({ hasText: assignment.title })).click();
    assert.deepEqual((await page.evaluate(readState)).submissions.find(item => item.id === fixtureIds[0]).aiReview.result, aiSnapshot);
    await button('查看老师正式反馈').click(); assert.match(await page.locator('.score-value').first().innerText(), /76/);
    await button('按建议，再写一次', page.locator('.page-body')).click(); await samples();
    await expandTools(); await tools.locator('.switch-line').filter({ hasText: '测试处理失败' }).locator('uni-switch').click(); await collapseTools();
    await button('提交订正并开始AI批阅').click(); await confirm();
    await button('重试AI批阅', page.locator('.ai-empty-result')).waitFor();
    assert.match(await page.locator('.ai-result-headline').innerText(), /没有完成/);
    await expandTools(); await tools.locator('.switch-line').filter({ hasText: '测试下一次AI批阅失败' }).locator('uni-switch').click(); await collapseTools();
    await button('重试AI批阅', page.locator('.ai-empty-result')).click(); await page.locator('.ai-score-grid').waitFor();
    const revised = (await page.evaluate(readState)).submissions.filter(item => item.assignmentId === assignment.id && item.studentId === 'student-1');
    assert.equal(revised.length, 2); assert.equal(revised.find(item => item.version === 2).aiReview.attempt, 2);
    assert.equal(revised.find(item => item.version === 1).published.handwriting.scores.intuitive, 3);
    await page.setViewportSize({ width: 320, height: 844 }); await noOverflow();
    await role('教师'); await task(assignment.title); await button('查看全班进度与结果').click(); await noOverflow();
    await page.setViewportSize({ width: 1280, height: 900 }); await noOverflow();
    await page.screenshot({ path: path.join(output, 'prototype-teacher-ai-desktop-v0.11.0.jpg'), type: 'jpeg', quality: 85 });
    assert.deepEqual(errors, []); assert.deepEqual(assets, []);
    console.log('teacher publication, separate formal score, revision failure/retry, history and 320/390/1280px layout passed; no page or asset errors');
  } catch (error) {
    if (page) await page.screenshot({ path: '/tmp/writingstar-ai-failure.png', fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})();
