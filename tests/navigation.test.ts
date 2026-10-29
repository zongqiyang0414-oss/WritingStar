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
  const shows = [], hides = [], disposals = [], navigations = [];
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
    uni: { pageScrollTo: () => {}, navigateTo: options => navigations.push(options) },
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
  return { page: sandbox.usePage(), service, navigations, show: () => shows.forEach(callback => callback()) };
}

test('扫描页按剩余页数打开，回传保留页序，重复回调和换学生后的迟到结果不混入', async () => {
  const { page, service, navigations, show } = await setup();
  const assignment = await service.createAssignment({ classId: 'class-1', title: '扫描回传', requirements: '扫描', dueAt: new Date(Date.now() + 86400000).toISOString() }, 'teacher');
  show(); page.openAssignment(assignment); page.openTeacherSubmit(assignment);
  page.scanPhotos(); assert.equal(navigations.length, 0);
  page.selectSubmissionStudent(page.submissionStudents.value.findIndex(student => student.id === 'student-1'));
  page.addSamples(); page.scanPhotos();
  assert.equal(navigations[0].url, '/pages/scan/index?remaining=4');
  const result = [{ id: 'scan-a', url: '/saved/scan-a.jpg', name: '扫描件.jpg', sample: false }, { id: 'scan-b', url: '/saved/scan-b.jpg', name: '扫描件.jpg', sample: false }];
  navigations[0].events.scanned(result); navigations[0].events.scanned(result);
  assert.equal(page.photos.value.length, 4);
  assert.deepEqual(page.photos.value.slice(2).map(photo => photo.id), ['scan-a', 'scan-b']);
  page.selectSubmissionStudent(page.submissionStudents.value.findIndex(student => student.id === 'student-2'));
  await page.confirmModal();
  navigations[0].events.scanned(result);
  assert.equal(page.photos.value.length, 0);
});

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
  page.submit();
  assert.match(page.error.value, /选择代交的学生/);
  const index = page.submissionStudents.value.findIndex(item => item.id === 'student-1');
  page.selectSubmissionStudent(index);
  page.addSamples();
  page.failSubmit.value = true;
  page.submit();
  assert.match(page.modal.value.title, /小禾/);
  await page.confirmModal();
  assert.equal(page.screen.value, 'submit');
  assert.match(page.error.value, /提交失败/);
  assert.equal(page.photos.value.length, 2);
  page.failSubmit.value = false;
  page.submit();
  await page.confirmModal();
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
  show();
  page.openAssignment(assignment);
  await page.toggleExcellent(submission);
  assert.match(page.modal.value.body, /全班|本班/);
  await page.confirmModal();
  page.switchRole('student');
  page.openAssignment(assignment);
  page.openExcellentWorks(assignment);
  assert.equal(page.excellentWorks.value.length, 1);
  page.openExcellentWork(page.excellentWorks.value[0]);
  assert.equal(page.screen.value, 'excellentWork');
  assert.equal(page.excellentWork.value.photos.length, 2);
  assert.equal(page.excellentWork.value.note, undefined);
  assert.equal(page.excellentWork.value.draft, undefined);
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
