import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import * as vue from 'vue';
import * as photos from '../src/platform/photos.js';
import * as identity from '../src/services/identity.js';
import * as school from '../src/services/school.js';
import * as mock from '../src/services/mock.js';
import * as seed from '../src/services/seed.js';
import * as rubric from '../src/services/rubric.js';
import * as presentation from '../src/services/presentation.js';
import * as analytics from '../src/services/analytics.js';
import * as pageModels from '../src/services/pageModels.js';
import * as administration from '../src/services/administration.js';
import * as aiReview from '../src/services/aiReview.js';
import * as submissionPolicy from '../src/services/submissionPolicy.js';

const generate = require('@babel/generator').default;

// Exercise the real composable with page lifecycle and native APIs supplied by
// the host, without importing the mini-program runtime into Node.
async function setup() {
  const service = new mock.MockService({ read: () => null, write: () => {} });
  service.prepareClassPractice();
  await service.signIn('teacher');
  await service.bindInvitation('JS2026', 'teacher');
  await service.signIn('student');
  await service.bindInvitation('XS2026', 'student');
  const shows = [], hides = [], disposals = [];
  const modules = {
    '../platform/photos.js': photos,
    '../services/identity.js': identity,
    '../services/index.js': { createPrototypeService: () => service, STORAGE_KEY: 'test' },
    '../services/school.js': school,
    '../services/mock.js': mock,
    '../services/seed.js': seed,
    '../services/rubric.js': rubric,
    '../services/presentation.js': presentation,
    '../services/analytics.js': analytics,
    '../services/pageModels.js': pageModels,
    '../services/administration.js': administration,
    '../services/aiReview.js': aiReview,
    '../services/submissionPolicy.js': submissionPolicy,
    'vue': { ...vue, onUnmounted: callback => disposals.push(callback) },
    '@dcloudio/uni-app': {
      onShow: callback => shows.push(callback),
      onHide: callback => hides.push(callback),
    },
  };
  const ast = parse(fs.readFileSync(new URL('../src/composables/usePrototype.js', import.meta.url), 'utf8'), { sourceType: 'module' });
  const sandbox = {
    Date, console,
    setTimeout: () => 1, clearTimeout: () => {},
    setInterval: () => 1, clearInterval: () => {},
    uni: { pageScrollTo: () => {} },
  };
  const statements = [];
  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers)
        sandbox[specifier.local.name] = modules[statement.source.value][specifier.imported.name];
    } else if (statement.type === 'ExportNamedDeclaration') {
      statements.push(statement.declaration);
    } else statements.push(statement);
  }
  ast.program.body = statements;
  vm.createContext(sandbox);
  vm.runInContext(generate(ast).code + ';globalThis.usePage = usePrototype;', sandbox);
  return { page: sandbox.usePage(), service, show: () => shows.forEach(callback => callback()) };
}

test('切页和返回前台复用只读状态，保存后才刷新快照', async () => {
  const { page, service, show } = await setup();
  const initial = page.state.value;
  assert.equal(vue.isShallow(page.state), true);
  page.go('statistics');
  page.go('profile');
  show();
  assert.equal(page.state.value, initial);
  await service.restartBinding('student');
  show();
  assert.notEqual(page.state.value, initial);
  assert.equal(page.state.value.submissions, initial.submissions);
});

test('轻量排名行解析原学生，逐级返回保留搜索和排名类型', async () => {
  const { page } = await setup();
  page.go('statisticsStudents');
  page.analyticsSearch.value = '王';
  page.rankingCategory.value = 'composition';
  const row = page.rankingModel.value.ranks[0];
  assert.ok(row);
  page.openStudentAnalytics(row);
  assert.equal(page.screen.value, 'statisticsStudent');
  assert.equal(page.teacherGrowthModel.value.student.id, row.id);
  page.back();
  assert.equal(page.screen.value, 'statisticsStudents');
  assert.equal(page.analyticsSearch.value, '王');
  assert.equal(page.rankingCategory.value, 'composition');
  page.openStudentAnalytics({ id: 'student-4' });
  assert.equal(page.screen.value, 'statisticsStudents');
});

