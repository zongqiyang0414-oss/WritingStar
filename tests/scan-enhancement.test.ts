import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enhanceDocument } from '../src/platform/documentScan.js';

function fixture(width = 320, height = 400) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Warm room lighting with a broad gradient and a soft fold shadow.
    const shade = .53 + .37 * x / width - .10 * Math.exp(-Math.pow((x - width * .45) / 22, 2));
    const i = (y * width + x) * 4;
    data[i] = 245 * shade; data[i + 1] = 231 * shade; data[i + 2] = 215 * shade; data[i + 3] = 255;
  }
  return { width, height, data };
}
function mark(image, left, top, width, height, reflectance) {
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
    const i = (y * image.width + x) * 4;
    for (let c = 0; c < 3; c++) image.data[i + c] *= reflectance[c];
  }
}
const pixel = (image, x, y) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 3));

test('分离纸色与阴影，蓝笔红章保色，浅铅笔和单像素边框仍可辨', async () => {
  const image = fixture();
  mark(image, 40, 80, 230, 1, [.1, .1, .1]);
  mark(image, 40, 130, 230, 2, [.94, .94, .94]);
  mark(image, 40, 170, 230, 3, [.77, .77, .77]);
  mark(image, 55, 220, 200, 5, [.15, .3, .8]);
  mark(image, 200, 270, 45, 45, [.8, .15, .16]);
  await enhanceDocument(image);
  for (const x of [10, 80, 145, 220, 300]) {
    const white = pixel(image, x, 40);
    assert.ok(Math.min(...white) >= 248, `shadow and colour cast must be removed at ${x}: ${white}`);
    assert.ok(Math.max(...white) - Math.min(...white) <= 5);
  }
  assert.ok(Math.max(...pixel(image, 120, 80)) < 40, 'single-pixel black frame retained');
  const pale = pixel(image, 120, 130)[0], pencil = pixel(image, 120, 171)[0];
  assert.ok(pale < 246 && pale > 210, `6% pencil must remain grey: ${pale}`);
  assert.ok(pencil < 210 && pencil > 120, `pencil midtones retained: ${pencil}`);
  const blue = pixel(image, 120, 222), red = pixel(image, 222, 290);
  assert.ok(blue[2] - blue[0] > 100 && blue[2] - blue[1] > 70, `blue ink: ${blue}`);
  assert.ok(red[0] - red[1] > 100 && red[0] - red[2] > 100, `red stamp: ${red}`);
});

test('填满多个照明采样格的粗灰笔不会被误提成白纸', async () => {
  const image = fixture();
  mark(image, 180, 140, 40, 90, [.6, .6, .6]);
  await enhanceDocument(image);
  const grey = pixel(image, 200, 180);
  assert.ok(Math.max(...grey) < 190 && Math.min(...grey) > 80, `broad grey foreground remains visible: ${grey}`);
  assert.ok(Math.min(...pixel(image, 245, 180)) >= 245, 'neighboring paper remains white');
});

test('增强在采样前与让出UI后均响应取消，不返回迟到成片', async () => {
  await assert.rejects(enhanceDocument(fixture(), () => true), /暂停/);
  let cancelled = false;
  const timer = setTimeout(() => { cancelled = true; }, 0);
  await assert.rejects(enhanceDocument(fixture(1400, 1800), () => cancelled), /暂停/);
  clearTimeout(timer);
});

test('有纸底颗粒的阴影作业提白，同时保留虚线、浅铅笔和红蓝色', async () => {
  const image = fixture();
  let seed = 71;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = (seed / 4294967296 - .5) * 10;
    for (let c = 0; c < 3; c++) image.data[i + c] += grain;
  }
  for (let x = 40; x < 270; x += 8) mark(image, x, 80, 4, 1, [.1, .1, .1]);
  mark(image, 40, 130, 230, 1, [.94, .94, .94]);
  mark(image, 40, 170, 230, 3, [.77, .77, .77]);
  mark(image, 55, 220, 200, 5, [.15, .3, .8]);
  mark(image, 200, 270, 45, 45, [.8, .15, .16]);
  await enhanceDocument(image);
  const paper = [];
  for (let y = 25; y < 65; y++) for (let x = 30; x < 290; x++) paper.push(pixel(image, x, y)[0]);
  paper.sort((a, b) => a - b);
  assert.ok(paper[Math.floor(paper.length * .1)] >= 248, `90% of textured paper is near white: ${paper[Math.floor(paper.length * .1)]}`);
  assert.ok(paper[Math.floor(paper.length * .5)] >= 253, 'paper median is white');
  assert.ok(pixel(image, 120, 80)[0] < 45, 'one-pixel dashed frame retained');
  assert.ok(pixel(image, 126, 80)[0] > 235, 'dash gap remains open');
  const pencil = pixel(image, 120, 130)[0];
  assert.ok(pencil > 210 && pencil < 246, `faint pencil is not whitened: ${pencil}`);
  assert.ok(pixel(image, 120, 171)[0] < 210, 'ordinary pencil remains visible');
  const blue = pixel(image, 120, 222), red = pixel(image, 222, 290);
  assert.ok(blue[2] - blue[0] > 100 && blue[2] - blue[1] > 70);
  assert.ok(red[0] - red[1] > 100 && red[0] - red[2] > 100);
});
