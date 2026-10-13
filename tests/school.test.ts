import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockService, clone } from '../src/services/mock';
import { createSeed, demoPhotos, sampleReview } from '../src/services/seed';
import { activeCounts, assignmentCounts, classAssignments, latestSubmission, studentReports, taskStatus } from '../src/services/school';
import { upgradeState } from '../src/services/migration';
import type { LegacyPrototypeState, PersistedState, PrototypeState, Review, Submission } from '../src/services/model';

const now = new Date('2026-10-13T10:00:00+08:00');
function setup(initial: PersistedState | null = null) {
  let saved = clone(initial);
  let writes = 0;
  const storage = {read: () => clone(saved), write: (state: PrototypeState) => {saved = clone(state); writes++;}};
  return {service: new MockService(storage, () => now), storage, writes: () => writes};
}
function scoredReview(intuitive: number): Review {
  const review = sampleReview();
  review.handwriting.scores.intuitive = intuitive;
  review.composition.scores.intuitive = intuitive;
  return review;
}
function published(source: Submission, overrides: Partial<Submission>, score = 8): Submission {
  const review = scoredReview(score);
  return {...clone(source), ...overrides, status: 'published', draft: clone(review), published: review, publishedAt: now.toISOString()};
}

test('班级发布绑定目标班级，班级列表和面板互不串入，学生不能跨班提交', async () => {
  const {service} = setup();
  const before = activeCounts(service.read(), 'class-1', now.getTime());
  const assignment = await service.createAssignment({classId: 'class-2', title: '第二班的新作业', requirements: '写一段观察记录', dueAt: '2026-10-20T20:00:00+08:00'}, 'teacher');
  assert.equal(assignment.className, '四年级（2）班');
  const state = service.read();
  assert.ok(classAssignments(state, 'class-2').some(item => item.id === assignment.id));
  assert.ok(!classAssignments(state, 'class-1').some(item => item.id === assignment.id));
  assert.deepEqual(activeCounts(state, 'class-1', now.getTime()), before);
  assert.deepEqual(activeCounts(state, 'class-2', now.getTime()), {missing: 4, pending: 0, completed: 0, total: 4});
  await assert.rejects(service.submit(assignment.id, demoPhotos, '', 'student'), /所在班级/);
  await assert.rejects(service.createAssignment({classId: 'unknown', title: '错误班级', requirements: '要求', dueAt: '2026-10-20T20:00:00+08:00'}, 'teacher'), /班级/);
  assert.equal(service.read().assignments.length, state.assignments.length);
});

test('工作台只统计尚未截止的作业，截止时刻立即移出面板', () => {
  const state = createSeed(now);
  assert.deepEqual(activeCounts(state, 'class-1', now.getTime()), {missing: 5, pending: 1, completed: 0, total: 6});
  const first = state.assignments.find(item => item.id === 'assignment-1')!;
  first.dueAt = now.toISOString();
  assert.deepEqual(activeCounts(state, 'class-1', now.getTime() - 1), {missing: 5, pending: 1, completed: 0, total: 6});
  assert.deepEqual(activeCounts(state, 'class-1', now.getTime()), {missing: 3, pending: 0, completed: 0, total: 3});
  assert.deepEqual(assignmentCounts(state, first), {missing: 2, pending: 1, completed: 0, total: 3});
});

test('已截止作业保留统计，但学生不能产生新的提交记录', async () => {
  const {service} = setup();
  const before = service.read();
  await assert.rejects(service.submit('assignment-closed-1', demoPhotos, '', 'student'), /已截止/);
  assert.deepEqual(service.read().submissions, before.submissions);
});

test('重新提交只按最新一轮归为待批阅，处理中或分析失败均不重复统计', async () => {
  const {service} = setup();
  await service.publish('submission-1', sampleReview(), 'teacher');
  assert.deepEqual(activeCounts(service.read(), 'class-1', now.getTime()), {missing: 5, pending: 0, completed: 1, total: 6});
  const revision = await service.submit('assignment-1', demoPhotos, '已补充细节', 'student');
  const expected = {missing: 5, pending: 1, completed: 0, total: 6};
  assert.deepEqual(activeCounts(service.read(), 'class-1', now.getTime()), expected);
  assert.equal(latestSubmission(service.read(), 'assignment-1', 'student-1')!.id, revision.id);
  assert.equal(taskStatus(latestSubmission(service.read(), 'assignment-1', 'student-1')), '待批阅');
  await service.finishAnalysis(revision.id, true);
  assert.deepEqual(activeCounts(service.read(), 'class-1', now.getTime()), expected);
  await service.manualReview(revision.id, 'teacher');
  assert.deepEqual(activeCounts(service.read(), 'class-1', now.getTime()), expected);
  await service.publish(revision.id, scoredReview(9), 'teacher');
  assert.deepEqual(activeCounts(service.read(), 'class-1', now.getTime()), {missing: 5, pending: 0, completed: 1, total: 6});
});

