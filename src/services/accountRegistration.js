/** Local prototype only. Production approval, password hashes and sessions belong on the server. */
const copy = value => JSON.parse(JSON.stringify(value));
const identifier = prefix => `${prefix}-${Date.now()}-${randomToken(10)}`;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomToken(length) {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(value => ALPHABET[value % ALPHABET.length]).join('');
}
function credential(state, role, personId, source = 'issued') {
  let username;
  do { username = `${role === 'teacher' ? 'T' : 'S'}${randomToken(10)}`; }
  while (state.loginCredentials.some(item => item.username.toLowerCase() === username.toLowerCase()));
  const entry = { id: identifier('credential'), role, personId, username, password: randomToken(12), source };
  state.loginCredentials.push(entry);
  return entry;
}

export const INITIAL_TEACHER_PASSWORD = 'Aa123456';
export function normalizeTeacherPhone(value) {
  let digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2);
  if (digits.length === 15 && digits.startsWith('0086')) digits = digits.slice(4);
  return digits;
}
function prepareLegacyAccounts(state) {
  if (state.accountRegistrationVersion === 1) return state;
  const next = { ...state, accountRegistrationVersion: 1, teacherApplications: [], loginCredentials: [], teachers: [...state.teachers] };
  // Preserve historical administrator scopes through ordinary teacher accounts.
  for (const administrator of state.administrators || []) {
    const teacherId = `teacher-${administrator.id}`;
    if (!next.teachers.some(item => item.id === teacherId)) next.teachers.push({
      id: teacherId, name: administrator.name.replace(/管理员$/, '老师'), initial: administrator.initial, subject: '语文',
      organizationIds: [...administrator.organizationIds],
      classIds: state.classes.filter(item => administrator.organizationIds.includes(item.organizationId)).map(item => item.id),
    });
  }
  for (const [index, teacher] of next.teachers.entries()) next.loginCredentials.push({
    id: `credential-${teacher.id}`, role: 'teacher', personId: teacher.id,
    username: `teacher${String(index + 1).padStart(2, '0')}`, password: 'Teacher2026', source: 'demo',
  });
  for (const [index, student] of state.students.entries()) next.loginCredentials.push({
    id: `credential-${student.id}`, role: 'student', personId: student.id,
    username: `student${String(index + 1).padStart(2, '0')}`, password: 'Student2026', source: 'demo',
  });
  if (state.adminAccount?.signedIn && state.adminAccount.administratorId && !state.teacherAccount.signedIn) {
    const migrated = next.teachers.find(item => item.id === `teacher-${state.adminAccount.administratorId}`);
    if (migrated) {
      next.teacherAccount = { signedIn: true, teacherId: migrated.id };
      next.teacherClassIds = [...migrated.classIds];
    }
  }
  return next;
}


export function prepareAccountRegistration(state) {
  if (state.accountRegistrationVersion === 2) return state;
  const next = copy(prepareLegacyAccounts(state));
  next.accountRegistrationVersion = 2;
  // Preserve demo accounts and every learning record. Earlier issued accounts
  // keep their IDs, so approved applications continue pointing at the same row.
  const issued = next.loginCredentials.filter(item => item.role === 'teacher' && item.source === 'issued');
  const claimed = new Set(next.loginCredentials.filter(item => !issued.includes(item)).map(item => item.username.toLowerCase()));
  const phoneFor = account => normalizeTeacherPhone(next.teacherApplications.find(item => item.credentialId === account.id || item.teacherId === account.personId)?.phone || next.teachers.find(item => item.id === account.personId)?.phone);
  const counts = new Map();
  for (const account of issued) { const phone=phoneFor(account); counts.set(phone,(counts.get(phone)||0)+1); }
  for (const account of issued) {
    const teacher = next.teachers.find(item => item.id === account.personId);
    const application = next.teacherApplications.find(item => item.credentialId === account.id || item.teacherId === account.personId);
    const phone = normalizeTeacherPhone(application?.phone || teacher?.phone);
    if (!phone || counts.get(phone) > 1 || claimed.has(phone)) {
      account.disabled = true;
      account.phoneConflict = true;
    } else {
      account.username = phone; claimed.add(phone);
      if (!account.passwordChangedAt) { account.password = INITIAL_TEACHER_PASSWORD; account.mustChangePassword = true; }
    }
  }
  if (next.teacherAccount?.signedIn) {
    const account = next.loginCredentials.find(item => item.role === 'teacher' && item.personId === next.teacherAccount.teacherId);
    if (account?.disabled) next.teacherAccount = { ...next.teacherAccount, signedIn: false };
    else if (account?.mustChangePassword) next.teacherAccount = { ...next.teacherAccount, mustChangePassword: true };
  }
  return next;
}

