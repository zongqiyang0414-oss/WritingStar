import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocument, enhanceDocument, rectifyDocument } from '../src/platform/documentScan.js';
import { fitRect, projectiveMap, validQuad } from '../src/platform/scanGeometry.js';
import { AutoScanGate } from '../src/platform/autoScan.js';
import { startNativeFrames, takeNativePhoto } from '../src/platform/scanner.js';

const quad = [{ x: .22, y: .1 }, { x: .79, y: .16 }, { x: .88, y: .9 }, { x: .12, y: .84 }];
function fixture(shadow = false) {
  const width = 300, height = 400, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x / (width - 1), py = y / (height - 1);
    const inside = quad.every((p, i) => {
      const q = quad[(i + 1) % 4];
      return (q.x - p.x) * (py - p.y) - (q.y - p.y) * (px - p.x) >= 0;
    });
    let value = inside ? (shadow ? 160 + px * 85 : 235) : 55;
    if (inside && px > .3 && px < .68 && py > .22 && py < .65 && y % 29 < 2) value *= .35;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  return { width, height, data };
}
test('从倾斜且有阴影的纸张识别四角，均匀背景或满屏白纸不伪造边框', () => {
  for (const shadow of [false, true]) {
    const found = analyzeDocument(fixture(shadow));
    assert.ok(found, 'paper must be detected');
    assert.ok(found.confidence > .7);
    found.corners.forEach((p, i) => assert.ok(Math.hypot(p.x - quad[i].x, p.y - quad[i].y) < .035));
  }
  for (const value of [30, 230]) {
    const data = new Uint8ClampedArray(100 * 140 * 4).fill(value);
    assert.equal(analyzeDocument({ width: 100, height: 140, data }), null);
  }
});
test('透视矫正把四个纸角映射到输出角，裁掉纸外桌面，拒绝交叉角点', async () => {
  const source = fixture();
  const output = await rectifyDocument(source, quad, { maxEdge: 500 });
  assert.ok(output.height > output.width);
  // Interior sides must contain paper instead of the background from the source bounding box.
  for (const [x, y] of [[3, 3], [output.width - 4, 3], [3, output.height - 4], [output.width - 4, output.height - 4]])
    assert.ok(output.data[(y * output.width + x) * 4] > 180);
  const project = projectiveMap(quad);
  for (const [i, u, v] of [[0, 0, 0], [1, 1, 0], [2, 1, 1], [3, 0, 1]]) {
    const p = project(u, v); assert.ok(Math.hypot(p.x - quad[i].x, p.y - quad[i].y) < 1e-10);
  }
  const crossed = [quad[0], quad[2], quad[1], quad[3]];
  assert.equal(validQuad(crossed), false);
  await assert.rejects(rectifyDocument(source, crossed), /边线不能交叉/);
});
test('纸面增强提亮阴影，保留浅铅笔灰阶和黑字；处理中可取消', async () => {
  const width = 200, height = 240, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const white = 160 + 70 * x / width;
    const value = y >= 90 && y < 94 ? white * .76 : y >= 120 && y < 124 ? white * .12 : white;
    const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  const result = await enhanceDocument({ width, height, data });
  const sample = (x, y) => result.data[(y * width + x) * 4];
  assert.ok(sample(70, 70) > 230, 'shadow lightened');
  assert.ok(sample(70, 91) > 120 && sample(70, 91) < 210, 'pencil remains gray');
  assert.ok(sample(70, 121) < 50, 'black marks remain dark');
  await assert.rejects(rectifyDocument(fixture(), quad, { cancelled: () => true }), /暂停/);
});
test('自动扫描只在持续稳定时触发，拍后锁定，换页或明确继续后重新等待', () => {
  const gate = new AutoScanGate(), detection = { corners: quad, confidence: .95, fingerprint: Array(192).fill(.8) };
  for (const time of [0, 300, 600, 900]) assert.equal(gate.update(detection, time).capture, false);
  assert.equal(gate.update(detection, 1200).capture, true);
  gate.captured(detection);
  for (const time of [1500, 1800, 2100, 2400, 2700]) assert.equal(gate.update(detection, time).capture, false);
  for (const time of [3000, 3300, 3600, 3900]) gate.update(null, time);
  assert.equal(gate.update(detection, 4200).capture, false);
  for (const time of [4500, 4800, 5100]) gate.update(detection, time);
  assert.equal(gate.update(detection, 5400).capture, true);
  gate.captured(detection); gate.nextPage();
  assert.equal(gate.update(detection, 5700).capture, false);
});
test('抖动、帧中断、短暂遮挡和整体曝光变化不会误触连拍', () => {
  const gate = new AutoScanGate(), detection = { corners: quad, confidence: .9, fingerprint: Array.from({ length: 192 }, (_, i) => .6 + i % 3 * .1) };
  gate.update(detection, 0); gate.update(detection, 300);
  assert.equal(gate.update(detection, 2000).capture, false, 'suspended frame stream resets stability');
  const moved = { ...detection, corners: quad.map(p => ({ x: p.x + .025, y: p.y })) };
  assert.equal(gate.update(moved, 2300).progress, 0);
  gate.captured(detection); gate.update(null, 2600); gate.update(null, 2900);
  for (const time of [3200, 3500, 3800, 4100, 4400]) {
    const result = gate.update({ ...detection, fingerprint: detection.fingerprint.map(v => v + .1) }, time);
    assert.equal(result.capture, false); assert.equal(result.waiting, true);
  }
});
test('相机帧停止后忽略迟到回调，缺失帧能力降级，拍摄使用高清质量', async () => {
  let callback, starts = 0, stops = 0, received = 0, unavailable = 0;
  const stop = startNativeFrames({ onCameraFrame(fn) { callback = fn; return { start() { starts++; }, stop() { stops++; } }; } }, () => received++, () => unavailable++);
  callback({}); stop(); callback({});
  assert.deepEqual([starts, stops, received, unavailable], [1, 1, 1, 0]);
  startNativeFrames({}, () => received++, () => unavailable++)();
  assert.equal(unavailable, 1);
  const path = await takeNativePhoto({ takePhoto(options) { assert.equal(options.quality, 'high'); options.success({ tempImagePath: '/tmp/capture.jpg' }); } });
  assert.equal(path, '/tmp/capture.jpg');
  await assert.rejects(takeNativePhoto({ takePhoto(options) { options.fail(); } }), /拍摄失败/);
});
test('预览cover与调角contain分别映射，不把照片比例直接当成屏幕比例', () => {
  const cover = fitRect(400, 300, 300, 500, true);
  assert.equal(cover.height, 500); assert.equal(cover.top, 0);
  assert.ok(Math.abs(cover.width - 400 * 5 / 3) < 1e-9);
  assert.ok(Math.abs(cover.left - (300 - 400 * 5 / 3) / 2) < 1e-9);
  assert.deepEqual(fitRect(400, 300, 300, 500), { width: 300, height: 225, left: 0, top: 137.5 });
});
