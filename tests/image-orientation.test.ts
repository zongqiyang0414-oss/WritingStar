import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix } from '../src/platform/answerCards.js';
import { encodePaperCode } from '../src/services/paperWorkflow.js';
import { readPaperScanMark } from '../src/platform/scanCode.js';
import { rotateImagePixels, createWorkOrientation } from '../src/platform/imageOrientation.js';
import { processScanPixels } from '../src/platform/scanProcessing.js';

function paper(code = encodePaperCode({ id: 'orientation-fixture' }, 1, 2)) {
  const width = 1000, height = 700, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const matrix = qrMatrix(code), unit = 5, left = 110, top = 100;
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix.length; x++) if (matrix[y][x])
    for (let yy = 0; yy < unit; yy++) for (let xx = 0; xx < unit; xx++) {
      const i = (((y + 4) * unit + yy + top) * width + (x + 4) * unit + xx + left) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  // A distinct coloured corner reveals accidental mirror/180-degree results.
  for (let y = 20; y < 40; y++) for (let x = 930; x < 950; x++) {
    const i = (y * width + x) * 4; data[i] = 15; data[i + 1] = 80; data[i + 2] = 170;
  }
  return { width, height, data };
}

test('四种拍摄方向均由有效学生码判正，纠正后RGBA和页码完全一致', async () => {
  const original = paper(), code = readPaperScanMark(original).code;
  for (const turns of [0, 1, 2, 3]) {
    const photographed = await rotateImagePixels(original, turns);
    const mark = readPaperScanMark(photographed);
    assert.equal(mark.code, code); assert.equal(mark.quarterTurns, (4 - turns) % 4);
    const corrected = await rotateImagePixels(photographed, mark.quarterTurns);
    assert.equal(corrected.width, original.width); assert.equal(corrected.height, original.height);
    assert.deepEqual(corrected.data, original.data);
  }
});

test('旋转按已知像素位置复制，保留透明度；无学生码和镜像不盲目转向', async () => {
  const data = Uint8ClampedArray.from([1,2,3,4,5,6].flatMap(n => [n,n+10,n+20,n+30]));
  const rotated = await rotateImagePixels({ width: 3, height: 2, data }, 1);
  assert.equal(rotated.width, 2); assert.equal(rotated.height, 3);
  assert.deepEqual(Array.from(rotated.data), [4,1,5,2,6,3].flatMap(n => [n,n+10,n+20,n+30]));
  assert.equal(readPaperScanMark(paper('https://example.test/unrelated')).quarterTurns, null);
  const original = paper(), mirrored = { ...original, data: original.data.slice() };
  for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
    mirrored.data.set(original.data.subarray((y * original.width + x) * 4, (y * original.width + x + 1) * 4), (y * original.width + original.width - 1 - x) * 4);
  assert.equal(readPaperScanMark(mirrored).quarterTurns, null);
});

test('扫描处理在增强前转正侧拍／倒置的真实学生码纸面', async () => {
  for (const turns of [1, 2, 3]) {
    const result = await processScanPixels(await rotateImagePixels(paper(), turns), null);
    assert.ok(result.image.width > result.image.height);
    assert.equal(readPaperScanMark(result.image).quarterTurns, 0);
    assert.equal(result.code, encodePaperCode({ id: 'orientation-fixture' }, 1, 2));
  }
});

test('查看器校正缓存与手动旋转共用队列，保留原图且释放临时副本', async () => {
  const original = await rotateImagePixels(paper(), 1), exports: any[] = [], removed: string[] = [];
  let reads = 0, disposed = false;
  const editor = createWorkOrientation({ read: async () => { reads++; return original; },
    exportImage: async image => { exports.push(image); return 'temporary:' + exports.length; },
    remove: value => { if (value) removed.push(value); }, dispose: () => { disposed = true; } });
  const [one, cached] = await Promise.all([editor.inspect('original'), editor.inspect('original')]);
  assert.equal(reads, 1); assert.equal(one.url, cached.url); assert.equal(one.quarterTurns, 3);
  assert.deepEqual(original, await rotateImagePixels(paper(), 1));
  const manual = await editor.rotate('original');
  assert.equal(manual.quarterTurns, 0); assert.equal(manual.url, 'original');
  assert.deepEqual(removed, ['temporary:1']); editor.dispose(); assert.equal(disposed, true);
  await assert.rejects(editor.inspect('late'), /关闭/);
});

test('旋转取消不导出迟到结果，已关闭查看器不继续绘制', async () => {
  await assert.rejects(rotateImagePixels(paper(), 1, () => true), /取消/);
  let release: (image: any) => void;
  const read = new Promise(resolve => { release = resolve; });
  const editor = createWorkOrientation({ read: () => read, exportImage: () => assert.fail('late output must never be encoded'), remove() {}, dispose() {} });
  const pending = editor.inspect('pending'); await Promise.resolve(); await Promise.resolve(); editor.dispose(); release!(paper());
  await assert.rejects(pending, /取消|关闭/);
});