test('批阅编辑不写入只读快照，未保存离开仍需确认', async () => {
  const { page } = await setup();
  const submission = page.state.value.submissions.find(item => item.id === 'submission-1');
  page.openReview(submission);
  page.review.value.handwriting.summary = '编辑中的评语';
  assert.notEqual(submission.draft.handwriting.summary, '编辑中的评语');
  page.go('home');
  assert.equal(page.screen.value, 'review');
  assert.ok(page.modal.value);
  page.modal.value = null;
  await page.saveDraft();
  assert.equal(page.state.value.submissions.find(item => item.id === submission.id).draft.handwriting.summary, '编辑中的评语');
  assert.equal(page.error.value, '');
  page.go('home');
  assert.equal(page.screen.value, 'home');
});

test('学生从成长摘要打开原版反馈，不能打开其他学生作品', async () => {
  const { page, service, show } = await setup();
  await service.publish('submission-1', seed.sampleReview(), 'teacher');
  show();
  page.switchRole('student');
  page.go('growth');
  const row = page.learnerGrowthModel.value.history.find(item => item.id === 'submission-1');
  assert.equal(row.published, true);
  page.openFeedback(row);
  assert.equal(page.screen.value, 'feedback');
  assert.equal(page.selectedSubmission.value.id, row.id);
  assert.ok(page.feedback.value);
  page.back();
  assert.equal(page.screen.value, 'growth');
  const another = page.state.value.submissions.find(item => item.studentId !== 'student-1');
  page.openFeedback({ id: another.id });
  assert.equal(page.screen.value, 'growth');
});

test('教师选择学生代交，失败保留照片，成功后进入该学生的AI批阅', async () => {
  const { page, service, show } = await setup();
  const assignment = await service.createAssignment({
    classId: 'class-1', title: '代交体验', requirements: '写清经过', dueAt: new Date(Date.now() + 86400000).toISOString(),
  }, 'teacher');
  show();
  page.openAssignment(assignment);
  page.openTeacherSubmit(assignment);
  assert.equal(page.screen.value, 'submit');
  await page.submit();
  assert.match(page.error.value, /选择代交的学生/);
  const index = page.submissionStudents.value.findIndex(item => item.id === 'student-1');
  page.selectSubmissionStudent(index);
  page.addSamples();
  page.failSubmit.value = true;
  await page.submit();
  assert.equal(page.modal.value, null);
  assert.equal(page.screen.value, 'submit');
  assert.match(page.error.value, /提交失败/);
  assert.equal(page.photos.value.length, 2);
  page.failSubmit.value = false;
  await page.submit();
  assert.equal(page.error.value, '');
  assert.equal(page.screen.value, 'aiReview');
  assert.equal(page.selectedSubmission.value.studentId, 'student-1');
  assert.equal(page.selectedSubmission.value.actor, 'teacher');
  assert.equal(page.photos.value.length, 0);
  page.back();
  assert.equal(page.screen.value, 'assignment');
  assert.equal(page.submissionStudents.value.some(item => item.id === 'student-1'), false);
  page.switchRole('student');
  page.openAssignment(assignment);
  assert.equal(page.mine.value.submittedBy.name, '陈老师');
  assert.equal(page.canSubmit.value, false);
});

test('更换代交学生和离开提交页会提示，取消保留照片，确认更换清空照片', async () => {
  const { page, service, show } = await setup();
  const assignment = await service.createAssignment({
    classId: 'class-1', title: '匹配学生', requirements: '写清经过', dueAt: new Date(Date.now() + 86400000).toISOString(),
  }, 'teacher');
  show();
  page.openTeacherSubmit(assignment, page.state.value.students.find(item => item.id === 'student-1'));
  page.addSamples();
  page.note.value = '小禾的照片';
  const index = page.submissionStudents.value.findIndex(item => item.id === 'student-2');
  page.selectSubmissionStudent(index);
  assert.match(page.modal.value.title, /更换代交学生/);
  page.modal.value = null;
  assert.equal(page.submissionStudent.value.id, 'student-1');
  assert.equal(page.photos.value.length, 2);
  page.selectSubmissionStudent(index);
  await page.confirmModal();
  assert.equal(page.submissionStudent.value.id, 'student-2');
  assert.equal(page.photos.value.length, 0);
  assert.equal(page.note.value, '');
  page.addSamples();
  page.back();
  assert.equal(page.screen.value, 'submit');
  assert.match(page.modal.value.body, /照片/);
  await page.confirmModal();
  assert.equal(page.screen.value, 'assignment');
  assert.equal(page.photos.value.length, 0);
});