/** Mutates only a caller-owned next state, so issuing accounts and importing a roster commit together. */
export function issueStudentCredentials(state, studentIds) {
  if (!Array.isArray(studentIds) || new Set(studentIds).size !== studentIds.length) throw new Error('学生名单无效。');
  const students = studentIds.map(id => state.students.find(item => item.id === id));
  if (students.some(item => !item)) throw new Error('学生档案不存在。');
  return students.map(student => {
    const account = state.loginCredentials.find(item => item.role === 'student' && item.personId === student.id)
      || credential(state, 'student', student.id);
    return { studentId: student.id, name: student.name, className: student.className, studentNumber: student.studentNumber || '', username: account.username, password: account.password };
  });
}

function textField(value, label, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`请填写${label}。`);
  if (value.trim().length > max) throw new Error(`${label}不能超过${max}个字。`);
  return value.trim();
}
function proofField(value) {
  if (value == null) return undefined;
  const name = textField(value.name, '教师证明文件名', 120);
  if (typeof value.url !== 'string' || !value.url.startsWith('data:') || value.url.length > 3 * 1024 * 1024)
    throw new Error('请重新上传教师证明文件。');
  if (!/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(value.url))
    throw new Error('教师证明仅支持 JPG、PNG、WebP 图片或 PDF。');
  if (!Number.isFinite(value.size) || value.size <= 0 || value.size > 2 * 1024 * 1024)
    throw new Error('教师证明文件不能超过2 MB。');
  return { name, url: value.url, type: value.type || '', size: value.size };
}
export function submitTeacherApplication(state, input, now) {
  const name = textField(input.name, '姓名', 30), school = textField(input.school, '学校', 80);
  const suppliedPhone = textField(input.phone, '联系电话', 24);
  const phone = normalizeTeacherPhone(suppliedPhone);
  if (!/^[+\d ()-]{7,24}$/.test(suppliedPhone) || !/^1\d{10}$/.test(phone)) throw new Error('请填写有效的11位手机号，作为教师登录账号。');
  if (state.loginCredentials.some(item => item.role === 'teacher' && item.username === phone)) throw new Error('该手机号已有账号，请登录或联系平台查询。');
  const proof = proofField(input.proof);
  if (state.teacherApplications.some(item => normalizeTeacherPhone(item.phone) === phone && item.status !== 'rejected'))
    throw new Error('该手机号已有申请，请等待审核或联系平台查询账号。');
  const application = { id: identifier('application'), name, school, phone, ...(proof ? { proof } : {}), status: 'pending', submittedAt: now.toISOString(), reason: '' };
  return { state: { ...state, teacherApplications: [...state.teacherApplications, application] }, application: copy(application) };
}

