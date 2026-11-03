import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockService, clone } from '../src/services/mock.js';
import { createSeed, samplePhotos, sampleReview } from '../src/services/seed.js';
import { assignmentCounts, assignmentCompleted, assignmentStudents } from '../src/services/school.js';
import { prepareAssignmentParticipants } from '../src/services/assignmentParticipants.js';
import { studentTasks, studentNotifications } from '../src/services/studentWorkspace.js';
import { aiAssignmentRows } from '../src/services/aiReview.js';
import { scanGroups } from '../src/services/paperWorkflow.js';
import { nativeNavigationMetrics, landscapePageHeight } from '../src/platform/pageInsets.js';

async function setup() {
  let time = Date.parse('2026-11-01T04:00:00Z'), saved = createSeed(new Date(time)), fail = false;
  saved.assignments = []; saved.submissions = []; saved.classPracticeVersion = 1;
  const storage = { read: () => clone(saved), write: state => { if (fail) throw new Error('存储满'); saved = clone(state); } };
  const clock = () => new Date(time), service = new MockService(storage, clock);
  for (const [role, code] of [['teacher','JS2026'],['student','XS2026'],['admin','MA2026']]) { await service.signIn(role); await service.bindInvitation(code, role); }
  const assignment = (title, classId = 'class-1', dueAt = '') => service.createAssignment({ title, classId, dueAt, requirements:'', paperPages:2 },'teacher');
  const finish = async work => { await service.finishAnalysis(work.id); await service.publish(work.id, sampleReview(), 'teacher'); };
  const complete = async task => { for (const student of assignmentStudents(service.read(), task)) await finish(await service.submitForStudent(task.id, student.id, samplePhotos, '', 'teacher')); };
  return { service, storage, clock, assignment, complete, advance: milliseconds => { time += milliseconds; }, fail: value => { fail = value; } };
}

test('新生只接进行中作业：不限时全批阅后自动完成，截止和完成名单不被新生改写', async () => {
  const env = await setup(), { service, assignment } = env;
  const ongoing = await assignment('进行中'), completed = await assignment('不限时已完成'), expired = await assignment('已截止','class-1','2026-11-02T00:00:00Z');
  await env.complete(completed); env.advance(86400000);
  assert.equal(assignmentCompleted(service.read(), completed, env.clock().getTime()), true);
  const originalCards = service.paperCards(ongoing.id, 'teacher');
  const joined = await service.saveStudent({ classId:'class-1', name:'新同学', studentNumber:'NEW-1' },'admin');
  const state = service.read();
  assert.equal(assignmentCounts(state,ongoing).total,4); assert.deepEqual(assignmentCounts(state,completed),{missing:0,pending:0,completed:3,total:3});
  assert.equal(assignmentCounts(state,expired).total,3); assert.equal(assignmentCompleted(state,completed,env.clock().getTime()),true);
  assert.deepEqual(studentTasks(state,joined.id,env.clock().getTime()).map(row=>row.assignment.id),[ongoing.id]);
  assert.ok(studentNotifications(state,joined.id).every(item=>item.assignmentId===ongoing.id));
  assert.equal(aiAssignmentRows(state,completed.id).length,3);
  assert.equal(service.paperCards(completed.id,'teacher').length,3);
  assert.deepEqual(service.paperCards(ongoing.id,'teacher').slice(0,3),originalCards);
  await assert.rejects(service.submitForStudent(completed.id,joined.id,samplePhotos,'','teacher'),/接取名单/);
  const snapshot=service.snapshot(); service.preparePaperCards(); assert.equal(service.snapshot(),snapshot,'历史作业不反复补入新生卡片');
});

test('调入学生只接目标班进行中作业，保留原班作品；成员保存失败同时回滚名单和码', async () => {
  const env=await setup(),{service,assignment}=env;
  const ongoing=await assignment('目标班进行中','class-2'), completed=await assignment('目标班已完成','class-2'); await env.complete(completed);
  const before=service.read(); env.fail(true);
  await assert.rejects(service.transferStudents({sourceClassId:'class-1',targetClassId:'class-2',studentIds:['student-1']},'admin'),/存储满/);
  assert.deepEqual(service.read(),before); env.fail(false);
  await service.transferStudents({sourceClassId:'class-1',targetClassId:'class-2',studentIds:['student-1']},'admin');
  const state=service.read(); assert.ok(state.assignments.find(a=>a.id===ongoing.id).participantIds.includes('student-1'));
  assert.ok(!state.assignments.find(a=>a.id===completed.id).participantIds.includes('student-1'));
  assert.deepEqual(state.submissions,before.submissions);
  assert.equal(assignmentCounts(state,completed).total,2);
});

