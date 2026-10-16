// Run against the current H5 build with a temporary browser profile and local-only requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const outputs = path.resolve(__dirname, '../outputs');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : decodeURIComponent(new URL(req.url, 'http://localhost').pathname)));
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
    const role = async name => page.locator('.role-button').filter({ hasText: new RegExp(`^${name}$`) }).click();
    const nav = async name => button(new RegExp(`^\\s*[^\\s]*\\s*${name}\\s*$`), page.locator('.bottom-nav')).click();
    const confirm = async () => { await page.locator('.modal-actions .primary').click(); await page.locator('.modal-card').waitFor({ state: 'hidden' }); };
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    const choose = async (picker, label) => {
      await picker.locator('.date-picker').click();
      const panel = page.locator('.uni-picker-custom.uni-picker-toggle');
      await panel.waitFor();
      const option = panel.locator('.uni-picker-select .uni-picker-item').filter({ hasText: new RegExp(`^${label}$`) });
      if (await option.isVisible()) { await option.click(); return; }
      const items = panel.locator('.uni-picker-content .uni-picker-item');
      const labels = (await items.allTextContents()).map(value => value.trim());
      const target = labels.indexOf(label); assert.ok(target >= 0, `missing picker option: ${label}`);
      const wheel = panel.locator('.uni-picker-view-group');
      await wheel.evaluate(node => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const aligned = async index => page.waitForFunction(index => {
        const panel = document.querySelector('.uni-picker-custom.uni-picker-toggle');
        const indicator = panel?.querySelector('.uni-picker-view-indicator')?.getBoundingClientRect();
        const item = panel?.querySelectorAll('.uni-picker-content .uni-picker-item')[index]?.getBoundingClientRect();
        return indicator && item && Math.abs(item.y + item.height / 2 - indicator.y - indicator.height / 2) < 2;
      }, index);
      for (let index = 0; index < labels.length; index++) await wheel.dispatchEvent('wheel', { deltaY: -40 });
      await aligned(0);
      for (let index = 0; index < target; index++) await wheel.dispatchEvent('wheel', { deltaY: 40 });
      await aligned(target);
      await panel.locator('.uni-picker-action-confirm').click();
      await panel.waitFor({ state: 'hidden' });
      assert.ok((await picker.locator('.date-picker').innerText()).includes(label), `picker did not select ${label}`);
    };
    const bind = async (name, code) => {
      await role(name); await page.locator('.binding-login').click(); await confirm();
      await page.locator('.binding-code input').fill(code); await button('查看绑定信息').click();
      await button('确认绑定，进入').click();
      await page.locator('.greeting').waitFor();
    };
    assert.deepEqual((await page.locator('.role-button').allTextContents()).map(value => value.trim()), ['教师', '学生', '管理员']);
    await bind('管理员', 'MA2026');
    assert.equal(await page.locator('.admin-stats .admin-stat-number').nth(0).innerText(), '2');
    assert.doesNotMatch(await page.locator('.app-shell').innerText(), /青禾学习中心|小安|小悦/);
    await noOverflow();
    await page.locator('.toast').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(outputs, 'prototype-admin-mobile-v0.10.0.jpg'), type: 'jpeg', quality: 85 });
    await page.setViewportSize({ width: 320, height: 844 }); await noOverflow();
    await page.setViewportSize({ width: 390, height: 844 });
    console.log('administrator binding, organization isolation and 320/390px layout passed');

    await nav('班级'); await button('新建班级').click();
    await page.locator('.admin-workspace .form-input input').first().fill('五年级（星光）班');
    await role('学生'); await page.locator('.modal-actions .secondary').click();
    assert.equal(await page.locator('.admin-workspace .form-input input').first().inputValue(), '五年级（星光）班');
    await button('保存班级').click(); await page.locator('.admin-class-summary').waitFor();
    await button('分配老师').click(); await page.locator('.admin-choice').filter({ hasText: '张老师' }).click();
    await button('保存任教分配').click(); await confirm();
    assert.match(await page.locator('.admin-teacher-line').innerText(), /张老师/);
    await page.locator('.admin-subheading .back-button').click();
    await page.locator('.admin-class-card').filter({ hasText: '五年级（星光）班' }).waitFor();
    await bind('教师', 'WK2026');
    assert.match(await page.locator('.app-shell').innerText(), /五年级（星光）班/);
    await role('管理员'); await nav('学生');
    console.log('class creation, unsaved edit guard, member back navigation and live teacher allocation passed');

    await button('新增学生').click();
    await page.locator('.admin-workspace .form-input input').nth(0).fill('林清');
    await page.locator('.admin-workspace .form-input input').nth(1).fill('WS2026001');
    await button('保存学生档案').click();
    await page.locator('.student-search input').fill('WS2026001');
    let card = page.locator('.admin-student-card').filter({ hasText: '林清' });
    await card.waitFor(); await button('编辑档案', card).click();
    await page.locator('.admin-workspace .form-input input').nth(0).fill('林清和'); await button('保存学生档案').click();
    card = page.locator('.admin-student-card').filter({ hasText: '林清和' }); await card.waitFor();
    await button(/^归档$/, card).click(); await confirm();
    await button(/^已归档$/, page.locator('.admin-status-filters')).click();
    await card.waitFor(); await button('恢复在班', card).click(); await confirm();
    await button(/^在班$/, page.locator('.admin-status-filters')).click(); await card.waitFor();
    const originalSubmissions = (await page.evaluate(storageRead)).submissions;
    await page.locator('.student-search input').fill('小禾');
    await button(/^调班$/, page.locator('.admin-student-card').filter({ hasText: '小禾' })).click();
    await choose(page.locator('.form-card uni-picker').nth(1), '四年级（2）班');
    await button('核对并确认调班').click();
    assert.match(await page.locator('.modal-card').innerText(), /1 位学生|1位学生/); await confirm();
    assert.match(await page.locator('.admin-class-filter').innerText(), /四年级（2）班/);
    assert.deepEqual((await page.evaluate(storageRead)).submissions, originalSubmissions);
    console.log('student creation, editing, number search, archive/restore and single transfer passed');

    // Leave two new pupils in the original class, then transfer them together through the selection UI.
    for (const [name, number] of [['批量甲', 'WSB01'], ['批量乙', 'WSB02']]) {
      await button('新增学生').click();
      await page.locator('.admin-workspace .form-input input').nth(0).fill(name); await page.locator('.admin-workspace .form-input input').nth(1).fill(number);
      await choose(page.locator('.form-card uni-picker'), '四年级（1）班'); await button('保存学生档案').click();
    }
    await button(/^调班$/, page.locator('.admin-inline-actions')).click();
    await choose(page.locator('.form-card uni-picker').nth(0), '四年级（1）班');
    await choose(page.locator('.form-card uni-picker').nth(1), '五年级（星光）班');
    await page.locator('.student-search input').fill('批量'); await button('全选当前结果').click();
    assert.match(await page.locator('.admin-transfer-footer').innerText(), /已选 2 人/);
    await page.locator('.toast').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(outputs, 'prototype-admin-transfer-mobile-v0.10.0.jpg'), type: 'jpeg', quality: 85 });
    await page.setViewportSize({ width: 390, height: 844 });
    await button('核对并确认调班').click(); await confirm();
    const afterBatch = await page.evaluate(storageRead);
    const newClass = afterBatch.classes.find(item => item.name === '五年级（星光）班');
    assert.equal(afterBatch.students.filter(item => ['WSB01', 'WSB02'].includes(item.studentNumber) && item.classId === newClass.id).length, 2);
    await page.reload({ waitUntil: 'networkidle' }); await role('管理员');
    assert.match(await page.locator('.admin-events').innerText(), /调班2人/);
    await noOverflow(); console.log('batch transfer, selection preview, management log and reload persistence passed');

    // Original class teacher can review a pupil after transfer, and the pupil opens the original feedback.
    const tools = page.locator('.mobile-preview-tools');
    await role('教师'); await tools.locator('.prototype-tools-heading .text-button').click();
    await button('重新体验当前身份的绑定', tools).click(); await confirm();
    await bind('教师', 'JS2026');
    const task = page.locator('.assignment-card').filter({ hasText: '放学路上的一件小事' });
    await task.locator('.compact-button').click();
    await button('进入批阅', page.locator('.former-student-row').filter({ hasText: '小禾' })).click();
    await page.locator('.action-bar .primary').click(); await confirm();
    await bind('学生', 'XS2026');
    assert.match(await page.locator('.app-shell').innerText(), /四年级（2）班/);
    await nav('记录');
    await button('查看这一版反馈', page.locator('.history-card').filter({ hasText: '放学路上的一件小事' })).click();
    assert.match(await page.locator('.feedback-intro .small').innerText(), /放学路上的一件小事/);
    assert.equal(await page.locator('.score-value').count(), 2);
    await role('管理员'); await nav('我的'); await noOverflow();
    await nav('管理台'); await page.setViewportSize({ width: 1280, height: 900 }); await noOverflow();
    await page.screenshot({ path: path.join(outputs, 'prototype-admin-desktop-v0.10.0.jpg'), type: 'jpeg', quality: 85, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    if (!await tools.locator('.prototype-tools-body').isVisible()) await tools.locator('.prototype-tools-heading .text-button').click();
    await button('重新体验当前身份的绑定', tools).click(); await confirm();
    await bind('管理员', 'MB2026');
    assert.doesNotMatch(await page.locator('.app-shell').innerText(), /星河小学|小禾|调班2人/);
    assert.equal(await page.locator('.admin-stats .admin-stat-number').first().innerText(), '1');
    await noOverflow();
    assert.deepEqual(errors, []); assert.deepEqual(badAssets, []);
    console.log('former teacher review, transferred pupil historical feedback and desktop layout passed; no page or asset errors');
  } catch (error) {
    if (page) await page.screenshot({ path: '/tmp/writingstar-admin-failure.png', fullPage: true }).catch(() => {});
    console.error(error); process.exitCode = 1;
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})();
