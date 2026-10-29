// Local synthetic camera stream; no real student photos or camera permissions.
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
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
(async () => {
  let browser, page;
  try {
    const base = process.env.WRITINGSTAR_SCAN_URL || await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
    browser = await chromium.launch({ headless: true, executablePath: process.env.WRITINGSTAR_CHROMIUM, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(15000);
    const failures = []; page.on('pageerror', error => failures.push(error.message));
    await page.addInitScript(() => {
      const state = { present: true, denied: false, version: 1, streams: [] };
      window.__scanTest = state;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
        if (state.denied) throw new Error('test permission denied');
        const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 960;
        const ctx = canvas.getContext('2d');
        const draw = () => {
          ctx.fillStyle = '#403c32'; ctx.fillRect(0, 0, 720, 960);
          if (!state.present) return;
          ctx.fillStyle = '#eee9d8'; ctx.beginPath(); ctx.moveTo(155, 95); ctx.lineTo(570, 150); ctx.lineTo(635, 862); ctx.lineTo(85, 805); ctx.closePath(); ctx.fill();
          ctx.save(); ctx.translate(200, 200); ctx.rotate(.08);
          ctx.fillStyle = '#252721'; ctx.font = 'bold 25px sans-serif'; ctx.fillText('WRITINGSTAR', 0, 0);
          ctx.font = '18px sans-serif'; ctx.fillText(`Scan test page ${state.version}`, 0, 48);
          for (let i = 0; i < 9; i++) { ctx.fillStyle = '#777a73'; ctx.fillRect(0, 110 + i * 43, 260 - (i % 3) * 30, 3); }
          ctx.restore();
        };
        draw(); const timer = setInterval(draw, 80), stream = canvas.captureStream(12); state.streams.push(stream);
        const track = stream.getVideoTracks()[0], stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
        return stream;
      } });
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    const button = (name, scope = page) => scope.locator('uni-button').filter({ hasText: name });
    const confirm = async () => { await page.locator('.modal-actions .primary').click(); await page.locator('.modal-card').waitFor({ state: 'hidden' }); };
    await page.locator('.binding-login').click(); await confirm();
    await page.locator('.binding-code input').fill('JS2026'); await button('查看绑定信息').click(); await button('确认绑定，进入').click();
    await button('布置作业').click(); await page.locator('.form-input input').fill('扫描验收');
    await page.locator('.form-card textarea').fill('Synthetic camera test'); await button('发布作业').click();
    await button('代交作业', page.locator('.student-row').filter({ has: page.locator('.strong').filter({ hasText: /^小林$/ }) })).click();
    await button('扫描作业').click(); await page.locator('.scan-outline').waitFor({ timeout: 15000 });
    await page.locator('.scan-shutter').click(); await button('调整边角').waitFor();
    const firstImage = await page.locator('.scan-result img').getAttribute('src');
    assert.ok(firstImage.startsWith('data:image/jpeg;'));
    await page.screenshot({ path: path.resolve(__dirname, '../outputs/scan-processed-2026-10-29.png') });
    assert.ok(await page.evaluate(() => window.__scanTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), 'review releases camera');
    await button('调整边角').click();
    const corner = await page.locator('.scan-corner').first().boundingBox();
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2); await page.mouse.down(); await page.mouse.move(corner.x + 24, corner.y + 24); await page.mouse.up();
    await button('确认并处理').click(); await button('继续扫描').waitFor();
    assert.notEqual(await page.locator('.scan-result img').getAttribute('src'), firstImage);
    await button('继续扫描').click(); await page.locator('.scan-outline').waitFor();
    await page.locator('.scan-mode-toggle').click();
    await page.waitForTimeout(2000); assert.match(await page.locator('.scan-count').innerText(), /^1/);
    await page.evaluate(() => { window.__scanTest.present = false; }); await page.waitForTimeout(1600);
    await page.evaluate(() => { window.__scanTest.present = true; window.__scanTest.version = 2; });
    await page.waitForFunction(() => document.querySelector('.scan-count')?.textContent.startsWith('2'), { timeout: 15000 });
    await page.waitForTimeout(2000); assert.match(await page.locator('.scan-count').innerText(), /^2/);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.resolve(__dirname, '../outputs/scan-camera-2026-10-29.png') });
    await button('完成，添加 2 页').click(); await page.locator('.upload-row').nth(1).waitFor();
    assert.equal(await page.locator('.upload-row').count(), 2);
    assert.ok(await page.evaluate(() => window.__scanTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), 'leaving releases every stream');
    // Permission fallback and importing a full-page source without detectable borders.
    await page.evaluate(() => { window.__scanTest.denied = true; });
    await button('扫描作业').click(); await page.locator('.scan-error').waitFor();
    assert.match(await page.locator('.scan-error').innerText(), /相机/);
    const chooser = page.waitForEvent('filechooser'); await button('从相册扫描').click();
    await (await chooser).setFiles(path.resolve(__dirname, '../src/static/essay-1.png'));
    await button('确认并处理').waitFor(); await button('确认并处理').click(); await button('调整边角').waitFor();
    await button('删除此页').click(); await page.locator('.scan-shutter').waitFor();
    await page.locator('.scan-icon-button').click(); await page.locator('.upload-row').nth(1).waitFor();
    assert.equal(await page.locator('.upload-row').count(), 2, 'cancel/import deletion preserves original submission draft');
    assert.deepEqual(failures, []);
    console.log('Scan browser checks passed: real processing of synthetic frames, corners, auto capture, duplicate lock, page return, permissions, import, deletion, camera release, responsive layout.');
  } catch (error) {
    if (page) { await page.screenshot({ path: '/tmp/writingstar-scan-failure.png' }); console.error((await page.locator('body').innerText()).slice(-1800)); }
    throw error;
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
