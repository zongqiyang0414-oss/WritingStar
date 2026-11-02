import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockService } from '../src/services/mock.js';
import { createSeed, samplePhotos, sampleReview } from '../src/services/seed.js';
import { total } from '../src/services/rubric.js';
import { AI_RUNNING, aiAssignmentRows, aiAssignmentSummary } from '../src/services/aiReview.js';
import { studentReports } from '../src/services/school.js';

const copy = value => JSON.parse(JSON.stringify(value));
function setup(initial = null) {
  let time = Date.parse('2026-10-16T10:00:00Z'), saved = copy(initial), fail = false, writes = 0;
  const clock = () => new Date(time);
  const storage = { read: () => copy(saved), write: value => {
    if (fail) throw new Error('存储满'); saved = copy(value); writes++;
  }};
  const service = new MockService(storage, clock);
  return { service, storage, clock, advance: milliseconds => { time += milliseconds; }, fail: value => { fail = value; }, writes: () => writes };
}
async function bind(service, role, code) { await service.signIn(role); await service.bindInvitation(code, role); }
function batchSeed() {
  const state = createSeed(new Date('2026-10-16T10:00:00Z'));
  const base = state.submissions[0];
  state.submissions.push({ ...copy(base), id: 's2-old', studentId: 'student-2' });
  state.submissions.push({ ...copy(base), id: 's2-latest', studentId: 'student-2', version: 2 });
  state.submissions.push({ ...copy(base), id: 's3', studentId: 'student-3', status: 'published', published: sampleReview() });
  return state;
}
function finishWorker(env) {
  env.service.advanceAiReviews(); env.advance(1200); env.service.advanceAiReviews(); env.advance(1800); env.service.advanceAiReviews();
  env.advance(3000); env.service.advanceAiReviews();
}

test('学生提交与AI任务原子保存，逐步展示进度，AI结果可见而教师草稿仍隐藏', async () => {
  const env = setup(), { service } = env; await bind(service, 'student', 'XS2026');
  const submission = await service.submit('assignment-plan-1', samplePhotos, '保留页序', 'student');
  assert.equal(service.aiResult(submission.id, 'student').state, 'queued');
  assert.deepEqual(service.read().submissions.find(item => item.id === submission.id).photos, samplePhotos);
  service.advanceAiReviews(); assert.equal(service.aiResult(submission.id, 'student').state, 'reading');
  env.advance(1200); service.advanceAiReviews(); assert.equal(service.aiResult(submission.id, 'student').state, 'reviewing');
  env.advance(1800); service.advanceAiReviews();
  const ai = service.aiResult(submission.id, 'student');
  assert.equal(ai.state, 'completed'); assert.equal(ai.resultSource, 'sample');
  assert.equal(total(ai.result.handwriting), 81); assert.equal(ai.draft, undefined);
  assert.equal(service.feedback(submission.id, 'student'), null);
  assert.equal(studentReports(service.read(), 'class-1').find(item => item.id === 'student-1').feedbackCount, 0);
});

test('AI结果只属于本人或任教老师，其他学生、越班老师和管理员均被拒绝', async () => {
  const { service } = setup(); await bind(service, 'teacher', 'JS2026');
  await service.startAiReview('submission-1', 'teacher'); await service.finishAnalysis('submission-1');
  await bind(service, 'student', 'CX2026');
  assert.throws(() => service.aiResult('submission-1', 'student'), /自己/);
  await assert.rejects(service.startAiReview('submission-1', 'student'), /自己/);
  assert.throws(() => service.aiResult('submission-1', 'admin'), /教师或学生/);
  await service.restartBinding('teacher'); await bind(service, 'teacher', 'LS2026');
  assert.throws(() => service.aiResult('submission-1', 'teacher'), /任教范围/);
  await assert.rejects(service.startAiBatch('assignment-1', 'teacher'), /任教范围/);
  await assert.rejects(service.startAiBatch('assignment-1', 'student'), /教师/);
});

