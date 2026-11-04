import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockService } from '../src/services/mock.js';
import { prepareAccountRegistration } from '../src/services/accountRegistration.js';
import { getTeacherClasses } from '../src/services/identity.js';
const copy = value => JSON.parse(JSON.stringify(value));
const clock = () => new Date('2026-11-04T10:00:00Z');
function setup(initial = null) {
  let saved = initial, fail = false, writes = 0;
  const storage = { read: () => copy(saved), write: value => { if (fail) throw new Error('存储满'); saved = copy(value); writes++; } };
  const service = new MockService(storage, clock);
  return { service, storage, fail: value => { fail = value; }, writes: () => writes };
}
const input = { name: '杨老师', school: '新知小学', phone: '13812345678' };

test('教师申请必填三项且审核前无账号，证明可选，重复申请与错误输入不写入', async () => {
  const { service } = setup();
  for (const invalid of [{name:''}, {school:' '}, {phone:'123'}, {proof:{name:'证件.exe', url:'javascript:1',size:12}}]) {
    const before = service.read();
    await assert.rejects(service.submitTeacherApplication({...input,...invalid}));
    assert.deepEqual(service.read(), before);
  }
  const before = service.read();
  const application = await service.submitTeacherApplication(input);
  assert.equal(application.status, 'pending');
  assert.deepEqual(service.read().loginCredentials, before.loginCredentials);
  assert.deepEqual(service.read().teachers, before.teachers);
  await assert.rejects(service.submitTeacherApplication(input), /已有申请/);
  await assert.rejects(service.reviewTeacherApplication(application.id, {decision:'approved'}, 'teacher'), /仅供平台审核/);
  await assert.rejects(service.reviewTeacherApplication(application.id, {decision:'approved'}, 'student'), /仅供平台审核/);
  await assert.rejects(service.reviewTeacherApplication(application.id, {decision:'approved'}), /仅供平台审核/);
});

test('平台通过申请后唯一发放账号，账户可登录并建班，不能越校管理或自行发放教师账号', async () => {
  const { service, storage } = setup();
  const application = await service.submitTeacherApplication(input);
  const {credential, application: reviewed} = await service.reviewTeacherApplication(application.id, {decision:'approved'}, 'platform-demo');
  assert.equal(reviewed.status, 'approved');
  assert.equal(credential.role, 'teacher');
  assert.equal(credential.username, input.phone);
  assert.equal(credential.password, 'Aa123456');
  assert.equal(credential.mustChangePassword, true);
  const after = service.read();
  await assert.rejects(service.reviewTeacherApplication(application.id, {decision:'approved'}, 'platform-demo'), /已完成审核/);
  assert.deepEqual(service.read(), after);
  const fresh = new MockService(storage, clock);
  await fresh.loginAccount('teacher', credential.username.toLowerCase(), credential.password);
  assert.equal(fresh.read().teacherAccount.teacherId, reviewed.teacherId);
  const organization = fresh.read().teachers.find(t => t.id === reviewed.teacherId).organizationIds[0];
  await assert.rejects(fresh.saveClass({organizationId:organization,name:'一（1）班'},'teacher'), /修改初始密码/);
  await fresh.changeTeacherPassword({currentPassword:'Aa123456',newPassword:'Newpass2027',confirmPassword:'Newpass2027'},'teacher');
  assert.deepEqual(getTeacherClasses(fresh.read()), []);
  const schoolClass = await fresh.saveClass({organizationId:organization,name:'一（1）班'}, 'teacher');
  assert.equal(getTeacherClasses(fresh.read())[0].id, schoolClass.id);
  await assert.rejects(fresh.saveClass({organizationId:'organization-1',name:'越权班'}, 'teacher'), /管理范围/);
  await assert.rejects(fresh.createTeacher({organizationId:organization,name:'其他老师',subject:'语文'}, 'teacher'), /平台审核/);
  await assert.rejects(fresh.setClassTeachers({classId:schoolClass.id,teacherIds:[]}, 'teacher'), /平台审核/);
  const student = await fresh.saveStudent({classId:schoolClass.id,name:'新学生',studentNumber:'N001'},'teacher');
  const studentAccount = fresh.read().loginCredentials.find(c => c.personId === student.id);
  await fresh.loginAccount('student',studentAccount.username,studentAccount.password);
  assert.equal(fresh.read().accounts.student.studentId, student.id);
});

