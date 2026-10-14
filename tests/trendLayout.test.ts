import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TrendPoint } from '../src/services/analytics';
import { chartPadding, trendScale, trendX, trendY } from '../src/services/trendLayout';

const point = (handwriting: number | null, composition: number | null): TrendPoint => ({id:'point', label:'作文', note:'', handwriting, composition});

test('常规成绩及空状态均使用60—100纵轴，5分刻度等距映射且不改变分数', () => {
  const points = [point(70,90),point(83.7,83.8),point(null,null)];
  const before = structuredClone(points);
  const scale = trendScale(points);
  assert.deepEqual(scale.ticks,[60,65,70,75,80,85,90,95,100]);
  assert.equal(trendY(100,scale,232),chartPadding.top);
  assert.equal(trendY(60,scale,232),232-chartPadding.bottom);
  assert.equal(trendY(70,scale,232)-trendY(75,scale,232),24);
  assert.equal(trendScale([point(null,null)]).minimum,60);
  assert.deepEqual(points,before);
});

test('60分以下及有效0分扩展下限，保留5分间隔，不裁掉有效成绩', () => {
  for (const score of [59.5,48,0]) {
    const scale = trendScale([point(85,score)]);
    assert.ok(scale.minimum<=score);
    assert.ok(scale.ticks.every((n,i) => i===0 || n-scale.ticks[i-1]===5));
    assert.ok(trendY(score,scale,420)<=420-chartPadding.bottom);
    assert.equal(scale.maximum,100);
  }
  assert.equal(trendScale([point(59.5,null)]).minimum,55);
  assert.equal(trendScale([point(null,0)]).minimum,0);
});

test('全部成绩点按容器宽度排列，窄屏13项及更多记录均不会扩展画布', () => {
  for (const width of [278,410]) for (const count of [1,13,50]) {
    const positions = Array.from({length:count},(_,i) => trendX(i,count,width));
    assert.ok(positions.every(x=>x>=chartPadding.left && x<=width-chartPadding.right));
    assert.ok(positions.every((x,i) => i===0 || x>positions[i-1]));
    if(count>1){assert.equal(positions[0],chartPadding.left);assert.equal(positions.at(-1),width-chartPadding.right);}
    else assert.equal(positions[0],width/2);
  }
});
