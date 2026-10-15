import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {MockService} from '../src/services/mock.js';
import {createSeed} from '../src/services/seed.js';

const generate = require('@babel/generator').default;
const release = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../preview/release.json'), 'utf8'));
const asset = release.files.find(file => /pages-index-index.*\.js$/.test(file.path));
const ast = parse(fs.readFileSync(path.resolve(__dirname, '../preview', asset.path), 'utf8'), {sourceType:'module'});
const sandbox = {console, Date, setTimeout, clearTimeout, setInterval, clearInterval};
for (const statement of ast.program.body) if (statement.type === 'ImportDeclaration') {
  for (const specifier of statement.specifiers) sandbox[specifier.local.name] = value => value;
}
ast.program.body = ast.program.body.filter(statement => !['ImportDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(statement.type));
vm.createContext(sandbox);
vm.runInContext(generate(ast).code + ';globalThis.baseline={Service:ea,seed:Le};', sandbox);
const baseline = sandbox.baseline;
const copy = value => JSON.parse(JSON.stringify(value));
const clock = () => new Date('2026-10-15T10:00:00Z');
function service(Service, initial = null) {
  let saved = copy(initial);
  return new Service({read: () => copy(saved), write: state => {saved = copy(state);}}, clock);
}

test('恢复源码的完整初始状态与已发布v0.9.1逐字段一致', () => {
  assert.deepEqual(createSeed(clock()), copy(baseline.seed(clock())));
});
test('学校、班级、53名学生及13项作业的全部练习数据与发布版本一致', () => {
  const source = service(MockService), deployed = service(baseline.Service);
  source.prepareClassPractice(); deployed.prepareClassPractice();
  assert.deepEqual(source.read(), copy(deployed.read()));
  assert.equal(source.read().students.filter(student => student.classId === 'class-1').length, 53);
  assert.equal(source.read().assignments.filter(assignment => assignment.classId === 'class-1').length, 13);
});
for (const schemaVersion of [3, 4, 5, 6]) test(`schema ${schemaVersion}数据迁移与发布版本一致`, () => {
  const old = createSeed(clock());
  old.schemaVersion = schemaVersion;
  old.accounts.parent = {signedIn:true, studentId:'student-1'};
  if (schemaVersion < 5) {delete old.teachers; delete old.teacherAccount;}
  assert.deepEqual(service(MockService, old).read(), copy(service(baseline.Service, old).read()));
});
test('绑定、保存草稿、发布与刷新后的全部状态延续已发布版本', async () => {
  const source = service(MockService), deployed = service(baseline.Service);
  for (const current of [source, deployed]) {
    await current.signIn('teacher'); await current.bindInvitation('JS2026', 'teacher');
    await current.signIn('student'); await current.bindInvitation('XS2026', 'student');
    const review = current.read().submissions[0].draft;
    review.handwriting.scores.intuitive = 10;
    review.composition.summary = '保留这条教师反馈。';
    await current.saveDraft('submission-1', review, 'teacher');
    assert.equal(current.feedback('submission-1', 'student'), null);
    await current.publish('submission-1', review, 'teacher');
  }
  assert.deepEqual(source.read(), copy(deployed.read()));
});
