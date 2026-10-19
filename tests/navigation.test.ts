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
