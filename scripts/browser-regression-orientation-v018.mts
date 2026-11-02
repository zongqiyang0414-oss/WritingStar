import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { MockService, clone } from '../src/services/mock.js';
import { encodePaperCode } from '../src/services/paperWorkflow.js';
import { qrMatrix } from '../src/platform/answerCards.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve('dist/client');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url!, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const types: any = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
let browser;
try {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
  const page = await context.newPage(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(20_000);
  const images = await page.evaluate(matrix => {
    const paper = document.createElement('canvas'); paper.width = 1000; paper.height = 700; const c = paper.getContext('2d')!;
    c.fillStyle = '#fff'; c.fillRect(0, 0, 1000, 700); c.fillStyle = '#0f50aa'; c.fillRect(930, 20, 20, 20);
    c.fillStyle = '#263d34'; c.font = '30px sans-serif'; c.fillText('Upright landscape homework', 110, 60);
    c.fillStyle = '#000'; const unit = 5;
    matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) c.fillRect(110 + (x + 4) * unit, 100 + (y + 4) * unit, unit, unit); }));
    const result = [];
    for (let turns = 0; turns < 4; turns++) {
      const out = document.createElement('canvas'); out.width = turns % 2 ? 700 : 1000; out.height = turns % 2 ? 1000 : 700;
      const ctx = out.getContext('2d')!; ctx.translate(out.width / 2, out.height / 2); ctx.rotate(turns * Math.PI / 2); ctx.drawImage(paper, -500, -350); result.push(out.toDataURL('image/png'));
    }
    const unknown = document.createElement('canvas'); unknown.width = 480; unknown.height = 640; const ctx = unknown.getContext('2d')!;
    ctx.fillStyle = '#f8f5ed'; ctx.fillRect(0, 0, 480, 640); ctx.fillStyle = '#375c82'; ctx.fillRect(30, 40, 100, 60); result.push(unknown.toDataURL('image/png'));
    return result;
  }, qrMatrix(encodePaperCode({ id: 'browser-direction-fixture' }, 1, 2)));
  let saved: any = null;
  const service = new MockService({ read: () => clone(saved), write: value => { saved = clone(value); } });
  for (const [role, code] of [['teacher', 'JS2026'], ['student', 'XS2026']]) { await service.signIn(role); await service.bindInvitation(code, role); }
  const assignment = await service.createAssignment({ title: '方向矫正验收', classId: 'class-1', dueAt: '', requirements: '' }, 'teacher');
  const submission = await service.submit(assignment.id, images.map((url, n) => ({ id: 'direction-' + n, url, name: 'synthetic-' + n + '.png', sample: false })), '', 'student');
  const state = service.read(), item = state.submissions.find(item => item.id === submission.id); item.status = 'pending'; item.aiReview.state = 'unavailable'; service.commit(state);
  await context.addInitScript(state => { if (!localStorage.getItem('jiaxiu-prototype-v1')) localStorage.setItem('jiaxiu-prototype-v1', JSON.stringify(state)); }, service.read());
  await page.goto(base, { waitUntil: 'networkidle' });
  const button = (text: any, scope: any = page) => scope.locator('uni-button').filter({ hasText: text });
  await button('学生', page.locator('.role-picker')).click(); await button('记录', page.locator('.bottom-nav')).click();
  await button('查看作品与批阅进度', page.locator('.submission-record').filter({ hasText: '方向矫正验收' })).click();
  const viewer = page.locator('.work-viewer'); await viewer.waitFor();
  const ready = async () => {
    await page.waitForFunction(() => {
      const image = document.querySelector('.work-viewer-image img') as HTMLImageElement;
      return image?.complete && image.naturalWidth > 0 && !document.querySelector('.work-viewer-rotate')?.hasAttribute('disabled');
    });
  };
  for (let n = 0; n < 4; n++) {
    if (n) await button('下一页', viewer).click();
    await ready();
    const shown = await viewer.locator('.work-viewer-image img').evaluate((image: HTMLImageElement) => {
      const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight; const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return { width: c.width, height: c.height, marker: Array.from(ctx.getImageData(940, 30, 1, 1).data), src: image.src };
    });
    assert.equal(shown.width, 1000, `page ${n} is landscape`); assert.equal(shown.height, 700);
    assert.ok(shown.marker[2] > shown.marker[0] + 80, `page ${n} retains blue top-right corner`);
    if (n) assert.notEqual(shown.src, images[n], `page ${n} uses an upright derivative`);
  }
  await viewer.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'outputs/v018-auto-orientation.png' });
  await button('下一页', viewer).click(); await ready();
  assert.equal(await viewer.locator('.work-viewer-image img').getAttribute('src'), images[4], 'unknown photo remains unchanged');
  await viewer.locator('.work-viewer-rotate').click(); await ready();
  assert.equal(await viewer.locator('.work-viewer-image img').evaluate((image: HTMLImageElement) => image.naturalWidth), 640);
  // Native/full-image preview receives corrected URLs for all four known pages.
  await viewer.locator('.work-viewer-image').click();
  await page.locator('#u-a-p img').first().waitFor();
  const previewUrls = await page.locator('#u-a-p img').evaluateAll(images => images.map((image: HTMLImageElement) => image.src));
  assert.equal(previewUrls.length, 5);
  assert.ok(previewUrls.slice(1).every((url: string, n: number) => url !== images[n + 1]));
  await page.waitForFunction(() => [...document.querySelectorAll('#u-a-p img')].every((image: any) => image.complete && image.naturalWidth > image.naturalHeight));
  await page.keyboard.press('Escape');
  const preserved = await page.evaluate(id => JSON.parse(localStorage.getItem('jiaxiu-prototype-v1')!).submissions.find((s: any) => s.id === id).photos.map((p: any) => p.url), submission.id);
  assert.deepEqual(preserved, images, 'stored originals remain unchanged'); assert.deepEqual(errors, []);
  console.log('Orientation browser checks passed: four QR directions render upright, unknown image stays intact, manual rotation works, stored originals remain unchanged, and all full-image preview pages use corrected images.');
} finally { await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
