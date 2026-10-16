import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockService } from '../src/services/mock.js';
import { createSeed, samplePhotos, sampleReview } from '../src/services/seed.js';
import { getTeacherClasses, getBoundStudent } from '../src/services/identity.js';
import { formerAssignmentStudents } from '../src/services/school.js';

const clock = () => new Date('2026-10-16T10:00:00Z');
const copy = value => JSON.parse(JSON.stringify(value));
function setup(initial = null) {
  let saved = copy(initial), fail = false, writes = 0;
  const storage = { read: () => copy(saved), write: value => {
    if (fail) throw new Error('存储满');
    saved = copy(value); writes++;
  }};
  const service = new MockService(storage, clock);
  return { service, storage, fail: value => { fail = value; }, writes: () => writes, saved: () => copy(saved) };
}
async function bind(service, role = 'admin', code = 'MA2026') {
  await service.signIn(role); await service.bindInvitation(code, role);
}

test('管理员升级只追加管理数据，保留旧绑定与全部作品；保存失败可重试且只迁移一次', () => {
  const old = createSeed(clock());
  old.teacherAccount = { signedIn: true, teacherId: 'teacher-chen' };
  old.accounts.student = { signedIn: true, studentId: 'student-1' };
  const snapshot = copy(old), env = setup(old);
  assert.equal(env.writes(), 1);
  assert.deepEqual(env.service.read().submissions, old.submissions);
  assert.deepEqual(env.service.read().accounts, old.accounts);
  assert.deepEqual(env.service.read().teacherAccount, old.teacherAccount);
  assert.deepEqual(old, snapshot);
  new MockService(env.storage, clock);
  assert.equal(env.writes(), 1);
  const failedStorage = { read: () => copy(old), write: () => { throw new Error('存储满'); } };
  assert.throws(() => new MockService(failedStorage, clock), /存储满/);
  assert.deepEqual(old, snapshot);
});

test('管理员须独立登录绑定；教师、学生、过期码和未绑定管理员不能获得管理权限', async () => {
  const { service } = setup();
  assert.throws(() => service.previewBinding('MA2026', 'admin'), /请先登录/);
  await service.signIn('admin');
  assert.throws(() => service.previewBinding('JS2026', 'admin'), /不存在/);
  assert.throws(() => service.previewBinding('MEX2026', 'admin'), /过期/);
  await assert.rejects(service.saveClass({ organizationId: 'organization-1', name: '新班级' }, 'admin'), /绑定/);
  await bind(service, 'teacher', 'JS2026'); await bind(service, 'student', 'XS2026');
  const before = service.read();
  for (const role of ['teacher', 'student', 'parent']) {
    await assert.rejects(service.saveClass({ organizationId: 'organization-1', name: '新班级' }, role), /管理员/);
    await assert.rejects(service.transferStudents({ sourceClassId: 'class-1', targetClassId: 'class-2', studentIds: ['student-1'] }, role), /管理员/);
    await assert.rejects(service.setClassTeachers({ classId: 'class-1', teacherIds: [] }, role), /管理员/);
    await assert.rejects(service.saveStudent({ classId: 'class-1', name: '学生', studentNumber: '1' }, role), /管理员/);
    await assert.rejects(service.setStudentArchived({ studentId: 'student-1', archived: true }, role), /管理员/);
  }
  assert.deepEqual(service.read(), before);
  await service.bindInvitation('MA2026', 'admin');
  assert.equal(service.read().teacherAccount.teacherId, 'teacher-chen');
  assert.equal(service.read().accounts.student.studentId, 'student-1');
  assert.throws(() => service.feedback('submission-1', 'admin'), /教师或学生/);
  await assert.rejects(service.createAssignment({ classId: 'class-1' }, 'admin'), /教师/);
});