test('学情仅按每项作业最近已发布反馈算均分，待批草稿和历史轮次不会混入', () => {
  const state = createSeed(now);
  const source = state.submissions[0];
  const old = published(source, {id: 'old', version: 1}, 8);
  const recent = published(source, {id: 'recent', version: 2}, 9);
  const waiting = {...clone(source), id: 'waiting', version: 3, draft: scoredReview(10)};
  const anotherAssignment = published(source, {id: 'another', assignmentId: 'assignment-plan-1', version: 1}, 6);
  const anotherStudent = published(source, {id: 'another-student', studentId: 'student-2'}, 10);
  state.submissions = [recent, waiting, anotherAssignment, old, anotherStudent];
  const reports = studentReports(state, 'class-1');
  const report = reports.find(item => item.id === 'student-1')!;
  assert.equal(report.feedbackCount, 2);
  assert.equal(report.handwriting, 80.5);
  assert.equal(report.composition, 80.5);
  assert.deepEqual({missing: report.missing, pending: report.pending, completed: report.completed}, {missing: 1, pending: 1, completed: 1});
  const empty = reports.find(item => item.id === 'student-3')!;
  assert.equal(empty.feedbackCount, 0);
  assert.equal(empty.handwriting, null);
  assert.equal(empty.composition, null);
  assert.ok(studentReports(state, 'class-2').every(item => item.handwriting === null && item.composition === null));
});

test('schema 1 升级保留原作品、评分、教师文字及自定义班级，重复升级无新增副作用', () => {
  const original = createSeed(now);
  const baseAssignment = original.assignments[0];
  const baseStudent = original.students[0];
  const {classId: _assignmentClass, ...assignment} = baseAssignment;
  const {classId: _studentClass, ...student} = baseStudent;
  const review = sampleReview();
  review.handwriting.scores.intuitive = 9;
  review.handwriting.comments.logical = '请保留我批注的第 3 行建议。';
  review.nextSteps = '先订正字形，再补充对话。';
  const submission = published(original.submissions[0], {id: 'submission-preserved', photos: [{id: 'user-photo', url: 'data:image/png;base64,original', name: '我的作品.png', sample: false}], note: '学生原说明'});
  submission.draft = clone(review);
  submission.published = clone(review);
  const legacy: LegacyPrototypeState = {schemaVersion: 1,
    assignments: [{...assignment, className: '五年级（3）班', title: '原有自定义作业'}],
    students: [{...student, className: '五年级（3）班'}], submissions: [submission]};
  const snapshot = clone(legacy);
  const result = upgradeState(legacy, now);
  assert.equal(result.schemaVersion, 2);
  assert.deepEqual(result.submissions, snapshot.submissions);
  const keptAssignment = result.assignments.find(item => item.id === assignment.id)!;
  const keptStudent = result.students.find(item => item.id === student.id)!;
  assert.equal(keptAssignment.title, '原有自定义作业');
  assert.equal(keptAssignment.classId, keptStudent.classId);
  assert.equal(result.classes.find(item => item.id === keptAssignment.classId)!.name, '五年级（3）班');
  assert.deepEqual(upgradeState(result, new Date('2026-10-14T10:00:00+08:00')), result);
  assert.equal(new Set(result.assignments.map(item => item.id)).size, result.assignments.length);
  assert.equal(new Set(result.students.map(item => item.id)).size, result.students.length);
  assert.deepEqual(legacy, snapshot);

  const {service, storage, writes} = setup(legacy);
  assert.equal(writes(), 1);
  assert.deepEqual(service.read().submissions, snapshot.submissions);
  const reload = new MockService(storage, () => now);
  assert.equal(writes(), 1);
  assert.deepEqual(reload.read(), service.read());
});
