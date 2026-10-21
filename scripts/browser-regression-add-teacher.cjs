// Run against the current H5 build with an isolated browser profile and local-only requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const outputs = path.resolve(__dirname, '../outputs');
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
    const nav = name => button(new RegExp(`${name}\\s*$`), page.locator('.admin-bottom-nav')).click();
    const confirm = async () => { await page.locator('.modal-actions .primary').click(); await page.locator('.modal-card').waitFor({ state: 'hidden' }); };
    const bind = async code => {
      await page.locator('.binding-login').click(); await confirm();
      await page.locator('.binding-code input').fill(code); await button('查看绑定信息').click();
      await button('确认绑定，进入').click(); await page.locator('.greeting').waitFor();
    };
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    await role('管理员'); await bind('MA2026');
    const before = await page.evaluate(storageRead);
    await button(/^添加教师/).click();
    assert.equal(await button(/^保存教师$/).getAttribute('disabled'), 'true');
    const inputs = page.locator('.admin-workspace .form-input input');
    await inputs.nth(0).fill('林老师'); await inputs.nth(1).fill('写作'); await inputs.nth(2).fill('13800000001');
    await page.locator('.admin-teacher-form-choice').nth(0).click(); await page.locator('.admin-teacher-form-choice').nth(1).click();
    await page.setViewportSize({ width: 320, height: 844 }); await noOverflow();
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: path.join(outputs, 'prototype-admin-add-teacher-2026-10-20.jpg'), type: 'jpeg', quality: 85, fullPage: true });
    await inputs.nth(2).fill('123'); await button(/^保存教师$/).click();
    await page.locator('[role="alert"]').filter({ hasText: '11位手机号' }).waitFor();
    assert.deepEqual(await page.evaluate(storageRead), before);
    await nav('学生'); await page.locator('.modal-actions .secondary').click();
    assert.equal(await inputs.nth(0).inputValue(), '林老师');
    await inputs.nth(2).fill('13800000001');
    await button(/^保存教师$/).click();
    const card = page.locator('.admin-teacher-card').filter({ hasText: '林老师' });
    await card.waitFor(); assert.match(await card.innerText(), /13800000001/); assert.match(await card.innerText(), /任教 2 班/);
    const after = await page.evaluate(storageRead);
    assert.equal(after.teachers.length, before.teachers.length + 1);
    for (const key of ['teacherAccount', 'teacherClassIds', 'accounts', 'assignments', 'submissions', 'students']) assert.deepEqual(after[key], before[key]);
    assert.match(after.administrationEvents[0].description, /添加教师：林老师/);
    await page.locator('.student-search input').fill('13800000001'); assert.equal(await page.locator('.admin-teacher-card').count(), 1);
    await page.locator('.student-search input').fill('不存在的老师'); await page.locator('.empty-state').filter({ hasText: '没有找到对应教师' }).waitFor();
    await button(/^清除$/).click(); await card.waitFor();
    await nav('管理台'); assert.equal(await page.locator('.admin-stat-number').nth(2).innerText(), '4');
    assert.match(await page.locator('.admin-events').innerText(), /添加教师：林老师/);
    await page.reload({ waitUntil: 'networkidle' }); await role('管理员'); await nav('教师'); await card.waitFor();
    console.log('home entry, field validation, unsaved edit guard, multi-class assignment, search, counts and reload persistence passed');

    await button('添加教师').click(); await inputs.nth(0).fill('待分配老师'); await inputs.nth(2).fill('13800000001');
    await button(/^保存教师$/).click(); await page.locator('[role="alert"]').filter({ hasText: '已有该手机号' }).waitFor();
    assert.equal((await page.evaluate(storageRead)).teachers.length, after.teachers.length);
    assert.equal(await inputs.nth(0).inputValue(), '待分配老师');
    await inputs.nth(2).fill(''); await button(/^保存教师$/).click();
    const waiting = page.locator('.admin-teacher-card').filter({ hasText: '待分配老师' }); await waiting.waitFor();
    assert.match(await waiting.innerText(), /暂未分配/);
    await nav('班级'); await page.locator('.admin-class-card').filter({ hasText: '四年级（1）班' }).click();
    await button('分配老师').click(); await page.locator('.admin-choice').filter({ hasText: '待分配老师' }).click();
    await button('保存任教分配').click(); await confirm();
    assert.match(await page.locator('.admin-teacher-line').innerText(), /待分配老师/);
    await nav('教师'); assert.match(await waiting.innerText(), /任教 1 班/);
    await page.locator('.toast').waitFor({ state: 'hidden' });
    for (const width of [320, 390, 1280]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(); }
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: path.join(outputs, 'prototype-admin-teachers-2026-10-20.jpg'), type: 'jpeg', quality: 85, fullPage: true });
    console.log('duplicate phone recovery, optional phone/classes, subsequent teacher allocation and 320/390/1280px layouts passed');

    const tools = page.locator('.mobile-preview-tools');
    await tools.locator('.prototype-tools-heading .text-button').click();
    await button('重新体验当前身份的绑定', tools).click(); await confirm(); await bind('MB2026');
    await nav('教师');
    assert.equal(await page.locator('.admin-teacher-card').count(), 2);
    assert.doesNotMatch(await page.locator('.admin-workspace').innerText(), /林老师|待分配老师|13800000001/);
    await role('教师'); assert.equal(await page.locator('.admin-bottom-nav').count(), 0);
    await role('学生'); assert.equal(await page.locator('.admin-bottom-nav').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(badAssets, []);
    console.log('school isolation and administrator-only navigation passed; no page or asset errors');
  } catch (error) {
    if (page) await page.screenshot({ path: '/tmp/writingstar-add-teacher-failure.png', fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})();
