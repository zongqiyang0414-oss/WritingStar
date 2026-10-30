import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScanImageViewport } from '../src/platform/scanImageViewport.js';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < .001, `${a} vs ${b}`);
function viewport() { const result = new ScanImageViewport(); result.resize({ width: 300, height: 500, imageWidth: 600, imageHeight: 900 }); return result; }

test('双指缩放以指间中心为锚点，放大后的同一笔迹仍在指下', () => {
  const zoom = viewport();
  zoom.start([{ x: 80, y: 210 }, { x: 160, y: 210 }]);
  const view = zoom.move([{ x: 20, y: 220 }, { x: 220, y: 220 }]);
  near(view.scale, 2.5);
  near((120 - 150) * view.scale + 150 + view.x, 120);
  near((210 - 250) * view.scale + 250 + view.y, 220);
});

test('缩放和拖动受实际纸面边界约束，缩回整页或旋转后不会丢失图片', () => {
  const zoom = viewport();
  const enlarged = zoom.constrain(100, 9999, -9999);
  near(enlarged.scale, 5); near(enlarged.x, 600); near(enlarged.y, -875);
  const normal = zoom.constrain(.2, 900, -900);
  near(normal.scale, 1); near(normal.x, 0); near(normal.y, 0);
  zoom.constrain(3, 40, 60);
  const rotated = zoom.resize({ width: 500, height: 300, imageWidth: 600, imageHeight: 900 });
  near(rotated.scale, 1); near(rotated.x, 0); near(rotated.y, 0);
});

test('双指抬起一指后拖动平滑续接，取消手势不会重用旧手指坐标', () => {
  const zoom = viewport();
  zoom.start([{ x: 110, y: 250 }, { x: 190, y: 250 }]);
  const pinched = zoom.move([{ x: 50, y: 250 }, { x: 250, y: 250 }]);
  zoom.start([{ x: 50, y: 250 }]);
  const dragged = zoom.move([{ x: 70, y: 290 }]);
  near(dragged.x - pinched.x, 20); near(dragged.y - pinched.y, 40);
  zoom.start([]);
  const fresh = zoom.move([{ x: 280, y: 30 }]);
  near(fresh.x, dragged.x); near(fresh.y, dragged.y);
});
