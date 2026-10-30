import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocument } from '../src/platform/documentScan.js';
import { orderQuad, validQuad } from '../src/platform/scanGeometry.js';
import { LivePaperDetector } from '../src/platform/paperScanCapture.js';
import { AutoScanGate } from '../src/platform/autoScan.js';

type Point = { x: number; y: number };
const perspective: Point[] = [{ x: .19, y: .11 }, { x: .81, y: .17 }, { x: .89, y: .87 }, { x: .13, y: .92 }];
function fixture(quad: Point[], options: { paper?: number; desk?: number; shadow?: number; printOnly?: boolean; noise?: number; blur?: boolean } = {}) {
  const width = 420, height = 500, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x / (width - 1), py = y / (height - 1);
    const distances = quad.map((a, i) => {
      const b = quad[(i + 1) % 4];
      return ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
    });
    const inside = distances.every(distance => distance >= 0);
    let value = inside ? (options.paper ?? 235) - (options.shadow ?? 0) * px : (options.desk ?? 65);
    if (options.printOnly) value = inside && Math.min(...distances) < .004 ? 40 : 230;
    if (inside && px > .3 && px < .7 && py > .25 && py < .7 && y % 37 < 2) value = 45;
    value += (options.noise ?? 0) * ((x * 13 + y * 7) % 7 - 3) / 3;
    const index = (y * width + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = value; data[index + 3] = 255;
  }
  if (options.blur) {
    const original = data.slice();
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      const value = (original[index] * 4 + original[index - 4] + original[index + 4] + original[index - width * 4] + original[index + width * 4]) / 8;
      data[index] = data[index + 1] = data[index + 2] = value;
    }
  }
  return { width, height, data };
}
function assertCorners(image, expected: Point[], tolerance = .012) {
  const found = analyzeDocument(image);
  assert.ok(found, 'complete paper must be detected');
  assert.ok(validQuad(found.corners), 'corners remain clockwise and convex');
  assert.ok(found.confidence >= .75, `border confidence ${found.confidence}`);
  // A rotation can change which physical corner is top-left without changing
  // the quadrilateral. Compare the geometric corners rather than image labels.
  for (const point of expected) {
    const error = Math.min(...found.corners.map(actual => Math.hypot(point.x - actual.x, point.y - actual.y)));
    assert.ok(error < tolerance, `corner (${point.x}, ${point.y}) error ${error}`);
  }
  return found;
}

test('浅色桌面的低对比纸边仍可识别，并贴合实际外边而非扩张轮廓', () => {
  assertCorners(fixture(perspective, { paper: 235, desk: 223, noise: 1, blur: true }), perspective);
});
test('亮背景上的较暗纸张、倾斜梯形和纸面阴影保留四边', () => {
  assertCorners(fixture(perspective, { paper: 170, desk: 230, noise: 2 }), perspective);
  assertCorners(fixture(perspective, { paper: 240, desk: 75, shadow: 110, noise: 2, blur: true }), perspective);
});
test('旋转纸张在斜角方向保持真实四角和横版形状', () => {
  const angle = 32 * Math.PI / 180;
  const rotated = orderQuad([[-.29, -.22], [.29, -.22], [.29, .22], [-.29, .22]].map(([x, y]) => ({
    x: .5 + x * Math.cos(angle) - y * Math.sin(angle), y: .5 + x * Math.sin(angle) + y * Math.cos(angle),
  })));
  assertCorners(fixture(rotated, { paper: 230, desk: 190, blur: true }), rotated);
});
test('只有印刷矩形和文字的满屏纸面不能误识别成完整纸张', () => {
  assert.equal(analyzeDocument(fixture(perspective, { printOnly: true })), null);
});
test('被画面截断的纸张、空白背景和细小噪声不补造四角', () => {
  const clipped = [{ x: -.07, y: .1 }, { x: .8, y: .15 }, { x: .86, y: 1.1 }, { x: -.03, y: .95 }];
  assert.equal(analyzeDocument(fixture(clipped)), null);
  assert.equal(analyzeDocument(fixture(perspective, { paper: 230, desk: 230, noise: 2 })), null);
  assert.equal(analyzeDocument({ width: 0, height: 0, data: new Uint8ClampedArray() }), null);
});