test('同班学生可读优秀作品并逐级返回，普通反馈入口仍不能打开同学作品', async () => {
  const { page, service, show } = await setup();
  const assignment = await service.createAssignment({
    classId: 'class-1', title: '全班参考', requirements: '写清经过', dueAt: new Date(Date.now() + 86400000).toISOString(),
  }, 'teacher');
  const submission = await service.submitForStudent(assignment.id, 'student-2', seed.samplePhotos, '不共享的说明', 'teacher');
  await service.finishAnalysis(submission.id);
  await service.publish(submission.id, seed.sampleReview(), 'teacher');
  show();
  page.openAssignment(assignment);
  await page.toggleExcellent(submission);
  assert.equal(page.modal.value, null);
  page.switchRole('student');
  page.openAssignment(assignment);
  page.openExcellentWorks(assignment);
  assert.equal(page.excellentWorks.value.length, 1);
  page.openExcellentWork(page.excellentWorks.value[0]);
  assert.equal(page.screen.value, 'excellentWork');
  assert.equal(page.excellentWork.value.photos.length, 2);
  assert.equal(page.excellentWork.value.note, undefined);
  assert.equal(page.excellentWork.value.draft, undefined);
  assert.deepEqual(page.excellentWork.value.published, seed.sampleReview());
  page.openFeedback(submission);
  assert.equal(page.screen.value, 'excellentWork');
  page.back();
  assert.equal(page.screen.value, 'excellentWorks');
  page.back();
  assert.equal(page.screen.value, 'assignment');
  page.switchRole('teacher');
  page.openExcellentWorks();
  page.openExcellentWork(page.excellentWorks.value.find(item => item.id === submission.id));
  await page.toggleExcellent(submission);
  assert.equal(page.screen.value, 'excellentWorks');
  assert.equal(page.excellentWorks.value.length, 0);
});

test('多班级不限截止发布后进入首个班级作业详情，不产生其他班级副本', async () => {
  const { page, service } = await setup();
  const original = service.read();
  page.go('create');
  page.newTitle.value = '多班级共同练习';
  page.newRequirements.value = '';
  page.newDue.value = '';
  page.newClassIds.value = ['class-2', 'class-1'];
  await page.createAssignment();
  const added = service.read().assignments.filter(item => !original.assignments.some(previous => previous.id === item.id));
  assert.equal(added.length, 2);
  assert.deepEqual(added.map(item => item.classId), ['class-2', 'class-1']);
  assert.ok(added.every(item => item.dueAt === '' && item.requirements === ''));
  assert.equal(page.screen.value, 'assignment');
  assert.equal(page.currentClass.value.id, 'class-2');
  assert.equal(page.selectedAssignment.value.id, added[0].id);
  assert.equal(page.expired(page.selectedAssignment.value), false);
  assert.equal(page.newTitle.value, '');
  assert.equal(page.error.value, '');
  assert.equal(page.modal.value, null);
});

test('点击登录直接建立当前身份登录状态，绑定仍独立完成且没有确认弹窗', async () => {
  const { page, service, show } = await setup();
  await service.restartBinding('teacher');
  show();
  assert.equal(page.accountSignedIn.value, false);
  await page.loginForBinding();
  assert.equal(page.accountSignedIn.value, true);
  assert.equal(service.read().teacherAccount.teacherId, null);
  assert.equal(page.needsBinding.value, true);
  assert.equal(page.modal.value, null);
  assert.equal(page.error.value, '');
});

test('教师核对修改AI结果后直接完成批阅并进入反馈，原AI结果不被改写', async () => {
  const { page, service, show } = await setup();
  await service.startAiReview('submission-1', 'teacher');
  await service.finishAnalysis('submission-1');
  show();
  const submission = page.state.value.submissions.find(item => item.id === 'submission-1');
  const originalAi = mock.clone(submission.aiReview);
  const edited = mock.clone(submission.aiReview.result);
  edited.handwriting.scores.intuitive = 9;
  edited.handwriting.summary = '教师核对后的总体评价';
  edited.nextSteps = '先调整字的间距。';
  page.openAiReview(submission);
  await page.applyAiSuggestions(edited);
  assert.equal(page.error.value, '');
  assert.equal(page.modal.value, null);
  assert.equal(page.screen.value, 'feedback');
  assert.equal(page.selectedSubmission.value.status, 'published');
  assert.deepEqual(service.feedback('submission-1', 'student'), edited);
  assert.deepEqual(service.read().submissions.find(item => item.id === 'submission-1').aiReview, originalAi);
  assert.equal(page.feedback.value.handwriting.summary, '教师核对后的总体评价');
});


