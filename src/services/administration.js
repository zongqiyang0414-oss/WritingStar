/** Local prototype administration. Real authorization must come from the backend session. */
export const ADMIN_INVITATIONS = [
  { code: "MA2026", role: "admin", administratorId: "admin-xinghe", label: "王管理员 · 星河小学", status: "active" },
  { code: "MB2026", role: "admin", administratorId: "admin-qinghe", label: "林管理员 · 青禾学习中心", status: "active" },
  { code: "MEX2026", role: "admin", administratorId: "admin-xinghe", label: "过期管理员码", status: "expired" },
];

export function prepareAdministration(state) {
  if (state.administrationVersion === 1) return state;
  return {
    ...state,
    administrationVersion: 1,
    adminAccount: { signedIn: false, administratorId: null },
    administrators: [
      { id: "admin-xinghe", name: "王管理员", initial: "王", organizationIds: ["organization-1"] },
      { id: "admin-qinghe", name: "林管理员", initial: "林", organizationIds: ["organization-2"] },
    ],
    administrationEvents: [],
  };
}

export function getBoundAdministrator(state) {
  return state.adminAccount?.signedIn
    ? state.administrators?.find((item) => item.id === state.adminAccount.administratorId)
    : undefined;
}

export function previewAdminBinding(state, code) {
  if (!state.adminAccount.signedIn) throw new Error("请先登录，再输入管理员邀请码。");
  if (state.adminAccount.administratorId) throw new Error("当前管理员身份已绑定，请联系学校负责人核对。");
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error("请输入学校提供的管理员邀请码。");
  const invitation = ADMIN_INVITATIONS.find((item) => item.code === normalized);
  if (!invitation) throw new Error("管理员邀请码不存在，请核对身份和邀请码。");
  if (invitation.status !== "active") throw new Error("管理员邀请码已过期，请联系学校负责人。");
  const administrator = state.administrators.find((item) => item.id === invitation.administratorId);
  const organizations = state.organizations.filter((item) => administrator?.organizationIds.includes(item.id));
  if (!administrator || !organizations.length || organizations.length !== new Set(administrator.organizationIds).size)
    throw new Error("管理员授权范围暂不可用，请联系学校负责人。");
  return { role: "admin", code: normalized, administrator, organizations };
}

const identifier = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const field = (value, label, limit) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`请填写${label}。`);
  if (value.trim().length > limit) throw new Error(`${label}不能超过${limit}个字。`);
  return value.trim();
};

