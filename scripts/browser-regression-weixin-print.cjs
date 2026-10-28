// Run with the H5 development server active. Native file/canvas APIs are
// adapters around real browser canvases; WeChat menus still require a device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core');
const base = process.env.WRITINGSTAR_TEST_URL || 'http://127.0.0.1:5173';
const root = path.resolve(__dirname, '..');

(async () => {
  const template = fs.readFileSync(path.join(root, 'dist/build/mp-weixin/components/AnswerCardPanel.wxml'), 'utf8');
  assert.match(template, /bindtap="[^"]+">打印 \/ 下载此生 PDF/);
  assert.match(template, /bindtap="[^"]+">打印全班/);
  assert.doesNotMatch(template, /保存第.*页答题卡供打印/);
  const browser = await chromium.launch({executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const context = await browser.newContext({viewport: {width: 390, height: 900}});
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' || /^(blob|data):/.test(route.request().url()) ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes)
        if (node.tagName === 'IFRAME' && node.title?.includes('答题卡打印')) node.contentWindow.print = () => {
          window.__printPages = node.contentDocument.images.length;
          node.contentWindow.dispatchEvent(new Event('afterprint'));
        };
    }).observe(document, {childList: true, subtree: true}));
    await page.goto(base, {waitUntil: 'networkidle'});
    const button = text => page.locator('uni-button').filter({hasText: text});
    await page.locator('.binding-login').click(); await page.locator('.binding-code input').fill('JS2026');
    await button('查看绑定信息').click(); await button(/^\s*确认\s*$/).click(); await page.locator('.greeting').waitFor();
    await button('布置作业').click(); await page.locator('.form-input input').fill('微信打印入口验证'); await button('发布作业').click();
    await button('查看 / 打印答题卡').click(); await page.locator('.paper-preview-image').waitFor();
    assert.equal(await button('打印 / 下载此生 PDF').count(), 1);
    assert.match(await button('打印全班').innerText(), /106 页/);
    await button('打印 / 下载此生 PDF').click(); await page.waitForFunction(() => window.__printPages === 2);
    assert.equal(await button('转发已生成 PDF').count(), 0);
    await page.exposeFunction('persistPdf', (name, encoded) => fs.writeFileSync(`/tmp/${name}`, Buffer.from(encoded, 'base64')));
    const result = await page.evaluate(async () => {
      const {exportWeixinAnswerCards, openWeixinAnswerCards, shareWeixinAnswerCards} = await import('/src/platform/weixinAnswerCards.js');
      const {encodePaperCode} = await import('/src/services/paperWorkflow.js');
      const {readStudentCode} = await import('/src/platform/documentScanner.js');
      const assignment = {title: '真实画布打印验证', requirements: '记录秋天的一次发现。', paperPacket: {pages: 2}};
      const cards = Array.from({length: 53}, (_, i) => ({id: `print-${i}`, studentName: `测试学生${i + 1}`, className: '测试班'}));
      const files = new Map(), rasters = new Map(), qrCodes = [];
      let frame, completed = 0, opened = 0, shared = 0, peak = 0;
      const fs = {
        access: o => o.success({}), readdir: o => o.success({files: []}),
        writeFile: o => {files.set(o.filePath, []); o.success({});},
        appendFile: o => {files.get(o.filePath).push(o.data); o.success({});},
        readFile: o => o.success({data: rasters.get(o.filePath)}),
        unlink: o => {rasters.delete(o.filePath); files.delete(o.filePath); o.success({});},
      };
      globalThis.wx = {env: {USER_DATA_PATH: '/user'}, getFileSystemManager: () => fs,
        shareFileMessage: o => {shared++; o.success({});}};
      globalThis.uni = {
        createCanvasContext: () => {
          frame = document.createElement('canvas'); frame.width = 794; frame.height = 1123;
          const ctx = frame.getContext('2d');
          return {setFillStyle: value => ctx.fillStyle = value, setStrokeStyle: value => ctx.strokeStyle = value,
            setFontSize: value => ctx.font = `${value}px sans-serif`, setLineWidth: value => ctx.lineWidth = value,
            fillRect: (...args) => ctx.fillRect(...args), fillText: (...args) => ctx.fillText(...args),
            beginPath: () => ctx.beginPath(), moveTo: (...args) => ctx.moveTo(...args), lineTo: (...args) => ctx.lineTo(...args), stroke: () => ctx.stroke(),
            draw: (_reserve, done) => done()};
        },
        canvasToTempFilePath: async o => {
          const canvas = document.createElement('canvas'); canvas.width = o.destWidth; canvas.height = o.destHeight;
          const ctx = canvas.getContext('2d'); ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', o.quality));
          if (completed === 0 || completed === 105) {
            const image = await createImageBitmap(blob); ctx.drawImage(image, 0, 0);
            qrCodes.push(readStudentCode(ctx.getImageData(0, 0, canvas.width, canvas.height))); image.close();
          }
          const name = `/tmp/card-${completed++}.jpg`; rasters.set(name, await blob.arrayBuffer()); peak = Math.max(peak, rasters.size);
          canvas.width = canvas.height = 0; frame.width = frame.height = 0;
          o.success({tempFilePath: name});
        },
        openDocument: o => {if (!o.showMenu || o.fileType !== 'pdf') throw new Error('Missing PDF menu'); opened++; o.success({});},
      };
      const options = {canvasId: 'print', scope: {}};
      async function save(filePath, name) {
        const blob = new Blob(files.get(filePath), {type: 'application/pdf'});
        const encoded = await new Promise(resolve => {const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob);});
        await window.persistPdf(name, encoded); return blob.size;
      }
      const all = await exportWeixinAnswerCards(assignment, cards, options);
      const classBytes = await save(all, 'writingstar-weixin-class-106-pages.pdf');
      await openWeixinAnswerCards(all); await shareWeixinAnswerCards(all);
      const single = await exportWeixinAnswerCards(assignment, [cards[0]], options);
      const singleBytes = await save(single, 'writingstar-weixin-single-2-pages.pdf');
      return {classBytes, singleBytes, peak, opened, shared, qrCodes, expected: [encodePaperCode(cards[0], 1, 2), encodePaperCode(cards[52], 2, 2)]};
    });
    assert.deepEqual(result.qrCodes, result.expected);
    assert.equal(result.peak, 1); assert.equal(result.opened, 1); assert.equal(result.shared, 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({compiledWeixinButtons: true, h5SinglePages: 2, ...result}));
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
