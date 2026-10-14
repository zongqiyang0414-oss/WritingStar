import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillClassPractice } from '../src/services/classPractice';
import { createSeed, sampleReview } from '../src/services/seed';
import { MockService, clone } from '../src/services/mock';
import { classTrend, studentRanking, studentTrend } from '../src/services/analytics';
import { total, validateReview } from '../src/services/rubric';
import type { PrototypeState } from '../src/services/model';

const now = new Date('2026-10-14T10:00:00+08:00');

test('四一班追加10个作业与50个自然姓名，其他学生均有合法双评分，小禾保留待批阅', () => {
  const original = createSeed(now);
  const snapshot = clone(original);
  const state = fillClassPractice(original, now);
  const assignments = state.assignments.filter(a => a.classId === 'class-1');
  const students = state.students.filter(s => s.classId === 'class-1');
  assert.equal(assignments.length, 13);
  assert.equal(students.length, 53);
  const added = students.filter(s => s.id.startsWith('practice-v041-'));
  assert.equal(added.length, 50);
  assert.equal(new Set(added.map(s => s.name)).size, 50);
  assert.ok(added.every(s => /^[\u4e00-\u9fff]{2,3}$/.test(s.name)));
  for (const student of students.filter(s => s.id !== 'student-1')) {
    const submissions = state.submissions.filter(s => s.studentId === student.id);
    assert.equal(submissions.length, 13);
    assert.equal(new Set(submissions.map(s => s.assignmentId)).size, 13);
    for (const s of submissions) {
      assert.equal(s.status, 'published');
      assert.equal(validateReview(s.published!), null);
      assert.ok(s.publishedAt);
      assert.ok(Date.parse(s.submittedAt) >= Date.parse(state.assignments.find(a => a.id === s.assignmentId)!.createdAt));
      assert.ok(Date.parse(s.publishedAt!) >= Date.parse(s.submittedAt));
      assert.ok(Date.parse(s.publishedAt!) <= now.getTime());
    }
  }
  assert.equal(state.submissions.filter(s => s.published).length, 676);
  assert.ok(state.submissions.filter(s => s.studentId === 'student-1').every(s => s.status === 'pending' && s.published === null));
  assert.deepEqual(original, snapshot);
  assert.deepEqual(state.submissions.find(s => s.id === 'submission-1'), snapshot.submissions[0]);
  assert.ok(classTrend(state, 'class-1').every(p => p.handwriting !== null && p.composition !== null));
  assert.equal(studentRanking(state, 'class-1', 'handwriting').filter(s => s.rank !== null).length, 52);
  assert.equal(studentRanking(state, 'class-1', 'handwriting').find(s => s.id === 'student-1')!.rank, null);
  const growth = studentTrend(state, 'class-1', added[0].id);
  assert.equal(growth.length, 13);
  assert.ok(new Set(growth.map(p => p.handwriting)).size > 3);
  assert.ok(new Set(students.filter(s => s.id !== 'student-1').map(s => total(state.submissions.find(a => a.studentId === s.id)!.published!.handwriting))).size > 10);
  assert.deepEqual(state.students.filter(s => s.classId === 'class-2'), snapshot.students.filter(s => s.classId === 'class-2'));
  assert.deepEqual(state.assignments.filter(a => a.classId === 'class-2'), snapshot.assignments.filter(a => a.classId === 'class-2'));
});

test('追加不覆盖原评分、教师文字、自选作品及订正，刷新不重复追加', () => {
  const old = createSeed(now);
  const review = sampleReview();
  review.handwriting.scores.intuitive = 10;
  review.nextSteps = '我的原有批注必须保留。';
  old.submissions[0].status = 'published';
  old.submissions[0].published = clone(review);
  old.submissions[0].draft = clone(review);
  old.submissions[0].publishedAt = now.toISOString();
  old.submissions.push({...clone(old.submissions[0]), id: 'custom-revision', version: 2, status: 'pending', published: null,
    photos: [{id: 'mine', url: 'data:image/png;base64,original', sample: false, name: '原作品'}]});
  old.submissions.push({...clone(old.submissions[1]), id: 'other-child-upload', studentId: 'student-2', version: 1});
  const snapshot = clone(old);
  const expanded = fillClassPractice(old, now);
  assert.deepEqual(expanded.submissions.slice(0, snapshot.submissions.length), snapshot.submissions);
  assert.equal(expanded.submissions.filter(s => s.assignmentId === 'assignment-1' && s.studentId === 'student-2').length, 1);
  assert.equal(expanded.submissions.find(s => s.id === 'other-child-upload')!.published, null);
  assert.strictEqual(fillClassPractice(expanded, new Date(now.getTime() + 86400000)), expanded);
  assert.equal(new Set(expanded.submissions.map(s => s.id)).size, expanded.submissions.length);
  assert.deepEqual(old, snapshot);
});

test('本机服务追加只写一次，小禾批阅发布后刷新保留，重置恢复完整练习班级', async () => {
  let saved: PrototypeState | null = createSeed(now);
  let writes = 0;
  const storage = {read: () => clone(saved), write: (s: PrototypeState) => {saved = clone(s); writes++;}};
  const service = new MockService(storage, () => now);
  service.prepareClassPractice();
  assert.equal(writes, 1);
  service.prepareClassPractice();
  assert.equal(writes, 1);
  await service.publish('submission-1', sampleReview(), 'teacher');
  const reload = new MockService(storage, () => now);
  reload.prepareClassPractice();
  assert.equal(writes, 2);
  assert.ok(reload.feedback('submission-1', 'parent'));
  assert.equal(reload.read().submissions.length, service.read().submissions.length);
  reload.reset();
  assert.equal(reload.read().students.filter(s => s.classId === 'class-1').length, 53);
  assert.equal(reload.feedback('submission-1', 'student'), null);
});

test('填充保存失败保留原状态，重试后仅追加一次', () => {
  let saved = createSeed(now);
  let fail = true;
  const storage = {read: () => clone(saved), write: (s: PrototypeState) => {if (fail) throw new Error('存储满'); saved = clone(s);}};
  const service = new MockService(storage, () => now);
  const original = service.read();
  assert.throws(() => service.prepareClassPractice(), /存储满/);
  assert.deepEqual(service.read(), original);
  assert.deepEqual(saved, original);
  fail = false;
  service.prepareClassPractice();
  assert.equal(saved.classPracticeVersion, 1);
  assert.equal(service.read().submissions.filter(s => s.published).length, 676);
});
