import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoScanGate } from '../src/platform/autoScan.js';

const corners = [{ x: .2, y: .12 }, { x: .8, y: .15 }, { x: .84, y: .88 }, { x: .17, y: .85 }];
const paper = { corners, confidence: .9, fingerprint: Array.from({ length: 192 }, (_, i) => .6 + i % 3 * .1) };
const translate = (x: number) => ({ ...paper, corners: corners.map(p => ({ x: p.x + x, y: p.y })) });

test('一个角的像素抖动不反复清零，稳定1.2秒只发出一次拍摄信号', () => {
  const gate = new AutoScanGate();
  for (let time = 0; time <= 1200; time += 200) {
    const jittered = { ...paper, corners: corners.map((p, i) => ({ ...p, x: p.x + (i === 0 && time % 400 ? .025 : 0) })) };
    const state = gate.update(jittered, time);
    assert.equal(state.capture, time === 1200);
    assert.equal(state.progress, time / 1200);
  }
  assert.equal(gate.update(paper, 1400).capture, false);
});

test('一次短暂漏检或置信度下降保留进度，但漏检时段不计入稳定时间', () => {
  for (const miss of [null, { ...paper, confidence: .69 }]) {
    const gate = new AutoScanGate();
    gate.update(paper, 0); gate.update(paper, 200); gate.update(paper, 400);
    const paused = gate.update(miss, 600);
    assert.equal(paused.capture, false); assert.equal(paused.progress, 1 / 3);
    assert.equal(gate.update(paper, 800).progress, 1 / 3);
    for (const time of [1000, 1200, 1400]) assert.equal(gate.update(paper, time).capture, false);
    assert.equal(gate.update(paper, 1600).capture, true);
  }
});

test('整体移动和缓慢漂移重新等待，固定锚点不随纸张追踪而误判稳定', () => {
  const gate = new AutoScanGate();
  gate.update(paper, 0); gate.update(paper, 200);
  const moved = gate.update(translate(.025), 400);
  assert.equal(moved.progress, 0); assert.equal(moved.reason, 'moving');
  gate.nextPage();
  for (let index = 0; index <= 20; index++) assert.equal(gate.update(translate(index * .005), index * 200).capture, false);
});

test('持续漏检、相机暂停、重复帧与倒退时间不能完成倒计时', () => {
  const gate = new AutoScanGate();
  gate.update(paper, 0); gate.update(paper, 200); gate.update(paper, 400);
  gate.update(null, 600); gate.update(null, 800); gate.update(null, 1000);
  assert.equal(gate.update(paper, 1200).progress, 0);
  assert.equal(gate.update(paper, 4000).progress, 0);
  assert.equal(gate.update(paper, 4000).capture, false);
  assert.equal(gate.update(paper, 3900).capture, false);
  assert.equal(gate.update(paper, Number.NaN).capture, false);
  assert.equal(gate.update({ ...paper, corners: [] }, 4200).capture, false);
});

test('拍后置信度下降或角标候选不能解锁，同页曝光变化不连拍', () => {
  const gate = new AutoScanGate(); gate.captured(paper);
  for (const time of [0, 200, 400, 600, 800, 1000, 1200]) {
    const state = gate.update({ ...paper, confidence: .5 }, time);
    assert.equal(state.waiting, true); assert.equal(state.capture, false);
  }
  for (const time of [1400, 1600, 1800, 2000, 2200, 2400]) {
    assert.equal(gate.update({ ...paper, autoEligible: false }, time).waiting, true);
  }
  for (const time of [2600, 2800, 3000, 3200, 3400, 3600]) {
    assert.equal(gate.update({ ...paper, fingerprint: paper.fingerprint.map(value => value + .1) }, time).waiting, true);
  }
  gate.nextPage();
  for (const time of [3800, 4000, 4200, 4400, 4600, 4800, 5000]) {
    assert.equal(gate.update({ ...paper, autoEligible: false }, time).capture, false);
  }
  assert.equal(gate.update(paper, 5200).progress, 0);
});

test('持续移开页面或稳定新页面内容后重新等待，不在换页途中拍摄', () => {
  const gate = new AutoScanGate(); gate.captured(paper);
  for (const time of [0, 200, 400, 600, 800]) assert.equal(gate.update(null, time).waiting, true);
  assert.equal(gate.update(null, 1000).waiting, false);
  for (const time of [1200, 1400, 1600, 1800, 2000, 2200]) assert.equal(gate.update(paper, time).capture, false);
  assert.equal(gate.update(paper, 2400).capture, true);
  gate.captured(paper);
  const next = { ...paper, fingerprint: paper.fingerprint.map((value, i) => value + (i % 2 ? .2 : -.2)) };
  for (const time of [2600, 2800, 3000, 3200, 3400]) assert.equal(gate.update(next, time).waiting, true);
  const rearmed = gate.update(next, 3600);
  assert.equal(rearmed.waiting, false); assert.equal(rearmed.progress, 0); assert.equal(rearmed.capture, false);
  for (const time of [3800, 4000, 4200, 4400, 4600]) assert.equal(gate.update(next, time).capture, false);
  assert.equal(gate.update(next, 4800).capture, true);
});

test('不稳定的新指纹不会解除拍后锁定，显式下一页仍可使用', () => {
  const gate = new AutoScanGate(); gate.captured(paper);
  for (let time = 0; time <= 2000; time += 200) {
    const direction = time % 400 ? 1 : -1;
    const candidate = { ...paper, fingerprint: paper.fingerprint.map((value, i) => value + direction * (i % 2 ? .2 : -.2)) };
    assert.equal(gate.update(candidate, time).waiting, true);
  }
  gate.nextPage();
  assert.equal(gate.update(paper, 2200).waiting, false);
  assert.equal(gate.update(paper, 2200).capture, false);
});
