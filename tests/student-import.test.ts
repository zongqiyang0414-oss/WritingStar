import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utils, write } from 'xlsx';
import { zipSync, strToU8 } from 'fflate';
import { createSeed } from '../src/services/seed.js';
import { MockService } from '../src/services/mock.js';
import { prepareAdministration } from '../src/services/administration.js';
import { prepareAccountRegistration } from '../src/services/accountRegistration.js';
import { importStudentRoster, previewStudentImport } from '../src/services/studentImport.js';
import { parseRosterBytes, parseWordRoster, validateRosterFile, credentialsText } from '../src/platform/studentRosterImport.js';

const clone = (value: any) => JSON.parse(JSON.stringify(value));
function state() {
  const result = prepareAccountRegistration(prepareAdministration(createSeed(new Date('2026-11-04T10:00:00Z'))));
  result.teacherAccount = { signedIn: true, teacherId: 'teacher-chen' };
  return result;
}
function workbookBytes(grid: unknown[][], bookType: 'xlsx' | 'xls' = 'xlsx') {
  const book = utils.book_new(); utils.book_append_sheet(book, utils.aoa_to_sheet(grid), '四年一班');
  return new Uint8Array(write(book, { type: 'array', bookType }));
}
const wordCell = (value: string) => `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
const wordRow = (cells: string[]) => `<w:tr>${cells.map(wordCell).join('')}</w:tr>`;
const word = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>班级学生名单</w:t></w:r></w:p><w:tbl>${wordRow(['姓名', '学号'])}${wordRow(['张&amp;林', '0007'])}${wordRow(['李青', '0008'])}</w:tbl></w:body></w:document>`;

test('Excel真实xlsx/xls读取姓名及前导零学号，保留实际行号，跳过空行和重复表头', () => {
  for (const type of ['xlsx', 'xls'] as const) {
    const rows = parseRosterBytes(workbookBytes([[], ['四年一班名单'], ['姓名', '学号'], ['林晓', '0001'], [], ['姓名', '学号'], ['周晴', '0002']], type), `名单.${type}`);
    assert.deepEqual(rows.map(({ name, studentNumber, row }: any) => ({ name, studentNumber, row })), [
      { name: '林晓', studentNumber: '0001', row: 4 }, { name: '周晴', studentNumber: '0002', row: 7 },
    ]);
  }
});

test('Word真实docx普通表格本地读取，支持XML实体和多个文字片段；拒绝无表头/旧doc/损坏文件', () => {
  const bytes = zipSync({ 'word/document.xml': strToU8(word), 'word/media/image.png': new Uint8Array(32) });
  assert.deepEqual(parseRosterBytes(bytes, '名单.docx').map((row: any) => [row.name, row.studentNumber]), [['张&林', '0007'], ['李青', '0008']]);
  assert.equal(parseWordRoster(word.replace('张&amp;林', '张</w:t></w:r><w:r><w:t>林'))[0].name, '张林');
  assert.throws(() => parseWordRoster('<w:tbl>' + wordRow(['甲', '乙']) + '</w:tbl>'), /姓名/);
  assert.throws(() => validateRosterFile({ name: '名单.doc', size: 100 }), /另存为.docx/);
  assert.throws(() => parseRosterBytes(strToU8('broken'), '名单.docx'), /文件无法读取/);
  assert.throws(() => parseWordRoster('<!DOCTYPE x>' + word), /XML声明/);
});