export class AdministrationService {
  administrator(role) {
    if (role !== "admin") throw new Error("此操作需要管理员身份。");
    const administrator = getBoundAdministrator(this.state);
    if (!administrator) throw new Error("请先登录并完成管理员身份绑定。");
    return administrator;
  }
  managedOrganization(organizationId, role) {
    const administrator = this.administrator(role);
    const organization = this.state.organizations.find((item) => item.id === organizationId);
    if (!organization || !administrator.organizationIds.includes(organizationId))
      throw new Error("该学校／机构不在你的管理范围内。");
    return organization;
  }
  managedClass(classId, role) {
    this.administrator(role);
    const schoolClass = this.state.classes.find((item) => item.id === classId);
    if (!schoolClass) throw new Error("班级不存在，请刷新后重试。");
    this.managedOrganization(schoolClass.organizationId, role);
    return schoolClass;
  }
  recordAdministration(state, organizationId, description, role) {
    const administrator = this.administrator(role);
    state.administrationEvents.unshift({
      id: identifier("management"), organizationId, description,
      administratorId: administrator.id, administratorName: administrator.name,
      createdAt: this.clock().toISOString(),
    });
  }
  async saveClass(input, role) {
    const organization = this.managedOrganization(input.organizationId, role);
    const name = field(input.name, "班级名称", 30);
    const existing = input.id ? this.managedClass(input.id, role) : null;
    if (existing && existing.organizationId !== organization.id) throw new Error("班级不能跨学校／机构移动。");
    if (this.state.classes.some((item) => item.organizationId === organization.id && item.id !== existing?.id && item.name === name))
      throw new Error("本校已有同名班级，请使用其他名称。");
    const next = this.read();
    const schoolClass = existing ? next.classes.find((item) => item.id === existing.id) : { id: identifier("class"), organizationId: organization.id, name };
    schoolClass.name = name;
    if (!existing) next.classes.push(schoolClass);
    else {
      for (const item of [...next.students, ...next.assignments]) if (item.classId === schoolClass.id) item.className = name;
    }
    this.recordAdministration(next, organization.id, `${existing ? "修改班级" : "新建班级"}：${name}`, role);
    this.commit(next);
    return { ...schoolClass };
  }
  async createTeacher(input, role) {
    const organization = this.managedOrganization(input.organizationId, role);
    const name = field(input.name, "教师姓名", 30);
    const subject = field(input.subject, "任教学科", 30);
    if (input.phone !== undefined && typeof input.phone !== "string") throw new Error("请填写有效的11位手机号。");
    const phone = (input.phone || "").trim();
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) throw new Error("请填写有效的11位手机号。");
    if (phone && this.state.teachers.some((item) => item.organizationIds.includes(organization.id) && item.phone === phone))
      throw new Error("本校已有该手机号的教师，请核对已有档案。");
    const classIds = input.classIds === undefined ? [] : input.classIds;
    if (!Array.isArray(classIds) || new Set(classIds).size !== classIds.length) throw new Error("请重新选择任教班级。");
    for (const id of classIds) {
      const schoolClass = this.managedClass(id, role);
      if (schoolClass.organizationId !== organization.id) throw new Error("只能选择当前学校／机构的任教班级。");
    }
    const next = this.read();
    const teacher = {
      id: identifier("teacher"), name, initial: [...name][0], subject,
      ...(phone ? { phone } : {}), organizationIds: [organization.id], classIds: [...classIds],
    };
    next.teachers.push(teacher);
    this.recordAdministration(next, organization.id, `添加教师：${name} · ${subject} · ${classIds.length ? "任教" + classIds.length + "个班级" : "待分配班级"}`, role);
    this.commit(next);
    return { ...teacher, organizationIds: [...teacher.organizationIds], classIds: [...teacher.classIds] };
  }
  async setClassTeachers(input, role) {
    const schoolClass = this.managedClass(input.classId, role);
    if (!Array.isArray(input.teacherIds) || new Set(input.teacherIds).size !== input.teacherIds.length)
      throw new Error("请重新选择任教老师。");
    for (const id of input.teacherIds) {
      const teacher = this.state.teachers.find((item) => item.id === id);
      if (!teacher || !teacher.organizationIds.includes(schoolClass.organizationId))
        throw new Error("只能分配本校已关联的老师。");
    }
    const next = this.read();
    for (const teacher of next.teachers) {
      if (!teacher.organizationIds.includes(schoolClass.organizationId)) continue;
      teacher.classIds = teacher.classIds.filter((id) => id !== schoolClass.id);
      if (input.teacherIds.includes(teacher.id)) teacher.classIds.push(schoolClass.id);
    }
    const boundTeacher = next.teachers.find((item) => item.id === next.teacherAccount.teacherId);
    if (boundTeacher) next.teacherClassIds = [...boundTeacher.classIds];
    this.recordAdministration(next, schoolClass.organizationId, `调整任教：${schoolClass.name}，${input.teacherIds.length}位老师`, role);
    this.commit(next);
  }
  async saveStudent(input, role) {
    const schoolClass = this.managedClass(input.classId, role);
    const name = field(input.name, "学生姓名", 30);
    const studentNumber = field(input.studentNumber, "学号", 32);
    const existing = input.id ? this.state.students.find((item) => item.id === input.id) : null;
    if (input.id && !existing) throw new Error("学生档案不存在，请刷新后重试。");
    if (existing) {
      this.managedClass(existing.classId, role);
      if (existing.classId !== schoolClass.id) throw new Error("调整班级请使用调班功能。");
    }
    const classIds = this.state.classes.filter((item) => item.organizationId === schoolClass.organizationId).map((item) => item.id);
    if (this.state.students.some((item) => classIds.includes(item.classId) && item.id !== existing?.id && item.studentNumber?.toLowerCase() === studentNumber.toLowerCase()))
      throw new Error("本校已有该学号的学生，请核对已有档案（包括已归档学生）。");
    const next = this.read();
    const student = existing ? next.students.find((item) => item.id === existing.id) : { id: identifier("student"), classId: schoolClass.id, className: schoolClass.name, archived: false };
    Object.assign(student, { name, initial: [...name][0], studentNumber });
    if (!existing) next.students.push(student);
    this.recordAdministration(next, schoolClass.organizationId, `${existing ? "修改学生" : "新增学生"}：${name} · ${schoolClass.name}`, role);
    this.commit(next);
    return { ...student };
  }
  async transferStudents(input, role) {
    const source = this.managedClass(input.sourceClassId, role);
    const target = this.managedClass(input.targetClassId, role);
    if (source.organizationId !== target.organizationId) throw new Error("只能在同一学校／机构内调班。");
    if (source.id === target.id) throw new Error("请选择不同的目标班级。");
    if (!Array.isArray(input.studentIds) || !input.studentIds.length || new Set(input.studentIds).size !== input.studentIds.length)
      throw new Error("请至少选择一位学生，且不要重复选择。");
    for (const id of input.studentIds) {
      const student = this.state.students.find((item) => item.id === id);
      if (!student || student.archived || student.classId !== source.id)
        throw new Error("学生名单已变化，请返回原班级重新选择。");
    }
    const next = this.read();
    for (const student of next.students) if (input.studentIds.includes(student.id)) {
      student.classId = target.id;
      student.className = target.name;
    }
    this.recordAdministration(next, source.organizationId, `调班${input.studentIds.length}人：${source.name} → ${target.name}`, role);
    this.commit(next);
  }
  async setStudentArchived(input, role) {
    this.administrator(role);
    const student = this.state.students.find((item) => item.id === input.studentId);
    if (!student) throw new Error("学生档案不存在。");
    const schoolClass = this.managedClass(student.classId, role);
    if (typeof input.archived !== "boolean") throw new Error("请选择学生状态。");
    if (!!student.archived === input.archived) throw new Error("学生状态已变化，请刷新后重试。");
    const next = this.read();
    next.students.find((item) => item.id === student.id).archived = input.archived;
    this.recordAdministration(next, schoolClass.organizationId, `${input.archived ? "归档学生" : "恢复在班"}：${student.name} · ${schoolClass.name}`, role);
    this.commit(next);
  }
}