test('退回须原因且不发账户，可重新申请并附证明；错误密码、角色和归档账号不能登录', async () => {
  const { service } = setup();
  const app = await service.submitTeacherApplication(input);
  await assert.rejects(service.reviewTeacherApplication(app.id, {decision:'rejected',reason:' '}, 'platform-demo'), /退回原因/);
  const before = service.read();
  await service.reviewTeacherApplication(app.id, {decision:'rejected',reason:'请补充教师证明'}, 'platform-demo');
  assert.deepEqual(service.read().loginCredentials, before.loginCredentials);
  const proof = {name:'教师证明.png',url:'data:image/png;base64,aGVsbG8=',type:'image/png',size:5};
  const again = await service.submitTeacherApplication({...input,proof});
  assert.deepEqual(again.proof, proof);
  await assert.rejects(service.loginAccount('teacher','teacher01','wrong'), /账号或密码/);
  await assert.rejects(service.loginAccount('student','teacher01','Teacher2026'), /账号或密码/);
  await assert.rejects(service.loginAccount('admin','teacher01','Teacher2026'), /教师或学生/);
  await service.loginAccount('teacher','teacher01','Teacher2026');
  await service.setStudentArchived({studentId:'student-1',archived:true},'teacher');
  await assert.rejects(service.loginAccount('student','student01','Student2026'), /账号暂不可用/);
});

test('教师账号迁移保留旧身份作品且只写一次，旧管理员转换教师范围；审核或登录保存失败原子回滚', async () => {
  const { service, storage, fail, writes } = setup();
  const before = service.read();
  assert.equal(prepareAccountRegistration(before), before);
  new MockService(storage,clock);
  assert.equal(writes(),1);
  const legacy = copy(before); delete legacy.accountRegistrationVersion; delete legacy.loginCredentials; delete legacy.teacherApplications;
  legacy.adminAccount = {signedIn:true,administratorId:'admin-xinghe'};
  const migrated = setup(legacy).service.read();
  assert.equal(migrated.teacherAccount.teacherId, 'teacher-admin-xinghe');
  assert.deepEqual(migrated.submissions, legacy.submissions);
  assert.deepEqual(migrated.accounts, legacy.accounts);
  const app = await service.submitTeacherApplication(input), pending = service.read(); fail(true);
  await assert.rejects(service.reviewTeacherApplication(app.id,{decision:'approved'},'platform-demo'),/存储满/);
  assert.deepEqual(service.read(), pending);
  await assert.rejects(service.loginAccount('teacher','teacher01','Teacher2026'),/存储满/);
  assert.deepEqual(service.read(),pending);
  fail(false);
  await service.reviewTeacherApplication(app.id,{decision:'approved'},'platform-demo');
  assert.equal(service.read().teacherApplications.filter(a => a.status === 'approved').length,1);
});

test('教师重新领取本班账号只读且密码不变，越班和学生请求被拒绝，练习新增学生同时发号', async () => {
  const {service, writes} = setup();
  await service.loginAccount('teacher','teacher02','Teacher2026');
  const before = service.read(), count = writes();
  const first = service.studentCredentials('class-2','teacher');
  assert.ok(first.length);
  first[0].password = '篡改返回值';
  assert.deepEqual(service.read(), before);
  assert.notEqual(service.studentCredentials('class-2','teacher')[0].password, first[0].password);
  assert.equal(writes(), count);
  assert.throws(() => service.studentCredentials('class-1','teacher'), /管理范围/);
  assert.throws(() => service.studentCredentials('class-2','student'), /教师身份/);
  service.prepareClassPractice();
  for (const student of service.read().students) assert.ok(service.read().loginCredentials.some(account => account.personId === student.id));
});