test('叠放纸张与纸面渐变阴影时识别最上层页面，保留印刷框外页边', () => {
  const front = [{x:.2,y:.105},{x:.945,y:.109},{x:.95,y:.908},{x:.186,y:.892}];
  const back = [{x:.18,y:.04},{x:.81,y:.36},{x:.34,y:.98},{x:-.2,y:.69}];
  const image = fixture(front);
  const inside = (quad, x, y) => quad.every((a,i) => { const b=quad[(i+1)%4]; return (b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)>=0; });
  for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
    const px=x/(image.width-1),py=y/(image.height-1),onFront=inside(front,px,py);
    let value=onFront ? 178+50*px : inside(back,px,py) ? 165+25*px : 65+30*py;
    if(onFront && px>.28 && px<.86 && py>.18 && py<.82 && (px<.285 || px>.855 || py<.185 || py>.815)) value=55;
    const i=(y*image.width+x)*4; image.data[i]=image.data[i+1]=image.data[i+2]=value;
  }
  assertCorners(image,front,.022);
});

function woodDeskFixture() {
  // A taller desk/table edge is a complete, individually supported rectangle.
  // The real paper stops above it. Its shadowed lower half has desk-like luma,
  // while neutral chromaticity remains distinct from the warm wood grain.
  const paper = [{ x: .23, y: .17 }, { x: .84, y: .18 }, { x: .83, y: .81 }, { x: .21, y: .79 }];
  const falseOutline = [{ x: .23, y: .17 }, { x: .84, y: .18 }, { x: .827, y: .92 }, { x: .207, y: .92 }];
  const image = fixture(paper);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const px = x / (image.width - 1), py = y / (image.height - 1);
    const inside = paper.every((a, i) => { const b = paper[(i + 1) % 4]; return (b.x-a.x)*(py-a.y)-(b.y-a.y)*(px-a.x) >= 0; });
    const wood = 174 + 9 * Math.sin(y * .65 + x * .04), shade = 228 - 80 * py;
    let rgb = inside ? [shade + 3, shade, shade - 2] : py > .92 ? [60, 57, 43] : [wood + 9, wood + 6, wood - 15];
    // Printed inner frame and handwritten lines are content, not crop borders.
    if (inside && px > .28 && px < .78 && py > .23 && py < .74 && (px < .284 || px > .776 || py < .234 || py > .736)) rgb = [45, 43, 42];
    const i = (y * image.width + x) * 4; image.data[i] = rgb[0]; image.data[i+1] = rgb[1]; image.data[i+2] = rgb[2];
  }
  return { image, paper, falseOutline };
}

test('色度材料分割在阴影纸张与浅色木纹桌面之间定位真实下沿，不采用更大桌沿', () => {
  const { image, paper } = woodDeskFixture();
  assertCorners(image, paper, .018);
});

test('含桌面条带的旧框不能仅凭四边线继续跟踪，重新检测恢复真实纸边', () => {
  const { image, paper, falseOutline } = woodDeskFixture();
  const wrong = analyzeDocument(image, { previousCorners: falseOutline, trackingOnly: true });
  assert.equal(wrong, null, 'a material seam inside the old crop invalidates tracking');
  const fresh = assertCorners(image, paper, .018);
  const tracked = analyzeDocument(image, { previousCorners: fresh.corners, trackingOnly: true });
  assert.ok(tracked, 'the physical paper remains trackable');
});

test('纸与桌面亮度近似时使用色度边界，不靠强灰度对比', () => {
  const image = fixture(perspective);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const px = x / (image.width - 1), py = y / (image.height - 1);
    const inside = perspective.every((a, i) => { const b = perspective[(i + 1) % 4]; return (b.x-a.x)*(py-a.y)-(b.y-a.y)*(px-a.x) >= 0; });
    const rgb = inside ? [191, 191, 191] : [204, 189, 170];
    const i = (y * image.width + x) * 4; image.data[i]=rgb[0]; image.data[i+1]=rgb[1]; image.data[i+2]=rgb[2];
  }
  const fresh = assertCorners(image, perspective, .014);
  assert.ok(analyzeDocument(image, { previousCorners: fresh.corners, trackingOnly: true }));
  const detector = new LivePaperDetector(), gate = new AutoScanGate();
  for (let time = 0; time <= 1200; time += 200) {
    const detection = detector.update(image, time);
    assert.ok(detection, 'equal-luminance paper supplies every consecutive frame');
    assert.equal(gate.update(detection, time).capture, time === 1200, 'stable chromatic edges complete the auto-shutter hold');
  }
});
