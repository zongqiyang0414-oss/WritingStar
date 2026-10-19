import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { parse as parseComponent } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { TREND_PADDING } from '../src/components/trendLayout.js';

const generate = require('@babel/generator').default;
const source = parseComponent(fs.readFileSync(path.resolve(__dirname, '../src/components/ScoreTrend.vue'), 'utf8')).descriptor.scriptSetup!.content;

// Run the actual setup script with Vue's renderer and each uni-app platform branch.
function platformScript(platform: 'H5' | 'MP-WEIXIN') {
  const enabled = [true];
  const lines = source.split('\n').filter(line => {
    const directive = line.match(/\/\/ #(ifdef|ifndef) (\S+)/);
    if (directive) {
      const matches = directive[2] === platform;
      enabled.push(enabled.at(-1)! && (directive[1] === 'ifdef' ? matches : !matches));
      return false;
    }
    if (line.includes('// #endif')) {
      enabled.pop();
      return false;
    }
    return enabled.at(-1);
  });
  const ast = parse(lines.join('\n'), { sourceType: 'module' });
  ast.program.body = ast.program.body.filter(node => node.type !== 'ImportDeclaration');
  return generate(ast).code;
}

function chart(platform: 'H5' | 'MP-WEIXIN' = 'MP-WEIXIN') {
  const points = Vue.reactive([
    { id: 'first', handwriting: 70, composition: 80, label: '第一次', detail: '详情' },
    { id: 'second', handwriting: 85, composition: null, label: '第二次', detail: '详情' },
  ]);
  const queries: Array<(rect: { width: number }) => void> = [];
  const timers = new Map<number, () => void>();
  const frames = new Map<number, () => void>();
  const calls = { draw: 0, measured: 0, resized: undefined as undefined | (() => void), canvas: [] as string[] };
  let nextTask = 0;
  let state: any;
  const canvas = new Proxy({}, {
    get: (_, name: string) => (..._args: unknown[]) => {
      calls.canvas.push(name);
      if (name === 'draw') calls.draw++;
    },
  });
  const setup = vm.runInNewContext(`(function () { ${platformScript(platform)}; return { selectedId, selectedPoint, scale, visibleSeries, canvasWidth, canvasHeight }; })`, {
    ...Vue,
    TREND_PADDING,
    defineProps: () => ({ points }),
    uni: {
      createCanvasContext: () => canvas,
      createSelectorQuery: () => {
        calls.measured++;
        const query = {
          in: () => query,
          select: () => query,
          boundingClientRect: (callback: (rect: { width: number }) => void) => { queries.push(callback); return query; },
          exec: () => {},
        };
        return query;
      },
      onWindowResize: (callback: () => void) => { calls.resized = callback; },
      offWindowResize: (callback: () => void) => { if (calls.resized === callback) calls.resized = undefined; },
    },
    setTimeout: (callback: () => void) => { timers.set(++nextTask, callback); return nextTask; },
    clearTimeout: (id: number) => timers.delete(id),
    requestAnimationFrame: (callback: () => void) => { frames.set(++nextTask, callback); return nextTask; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const renderer = Vue.createRenderer({
    patchProp() {}, insert() {}, remove() {},
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
  });
  const app = renderer.createApp({ setup() { state = setup(); return () => null; } });
  app.mount({});
  async function flush() {
    await Vue.nextTick();
    await Vue.nextTick();
    while (frames.size) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
      await Vue.nextTick();
    }
  }
  return {
    app, points, state, queries, calls, timers, frames, flush,
    measure(width = 360) { const callback = queries.shift(); assert.ok(callback); callback({ width }); },
    runTimers() { const pending = [...timers.values()]; timers.clear(); for (const callback of pending) callback(); },
  };
}

for (const platform of ['H5', 'MP-WEIXIN'] as const) {
  test(`${platform}: 图表首次仅测量并绘制一次，分数、选点及图例更新合并绘制`, async () => {
    const current = chart(platform);
    try {
      await Vue.nextTick();
      assert.equal(current.calls.measured, 1);
      assert.equal(current.state.selectedId.value, 'second');
      current.measure();
      await current.flush();
      assert.equal(current.calls.draw, 1);
      assert.equal(current.state.canvasWidth.value, 360);
      assert.ok(current.calls.canvas.includes('lineTo'));
      assert.ok(current.calls.canvas.includes('arc'));

      current.points[0].handwriting = 50;
      current.state.selectedId.value = 'first';
      current.state.visibleSeries.value.composition = false;
      await current.flush();
      assert.equal(current.calls.draw, 2);
      assert.equal(current.calls.measured, 1, 'score changes do not need layout queries');
      assert.equal(current.state.scale.value.minimum, 50);
      assert.equal(current.state.selectedPoint.value.id, 'first');

      current.points[0].label = '新标题';
      current.points[0].detail = '新详情';
      await current.flush();
      assert.equal(current.calls.draw, 2, 'metadata remains reactive without redrawing the canvas');
      assert.equal(current.state.selectedPoint.value.label, '新标题');
    } finally { current.app.unmount(); }
  });

  test(`${platform}: 连续 resize 合并测量，卸载取消任务并忽略异步测量返回`, async () => {
    const current = chart(platform);
    await Vue.nextTick();
    current.measure();
    await current.flush();
    for (let i = 0; i < 10; i++) current.calls.resized!();
    assert.equal(current.timers.size, 1);
    assert.equal(current.calls.measured, 1);
    current.runTimers();
    assert.equal(current.calls.measured, 2);
    current.calls.resized!();
    current.app.unmount();
    assert.equal(current.timers.size, 0);
    assert.equal(current.calls.resized, undefined);
    current.measure(500);
    await current.flush();
    assert.equal(current.state.canvasWidth.value, 360, 'late selector callbacks must not update an unmounted chart');
    assert.equal(current.calls.draw, 1);
    assert.equal(current.frames.size, 0);
  });

  test(`${platform}: 删除选中成绩后仍选择最后一个已发布成绩，空数据正常绘制`, async () => {
    const current = chart(platform);
    try {
      await Vue.nextTick();
      current.measure();
      await current.flush();
      current.points.splice(1, 1);
      await current.flush();
      assert.equal(current.state.selectedId.value, 'first');
      assert.equal(current.calls.draw, 2);
      current.points.splice(0);
      await current.flush();
      assert.equal(current.state.selectedId.value, '');
      assert.equal(current.state.selectedPoint.value, undefined);
      assert.equal(current.calls.draw, 3);
    } finally { current.app.unmount(); }
  });
}

test('H5: 卸载取消已排队的浏览器绘制帧', async () => {
  const current = chart('H5');
  await Vue.nextTick();
  current.measure();
  await Vue.nextTick();
  assert.equal(current.frames.size, 1);
  current.app.unmount();
  assert.equal(current.frames.size, 0);
  await current.flush();
  assert.equal(current.calls.draw, 0);
});