test('旧作业按现存名单一次迁移，保留提交且不猜历史入班时间，刷新不重置名单', async () => {
  const state=createSeed(new Date('2026-11-01T04:00:00Z')), copy=clone(state), prepared=prepareAssignmentParticipants(state);
  assert.deepEqual(state,copy); assert.equal(prepared.schemaVersion,6); assert.deepEqual(prepared.submissions,state.submissions);
  assert.ok(prepared.assignments.every(a=>Array.isArray(a.participantIds)));
  assert.equal(prepareAssignmentParticipants(prepared),prepared);
  const env=await setup(); await env.assignment('名单持久化'); const expected=env.service.read();
  assert.deepEqual(new MockService(env.storage,env.clock).read(),expected);
});

test('缺页为可提交提醒，确认后单页存档；确认不绕过重复页、身份和一次提交校验', async () => {
  const {service,assignment}=await setup(), task=await assignment('仅写一页');
  const row={id:'row-1',photo:{...samplePhotos[0],id:'one-photo',sample:false},code:'',manual:true,studentId:'student-1',page:1};
  const group=scanGroups(service.read(),task.id,[row]).groups[0];
  assert.equal(group.ready,true); assert.deepEqual(group.missingPages,[2]); assert.match(group.warnings[0],/缺少第 2 页/);
  await assert.rejects(service.submitPaperBatch(task.id,[row],'student'),/请确认/);
  await assert.rejects(service.submitPaperBatch(task.id,[row,{...row,id:'row-2',photo:{...row.photo,id:'other-photo'}}],'student',false,false,true),/重复页/);
  await assert.rejects(service.submitPaperBatch(task.id,[{...row,studentId:'student-2'}],'student',false,false,true),/其他学生/);
  const [work]=await service.submitPaperBatch(task.id,[row],'student',false,false,true);
  assert.equal(work.photos.length,1); assert.deepEqual(work.paper.missingPages,[2]); assert.equal(work.paper.expectedPages,2);
  assert.equal(work.aiReview.result,null); assert.equal(work.photos[0].sample,false);
  await assert.rejects(service.submitPaperBatch(task.id,[row],'student',false,false,true),/已提交/);
});

test('缺页确认后保存失败保留原状态、照片和重试机会', async () => {
  const env=await setup(),task=await env.assignment('缺页失败回滚');
  const row={id:'partial',photo:{...samplePhotos[0],id:'partial-photo'},code:'',manual:true,studentId:'student-1',page:2};
  const before=env.service.read(); env.fail(true);
  await assert.rejects(env.service.submitPaperBatch(task.id,[row],'student',false,false,true),/存储满/);
  assert.deepEqual(env.service.read(),before); env.fail(false);
  const [work]=await env.service.submitPaperBatch(task.id,[row],'student',false,false,true); assert.deepEqual(work.paper.missingPages,[1]);
});

test('AI不可用时教师可直接批阅，保留已有草稿，学生和管理员不能进入教师操作', async () => {
  const {service,assignment}=await setup(),task=await assignment('AI不可用');
  const work=await service.submit(task.id,[{...samplePhotos[0],sample:false}],'','student'); await service.finishAnalysis(work.id);
  const draft=sampleReview(); draft.nextSteps='保留教师已写的建议'; await service.saveDraft(work.id,draft,'teacher');
  const before=service.read(); await service.manualReview(work.id,'teacher'); assert.deepEqual(service.read(),before);
  await assert.rejects(service.manualReview(work.id,'student'),/教师/); await assert.rejects(service.manualReview(work.id,'admin'),/教师/);
  await service.publish(work.id,draft,'teacher'); assert.equal(service.feedback(work.id,'student').nextSteps,'保留教师已写的建议');
  await assert.rejects(service.manualReview(work.id,'teacher'),/无需转入/);
});

test('处理中转教师批阅取消迟到AI，不清空原图和已保存评价', async () => {
  const env=await setup(),task=await env.assignment('处理中转教师');
  const work=await env.service.submit(task.id,samplePhotos,'原提交','student'); env.service.advanceAiReviews();
  const state=env.service.read(),item=state.submissions.find(s=>s.id===work.id); item.draft=sampleReview(); item.draft.nextSteps='教师已有输入'; env.service.commit(state);
  await env.service.manualReview(work.id,'teacher'); env.advance(10000); env.service.advanceAiReviews();
  const final=env.service.read().submissions.find(s=>s.id===work.id); assert.equal(final.aiReview.state,'cancelled');
  assert.equal(final.draft.nextSteps,'教师已有输入'); assert.deepEqual(final.photos,work.photos); assert.equal(final.note,'原提交');
});

test('小程序导航覆盖灵动岛安全区并预留胶囊，横版整页尺寸不拉伸原图', () => {
  assert.deepEqual(nativeNavigationMetrics({statusBarHeight:54,screenHeight:932,windowWidth:430,safeArea:{top:54,bottom:898}},{top:58,height:32,left:318}),{top:54,height:98,bottom:34,menuSpace:124});
  assert.equal(nativeNavigationMetrics({statusBarHeight:24}).height,68);
  assert.equal(nativeNavigationMetrics().height,44);
  for (const width of [240,310,470]) assert.ok(Math.abs(landscapePageHeight(width)-width/Math.SQRT2)<1);
  assert.ok(landscapePageHeight(700,390)<=254);
});
