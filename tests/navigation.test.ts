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
import * as studentWorkspace from '../src/services/studentWorkspace.js';

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
  const shows = [], hides = [], disposals = [], scrolls = [];
  let pageScroll;
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
    '../services/studentWorkspace.js': studentWorkspace,
    'vue': { ...vue, onUnmounted: callback => disposals.push(callback) },
    '@dcloudio/uni-app': {
      onShow: callback => shows.push(callback),
      onHide: callback => hides.push(callback),
      onPageScroll: callback => { pageScroll = callback; },
    },
  };
  const ast = parse(fs.readFileSync(new URL('../src/composables/usePrototype.js', import.meta.url), 'utf8'), { sourceType: 'module' });
  const sandbox = {
    Date, console,
    setTimeout: () => 1, clearTimeout: () => {},
    setInterval: () => 1, clearInterval: () => {},
    uni: { pageScrollTo: options => scrolls.push(options.scrollTop) },
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
  return { page: sandbox.usePage(), service, scrolls, scroll: top => pageScroll({ scrollTop: top }), show: () => shows.forEach(callback => callback()) };
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

test('账号密码登录同时关联教师与任教范围，错误密码不能进入工作台', async () => {
  const { page, service, show } = await setup();
  await service.restartBinding('teacher');
  show();
  assert.equal(page.accountSignedIn.value, false);
  await page.loginForBinding({username:'teacher01',password:'wrong'});
  assert.equal(page.accountSignedIn.value, false);
  assert.equal(page.needsBinding.value, true);
  await page.loginForBinding({username:'teacher01',password:'Teacher2026'});
  assert.equal(page.accountSignedIn.value, true);
  assert.equal(service.read().teacherAccount.teacherId, 'teacher-chen');
  assert.equal(page.needsBinding.value, false);
  assert.equal(page.roles.map(role=>role.id).join(','), 'teacher,student');
  assert.equal(page.modal.value, null);
  assert.equal(page.error.value, '');
});



test('全班一键审核先确认，取消不发布，确认后刷新统计并跳过未完成作品', async () => {
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
  assert.equal(page.modal.value.title, '我已确定所有AI批阅结果无误');
  assert.equal(page.state.value.submissions.find(item => item.id === submission.id).status, 'pending');
  page.modal.value = null; // Cancel leaves results and drafts untouched.
  assert.equal(page.aiSummary.value.readyToPublish, ready);
  await page.publishAiBatch(); await page.confirmModal();
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
  assert.equal(page.modal.value.title, '打回这份作业？');
  assert.equal(service.latest(assignment.id, 'student-1').resubmission, undefined);
  page.modal.value = null;
  await page.agreeResubmission(first); await page.confirmModal();
  assert.equal(page.toast.value, '作业已打回，待学生重新提交');
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


test('返回真实来源并恢复学生搜索、筛选、作品、照片页和滚动位置', async () => {
  const { page, service, show, scroll, scrolls } = await setup();
  await service.publish('submission-1', seed.sampleReview(), 'teacher'); show();
  page.openAssignment(service.read().assignments.find(item => item.id === 'assignment-1'));
  page.studentSearch.value = '小禾'; page.filter.value = '已完成'; scroll(670);
  assert.equal(page.studentsInAssignment.value.length, 1);
  page.openFeedback(service.latest('assignment-1', 'student-1'));
  scroll(120); page.photoIndex.value = 1;
  page.openAiReview(service.latest('assignment-1', 'student-1'));
  page.back(); await vue.nextTick();
  assert.equal(page.screen.value, 'feedback'); assert.equal(page.photoIndex.value, 1);
  assert.equal(scrolls.at(-1), 120);
  page.back(); await vue.nextTick();
  assert.equal(page.screen.value, 'assignment'); assert.equal(scrolls.at(-1), 670);
  assert.equal(page.studentSearch.value, '小禾'); assert.equal(page.filter.value, '已完成');
  page.openPaperCards(); page.openPaperScan(); page.back();
  assert.equal(page.screen.value, 'paperCards'); page.back();
  assert.equal(page.screen.value, 'assignment');
});

test('全班结果返回保留搜索筛选，退出登录保留数据及绑定且不能返回学生作品', async () => {
  const { page, service, show, scroll, scrolls } = await setup();
  page.openAssignment(service.read().assignments.find(item => item.id === 'assignment-1'));
  page.openAiBatch(); page.aiBatchView.value = { query: '小禾', filter: 'ready' }; scroll(456);
  page.openAiReview(service.latest('assignment-1', 'student-1')); page.back(); await vue.nextTick();
  assert.equal(page.screen.value, 'aiBatch'); assert.equal(page.aiBatchView.value.query, '小禾');
  assert.equal(page.aiBatchView.value.filter, 'ready'); assert.equal(scrolls.at(-1), 456);
  const before = service.read(); page.go('profile'); await page.logout();
  assert.equal(page.needsBinding.value, true); assert.equal(page.accountSignedIn.value, false);
  assert.equal(service.read().teacherAccount.teacherId, before.teacherAccount.teacherId);
  assert.deepEqual(service.read().submissions, before.submissions);
  page.back(); assert.equal(page.screen.value, 'home');
  await page.loginForBinding({username:'teacher01',password:'Teacher2026'}); assert.equal(page.needsBinding.value, false);
});


test('一键审核确认后仍校验当前作业，空队列不弹确认也不改数据', async () => {
  const { page, service, show } = await setup();
  await service.startAiReview('submission-1', 'teacher'); await service.finishAnalysis('submission-1'); show();
  page.openAssignment(service.read().assignments.find(item => item.id === 'assignment-1'));
  page.openAiBatch(); page.publishAiBatch();
  const pendingAction = page.modal.value.action; page.modal.value = null;
  const other = await service.createAssignment({ classId:'class-1',title:'新的作业',requirements:'',dueAt:'' },'teacher'); show();
  page.openAssignment(other); await pendingAction();
  assert.equal(service.read().submissions.find(item => item.id === 'submission-1').status, 'pending');
  const before = service.snapshot(); page.publishAiBatch();
  assert.equal(page.modal.value, null); assert.equal(service.snapshot(), before);
});


test('一键审核确认期间新结果就绪时不扩大审核范围，要求重新核对', async () => {
  const { page, service, show } = await setup();
  const assignment = await service.createAssignment({classId:'class-1',title:'确认期间新结果',requirements:'',dueAt:''},'teacher');
  const first = await service.submitForStudent(assignment.id,'student-1',seed.samplePhotos,'','teacher');
  const another = await service.submitForStudent(assignment.id,'student-2',seed.samplePhotos,'','teacher');
  await service.finishAnalysis(first.id);show();
  page.openAssignment(assignment);page.openAiBatch();page.publishAiBatch();assert.ok(page.modal.value);
  await service.finishAnalysis(another.id);show();
  await page.confirmModal();assert.match(page.error.value,/已变化/);
  assert.equal(service.read().submissions.find(item => item.id === first.id).status,'pending');
});


test('点击已打回只展示说明，确认关闭不重复写入许可', async () => {
  const { page, service, show } = await setup();
  const first = service.read().submissions.find(item => item.id === 'submission-1');
  await service.agreeResubmission(first.id,'teacher');show();const before=service.snapshot();
  await page.agreeResubmission(first);
  assert.equal(page.modal.value.title,'作业已打回');assert.equal(page.modal.value.cancel,false);
  await page.confirmModal();assert.equal(service.snapshot(),before);assert.equal(page.modal.value,null);
});

test('学生分类返回保留，消息直达作业与教师反馈并更新已读，教师端不受分类影响', async () => {
  const { page, service, show } = await setup();
  const assignment = await service.createAssignment({ classId: 'class-1', title: '消息通知验证', requirements: '', dueAt: '' }, 'teacher');
  page.switchRole('student'); show();
  page.studentTaskFilter.value = 'unsubmitted';
  assert.ok(page.visibleAssignments.value.some(item => item.id === assignment.id));
  page.openNotifications(); assert.equal(page.screen.value, 'notifications');
  const notification = page.learnerNotifications.value.find(item => item.assignmentId === assignment.id);
  await page.openStudentNotification(notification);
  assert.equal(page.screen.value, 'assignment'); assert.equal(page.selectedAssignment.value.id, assignment.id);
  assert.equal(page.learnerNotifications.value.find(item => item.id === notification.id).read, true);
  page.back(); assert.equal(page.screen.value, 'notifications'); page.back(); assert.equal(page.screen.value, 'home');
  assert.equal(page.studentTaskFilter.value, 'unsubmitted');
  const work = await service.submit(assignment.id, seed.samplePhotos, '', 'student'); await service.finishAnalysis(work.id);
  await service.publish(work.id, seed.sampleReview(), 'teacher'); show();
  page.studentTaskFilter.value = 'reviewed'; page.openNotifications();
  await page.openStudentNotification(page.learnerNotifications.value.find(item => item.assignmentId === assignment.id && item.type === 'reviewed'));
  assert.equal(page.screen.value, 'feedback'); assert.equal(page.selectedSubmission.value.id, work.id);
  page.back(); page.back(); assert.equal(page.studentTaskFilter.value, 'reviewed');
  page.switchRole('teacher'); assert.equal(page.learnerNotifications.value.length, 0);
  assert.equal(page.statusLabel({ status: 'pending' }), '待审核');
});