test('教师改分、应用和发布不改写AI快照，未发布草稿不出现在学生AI结果或学情', async () => {
  const env = setup(), { service } = env; await bind(service, 'teacher', 'JS2026'); await bind(service, 'student', 'XS2026');
  await service.startAiReview('submission-1', 'teacher'); finishWorker(env);
  const original = service.aiResult('submission-1', 'student');
  const edited = sampleReview(); edited.handwriting.scores.intuitive = 3; edited.composition.summary = '仅教师草稿中的评语';
  await service.saveDraft('submission-1', edited, 'teacher');
  assert.deepEqual(service.aiResult('submission-1', 'student'), original);
  assert.equal(service.feedback('submission-1', 'student'), null);
  await service.applyAiReview('submission-1', 'teacher');
  assert.deepEqual(service.read().submissions[0].draft, original.result);
  await service.publish('submission-1', edited, 'teacher');
  assert.deepEqual(service.aiResult('submission-1', 'student'), original);
  assert.equal(total(service.feedback('submission-1', 'student').handwriting), 76);
  assert.equal(total(service.aiResult('submission-1', 'student').result.handwriting), 81);
  await assert.rejects(service.applyAiReview('submission-1', 'teacher'), /完成审核/);
});

test('一键批阅仅取每名学生最新提交，跳过未提交和已发布，并且重复点击不重复入队', async () => {
  const env = setup(batchSeed()), { service } = env; await bind(service, 'teacher', 'JS2026');
  const before = service.read();
  const first = await service.startAiBatch('assignment-1', 'teacher');
  assert.deepEqual(first.queued.sort(), ['s2-latest', 'submission-1']);
  assert.deepEqual((await service.startAiBatch('assignment-1', 'teacher')).queued, []);
  const after = service.read();
  assert.deepEqual(after.submissions.find(item => item.id === 's2-old'), before.submissions.find(item => item.id === 's2-old'));
  assert.deepEqual(after.submissions.find(item => item.id === 's3'), before.submissions.find(item => item.id === 's3'));
  const summary = aiAssignmentSummary(aiAssignmentRows(after, 'assignment-1'));
  assert.equal(summary.running, 2); assert.equal(summary.published, 1);
  assert.equal(after.submissions.length, before.submissions.length);
  finishWorker(env);
  assert.deepEqual((await service.startAiBatch('assignment-1', 'teacher')).queued, []);
  assert.equal(aiAssignmentSummary(aiAssignmentRows(service.read(), 'assignment-1')).completed, 2);
  await assert.rejects(service.startAiReview('s2-old', 'teacher'), /最新/);
});

test('AI批阅不覆盖教师已有草稿，单独批量重试失败项不会重跑已完成项', async () => {
  const env = setup(batchSeed()), { service } = env; await bind(service, 'teacher', 'JS2026');
  const draft = sampleReview(); draft.nextSteps = '老师已保存的订正要求';
  await service.saveDraft('submission-1', draft, 'teacher');
  await service.startAiReview('submission-1', 'teacher');
  await service.startAiReview('s2-latest', 'teacher', true); finishWorker(env);
  assert.deepEqual(service.read().submissions[0].draft, draft);
  assert.equal(service.aiResult('s2-latest', 'teacher').state, 'failed');
  const complete = service.aiResult('submission-1', 'teacher');
  assert.deepEqual((await service.startAiBatch('assignment-1', 'teacher', true)).queued, ['s2-latest']);
  finishWorker(env);
  assert.equal(service.aiResult('s2-latest', 'teacher').attempt, 3);
  assert.equal(service.aiResult('s2-latest', 'teacher').state, 'completed');
  assert.deepEqual(service.aiResult('submission-1', 'teacher'), complete);
});

test('自选与混合图片不会生成示例评分，等待结果时仍保留照片并允许老师人工批阅', async () => {
  const env = setup(), { service } = env; await bind(service, 'student', 'XS2026'); await bind(service, 'teacher', 'JS2026');
  const photos = [copy(samplePhotos[0]), { id: 'actual', name: '我的作品.png', url: 'data:image/png;base64,dXNlcg==', sample: false }];
  const submission = await service.submit('assignment-plan-1', photos, '', 'student'); finishWorker(env);
  const ai = service.aiResult(submission.id, 'student');
  assert.equal(ai.state, 'unavailable'); assert.equal(ai.result, null);
  assert.equal(total(service.read().submissions.find(item => item.id === submission.id).draft.handwriting), null);
  assert.deepEqual(service.read().submissions.find(item => item.id === submission.id).photos, photos);
  await service.publish(submission.id, sampleReview(), 'teacher');
  assert.equal(service.aiResult(submission.id, 'student').result, null);
  assert.equal(total(service.feedback(submission.id, 'student').composition), 81);
});