test('Excel合并可见名单工作表，隐藏工作表不导入；上限校验不截断学生', () => {
  const book = utils.book_new();
  for (const [name, grid] of [['一班', [['姓名'], ['林青']]], ['二班', [['姓名'], ['陈青']]], ['隐藏', [['姓名'], ['勿导入']]]] as const)
    utils.book_append_sheet(book, utils.aoa_to_sheet(grid as any), name);
  book.Workbook = { Sheets: [{ name: '一班', Hidden: 0 }, { name: '二班', Hidden: 0 }, { name: '隐藏', Hidden: 1 }] };
  assert.deepEqual(parseRosterBytes(new Uint8Array(write(book, { type: 'array', bookType: 'xlsx' })), '名单.xlsx').map((row: any) => row.name), ['林青', '陈青']);
  assert.throws(() => parseRosterBytes(workbookBytes([['姓名'], ...Array.from({ length: 501 }, (_, index) => ['学生' + index])]), '名单.xlsx'), /500/);
  assert.throws(() => validateRosterFile({ name: '大名单.xlsx', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
});

test('批量导入同一事务创建学生及唯一账号，不覆盖原学生、作品、绑定；缺学号自动补足', () => {
  const initial = state(), before = clone(initial);
  const imported = importStudentRoster(initial, { classId: 'class-1', rows: [{ name: '林晓', studentNumber: 'S00001' }, { name: '周晴' }, { name: '同名', studentNumber: 'P001' }, { name: '同名', studentNumber: 'P002' }] });
  assert.deepEqual(initial, before);
  assert.equal(imported.students.length, 4); assert.equal(imported.credentials.length, 4);
  assert.equal(imported.students[1].studentNumber, 'S00002');
  assert.equal(new Set(imported.credentials.map((row: any) => row.username)).size, 4);
  assert.ok(imported.credentials.every((row: any) => row.password.length >= 10));
  assert.deepEqual(imported.state.submissions, before.submissions);
  assert.deepEqual(imported.state.teacherAccount, before.teacherAccount);
  assert.deepEqual(imported.state.students.slice(0, before.students.length), before.students);
  assert.equal(imported.state.administrationEvents[0].administratorId, 'teacher-chen');
});

test('预览和提交都拒绝越权、重复学号、同名缺学号及无效行，整批不部分写入', () => {
  const initial = state(); initial.teachers.find((teacher: any) => teacher.id === 'teacher-chen').classIds = ['class-1'];
  const before = clone(initial);
  for (const role of ['student', 'admin']) assert.throws(() => importStudentRoster(initial, { classId: 'class-1', rows: [{ name: '林晓' }] }, role), /教师/);
  assert.throws(() => previewStudentImport(initial, { classId: 'class-2', rows: [{ name: '林晓' }] }), /自己管理/);
  const existing = initial.students.find((student: any) => student.classId === 'class-1');
  existing.studentNumber = 'EXIST'; existing.archived = true;
  const invalid = { classId: 'class-1', rows: [{ name: '新生', studentNumber: 'exist' }, { name: '重名' }, { name: '重名', studentNumber: 'P001' }, { name: '甲', studentNumber: 'repeat' }, { name: '乙', studentNumber: 'REPEAT' }, { name: '' }] };
  const preview = previewStudentImport(initial, invalid);
  assert.equal(preview.canImport, false); assert.equal(preview.totalCount, 6);
  assert.ok(preview.errors.some((error: any) => /归档/.test(error.message)));
  assert.ok(preview.errors.some((error: any) => /同名/.test(error.message)));
  assert.ok(preview.rows.filter((row: any) => /repeat/i.test(row.studentNumber)).every((row: any) => row.errors.length));
  const beforeInvalid = clone(initial);
  assert.throws(() => importStudentRoster(initial, invalid), /修正名单/);
  assert.deepEqual(initial, beforeInvalid);
  initial.teacherAccount.signedIn = false;
  assert.throws(() => previewStudentImport(initial, { classId: 'class-1', rows: [{ name: '林晓' }] }), /登录/);
  assert.equal(before.students.length, initial.students.length);
});

test('凭据复制包含身份与初始密码，防止姓名在电子表格中被解释为公式', () => {
  const result = credentialsText([{ name: '=1+1', className: '一班', studentNumber: '001', username: 'Sabc', password: 'pw123' }]);
  assert.match(result, /姓名\t班级\t学号\t账号\t初始密码/);
  assert.match(result, /'=1\+1\t一班\t001\tSabc\tpw123/);
});


test('导入保存失败时学生、凭据、作业名单与答题卡一并回滚，重试仅创建一次且学生可登录', async () => {
  let saved = state(), fail = false;
  const service = new MockService({ read: () => clone(saved), write: next => { if (fail) throw new Error('存储满'); saved = clone(next); } });
  const before = service.read();
  const input = { classId: 'class-1', rows: [{ name: '回滚新生', studentNumber: 'ROLLBACK01' }] };
  fail = true;
  await assert.rejects(service.importStudents(input, 'teacher'), /存储满/);
  assert.deepEqual(service.read(), before); assert.deepEqual(saved, before);
  fail = false;
  const credentials = await service.importStudents(input, 'teacher');
  assert.equal(credentials.length, 1);
  assert.equal(service.read().students.length, before.students.length + 1);
  assert.equal(service.read().loginCredentials.length, before.loginCredentials.length + 1);
  await service.loginAccount('student', credentials[0].username, credentials[0].password);
  assert.equal(service.read().accounts.student.studentId, credentials[0].studentId);
  const committed = service.read();
  await assert.rejects(service.importStudents(input, 'teacher'), /已有该学号/);
  assert.deepEqual(service.read(), committed);
});