test('管理员的所有管理写入受学校范围约束，不能跨校调班或分配外校老师', async () => {
  const { service } = setup(); await bind(service);
  const before = service.read();
  const attempts = [
    service.saveClass({ organizationId: 'organization-2', name: '越校' }, 'admin'),
    service.saveClass({ id: 'partner-v07-class-1', organizationId: 'organization-1', name: '越校' }, 'admin'),
    service.setClassTeachers({ classId: 'class-1', teacherIds: ['teacher-zhou'] }, 'admin'),
    service.saveStudent({ classId: 'partner-v07-class-1', name: '越校', studentNumber: '1' }, 'admin'),
    service.saveStudent({ id: 'partner-v07-student-1', classId: 'class-1', name: '越校', studentNumber: '1' }, 'admin'),
    service.transferStudents({ sourceClassId: 'class-1', targetClassId: 'partner-v07-class-1', studentIds: ['student-1'] }, 'admin'),
    service.setStudentArchived({ studentId: 'partner-v07-student-1', archived: true }, 'admin'),
  ];
  for (const attempt of attempts) await assert.rejects(attempt, /管理范围|本校/);
  assert.deepEqual(service.read(), before);
});

test('班级新建去重，改名同步名单和作业，作品与评分快照保持原样', async () => {
  const { service } = setup(); await bind(service);
  await assert.rejects(service.saveClass({ organizationId: 'organization-1', name: '四年级（1）班' }, 'admin'), /同名/);
  const created = await service.saveClass({ organizationId: 'organization-1', name: ' 五年级（1）班 ' }, 'admin');
  assert.equal(created.name, '五年级（1）班');
  const submissions = service.read().submissions;
  await service.saveClass({ id: 'class-1', organizationId: 'organization-1', name: '四年级（星光）班' }, 'admin');
  assert.equal(service.read().students.find(item => item.id === 'student-1').className, '四年级（星光）班');
  assert.equal(service.read().assignments.find(item => item.id === 'assignment-1').className, '四年级（星光）班');
  assert.deepEqual(service.read().submissions, submissions);
});

test('任教分配即时更新当前教师权限，保留其他学校任教范围与历史作业署名', async () => {
  const { service, storage } = setup(); await bind(service, 'teacher', 'JS2026'); await bind(service);
  const assignments = service.read().assignments;
  await service.setClassTeachers({ classId: 'class-1', teacherIds: ['teacher-waiting'] }, 'admin');
  assert.equal(getTeacherClasses(service.read()).some(item => item.id === 'class-1'), false);
  assert.equal(getTeacherClasses(service.read()).some(item => item.id === 'partner-v07-class-1'), true);
  await assert.rejects(service.saveDraft('submission-1', sampleReview(), 'teacher'), /任教范围/);
  await service.restartBinding('teacher'); await bind(service, 'teacher', 'WK2026');
  assert.deepEqual(getTeacherClasses(service.read()).map(item => item.id), ['class-1']);
  assert.deepEqual(service.read().assignments, assignments);
  assert.deepEqual(getTeacherClasses(new MockService(storage, clock).read()).map(item => item.id), ['class-1']);
});

test('新增与编辑学生以校内学号去重，同名不同学号可共存，归档学号仍不可复用', async () => {
  const { service } = setup(); await bind(service);
  const first = await service.saveStudent({ classId: 'class-1', name: '林清', studentNumber: ' S001 ' }, 'admin');
  const second = await service.saveStudent({ classId: 'class-2', name: '林清', studentNumber: 'S002' }, 'admin');
  assert.notEqual(first.id, second.id);
  await assert.rejects(service.saveStudent({ classId: 'class-2', name: '其他', studentNumber: 's001' }, 'admin'), /已有该学号/);
  await service.setStudentArchived({ studentId: first.id, archived: true }, 'admin');
  await assert.rejects(service.saveStudent({ classId: 'class-2', name: '其他', studentNumber: 'S001' }, 'admin'), /归档/);
  await service.saveStudent({ id: second.id, classId: 'class-2', name: '林清和', studentNumber: 'S002' }, 'admin');
  assert.equal(service.read().students.find(item => item.id === second.id).name, '林清和');
  await assert.rejects(service.saveStudent({ id: second.id, classId: 'class-1', name: '林清和', studentNumber: 'S002' }, 'admin'), /调班功能/);
});