test('失败后重试保留原作品，结果完成后重复请求保持同一任务和结果', async () => {
  const env = setup(), { service } = env; await bind(service, 'student', 'XS2026');
  const submission = await service.submit('assignment-plan-1', samplePhotos, '', 'student', false, true); finishWorker(env);
  assert.equal(service.aiResult(submission.id, 'student').state, 'failed');
  await service.startAiReview(submission.id, 'student'); finishWorker(env);
  const complete = service.aiResult(submission.id, 'student');
  assert.equal(complete.attempt, 3); assert.equal(complete.state, 'completed');
  await service.startAiReview(submission.id, 'student');
  assert.deepEqual(service.aiResult(submission.id, 'student'), complete);
  assert.equal(service.read().submissions.filter(item => item.id === submission.id).length, 1);
});

test('三份并行队列和未完成任务可在刷新后继续，空轮询不重复存储', async () => {
  const initial = batchSeed();
  initial.submissions.find(item => item.id === 's3').status = 'pending'; initial.submissions.find(item => item.id === 's3').published = null;
  initial.students.push({ id: 'student-extra', name: '测试学生', initial: '测', classId: 'class-1', className: '四年级（1）班' });
  initial.submissions.push({ ...copy(initial.submissions[0]), id: 's-extra', studentId: 'student-extra' });
  const env = setup(initial), { service } = env; await bind(service, 'teacher', 'JS2026'); await service.startAiBatch('assignment-1', 'teacher');
  service.advanceAiReviews();
  assert.equal(service.read().submissions.filter(item => item.aiReview?.state === 'reading').length, 3);
  assert.equal(service.read().submissions.filter(item => item.aiReview?.state === 'queued').length, 1);
  const writes = env.writes(); service.advanceAiReviews(); assert.equal(env.writes(), writes);
  const reload = new MockService(env.storage, env.clock); env.advance(3000); reload.advanceAiReviews();
  assert.equal(reload.read().submissions.filter(item => item.aiReview?.state === 'completed').length, 3);
  env.advance(3000); reload.advanceAiReviews();
  assert.equal(reload.read().submissions.filter(item => AI_RUNNING.includes(item.aiReview?.state)).length, 0);
});

test('批量入队和进度存储失败均不留下部分状态，重试后保持一次入队', async () => {
  const env = setup(batchSeed()), { service } = env; await bind(service, 'teacher', 'JS2026');
  const before = service.read(); env.fail(true);
  await assert.rejects(service.startAiBatch('assignment-1', 'teacher'), /存储满/);
  assert.deepEqual(service.read(), before);
  env.fail(false); await service.startAiBatch('assignment-1', 'teacher'); const queued = service.read();
  env.fail(true); assert.throws(() => service.advanceAiReviews(), /存储满/); assert.deepEqual(service.read(), queued);
  env.fail(false); service.advanceAiReviews(); assert.equal(service.aiResult('submission-1', 'teacher').attempt, 1);
});

test('人工批阅或已发布作品不会被迟到的AI完成回写；教师允许重新提交后保留原AI及反馈', async () => {
  const env = setup(), { service } = env; await bind(service, 'student', 'XS2026'); await bind(service, 'teacher', 'JS2026');
  const first = await service.submit('assignment-plan-1', samplePhotos, '', 'student');
  service.advanceAiReviews(); await service.manualReview(first.id, 'teacher');
  const manual = sampleReview(); manual.nextSteps = '人工批阅的建议';
  await service.saveDraft(first.id, manual, 'teacher'); env.advance(6000); service.advanceAiReviews();
  assert.equal(service.aiResult(first.id, 'student').state, 'cancelled');
  assert.deepEqual(service.read().submissions.find(item => item.id === first.id).draft, manual);
  await service.publish(first.id, manual, 'teacher');
  const original = service.read().submissions.find(item => item.id === first.id);
  await service.agreeResubmission(first.id, 'teacher');
  const second = await service.submit('assignment-plan-1', samplePhotos, '', 'student'); finishWorker(env);
  assert.equal(second.version, 2);
  assert.deepEqual(service.read().submissions.find(item => item.id === first.id).published, original.published);
  const seedDraft = sampleReview(); seedDraft.nextSteps = '发布时仍在等待AI';
  await service.startAiReview('submission-1', 'teacher'); await service.publish('submission-1', seedDraft, 'teacher');
  env.advance(6000); service.advanceAiReviews();
  assert.equal(service.aiResult('submission-1', 'student').state, 'cancelled');
  assert.deepEqual(service.feedback('submission-1', 'student'), seedDraft);
  const late = setup(); await bind(late.service, 'teacher', 'JS2026');
  await late.service.startAiReview('submission-1', 'teacher', true); finishWorker(late);
  await late.service.publish('submission-1', sampleReview(), 'teacher');
  const publishedAfterFailure = late.service.read().submissions[0];
  await late.service.finishAnalysis('submission-1');
  assert.deepEqual(late.service.read().submissions[0], publishedAfterFailure);
});

