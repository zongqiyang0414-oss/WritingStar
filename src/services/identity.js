import { ADMIN_INVITATIONS } from "./administration.js";

export function createTeachers(classes, classIds) {
  return [
    {
      id: "teacher-chen",
      name: "陈老师",
      initial: "陈",
      subject: "语文",
      organizationIds: [
        ...new Set(
          classes
            .filter((e) => classIds.includes(e.id))
            .map((e) => e.organizationId),
        ),
      ],
      classIds: [...classIds],
    },
    {
      id: "teacher-li",
      name: "李老师",
      initial: "李",
      subject: "语文",
      organizationIds: ["organization-1"],
      classIds: ["class-2"],
    },
    {
      id: "teacher-zhou",
      name: "周老师",
      initial: "周",
      subject: "语文",
      organizationIds: ["organization-2"],
      classIds: ["partner-v07-class-1"],
    },
    {
      id: "teacher-waiting",
      name: "张老师",
      initial: "张",
      subject: "语文",
      organizationIds: ["organization-1"],
      classIds: [],
    },
  ];
}
export function getBoundTeacher(state) {
  return state.teacherAccount.signedIn
    ? state.teachers.find((a) => a.id === state.teacherAccount.teacherId)
    : undefined;
}
export function teacherSummary(teacher) {
  return {
    id: teacher.id,
    name: teacher.name,
    initial: teacher.initial,
  };
}
export const DEFAULT_TEACHER = {
  id: "teacher-chen",
  name: "陈老师",
  initial: "陈",
};
export function getTeacherClasses(state, organizationId) {
  const t = getBoundTeacher(state);
  return t
    ? state.classes.filter(
        (s) =>
          t.classIds.includes(s.id) &&
          t.organizationIds.includes(s.organizationId) &&
          state.teacherClassIds.includes(s.id) &&
          (undefined === organizationId || s.organizationId === organizationId),
      )
    : [];
}
export function organizationForClass(state, classId) {
  const t = state.classes.find((e) => e.id === classId);
  return state.organizations.find((e) => e.id === t?.organizationId);
}
export const STUDENT_INVITATIONS = [
  {
    code: "XS2026",
    role: "student",
    studentId: "student-1",
    label: "小禾 · 甲秀小学",
    status: "active",
  },
  {
    code: "JZ2026",
    role: "student",
    studentId: "student-1",
    label: "小禾 · 甲秀小学",
    status: "active",
    legacy: true,
  },
  {
    code: "CX2026",
    role: "student",
    studentId: "student-4",
    label: "小川 · 甲秀小学四（2）班",
    status: "active",
  },
  {
    code: "CJ2026",
    role: "student",
    studentId: "student-4",
    label: "小川 · 甲秀小学四（2）班",
    status: "active",
    legacy: true,
  },
  {
    code: "AX2026",
    role: "student",
    studentId: "partner-v07-student-1",
    label: "小安 · 青禾学习中心",
    status: "active",
  },
  {
    code: "AJ2026",
    role: "student",
    studentId: "partner-v07-student-1",
    label: "小安 · 青禾学习中心",
    status: "active",
    legacy: true,
  },
  {
    code: "EX2026",
    role: "student",
    studentId: "student-1",
    label: "过期示例",
    status: "expired",
  },
  {
    code: "OFF2026",
    role: "student",
    studentId: "student-1",
    label: "停用示例",
    status: "disabled",
    legacy: true,
  },
];
export const TEACHER_INVITATIONS = [
  {
    code: "JS2026",
    role: "teacher",
    teacherId: "teacher-chen",
    label: "陈老师 · 两所学校／机构",
    status: "active",
  },
  {
    code: "LS2026",
    role: "teacher",
    teacherId: "teacher-li",
    label: "李老师 · 甲秀小学四（2）班",
    status: "active",
  },
  {
    code: "ZS2026",
    role: "teacher",
    teacherId: "teacher-zhou",
    label: "周老师 · 青禾学习中心",
    status: "active",
  },
  {
    code: "WK2026",
    role: "teacher",
    teacherId: "teacher-waiting",
    label: "张老师 · 学校已绑定，待分配班级",
    status: "active",
  },
  {
    code: "TEX2026",
    role: "teacher",
    teacherId: "teacher-chen",
    label: "过期教师码",
    status: "expired",
  },
];
export const DEMO_INVITATIONS = [
  ...STUDENT_INVITATIONS.filter((invitation) => !invitation.legacy),
  ...TEACHER_INVITATIONS,
  ...ADMIN_INVITATIONS,
];
export function getBoundStudent(state, role) {
  if (role !== "student") return;
  const t = state.accounts[role];
  if (!t.signedIn || !t.studentId) return;
  const s = state.students.find((e) => e.id === t.studentId);
  return s && organizationForClass(state, s.classId) ? s : undefined;
}
export function previewStudentBinding(state, code, role) {
  assertActiveRole(role);
  if (role !== "student") throw new Error("此绑定入口仅供学生使用。");
  const s = (function (e) {
      if ("teacher" === e) throw new Error("教师身份暂不使用此绑定入口。");
      return e;
    })(role),
    l = state.accounts[s];
  if (!l.signedIn) throw new Error("请先登录，再输入邀请码。");
  if (l.studentId)
    throw new Error("当前身份已绑定，信息有误请联系学校管理员。");
  const n = code.trim().toUpperCase();
  if (!n) throw new Error("请输入学校提供的邀请码。");
  const i = STUDENT_INVITATIONS.find((e) => e.code === n);
  if (!i && TEACHER_INVITATIONS.some((e) => e.code === n))
    throw new Error("这是教师邀请码，请向学校获取当前身份的邀请码。");
  if (!i) throw new Error("邀请码不存在，请核对后重新输入。");
  if ("active" !== i.status)
    throw new Error(
      "expired" === i.status
        ? "邀请码已过期，请联系学校管理员重新获取。"
        : "邀请码已停用，请联系学校管理员。",
    );
  if (i.role !== s)
    throw new Error(
      `这是${"student" === i.role ? "学生" : "学生"}邀请码，请向学校获取当前身份的邀请码。`,
    );
  const u = state.students.find((e) => e.id === i.studentId),
    d = state.classes.find((e) => e.id === u?.classId),
    o = d && organizationForClass(state, d.id);
  if (!u || u.archived || !d || !o)
    throw new Error("对应学习档案暂不可绑定，请联系学校管理员核对。");
  return {
    code: n,
    role: s,
    student: u,
    schoolClass: d,
    organization: o,
  };
}
export function assertActiveRole(role) {
  if (role !== "teacher" && role !== "student" && role !== "admin")
    throw new Error("请选择教师或学生身份，也可选择已获授权的管理员。");
  return role;
}