test('单人及批量调班保留原图、反馈、历史班级作业和学生绑定，学生只能向新班提交', async () => {
  const { service, storage } = setup(); await bind(service, 'teacher', 'JS2026'); await bind(service, 'student', 'XS2026'); await bind(service);
  await service.publish('submission-1', sampleReview(), 'teacher');
  const before = service.read();
  await service.transferStudents({ sourceClassId: 'class-1', targetClassId: 'class-2', studentIds: ['student-1', 'student-2'] }, 'admin');
  const moved = service.read();
  assert.deepEqual(moved.submissions, before.submissions);
  assert.deepEqual(moved.assignments, before.assignments);
  assert.deepEqual(moved.accounts, before.accounts);
  assert.equal(getBoundStudent(moved, 'student').classId, 'class-2');
  assert.deepEqual(service.feedback('submission-1', 'student'), sampleReview());
  await assert.rejects(service.submit('assignment-1', samplePhotos, '', 'student'), /所在班级/);
  await service.submit('assignment-class-2', samplePhotos, '', 'student');
  assert.equal(new MockService(storage, clock).read().students.find(item => item.id === 'student-1').classId, 'class-2');
  await service.transferStudents({ sourceClassId: 'class-2', targetClassId: 'class-1', studentIds: ['student-1'] }, 'admin');
  assert.equal(service.read().students.find(item => item.id === 'student-1').classId, 'class-1');
});

test('名单过期、重复选择、归档、空选择或相同目标的批量调班整批失败，不留下部分调动', async () => {
  const { service } = setup(); await bind(service);
  await service.setStudentArchived({ studentId: 'student-3', archived: true }, 'admin');
  for (const studentIds of [[], ['student-1', 'student-1'], ['student-1', 'student-4'], ['student-1', 'student-3'], ['student-1', 'missing']]) {
    const before = service.read();
    await assert.rejects(service.transferStudents({ sourceClassId: 'class-1', targetClassId: 'class-2', studentIds }, 'admin'));
    assert.deepEqual(service.read(), before);
  }
  await assert.rejects(service.transferStudents({ sourceClassId: 'class-1', targetClassId: 'class-1', studentIds: ['student-1'] }, 'admin'), /不同/);
});

test('归档学生保留反馈且不能新提交，恢复后可继续；不改写其他身份或学习记录', async () => {
  const { service } = setup(); await bind(service, 'teacher', 'JS2026'); await bind(service, 'student', 'XS2026'); await bind(service);
  await service.publish('submission-1', sampleReview(), 'teacher');
  const before = service.read();
  await service.setStudentArchived({ studentId: 'student-1', archived: true }, 'admin');
  await assert.rejects(service.submit('assignment-1', samplePhotos, '', 'student'), /已不在班级/);
  assert.deepEqual(service.feedback('submission-1', 'student'), sampleReview());
  assert.deepEqual(service.read().submissions, before.submissions);
  await service.setStudentArchived({ studentId: 'student-1', archived: false }, 'admin');
  const revision = await service.submit('assignment-1', samplePhotos, '', 'student');
  assert.equal(revision.version, 2);
});

test('存储失败时管理写入、任教权限及操作记录一起回滚，重试后只记录一次', async () => {
  const env = setup(), { service } = env; await bind(service, 'teacher', 'JS2026'); await bind(service);
  const before = service.read(); env.fail(true);
  await assert.rejects(service.setClassTeachers({ classId: 'class-1', teacherIds: ['teacher-waiting'] }, 'admin'), /存储满/);
  await assert.rejects(service.transferStudents({ sourceClassId: 'class-1', targetClassId: 'class-2', studentIds: ['student-1'] }, 'admin'), /存储满/);
  assert.deepEqual(service.read(), before); assert.deepEqual(env.saved(), before);
  env.fail(false);
  await service.transferStudents({ sourceClassId: 'class-1', targetClassId: 'class-2', studentIds: ['student-1'] }, 'admin');
  assert.equal(service.read().administrationEvents.length, 1);
});

test('调班或归档后，原班老师仍可批阅原作业的提交，发布后学生可以读取原反馈', async () => {
  const { service } = setup(); await bind(service, 'teacher', 'JS2026'); await bind(service, 'student', 'XS2026'); await bind(service);
  await service.transferStudents({ sourceClassId: 'class-1', targetClassId: 'class-2', studentIds: ['student-1'] }, 'admin');
  assert.equal(formerAssignmentStudents(service.read(), 'assignment-1')[0].id, 'student-1');
  await service.publish('submission-1', sampleReview(), 'teacher');
  assert.deepEqual(service.feedback('submission-1', 'student'), sampleReview());
  await service.setStudentArchived({ studentId: 'student-1', archived: true }, 'admin');
  assert.equal(formerAssignmentStudents(service.read(), 'assignment-1').some(item => item.id === 'student-1' && item.archived), true);
});