test('学生原图重试限制：运行中去重、60秒冷却、刷新保留、每份最多两次', async () => {
  const env = setup(), { service } = env; await bind(service, 'student', 'XS2026');
  const submitted = await service.submit('assignment-plan-1', samplePhotos, '原图不能丢失', 'student', false, true);
  finishWorker(env);
  await service.startAiReview(submitted.id, 'student', true);
  const running = service.aiResult(submitted.id, 'student');
  assert.equal(running.retry.remaining, 1);
  const writes = env.writes(); await service.startAiReview(submitted.id, 'student', true);
  assert.equal(env.writes(), writes);
  assert.equal(service.aiResult(submitted.id, 'student').id, running.id);
  finishWorker(env);
  await assert.rejects(service.startAiReview(submitted.id, 'student'), /秒后再重试/);
  const reload = new MockService(env.storage, env.clock);
  await assert.rejects(reload.startAiReview(submitted.id, 'student'), /秒后再重试/);
  env.advance(60_000);
  await reload.startAiReview(submitted.id, 'student', true);
  reload.advanceAiReviews(); env.advance(3000); reload.advanceAiReviews();
  env.advance(3000); reload.advanceAiReviews();
  env.advance(60_000);
  await assert.rejects(reload.startAiReview(submitted.id, 'student'), /次数已用完/);
  const final = reload.read().submissions.find(item => item.id === submitted.id);
  assert.equal(final.aiReview.studentRetryTimes.length, 2);
  assert.deepEqual(final.photos, submitted.photos);
  assert.equal(final.note, '原图不能丢失'); assert.equal(final.version, 1);
});

test('学生24小时重试额度跨作业计算，日限到期后恢复且不绕过单份上限', async () => {
  const env = setup(), { service } = env;
  await bind(service, 'student', 'XS2026'); await bind(service, 'teacher', 'JS2026');
  let last;
  for (let n = 0; n < 3; n++) {
    const assignment = await service.createAssignment({ title: '失败重试测试' + n, classId: 'class-1', dueAt: '', requirements: '' }, 'teacher');
    last = await service.submit(assignment.id, samplePhotos, '', 'student', false, true); finishWorker(env);
    for (let retry = 0; retry < (n === 2 ? 1 : 2); retry++) {
      env.advance(60_000); await service.startAiReview(last.id, 'student', true); finishWorker(env);
    }
  }
  env.advance(60_000);
  await assert.rejects(service.startAiReview(last.id, 'student'), /24小时/);
  env.advance(24 * 60 * 60 * 1000);
  await service.startAiReview(last.id, 'student'); finishWorker(env);
  assert.equal(service.aiResult(last.id, 'student').state, 'completed');
});

test('真实照片服务未开通时明确终止等待，不自动空转或消耗学生重试次数', async () => {
  const env = setup(), { service } = env; await bind(service, 'student', 'XS2026');
  const submitted = await service.submit('assignment-plan-1', [{ ...samplePhotos[0], sample: false }], '', 'student');
  finishWorker(env);
  const task = service.aiResult(submitted.id, 'student');
  assert.equal(task.state, 'unavailable'); assert.equal(task.attempt, 1); assert.equal(task.result, null);
  assert.match(task.error, /尚未开通/); assert.equal(task.retry.remaining, 2);
  const before = service.read();
  await assert.rejects(service.startAiReview(submitted.id, 'student'), /尚未开通/);
  assert.deepEqual(service.read(), before);
});