test('全班AI一键发布刷新统计并显示成功提示，不弹出确认且跳过未完成作品', async () => {
  const { page, service, show } = await setup();
  await service.startAiReview('submission-1', 'teacher');
  await service.finishAnalysis('submission-1');
  show();
  const submission = page.state.value.submissions.find(item => item.id === 'submission-1');
  page.openAssignment(page.state.value.assignments.find(item => item.id === submission.assignmentId));
  page.openAiBatch();
  const ready = page.aiSummary.value.readyToPublish;
  assert.ok(ready > 0);
  await page.publishAiBatch();
  assert.equal(page.screen.value, 'aiBatch');
  assert.equal(page.aiSummary.value.readyToPublish, 0);
  assert.equal(page.state.value.submissions.find(item => item.id === submission.id).status, 'published');
  assert.equal(page.modal.value, null);
  assert.equal(page.error.value, '');
  assert.match(page.toast.value, /已完成/);
  assert.ok(service.feedback(submission.id, 'student'));
});

test('教师同意后学生只能重新提交一次，代交名单始终排除已提交学生', async () => {
  const { page, service, show } = await setup();
  const assignment = service.read().assignments.find(item => item.id === 'assignment-1');
  page.openAssignment(assignment);
  const first = service.latest(assignment.id, 'student-1');
  assert.equal(page.canAllowResubmission(first), true);
  assert.ok(!page.submissionStudents.value.some(item => item.id === 'student-1'));
  page.switchRole('student'); page.openAssignment(assignment);
  assert.equal(page.canSubmit.value, false); page.openSubmit(assignment); assert.equal(page.screen.value, 'assignment');
  page.switchRole('teacher'); page.openAssignment(assignment);
  await page.agreeResubmission(first);
  assert.ok(page.toast.value.includes('同意学生重新提交'));
  assert.ok(!page.submissionStudents.value.some(item => item.id === 'student-1'));
  page.switchRole('student'); page.openAssignment(assignment); assert.equal(page.canSubmit.value, true);
  page.openSubmit(assignment); await page.submit();
  assert.equal(page.screen.value, 'aiReview');
  assert.equal(service.latest(assignment.id, 'student-1').version, 2);
  page.back(); assert.equal(page.canSubmit.value, false);
  assert.equal(page.submissionRecords.value.filter(item => item.assignmentId === assignment.id).length, 1);
  assert.equal(page.submissionRecords.value.find(item => item.assignmentId === assignment.id).id, service.latest(assignment.id, 'student-1').id);
});

test('教师记录页逐层返回时恢复原作品和来源，重复查看不同反馈不会往返循环', async () => {
  const { page, service, show } = await setup();
  await service.publish('submission-1', seed.sampleReview(), 'teacher');
  const assignment = await service.createAssignment({classId:'class-1',title:'记录返回验证',requirements:'',dueAt:''},'teacher');
  const another = await service.submit(assignment.id, seed.samplePhotos, '', 'student');
  await service.finishAnalysis(another.id); await service.publish(another.id, seed.sampleReview(), 'teacher'); show();
  const first = service.latest('assignment-1', 'student-1');
  const originalAssignment = service.read().assignments.find(item=>item.id==='assignment-1');
  page.openAssignment(originalAssignment); page.openFeedback(first); page.go('records');
  for (const id of [another.id, first.id, another.id]) {
    page.openFeedback(page.submissionRecords.value.find(item=>item.id===id));
    page.back(); assert.equal(page.screen.value,'records');
  }
  page.back(); assert.equal(page.screen.value,'feedback');
  assert.equal(page.selectedSubmission.value.id, first.id);
  page.back(); assert.equal(page.screen.value,'assignment');
  assert.equal(page.selectedAssignment.value.id, originalAssignment.id);
  page.back(); assert.equal(page.screen.value,'home');
});

test('记录页保留任务或个人页来源，AI建议和正式反馈之间返回不产生循环', async () => {
  const { page, service, show } = await setup();
  await service.publish('submission-1',seed.sampleReview(),'teacher'); show();
  const assignment = service.read().assignments.find(item=>item.id==='assignment-1');
  page.openAssignment(assignment); page.go('records'); page.back();
  assert.equal(page.screen.value,'assignment');
  page.switchRole('student'); page.go('profile'); page.go('records');
  page.openAiReview(service.latest(assignment.id,'student-1'));
  page.openFeedback(service.latest(assignment.id,'student-1'));
  page.back(); assert.equal(page.screen.value,'aiReview');
  page.back(); assert.equal(page.screen.value,'records');
  page.back(); assert.equal(page.screen.value,'profile');
});
