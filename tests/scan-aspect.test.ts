import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentAspectRatio, distance } from '../src/platform/scanGeometry.js';
import { rectifyDocument } from '../src/platform/documentScan.js';

// A real rectangular plane projected through a square-pixel pinhole camera.
function photograph(w, h, pitch, yaw, roll = .12) {
  const width = 1200, height = 1600, f = 1300;
  const corners = [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y]) => {
    const xx = x * Math.cos(yaw), z = -x * Math.sin(yaw);
    const yy = y * Math.cos(pitch) - z * Math.sin(pitch), zz = y * Math.sin(pitch) + z * Math.cos(pitch) + 1800;
    return {x:(width-1)/2+f*(xx*Math.cos(roll)-yy*Math.sin(roll))/zz,
      y:(height-1)/2+f*(xx*Math.sin(roll)+yy*Math.cos(roll))/zz};
  });
  return { width, height, corners };
}
test('斜拍竖纸、横纸、方纸按矩形物理比例恢复，不使用缩短的边长比', () => {
  for (const [w,h] of [[600,840],[840,600],[700,700]]) for (const [pitch,yaw] of [[.65,.3],[.2,.75],[-.55,.4],[0,0]]) {
    const scene = photograph(w,h,pitch,yaw);
    const ratio = documentAspectRatio(scene.corners,scene.width,scene.height);
    assert.ok(Math.abs(ratio-w/h)<1e-8,`ratio ${ratio} expected ${w/h}`);
    if (pitch === .2) {
      const oldRatio=Math.max(distance(scene.corners[0],scene.corners[1]),distance(scene.corners[2],scene.corners[3]))
        /Math.max(distance(scene.corners[0],scene.corners[3]),distance(scene.corners[1],scene.corners[2]));
      assert.ok(Math.abs(oldRatio-w/h)>.08, 'fixture exposes old foreshortening');
    }
  }
});
test('单轴斜拍比例有限，A4明确比例覆盖估算且保持四角和输出上限', async () => {
  const scene=photograph(600,840,.65,0,0);
  assert.ok(Math.abs(documentAspectRatio(scene.corners,scene.width,scene.height)-600/840)<.08);
  const image={width:scene.width,height:scene.height,data:new Uint8ClampedArray(scene.width*scene.height*4).fill(255)};
  const corners=scene.corners.map(p=>({x:p.x/(scene.width-1),y:p.y/(scene.height-1)}));
  for (const ratio of [210/297,297/210,1]) {
    const out=await rectifyDocument(image,corners,{maxEdge:350,aspectRatio:ratio});
    assert.ok(Math.abs(out.width/out.height-ratio)<.005);
    assert.equal(Math.max(out.width,out.height),350);
  }
});
