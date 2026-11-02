import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImagePdf } from '../src/platform/imagePdf.js';
import { exportWeixinAnswerCards, openWeixinAnswerCards, shareWeixinAnswerCards } from '../src/platform/weixinAnswerCards.js';
import { encodePaperCode } from '../src/services/paperWorkflow.js';

// Binary data deliberately contains line breaks and high bytes: PDF xref and
// image lengths must count bytes, not strings or base64 characters.
const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 10, 128, 13, 10, 255, 217]);
function inspectPdf(buffer: Buffer, count: number) {
  const text = buffer.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes(`/Type /Pages /Count ${count} /Kids [`));
  assert.equal((text.match(/\/Type \/Page\b/g) || []).length, count);
  const start = Number(text.match(/startxref\n(\d+)\n%%EOF/)![1]);
  assert.equal(text.slice(start, start + 4), 'xref');
  const lines = text.slice(start).split('\n');
  const objects = Number(lines[1].split(' ')[1]);
  for (let id = 1; id < objects; id++) {
    const offset = Number(lines[id + 2].slice(0, 10));
    assert.equal(text.slice(offset, offset + `${id} 0 obj`.length), `${id} 0 obj`);
  }
  let position = 0;
  for (let page = 0; page < count; page++) {
    position = buffer.indexOf(jpeg, position);
    assert.notEqual(position, -1);
    position += jpeg.length;
  }
}

function device(failPage = 0) {
  const oldUni = globalThis.uni, oldWx = globalThis.wx;
  const files = new Map<string, Buffer>([['/user/submission.jpg', Buffer.from('original')], ['/user/writingstar-print/old.pdf', Buffer.from('old')]]);
  let rendered = 0, activeRasters = 0, peakRasters = 0;
  const codes: string[] = [], opened: any[] = [], shared: any[] = [];
  const fs = {
    access: o => o.success({}), readdir: o => o.success({files: ['old.pdf']}),
    writeFile: o => {files.set(o.filePath, Buffer.from(o.data)); o.success({});},
    appendFile: o => {files.set(o.filePath, Buffer.concat([files.get(o.filePath)!, Buffer.from(o.data)])); o.success({});},
    readFile: o => {
      if (rendered === failPage) return o.fail({errMsg: 'readFile:fail'});
      o.success({data: jpeg.buffer});
    },
    unlink: o => {if (o.filePath.startsWith('/tmp/')) activeRasters--; files.delete(o.filePath); o.success({});},
  };
  globalThis.wx = {env: {USER_DATA_PATH: '/user'}, getFileSystemManager: () => fs,
    shareFileMessage: o => {shared.push(o); o.success({});}} as any;
  globalThis.uni = {
    getImageInfo: o => o.success({path: o.src}),
    createCanvasContext: (_id, _scope) => new Proxy({}, {get: (_target, name) => (...args) => {
      if (name === 'fillText' && String(args[0]).startsWith('WS1|')) codes.push(args[0]);
      if (name === 'draw') {rendered++; args[1]();}
    }}),
    canvasToTempFilePath: o => {
      assert.equal(o.destWidth, 2382); assert.equal(o.destHeight, 1684); assert.equal(o.fileType, 'jpg');
      activeRasters++; peakRasters = Math.max(peakRasters, activeRasters);
      o.success({tempFilePath: `/tmp/page-${rendered}.jpg`});
    },
    openDocument: o => {opened.push(o); o.success({});},
  } as any;
  return {files, codes, opened, shared, peak: () => peakRasters,
    restore() {globalThis.uni = oldUni; globalThis.wx = oldWx;}};
}
const assignment = {title: '打印验证', requirements: '写一次发现', paperPacket: {pages: 2}};
const cards = Array.from({length: 53}, (_, i) => ({id: `card-${i}`, studentName: `学生${i}`, className: '四年级（1）班'}));

test('PDF二进制流的A4页面、图片长度和xref可定位；拒绝空文件和无效图片', async () => {
  const chunks: Buffer[] = [];
  const pdf = await createImagePdf(async data => {chunks.push(Buffer.from(data));});
  await assert.rejects(pdf.finish(), /暂无/);
  await assert.rejects(pdf.addPage(new ArrayBuffer(2), 1588, 2246), /无效/);
  await pdf.addPage(jpeg.buffer, 1588, 2246);
  await pdf.addPage(jpeg.buffer, 2246, 1588);
  await pdf.finish();
  const buffer = Buffer.concat(chunks);
  inspectPdf(buffer, 2);
  assert.match(buffer.toString('latin1'), /MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(buffer.toString('latin1'), /MediaBox \[0 0 841\.89 595\.28\]/);
  await assert.rejects(pdf.addPage(jpeg.buffer, 1588, 2246), /结束/);
});

test('微信全班106页按学生、页码生成同一PDF，逐页释放图片，保留原作业；可打开并转发', async () => {
  const current = device();
  try {
    const progress: number[] = [];
    const path = await exportWeixinAnswerCards(assignment, cards, {canvasId: 'print', scope: {}, onProgress: done => progress.push(done)});
    inspectPdf(current.files.get(path)!, 106);
    assert.match(current.files.get(path)!.toString('latin1'), /MediaBox \[0 0 1190\.55 841\.89\]/);
    assert.deepEqual(current.codes, cards.flatMap(card => [encodePaperCode(card, 1, 2), encodePaperCode(card, 2, 2)]));
    assert.equal(progress.at(-1), 106); assert.equal(current.peak(), 1);
    assert.equal(current.files.has('/user/writingstar-print/old.pdf'), false);
    assert.equal(current.files.get('/user/submission.jpg')!.toString(), 'original');
    assert.equal(current.opened.length, 0, 'never open a partial PDF');
    await openWeixinAnswerCards(path); await shareWeixinAnswerCards(path);
    assert.equal(current.opened[0].filePath, path); assert.equal(current.opened[0].showMenu, true);
    assert.equal(current.shared[0].filePath, path);
  } finally {current.restore();}
});

test('微信单生导出包括该生全部页，不包含其他学生', async () => {
  const current = device();
  try {
    const path = await exportWeixinAnswerCards(assignment, [cards[1]], {canvasId: 'print', scope: {}});
    inspectPdf(current.files.get(path)!, 2);
    assert.deepEqual(current.codes, [encodePaperCode(cards[1], 1, 2), encodePaperCode(cards[1], 2, 2)]);
  } finally {current.restore();}
});

test('微信生成中读图失败或退出时清除半成品，不打开残缺PDF；打开失败仍可转发完整文件', async () => {
  for (const fail of [true, false]) {
    const current = device(fail ? 2 : 0);
    let stopped = false;
    try {
      await assert.rejects(exportWeixinAnswerCards(assignment, cards, {canvasId: 'print', scope: {}, cancelled: () => stopped,
        onProgress: done => {if (!fail && done === 1) stopped = true;}}), /生成失败|停止/);
      assert.equal([...current.files.keys()].some(path => path.endsWith('.pdf')), false);
      assert.equal(current.opened.length, 0);
    } finally {current.restore();}
  }
  const current = device();
  try {
    const path = await exportWeixinAnswerCards(assignment, [cards[0]], {canvasId: 'print', scope: {}});
    globalThis.uni.openDocument = o => o.fail({errMsg: 'openDocument:fail'});
    await assert.rejects(openWeixinAnswerCards(path), /PDF已生成/);
    inspectPdf(current.files.get(path)!, 2);
    await shareWeixinAnswerCards(path);
    assert.equal(current.shared.length, 1);
  } finally {current.restore();}
});