test('同手机号跨校不能重复申请或审批，手机号格式统一，退回可重新申请', async () => {
  const {service} = setup();
  const app = await service.submitTeacherApplication({...input,phone:'+86 138-1234-5678'});
  assert.equal(app.phone,input.phone);
  await assert.rejects(service.submitTeacherApplication({...input,school:'另一校'}),/已有申请/);
  await service.reviewTeacherApplication(app.id,{decision:'rejected',reason:'重新核对'},'platform-demo');
  const retry = await service.submitTeacherApplication(input);
  await service.reviewTeacherApplication(retry.id,{decision:'approved'},'platform-demo');
  await assert.rejects(service.submitTeacherApplication({...input,school:'另一校'}),/已有账号/);
});

test('改密校验及存储失败不改变账号，成功后旧密码失效且刷新不再提示', async () => {
  const {service,storage,fail} = setup();
  const app = await service.submitTeacherApplication(input);
  const {credential} = await service.reviewTeacherApplication(app.id,{decision:'approved'},'platform-demo');
  await service.loginAccount('teacher',credential.username,'Aa123456');
  const before = service.read(), valid={currentPassword:'Aa123456',newPassword:'Chosen2027',confirmPassword:'Chosen2027'};
  for(const invalid of [{currentPassword:'wrong'},{newPassword:'12345678',confirmPassword:'12345678'},{confirmPassword:'other'},{newPassword:'Aa123456',confirmPassword:'Aa123456'}]) {
    await assert.rejects(service.changeTeacherPassword({...valid,...invalid},'teacher'));
    assert.deepEqual(service.read(),before);
  }
  await assert.rejects(service.changeTeacherPassword(valid,'student'),/教师账号/);
  fail(true);await assert.rejects(service.changeTeacherPassword(valid,'teacher'),/存储满/);
  assert.deepEqual(service.read(),before);fail(false);
  await service.changeTeacherPassword(valid,'teacher');
  const reloaded = new MockService(storage,clock);
  assert.equal(reloaded.read().teacherAccount.mustChangePassword,false);
  await assert.rejects(reloaded.loginAccount('teacher',credential.username,'Aa123456'),/账号或密码/);
  await reloaded.loginAccount('teacher',credential.username,'Chosen2027');
  assert.ok(!reloaded.read().teacherAccount.mustChangePassword);
});

test('v0.26已颁发随机教师账号迁移为手机号，保留改过的密码、学生账号及全部学习记录', async () => {
  const {service} = setup();
  const app = await service.submitTeacherApplication(input);
  const {credential} = await service.reviewTeacherApplication(app.id,{decision:'approved'},'platform-demo');
  await service.loginAccount('teacher',credential.username,'Aa123456');
  const old = service.read();old.accountRegistrationVersion=1;
  const account=old.loginCredentials.find(item=>item.id===credential.id);account.username='ToldRandom';account.password='oldRandomPassword';delete account.mustChangePassword;
  const migrated=setup(old).service.read(),updated=migrated.loginCredentials.find(item=>item.id===account.id);
  assert.equal(updated.username,input.phone);assert.equal(updated.password,'Aa123456');
  assert.equal(migrated.teacherAccount.mustChangePassword,true);
  assert.deepEqual(migrated.submissions,old.submissions);
  assert.deepEqual(migrated.loginCredentials.filter(item=>item.role==='student'),old.loginCredentials.filter(item=>item.role==='student'));
  old.loginCredentials.find(item=>item.id===account.id).passwordChangedAt='2026-11-04T01:00:00Z';
  assert.equal(setup(old).service.read().loginCredentials.find(item=>item.id===account.id).password,'oldRandomPassword');
  old.loginCredentials.push({...account,id:'conflict-account',personId:'conflict-teacher'});
  old.teachers.push({...old.teachers.find(item=>item.id===account.personId),id:'conflict-teacher'});
  const conflict=setup(old).service.read();
  assert.ok(conflict.loginCredentials.filter(item=>[account.id,'conflict-account'].includes(item.id)).every(item=>item.disabled));
  assert.equal(conflict.teacherAccount.signedIn,false);
});
