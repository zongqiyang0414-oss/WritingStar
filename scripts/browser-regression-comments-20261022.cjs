// Browser acceptance for the 2026-10-22 comments. Uses an isolated local profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const outputs = path.resolve(__dirname, '../outputs');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(filename).pipe(res);
});
function storageRead() {
  const raw = JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));
  return raw.schemaVersion ? raw : typeof raw === 'string' ? JSON.parse(raw) : typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
}

(async () => {
  let browser, page;
  const errors = [], badAssets = [];
  try {
    fs.mkdirSync(outputs, { recursive: true });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' || url.protocol === 'data:' ? route.continue() : route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) badAssets.push(response.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    const button = (text, scope = page) => scope.locator('uni-button').filter({ hasText: typeof text === 'string' ? new RegExp(`^\\s*${text}\\s*$`) : text });
    const nav = text => button(new RegExp(text), page.locator('.bottom-nav')).click();
    const role = text => button(text, page.locator('.role-picker')).click();
    const noOverflow = async label => {
      for (const width of [320, 390, 736, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: horizontal overflow at ${width}px`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    };
    const screenshot = async name => {
      await page.locator('.notification-toast').waitFor({ state: 'hidden' });
      await page.setViewportSize({ width: 736, height: 963 });
      if (name.startsWith('excellent')) await page.locator('.excellent-evaluation').scrollIntoViewIfNeeded();
      else await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(outputs, `prototype-comments-${name}-2026-10-22.jpg`), fullPage: !name.startsWith('excellent'), type: 'jpeg', quality: 85 });
      await page.setViewportSize({ width: 390, height: 844 });
    };
    const bind = async code => {
      await page.locator('.binding-login').click();
      await page.locator('.binding-code input').waitFor();
      assert.equal(await page.locator('.modal-card').count(), 0, 'login must not require confirmation');
      assert.equal((await page.locator('.binding-intro .detail-title').innerText()).trim(), '绑定身份');
      await page.locator('.binding-code input').fill(code);
      await button(/查看绑定信息/).click();
      assert.doesNotMatch(await page.locator('.binding-view').innerText(), /所学校／机构|绑定后，在|信息有误时，请先|任教学校和班级由/);
      await button('确认', page.locator('.binding-view')).click();
      await page.locator('.greeting').waitFor();
    };
    assert.equal(await page.locator('.app-header .brand-mark, .header-avatar').count(), 0);
    assert.match(await page.locator('.header-brand-logo img').getAttribute('src'), /writingstar-logo-horizontal/);
    assert.doesNotMatch(await page.locator('.binding-view').innerText(), /写字 · 写作 · 一起成长|连接任教学校|首次使用/);
    await noOverflow('login');
    await bind('JS2026');
    assert.equal(await page.locator('.organization-context').count(), 0);
    assert.doesNotMatch(await page.locator('.home-view').innerText(), /每名学生的每项作业|写字有章法/);
    assert.equal(await page.locator('.assignment-card .compact-button').evaluateAll(items => items.some(item => item.textContent.includes('↗'))), false);
    await nav('我的');
    await page.locator('.profile-card').waitFor();
    assert.equal(await page.locator('.app-header .organization-context').count(), 0);
    assert.equal(await page.locator('.page-body .organization-context').count(), 1);
    assert.match(await page.locator('.organization-context').innerText(), /甲秀小学/);
    await nav('工作台');

    await button(/布置作业/).click();
    const composer = page.locator('.assignment-composer');
    await composer.waitFor();
    const titleInput = composer.locator('.form-input input');
    const requirements = composer.locator('textarea');
    assert.equal((await composer.locator('.uni-input-placeholder').innerText()).trim(), '必填');
    assert.equal((await composer.locator('.uni-textarea-placeholder').innerText()).trim(), '选填');
    await button('发布作业', composer).click();
    const notice = page.locator('.notification-toast');
    await notice.filter({ hasText: '请填写作业标题' }).waitFor();
    const noticeBox = await notice.boundingBox();
    assert.ok(Math.abs(noticeBox.y + noticeBox.height / 2 - 422) < 2, 'notification should be centered');
    assert.equal(await page.locator('.modal-card').count(), 0);
    await notice.waitFor({ state: 'hidden' });
    await button('模板填写', composer).click();
    assert.equal(await composer.locator('.composer-template-row').count(), 3);
    assert.equal(await composer.locator('.composer-template-delete').count(), 0, 'built-in templates are read-only');
    await composer.locator('.composer-template-select').first().click();
    await page.waitForFunction(() => document.querySelector('.assignment-composer input')?.value === '我的一次新发现');
    assert.equal(await titleInput.inputValue(), '我的一次新发现');
    assert.ok((await requirements.inputValue()).length > 10);
    await titleInput.fill('题库模板浏览器验收');
    await requirements.fill('观察一种植物，写出细节。');
    await button('另存为新模板', composer).click();
    await composer.locator('.composer-template-row').filter({ hasText: '题库模板浏览器验收' }).waitFor();
    let stored = await page.evaluate(storageRead);
    const templateId = stored.assignmentTemplates.find(item => item.title === '题库模板浏览器验收').id;
    await composer.locator('.composer-template-row').filter({ hasText: '题库模板浏览器验收' }).locator('.composer-template-select').click();
    await titleInput.fill('题库模板浏览器验收（更新）');
    await requirements.fill('更新后的写作要求。');
    await button('更新当前模板', composer).click();
    await composer.locator('.composer-template-row').filter({ hasText: '题库模板浏览器验收（更新）' }).waitFor();
    stored = await page.evaluate(storageRead);
    assert.equal(stored.assignmentTemplates.find(item => item.id === templateId).requirements, '更新后的写作要求。');
    await composer.locator('.composer-template-row').filter({ hasText: '题库模板浏览器验收（更新）' }).locator('.composer-template-delete').click();
    await composer.locator('.composer-template-row').filter({ hasText: '题库模板浏览器验收（更新）' }).waitFor({ state: 'hidden' });
    assert.equal((await page.evaluate(storageRead)).assignmentTemplates.some(item => item.id === templateId), false);
    await composer.locator('.composer-template-select').first().click();
    const publishedTitle = '不限截止日期与多班级发布验收';
    await titleInput.fill(publishedTitle); await requirements.fill('');
    await button('不限', composer).click();
    assert.equal(await composer.locator('uni-picker').count(), 0);
    const classOptions = composer.locator('.composer-class-option');
    assert.equal(await classOptions.count(), 2);
    for (let i = 0; i < await classOptions.count(); i++) if (!(await classOptions.nth(i).getAttribute('class')).includes('selected')) await classOptions.nth(i).click();
    assert.match(await composer.locator('.composer-selection-summary').innerText(), /已选 2 个班级/);
    await noOverflow('assignment composer');
    await screenshot('assignment-composer');
    await button('发布作业', composer).click();
    await page.locator('.task-detail').filter({ hasText: publishedTitle }).waitFor();
    stored = await page.evaluate(storageRead);
    const assignments = stored.assignments.filter(item => item.title === publishedTitle);
    assert.deepEqual(assignments.map(item => item.classId).sort(), ['class-1', 'class-2']);
    assert.ok(assignments.every(item => item.dueAt === '' && item.requirements === ''));
    assert.match(await page.locator('.task-detail').innerText(), /不限/);
    assert.equal(await button('代学生提交作业').count(), 0);
    console.log('Direct login, brand cleanup, profile-only school switch, centered auto-dismiss notifications, template CRUD, optional requirements and atomic multi-class unlimited assignments passed.');

    await nav('工作台');
    const originalCard = page.locator('.assignment-card').filter({ hasText: '放学路上的一件小事' });
    await originalCard.locator('.compact-button').click();
    const learnerRow = page.locator('.student-row').filter({ has: page.locator('.strong').filter({ hasText: /^\s*小禾\s*$/ }) });
    await button(/进入批阅/, learnerRow).click();
    assert.equal(await button('设为优秀作业').count(), 0, 'unpublished review cannot be selected as excellent');
    assert.equal(await button(/保存草稿/).count(), 0);
    await button(/查看AI批阅/).click();
    await page.locator('.ai-review-panel').waitFor();
    await button('开始AI批阅', page.locator('.ai-review-panel')).click();
    await page.locator('.ai-result-source').waitFor();
    assert.equal(await page.locator('.ai-result-hero').count(), 0);
    assert.equal(await page.locator('.ai-dimension-comment').count(), 5);
    assert.match(await page.locator('.ai-learning-note').innerText(), /^AI可能出错，请核查重要信息。$/);
    assert.equal(await button(/保留当前草稿|由老师人工批阅|返回作业批阅/).count(), 0);
    await page.locator('.ai-dimension-toggle').first().click();
    assert.equal(await page.locator('.ai-dimension-comment').count(), 4);
    assert.match(await page.locator('.ai-dimension-toggle').first().innerText(), /展开/);
    await page.locator('.ai-dimension-toggle').first().click();
    await button('写作评价', page.locator('.ai-category-switch')).click();
    assert.equal(await page.locator('.ai-dimension-comment').count(), 5);
    await button('修改评价').click();
    assert.equal(await page.locator('.dimension-expanded').count(), 5);
    const publishedHandwritingSummary = '教师核对后的书写总评：结构清晰，保持间距。';
    const publishedCompositionSummary = '教师核对后的写作总评：叙事完整，细节具体。';
    const publishedNextSteps = '批阅建议：下次补充一段人物对话。';
    await button('书写评价', page.locator('.ai-review-panel .category-switch')).click();
    await page.locator('.score-input-wrap input').first().fill('9');
    await page.locator('.ai-review-panel .form-card textarea').first().fill(publishedHandwritingSummary);
    await page.locator('.ai-review-panel .form-card textarea').last().fill(publishedNextSteps);
    await button('写作评价', page.locator('.ai-review-panel .category-switch')).click();
    assert.equal(await page.locator('.dimension-expanded').count(), 5);
    await page.locator('.score-input-wrap input').first().fill('7');
    await page.locator('.ai-review-panel .form-card textarea').first().fill(publishedCompositionSummary);
    await noOverflow('AI review editor');
    await button('收起修改').click();
    await screenshot('ai-review');
    await button('完成批阅', page.locator('.ai-teacher-actions')).click();
    await page.locator('.feedback-intro').waitFor();
    assert.equal(await page.locator('.modal-card').count(), 0, 'complete review publishes directly');
    stored = await page.evaluate(storageRead);
    const submission = stored.submissions.find(item => item.id === 'submission-1');
    assert.equal(submission.status, 'published');
    assert.equal(submission.published.handwriting.summary, publishedHandwritingSummary);
    assert.equal(submission.published.composition.summary, publishedCompositionSummary);
    assert.equal(submission.published.nextSteps, publishedNextSteps);
    const firstDimensionId = Object.keys(submission.published.handwriting.scores)[0];
    assert.notEqual(submission.published.handwriting.scores[firstDimensionId], submission.aiReview.result.handwriting.scores[firstDimensionId]);
    await button('设为优秀作业', page.locator('.homework-selection-bar')).click();
    await button('取消优秀作业', page.locator('.homework-selection-bar')).waitFor();
    assert.equal(await page.locator('.modal-card').count(), 0, 'excellent selection does not require confirmation');
    await nav('工作台');
    await button(/去看看/, page.locator('.excellent-entry')).click();
    assert.equal(await page.locator('.excellent-intro').count(), 0);
    await button(/查看完整作品/, page.locator('.excellent-card').filter({ hasText: '小禾' })).click();
    await page.locator('.excellent-evaluation').waitFor();
    assert.match(await page.locator('.excellent-evaluation').innerText(), new RegExp(publishedHandwritingSummary));
    assert.match(await page.locator('.excellent-workspace').innerText(), new RegExp(publishedNextSteps));
    assert.equal(await page.locator('.excellent-dimension-comment').count(), 5);
    await screenshot('excellent-teacher');
    console.log('AI evaluation editing, default expanded dimensions, direct review completion and excellent selection on published feedback passed.');

    // Give the saved private draft a distinct fixture marker after publication.
    // The gallery must continue to render only the published evaluation.
    await page.evaluate(() => {
      const key = 'jiaxiu-prototype-v1', raw = JSON.parse(localStorage.getItem(key));
      const state = raw.schemaVersion ? raw : typeof raw === 'string' ? JSON.parse(raw) : typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
      const item = state.submissions.find(entry => entry.id === 'submission-1');
      item.draft.handwriting.summary = 'PRIVATE_DRAFT_MARKER_20261022'; item.note = 'PRIVATE_NOTE_MARKER_20261022';
      if (raw.schemaVersion) localStorage.setItem(key, JSON.stringify(state));
      else if (typeof raw === 'string') localStorage.setItem(key, JSON.stringify(JSON.stringify(state)));
      else { raw.data = typeof raw.data === 'string' ? JSON.stringify(state) : state; localStorage.setItem(key, JSON.stringify(raw)); }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await role('学生'); await bind('XS2026');
    await button(/去看看/, page.locator('.excellent-entry')).click();
    await button(/查看完整作品/, page.locator('.excellent-card').filter({ hasText: '小禾' })).click();
    await page.locator('.excellent-evaluation').waitFor();
    assert.match(await page.locator('.excellent-evaluation').innerText(), new RegExp(publishedHandwritingSummary));
    assert.match(await page.locator('.excellent-workspace').innerText(), new RegExp(publishedNextSteps));
    assert.doesNotMatch(await page.locator('.excellent-workspace').innerText(), /PRIVATE_DRAFT_MARKER|PRIVATE_NOTE_MARKER/);
    assert.equal(await button('取消优秀作业').count(), 0);
    await button('写作评价', page.locator('.excellent-workspace .category-switch')).click();
    assert.match(await page.locator('.excellent-evaluation').innerText(), new RegExp(publishedCompositionSummary));
    assert.match(await page.locator('.excellent-evaluation').innerText(), /\d+\s*\/\s*100/);
    await noOverflow('student excellent evaluation');
    await screenshot('excellent-student');
    await role('教师'); await nav('学情');
    await page.locator('.trend-card').waitFor();
    assert.doesNotMatch(await page.locator('.trend-card .trend-heading').innerText(), /60.?100/);
    assert.doesNotMatch(await page.locator('.trend-legend').innerText(), /轻点切换/);
    await page.locator('.trend-card').scrollIntoViewIfNeeded();
    const style = await page.locator('.bottom-nav').evaluate(element => {
      const value = getComputedStyle(element), box = element.getBoundingClientRect();
      return { background: value.backgroundColor, opacity: value.opacity, zIndex: Number(value.zIndex), bottom: box.bottom, position: value.position };
    });
    assert.equal(style.background, 'rgb(255, 255, 255)'); assert.equal(style.opacity, '1');
    assert.equal(style.position, 'fixed'); assert.ok(style.zIndex >= 100); assert.ok(Math.abs(style.bottom - 844) < 2);
    const navAtPoint = await page.locator('.bottom-nav').evaluate(element => {
      const box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + 8));
    });
    assert.equal(navAtPoint, true, 'bottom navigation must cover the chart');
    await noOverflow('statistics chart');
    assert.deepEqual(errors, []); assert.deepEqual(badAssets, []);
    console.log('Teacher/student published excellent scores, comments and suggestions, private draft/note isolation, opaque navigation over canvas and 320/390/736/1280px layouts passed.');
  } catch (error) {
    if (page) await page.screenshot({ path: '/tmp/writingstar-comments-20261022-failure.png', fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})();
