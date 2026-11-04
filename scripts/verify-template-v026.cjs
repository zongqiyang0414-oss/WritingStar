const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.WRITINGSTAR_TEST_URL || 'http://127.0.0.1:5173', { waitUntil: 'networkidle' });
    const directory = path.resolve(__dirname, '../outputs'); fs.mkdirSync(directory, { recursive: true });
    await page.exposeFunction('saveTemplateArtifact', (name, value) => fs.writeFileSync(path.join(directory, name), Buffer.from(value.split(',')[1], 'base64')));
    const result = await page.evaluate(async () => {
      const { answerCardImage, cardQrRegions, CARD_WIDTH, CARD_HEIGHT, drawAnswerCard, loadAnswerCardBackground, loadAnswerCardIllustration } = await import('/src/platform/answerCards.js');
      const { encodePaperCode } = await import('/src/services/paperWorkflow.js');
      const { readPaperScanCode } = await import('/src/platform/scanCode.js');
      const { PAPER_TEMPLATES } = await import('/src/platform/paperTemplates.js');
      const { detectTemplateDocument } = await import('/src/platform/templateScan.js');
      const card = { id: 'printed-template-v026-fixture', studentName: '示例学生', studentNumber: '20260001', className: '四年级（1）班' };
      const illustrationCanvas = document.createElement('canvas'); illustrationCanvas.width = 600; illustrationCanvas.height = 240;
      const illustrationContext = illustrationCanvas.getContext('2d');
      illustrationContext.fillStyle = '#edf4ef'; illustrationContext.fillRect(0, 0, 600, 240);
      illustrationContext.fillStyle = '#26765a'; illustrationContext.fillRect(60, 55, 110, 110); illustrationContext.beginPath(); illustrationContext.arc(300, 110, 60, 0, Math.PI * 2); illustrationContext.fill();
      illustrationContext.font = '32px sans-serif'; illustrationContext.fillText('观察形状与色彩', 370, 120);
      const assignment = { title: '校园里的一次发现', requirements: '1. 观察校园中的一处景物，写清它的样子。\n2. 写下你的新发现和真实感受。\n3. 书写工整，注意段落安排，按页序提交。', illustration: illustrationCanvas.toDataURL('image/png'), paperPacket: { pages: 2 } };
      const pages = [];
      for (const paperPage of [1, 2]) {
        const encoded = await answerCardImage(assignment, card, paperPage, 2);
        await window.saveTemplateArtifact(`v026-template-page-${paperPage}.png`, encoded);
        const image = new Image(); image.src = encoded; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const expected = encodePaperCode(card, paperPage, 2), copies = [];
        // Decode each actual raster crop independently, including JPEG pixels
        // used by the native PDF path, with the other two codes covered.
        const jpegImage = new Image(); jpegImage.src = canvas.toDataURL('image/jpeg', .9); await jpegImage.decode();
        const jpeg = document.createElement('canvas'); jpeg.width = canvas.width; jpeg.height = canvas.height;
        const jpg = jpeg.getContext('2d'); jpg.drawImage(jpegImage, 0, 0);
        for (let copy = 0; copy < 3; copy++) {
          const region = cardQrRegions(paperPage)[copy];
          const decoded = [ctx, jpg].map(source => readPaperScanCode(source.getImageData(region.x * 2, region.y * 2, region.width * 2, region.height * 2)));
          const single = document.createElement('canvas'); single.width = canvas.width; single.height = canvas.height;
          const one = single.getContext('2d'); one.drawImage(canvas, 0, 0); one.fillStyle = '#ffffff';
          cardQrRegions(paperPage).forEach((box, index) => { if (index !== copy) one.fillRect(box.x * 2, box.y * 2, box.width * 2, box.height * 2); });
          decoded.push(readPaperScanCode(one.getImageData(0, 0, single.width, single.height)));
          copies.push(decoded);
        }
        const templateCanvas = document.createElement('canvas'); templateCanvas.width = 640; templateCanvas.height = Math.round(640 * CARD_HEIGHT / CARD_WIDTH);
        const templateContext = templateCanvas.getContext('2d'); templateContext.drawImage(canvas, 0, 0, templateCanvas.width, templateCanvas.height);
        const templateId = detectTemplateDocument(templateContext.getImageData(0, 0, templateCanvas.width, templateCanvas.height))?.templateId;
        // All measured registration pixels must match the untouched bottom art.
        const background = await loadAnswerCardBackground(paperPage), base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
        const baseContext = base.getContext('2d'); baseContext.drawImage(background, 0, 0, base.width, base.height);
        let changedMarkBytes = 0;
        for (const mark of PAPER_TEMPLATES[paperPage - 1].marks) {
          const x = Math.floor(mark.x * 2), y = Math.floor(mark.y * 2), width = Math.ceil(mark.width * 2), height = Math.ceil(mark.height * 2);
          const before = baseContext.getImageData(x, y, width, height).data, after = ctx.getImageData(x, y, width, height).data;
          changedMarkBytes += before.reduce((total, byte, index) => total + Number(byte !== after[index]), 0);
        }
        pages.push({ page: paperPage, expected, copies, templateId, changedMarkBytes });
      }
      const longTitle = '春天的校园里有许多值得我们细细观察的美好事物请用自己的语言记录下你的一次发现和真实感受吧';
      await window.saveTemplateArtifact('v026-template-long-title.png', await answerCardImage({ ...assignment, title: longTitle }, card, 1, 2));
      // Browser and mini-program canvas share the same aspect-fit instruction.
      const nativeImages = [], illustration = await loadAnswerCardIllustration(assignment.illustration), background = await loadAnswerCardBackground(1);
      const ctx = new Proxy({}, { get: (_target, key) => (...args) => { if (key === 'drawImage') nativeImages.push(args); } });
      drawAnswerCard(ctx, assignment, card, 1, background, illustration);
      const imageInstruction = nativeImages[1];
      return { pages, illustration: { x: imageInstruction[1], y: imageInstruction[2], width: imageInstruction[3], height: imageInstruction[4] } };
    });
    for (const paper of result.pages) {
      for (const copy of paper.copies) assert.deepEqual(copy, [paper.expected, paper.expected, paper.expected]);
      assert.equal(paper.templateId, paper.page === 1 ? 'fangyuan-front-v1' : 'fangyuan-back-v1');
      assert.equal(paper.changedMarkBytes, 0);
    }
    assert.equal(result.illustration.width / result.illustration.height, 600 / 240);
    assert.ok(result.illustration.x >= 64 && result.illustration.y >= 453);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
