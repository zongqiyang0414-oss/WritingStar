import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, sampleReview } from '../src/services/seed.js';
import { MockService } from '../src/services/mock.js';
import { STUDENT_TASK_CATEGORIES, studentTaskCategory, studentTasks, studentNotifications } from '../src/services/studentWorkspace.js';
const copy = value => JSON.parse(JSON.stringify(value));
const now = new Date('2026-11-02T04:00:00Z');
function fixture() {
  const state = createSeed(now), base = state.assignments[0], work = state.submissions[0];
  state.assignments = ['open','submitted','reviewed','returned','expired'].map((id, n) => ({ ...copy(base), id, title: id,
    classId: 'class-1', createdAt: new Date(now.getTime() - (10-n)*60000).toISOString(), dueAt: id === 'expired' ? '2026-11-01T00:00:00Z' : '' }));
  state.submissions = ['submitted','reviewed','returned'].map(id => ({ ...copy(work), id: 'work-'+id, assignmentId: id, studentId: 'student-1', version: 1,
    status: id === 'submitted' ? 'pending' : 'published', published: id === 'submitted' ? null : sampleReview(), publishedAt: id === 'submitted' ? null : '2026-11-02T03:58:00Z',
    resubmission: id === 'returned' ? { allowedAt: '2026-11-02T03:59:00Z' } : null }));
  return state;
}

test('学生作业五类互斥且覆盖全量，重交许可优先，已交／已批阅不因截止被埋入已截止', () => {
  const state = fixture(), rows = studentTasks(state, 'student-1', now);
  assert.deepEqual(STUDENT_TASK_CATEGORIES.map(item => item.label), ['未提交','已提交','已批阅','需重交','已截止']);
  assert.deepEqual(new Set(rows.map(item => item.category)), new Set(STUDENT_TASK_CATEGORIES.map(item => item.id)));
  const past = { dueAt: '2026-11-01T00:00:00Z' };
  assert.equal(studentTaskCategory(past, state.submissions[0], now), 'submitted');
  assert.equal(studentTaskCategory(past, state.submissions[1], now), 'reviewed');
  assert.equal(studentTaskCategory(past, state.submissions[2], now), 'resubmit');
  assert.equal(studentTaskCategory({ dueAt: now.toISOString() }, null, now), 'expired');
  assert.equal(studentTaskCategory({ dueAt: '' }, null, now), 'unsubmitted');
  for (const status of ['processing','failed','pending']) assert.equal(studentTaskCategory(past, { status }, now), 'submitted');
  state.submissions[2].resubmission.consumedAt = now.toISOString();
  assert.equal(studentTasks(state, 'student-1', now).find(row => row.assignment.id === 'returned').category, 'reviewed');
});

test('通知来自新布置、重交许可与教师发布，最新优先、稳定去重且不带教师草稿', () => {
  const state = fixture(), messages = studentNotifications(state, 'student-1');
  assert.equal(messages.length, 8); assert.equal(messages[0].type, 'returned');
  assert.equal(messages.filter(item => item.type === 'reviewed').length, 2);
  assert.equal(new Set(messages.map(item => item.id)).size, messages.length);
  assert.deepEqual(studentNotifications(copy(state), 'student-1'), messages);
  assert.ok(messages.every(item => !('photos' in item) && !('published' in item) && !('draft' in item)));
  state.submissions[0].aiReview = { state: 'completed', result: sampleReview() };
  assert.equal(studentNotifications(state, 'student-1').filter(item => item.type === 'reviewed').length, 2, 'AI完成不能假装教师批阅完成');
});

test('学生通知不越班、不暴露他人结果；重新提交不沿用旧发布通知', () => {
  const state = fixture();
  state.assignments.push({ ...copy(state.assignments[0]), id: 'other-class', classId: 'class-2' });
  assert.ok(!studentNotifications(state, 'student-1').some(item => item.assignmentId === 'other-class'));
  assert.ok(!studentNotifications(state, 'student-2').some(item => item.type === 'reviewed' || item.type === 'returned'));
  state.submissions.push({ ...copy(state.submissions[1]), id: 'work-newest', version: 2, status: 'pending', published: null, publishedAt: null });
  assert.ok(!studentNotifications(state, 'student-1').some(item => item.assignmentId === 'reviewed' && item.type === 'reviewed'));
  state.students.find(item => item.id === 'student-1').archived = true;
  assert.ok(studentNotifications(state, 'student-1').every(item => item.type === 'reviewed'));
});

test('通知已读仅本人可写，刷新保留、重复点击幂等，存储失败回滚', async () => {
  let saved = fixture(), fail = false, writes = 0;
  const storage = { read: () => copy(saved), write: value => { if (fail) throw new Error('存储满'); saved = copy(value); writes++; } };
  const service = new MockService(storage, () => now);
  await service.signIn('student'); await service.bindInvitation('XS2026','student');
  const message = service.studentNotifications('student').find(item => item.type === 'reviewed');
  const before = service.read(); fail = true;
  await assert.rejects(service.markStudentNotificationRead(message.id, 'student'), /存储满/); assert.deepEqual(service.read(), before); fail = false;
  await service.markStudentNotificationRead(message.id, 'student'); const written = writes;
  await service.markStudentNotificationRead(message.id, 'student'); assert.equal(writes, written);
  const reloaded = new MockService(storage, () => now);
  assert.equal(reloaded.studentNotifications('student').find(item => item.id === message.id).read, true);
  await service.restartBinding('student'); await service.signIn('student'); await service.bindInvitation('CX2026','student');
  await assert.rejects(service.markStudentNotificationRead(message.id, 'student'), /通知已更新/);
  assert.throws(() => service.studentNotifications('teacher'), /学生身份/);
  await assert.rejects(service.markStudentNotificationRead(message.id, 'admin'), /学生身份/);
});
