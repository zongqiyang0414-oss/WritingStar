// Isolated H5 acceptance for automatic AI review and batch publishing.
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
    fs.mkdirSync(outputs, { recursive: true });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' || url.protocol === 'data:' ? route.continue() : route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) badAssets.push(response.url()); });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base, { waitUntil: 'networkidle' });
    const button = (text, scope = page) => scope.locator('uni-button').filter({ hasText: typeof text === 'string' ? new RegExp(`^\\s*${text}\\s*$`) : text });
    const nav = text => button(new RegExp(text), page.locator('.bottom-nav')).click();
    const role = text => button(text, page.locator('.role-picker')).click();
    const noModal = async label => assert.equal(await page.locator('.modal-card').count(), 0, `${label}: unexpected confirmation`);
    const noOverflow = async label => {
      for (const width of [320, 390, 736, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: horizontal overflow at ${width}px`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    };
    const screenshot = async (name, target = null) => {
      await page.locator('.notification-toast').waitFor({ state: 'hidden' });
      await page.setViewportSize({ width: 736, height: 963 });
      if (target) await target.scrollIntoViewIfNeeded(); else await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(outputs, `prototype-ai-publish-${name}-2026-10-22.jpg`), type: 'jpeg', quality: 88 });
      await page.setViewportSize({ width: 390, height: 844 });
    };
    const bind = async code => {
      await page.locator('.binding-login').click();
      await page.locator('.binding-code input').fill(code);
      await button(/查看绑定信息/).click();
      await button('确认', page.locator('.binding-view')).click();
      await page.locator('.greeting').waitFor();
    };
    await bind('JS2026');
    const brand = page.locator('.app-header .brand-logo-frame');
    const brandImage = page.locator('.app-header .header-brand-logo img');
    assert.match(await brandImage.getAttribute('src'), /writingstar-logo-horizontal-transparent\.png/);
    await brandImage.evaluate(image => image.decode());
    const brandData = await brandImage.evaluate(image => {
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return { width: image.naturalWidth, height: image.naturalHeight, cornerAlpha: context.getImageData(0, 0, 1, 1).data[3] };
    });
    assert.ok(brandData.width > 0 && brandData.height > 0);
    assert.equal(brandData.cornerAlpha, 0, 'brand source must have a transparent background');
    assert.equal(Math.round((await brand.boundingBox()).width), 240);
    await nav('我的');
    await page.locator('.profile-card').waitFor();
    const school = await page.locator('.organization-context').boundingBox();
    const profile = await page.locator('.profile-card').boundingBox();
    const brandBox = await brand.boundingBox();
    assert.ok(profile.y - (school.y + school.height) >= 17.5, 'school card must have at least 18px gap below');
    assert.ok(Math.abs(brandBox.x - school.x) <= 2, 'brand frame must align to content left');
    await noOverflow('profile and logo');
    await screenshot('profile');
    await nav('工作台');
    await button(/布置作业/).click();
    const composer = page.locator('.assignment-composer');
    const assignmentTitle = '自动AI批阅与一键发布验收';
    await composer.locator('.form-input input').fill(assignmentTitle);
    await composer.locator('textarea').fill('观察放学路上的一件小事，写清事情经过。');
    await button('不限', composer).click();
    await button('发布作业', composer).click();
    await page.locator('.task-detail').filter({ hasText: assignmentTitle }).waitFor();
    const state = await page.evaluate(readState);
    const assignment = state.assignments.find(item => item.title === assignmentTitle);
    const studentRow = name => page.locator('.student-row').filter({ has: page.locator('.strong').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }) });
    assert.equal(await button('设为优秀作业', studentRow('小禾')).count(), 0, 'unsubmitted work must not be selectable as excellent');
    const submitted = [];
    for (const name of ['小禾', '小林']) {
      await button(/代交作业/, studentRow(name)).click();
      await page.locator('.teacher-submit-selection').filter({ hasText: name }).waitFor();
      const tools = page.locator('.mobile-preview-tools');
      if (!(await button('装载两页练习作品', tools).isVisible())) await tools.locator('.prototype-tools-heading .text-button').click();
      await button('装载两页练习作品', tools).click();
      await tools.locator('.prototype-tools-heading .text-button').click();
      await page.locator('.upload-row').nth(1).waitFor();
      await button('确认代交并开始AI批阅').click();
      await page.locator('.ai-review-panel').waitFor();
      await noModal('automatic AI submission');
      const stored = await page.evaluate(readState);
      const student = stored.students.find(item => item.name === name && item.classId === assignment.classId);
      const submission = stored.submissions.find(item => item.assignmentId === assignment.id && item.studentId === student.id);
      assert.ok(submission.aiReview, 'submission must automatically create AI work without a teacher start action');
      assert.ok(['queued', 'reading', 'reviewing', 'completed'].includes(submission.aiReview.state));
      assert.equal(submission.aiReview.source, 'teacher');
      assert.equal(submission.status === 'published', false, 'automatic AI must not publish teacher feedback');
      submitted.push(submission.id);
      await page.locator('.ai-result-source').waitFor();
      assert.equal(await button('开始AI批阅').count(), 0);
      await page.locator('.back-button').click();
      await page.locator('.task-detail').waitFor();
      assert.equal(await button('设为优秀作业', studentRow(name)).count(), 0, 'AI-complete but unpublished work must not be selectable as excellent');
    }
    // Restore a previously saved teacher edit in this isolated browser only.
    // The displayed review and the batch-published snapshot must use that edit.
    const editedReview = await page.evaluate(id => {
      const key = 'jiaxiu-prototype-v1', raw = JSON.parse(localStorage.getItem(key));
      const state = raw.schemaVersion ? raw : typeof raw === 'string' ? JSON.parse(raw) : typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
      const item = state.submissions.find(entry => entry.id === id);
      item.draft = JSON.parse(JSON.stringify(item.aiReview.result));
      item.draft.handwriting.scores.intuitive = 9;
      item.draft.handwriting.summary = '教师核对：横画平稳，注意字间留白。';
      item.draft.nextSteps = '订正建议：下次先调整左右结构。';
      item.draftRevision = 1;
      if (raw.schemaVersion) localStorage.setItem(key, JSON.stringify(state));
      else if (typeof raw === 'string') localStorage.setItem(key, JSON.stringify(JSON.stringify(state)));
      else { raw.data = typeof raw.data === 'string' ? JSON.stringify(state) : state; localStorage.setItem(key, JSON.stringify(raw)); }
      return item.draft;
    }, submitted[0]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.assignment-card').filter({ hasText: assignmentTitle }).locator('.compact-button').click();
    await page.locator('.task-detail').waitFor();
    await button(/查看全班进度与结果/, page.locator('.ai-assignment-entry')).click();
    const batch = page.locator('.ai-batch-panel');
    await button('一键发布 · 2 份', batch).waitFor();
    const editedRow = batch.locator('.ai-batch-row').filter({ hasText: '小禾' });
    await editedRow.filter({ hasText: '使用已修改评价' }).waitFor();
    await button(/查看修改/, editedRow).click();
    await page.locator('.evaluation-card').waitFor();
    assert.equal(await page.locator('.score-input-wrap input').first().inputValue(), '9');
    assert.equal(await page.locator('.form-card textarea').first().inputValue(), editedReview.handwriting.summary);
    assert.equal(await page.locator('.form-card textarea').last().inputValue(), editedReview.nextSteps);
    await page.locator('.back-button').click();
    await batch.waitFor();
    await noModal('return from viewing existing teacher edit');
    assert.match(await batch.innerText(), /学生提交后自动AI批阅/);
    assert.doesNotMatch(await batch.locator('.ai-batch-filters').innerText(), /需关注/);
    assert.equal(await button(/补跑历史作品AI批阅/, batch).count(), 0);
    await button('待发布', batch.locator('.ai-batch-filters')).click();
    assert.equal(await batch.locator('.ai-batch-row').count(), 2);
    await button('异常／待处理', batch.locator('.ai-batch-filters')).click();
    assert.match(await batch.locator('.ai-batch-filter-note').innerText(), /失败、等待结果或需要补全评价/);
    assert.equal(await batch.locator('.ai-batch-row').count(), 0);
    await button('全部', batch.locator('.ai-batch-filters')).click();
    await noOverflow('AI batch ready results');
    await screenshot('batch-ready');
    await button('一键发布 · 2 份', batch).click();
    await button('暂无可发布结果', batch).waitFor();
    await noModal('one-click batch publishing');
    const afterPublish = await page.evaluate(readState);
    for (const id of submitted) {
      const submission = afterPublish.submissions.find(item => item.id === id);
      assert.equal(submission.status, 'published');
      assert.ok(submission.published && submission.publishedAt);
      assert.deepEqual(submission.published, id === submitted[0] ? editedReview : submission.aiReview.result);
      if (id === submitted[0]) assert.notDeepEqual(submission.published, submission.aiReview.result);
      assert.equal(submission.aiReview.state, 'completed');
    }
    const counts = await batch.locator('.ai-batch-counts').innerText();
    assert.match(counts, /0\s*待发布/); assert.match(counts, /2\s*已发布/);
    await button('已发布', batch.locator('.ai-batch-filters')).click();
    assert.equal(await batch.locator('.ai-batch-row').count(), 2);
    await page.locator('.back-button').click();
    await page.locator('.task-detail').waitFor();
    await button('设为优秀作业', studentRow('小禾')).click();
    await button('取消优秀作业', studentRow('小禾')).waitFor();
    await noModal('roster excellent selection');
    let saved = await page.evaluate(readState);
    assert.ok(saved.submissions.find(item => item.id === submitted[0]).excellent);
    await button('取消优秀作业', studentRow('小禾')).click();
    await button('设为优秀作业', studentRow('小禾')).waitFor();
    await noModal('roster excellent removal');
    saved = await page.evaluate(readState);
    assert.equal(Boolean(saved.submissions.find(item => item.id === submitted[0]).excellent), false);
    await button('设为优秀作业', studentRow('小禾')).click();
    await noOverflow('published roster excellent actions');
    await screenshot('published-roster', studentRow('小禾'));
    await role('学生'); await bind('XS2026');
    const learnerAssignment = page.locator('.assignment-card').filter({ hasText: assignmentTitle });
    await learnerAssignment.locator('.compact-button').click();
    await page.locator('.feedback-intro').waitFor();
    assert.match(await page.locator('.dual-scores').innerText(), /\d+\s*\/\s*100/);
    assert.match(await page.locator('.page-body').innerText(), /教师核对：横画平稳，注意字间留白。/);
    assert.match(await page.locator('.next-steps').innerText(), /订正建议：下次先调整左右结构。/);
    assert.equal(await button('设为优秀作业').count(), 0);
    await noOverflow('student published feedback');
    assert.deepEqual(errors, []); assert.deepEqual(badAssets, []);
    console.log('Transparent enlarged left-aligned logo and profile card spacing passed.');
    console.log('Two actual submissions automatically queued AI review; teacher-edited result viewing and publishing, batch result filters, published counters and student feedback passed.');
    console.log('Published-only roster excellent selection/removal, 320/390/736/1280px layouts and zero page/asset errors passed.');
  } catch (error) {
    if (page) await page.screenshot({ path: '/tmp/writingstar-ai-publish-browser-failure.png', fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})();
