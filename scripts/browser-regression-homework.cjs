// Exercise the current H5 build with an isolated profile and local-only requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
function storageRead() {
  const raw = JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));
  return raw.schemaVersion ? raw : typeof raw === 'string' ? JSON.parse(raw) : typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
}

(async () => {
  let browser, page;
  const errors = [], badAssets = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' || url.protocol === 'data:' ? route.continue() : route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) badAssets.push(response.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    const button = (text, scope = page) => scope.locator('uni-button').filter({ hasText: text });
    const role = name => page.locator('.role-button').filter({ hasText: new RegExp(`^${name}$`) }).click();
    const confirm = async () => { await page.locator('.modal-actions .primary').click(); await page.locator('.modal-card').waitFor({ state: 'hidden' }); };
    const bind = async code => {
      await page.locator('.binding-login').click(); await confirm();
      await page.locator('.binding-code input').fill(code); await button('查看绑定信息').click();
      await button('确认绑定，进入').click(); await page.locator('.greeting').waitFor();
    };
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    const mobileAndDesktop = async () => {
      for (const width of [320, 390, 1280]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(); }
      await page.setViewportSize({ width: 390, height: 900 });
    };
    const title = '教师代交与优秀作品验收';
    await bind('JS2026');
    await button('布置作业').click();
    await page.locator('.form-input input').fill(title);
    await page.locator('.form-card textarea').fill('写清一次发现的经过，照片按页序排列。');
    await button('发布作业').click();
    await page.locator('.task-detail').filter({ hasText: title }).waitFor();
    const row = name => page.locator('.student-row').filter({ has: page.locator('.strong').filter({ hasText: new RegExp(`^${name}$`) }) });
    await button('代交作业', row('小林')).click();
    await page.locator('.teacher-submit-selection').filter({ hasText: '小林' }).waitFor();
    const chooser = page.waitForEvent('filechooser');
    await button('选择作品照片').click();
    await (await chooser).setFiles([path.resolve(__dirname, '../src/static/essay-1.png'), path.resolve(__dirname, '../src/static/essay-2.png')]);
    await page.locator('.upload-row').nth(1).waitFor();
    await button('下移', page.locator('.upload-row').first()).click();
    await page.locator('.form-card textarea').fill('仅对本人和老师可见的代交说明');
    await mobileAndDesktop();
    await page.screenshot({ path: path.resolve(__dirname, '../outputs/prototype-teacher-submit-2026-10-21.jpg'), type: 'jpeg', quality: 85, fullPage: true });
    await button('确认代交并开始AI批阅').click();
    assert.match(await page.locator('.modal-card').innerText(), /小林/);
    await confirm();
    await page.locator('.ai-review-panel').waitFor();
    let stored = await page.evaluate(storageRead);
    const assignment = stored.assignments.find(item => item.title === title);
    const submission = stored.submissions.find(item => item.assignmentId === assignment.id);
    assert.equal(submission.studentId, 'student-2');
    assert.equal(submission.actor, 'teacher');
    assert.equal(submission.submittedBy.name, '陈老师');
    assert.equal(submission.photos[0].name, 'essay-2.png');
    await page.locator('.back-button').click();
    assert.match(await row('小林').innerText(), /陈老师代交/);
    assert.equal(await button('代交作业', row('小林')).count(), 0);
    await button('设为优秀作业', row('小林')).click(); await confirm();
    await row('小林').locator('.excellent-badge').waitFor();
    console.log('Teacher submission, original-page ordering, provenance, duplicate prevention and selection passed.');

    await role('学生'); await bind('XS2026');
    await button('去看看', page.locator('.excellent-entry')).click();
    const card = page.locator('.excellent-card').filter({ hasText: title });
    await card.waitFor();
    assert.match(await card.innerText(), /小林/);
    assert.equal(await button('取消优秀').count(), 0);
    await button('查看完整作品', card).click();
    await page.locator('.excellent-detail-intro').waitFor();
    assert.equal(await page.locator('.photo-pagination').innerText().then(text => /1\s*\/\s*2/.test(text)), true);
    await button('下一页').click();
    assert.match(await page.locator('.photo-pagination').innerText(), /2\s*\/\s*2/);
    assert.doesNotMatch(await page.locator('.excellent-workspace').innerText(), /仅对本人和老师可见的代交说明|草稿|AI评分|直觉思维/);
    await mobileAndDesktop();
    await page.screenshot({ path: path.resolve(__dirname, '../outputs/prototype-class-excellent-2026-10-21.jpg'), type: 'jpeg', quality: 85, fullPage: true });
    await page.locator('.back-button').click(); await card.waitFor();
    await page.locator('.back-button').click(); await page.locator('.greeting').waitFor();
    await button('查看任务', page.locator('.assignment-card').filter({ hasText: title })).click();
    await button('查看作品', page.locator('.excellent-entry')).click(); await card.waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await role('学生');
    await button('去看看', page.locator('.excellent-entry')).click(); await card.waitFor();
    console.log('Classmate gallery, page navigation, private-field isolation, assignment entry and refresh persistence passed.');

    const tools = page.locator('.mobile-preview-tools');
    await tools.locator('.prototype-tools-heading .text-button').click();
    await button('重新体验当前身份的绑定', tools).click(); await confirm(); await bind('CX2026');
    await button('去看看', page.locator('.excellent-entry')).click();
    await page.locator('.empty-state').filter({ hasText: '还没有优秀作业' }).waitFor();
    assert.equal(await page.locator('.excellent-card').count(), 0);
    await role('教师');
    await button('去看看', page.locator('.excellent-entry')).click(); await card.waitFor();
    await button('取消优秀', card).click();
    await page.locator('.empty-state').filter({ hasText: '还没有优秀作业' }).waitFor();
    stored = await page.evaluate(storageRead);
    const original = stored.submissions.find(item => item.id === submission.id);
    assert.equal(original.excellent, null);
    assert.deepEqual(original.photos, submission.photos);
    assert.deepEqual(errors, []); assert.deepEqual(badAssets, []);
    console.log('Other-class isolation and teacher removal passed; originals preserved, no page or asset errors, 320/390/1280px layouts passed.');
  } catch (error) {
    if (page) await page.screenshot({ path: '/tmp/writingstar-homework-failure.png', fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})();