export function reviewTeacherApplication(state, id, input, actor, now) {
  if (actor !== 'platform-demo') throw new Error('此操作仅供平台审核，教师和学生不能审核教师申请。');
  if (!['approved', 'rejected'].includes(input.decision)) throw new Error('请选择通过或退回申请。');
  const existing = state.teacherApplications.find(item => item.id === id);
  if (!existing || existing.status !== 'pending') throw new Error('申请不存在或已完成审核，请刷新后重试。');
  const reason = input.decision === 'rejected' ? textField(input.reason, '退回原因', 300) : '';
  const next = copy(state), application = next.teacherApplications.find(item => item.id === id);
  Object.assign(application, { status: input.decision, reviewedAt: now.toISOString(), reason });
  let account;
  if (input.decision === 'approved') {
    const phone = normalizeTeacherPhone(application.phone);
    if (!/^1\d{10}$/.test(phone)) throw new Error('请先核对教师申请手机号。');
    if (next.loginCredentials.some(item => item.role === 'teacher' && (item.username === phone || normalizeTeacherPhone(next.teachers.find(teacher => teacher.id === item.personId)?.phone) === phone))) throw new Error('该手机号已有教师账号，请核对申请。');
    application.phone = phone;
    let organization = next.organizations.find(item => item.name === application.school);
    if (!organization) {
      organization = { id: identifier('organization'), name: application.school, kind: 'school' };
      next.organizations.push(organization);
    }
    const teacher = { id: identifier('teacher'), name: application.name, initial: [...application.name][0], phone: application.phone, subject: '语文', organizationIds: [organization.id], classIds: [], applicationId: application.id };
    next.teachers.push(teacher);
    account = { id: identifier('credential'), role: 'teacher', personId: teacher.id, username: phone, password: INITIAL_TEACHER_PASSWORD, source: 'issued', mustChangePassword: true };
    next.loginCredentials.push(account);
    Object.assign(application, { teacherId: teacher.id, credentialId: account.id });
  }
  return { state: next, application: copy(application), ...(account ? { credential: copy(account) } : {}) };
}

export function authenticateAccount(state, role, username, password) {
  if (role !== 'teacher' && role !== 'student') throw new Error('请选择教师或学生身份。');
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) throw new Error('请输入账号和密码。');
  const phone = role === 'teacher' ? normalizeTeacherPhone(username) : '';
  const login = /^1\d{10}$/.test(phone) ? phone : username.trim();
  const account = state.loginCredentials.find(item => item.role === role && item.username.toLowerCase() === login.toLowerCase() && item.password === password && !item.disabled);
  if (!account) throw new Error('账号或密码不正确，请核对后重试。');
  const person = (role === 'teacher' ? state.teachers : state.students).find(item => item.id === account.personId);
  if (!person || (role === 'student' && person.archived)) throw new Error('账号暂不可用，请联系教师或平台核对。');
  const next = role === 'teacher'
    ? { ...state, teacherAccount: { signedIn: true, teacherId: person.id, ...(account.mustChangePassword ? { mustChangePassword: true } : {}) }, teacherClassIds: [...person.classIds] }
    : { ...state, accounts: { ...state.accounts, student: { signedIn: true, studentId: person.id } } };
  return { state: next, person: copy(person) };
}


export function changeTeacherPassword(state, input, role, now) {
  if (role !== 'teacher' || !state.teacherAccount?.signedIn) throw new Error('请先登录教师账号。');
  const account = state.loginCredentials.find(item => item.role === 'teacher' && item.personId === state.teacherAccount.teacherId && !item.disabled);
  if (!account || account.password !== input?.currentPassword) throw new Error('初始密码不正确，请重新输入。');
  const password = input?.newPassword;
  if (typeof password !== 'string' || password.length < 8 || password.length > 32 || /\s/.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new Error('新密码需为8—32位，并包含字母和数字，不能含空格。');
  if (password !== input.confirmPassword) throw new Error('两次输入的新密码不一致。');
  if (password === account.password || password === INITIAL_TEACHER_PASSWORD) throw new Error('新密码不能与初始密码相同。');
  const next = copy(state), updated = next.loginCredentials.find(item => item.id === account.id);
  Object.assign(updated, { password, mustChangePassword: false, passwordChangedAt: now.toISOString() });
  next.teacherAccount = { ...next.teacherAccount, mustChangePassword: false };
  return next;
}
