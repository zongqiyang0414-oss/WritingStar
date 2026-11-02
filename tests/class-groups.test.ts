import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classGrade, groupClasses } from '../src/services/classGroups.js';

test('年级与班级分栏：统一数字年级、自然排序、保留自定义班和完整ID', () => {
  const classes = [
    { id: '5-2', name: '五年级（2）班' }, { id: '4-10', name: '四年级（10）班' },
    { id: 'custom', name: '书写启蒙班' }, { id: '4-2', name: '4年级（2）班' },
    { id: '4-1', name: '四年级（1）班' }, { id: 'junior', name: '初一（3）班' },
  ];
  const original = JSON.stringify(classes), result = groupClasses(classes);
  assert.deepEqual(result.map(item => item.name), ['四年级', '五年级', '初一', '其他班级']);
  assert.deepEqual(new Set(result[0].classes.map(item => item.id)), new Set(['4-1', '4-2', '4-10']));
  assert.ok(result[0].classes.findIndex(item => item.id === '4-1') < result[0].classes.findIndex(item => item.id === '4-10'));
  assert.equal(classGrade('12年级（1）班'), '十二年级');
  assert.equal(JSON.stringify(classes), original);
  assert.deepEqual(groupClasses([]), []);
});
