import {
  STUDENT_INVITATIONS,
  TEACHER_INVITATIONS,
  assertActiveRole,
  getBoundStudent,
  getBoundTeacher,
  getTeacherClasses,
  previewStudentBinding,
  teacherSummary,
} from "./identity.js";
import {
  createAccounts,
  createSeed,
  prepareTeacherState,
  sampleReview,
} from "./seed.js";
import { emptyReview, validateReview } from "./rubric.js";
import { migrateStudentEntry } from "./migration.js";
import { withClassPractice } from "./classPractice.js";

export const clone = (e) => JSON.parse(JSON.stringify(e));
export class MockService {
  constructor(storage, clock = () => new Date()) {
    this["state"] = undefined;
    this.storage = storage;
    this.clock = clock;
    const s = storage.read();
    this.state = migrateStudentEntry(
      s
        ? (function (e, a) {
            if (e.schemaVersion === 5 || e.schemaVersion === 6) return e;
            if (4 === e.schemaVersion) return prepareTeacherState(e);
            if (3 === e.schemaVersion)
              return prepareTeacherState({
                ...e,
                schemaVersion: 4,
                accounts: createAccounts(e.students),
              });
            const t = createSeed(a);
            if (2 === e.schemaVersion) {
              const a = t.classes.filter(
                  (a) =>
                    "organization-2" === a.organizationId &&
                    !e.classes.some((e) => e.id === a.id),
                ),
                s = new Set(a.map((e) => e.id)),
                l = [
                  ...e.classes.map((e) => ({
                    ...e,
                    organizationId: "organization-1",
                  })),
                  ...a,
                ];
              return prepareTeacherState({
                ...e,
                schemaVersion: 4,
                accounts: createAccounts(e.students),
                organizations: t.organizations,
                teacherClassIds: l.map((e) => e.id),
                classes: l,
                assignments: [
                  ...e.assignments,
                  ...t.assignments.filter(
                    (a) =>
                      s.has(a.classId) &&
                      !e.assignments.some((e) => e.id === a.id),
                  ),
                ],
                students: [
                  ...e.students,
                  ...t.students.filter(
                    (a) =>
                      s.has(a.classId) &&
                      !e.students.some((e) => e.id === a.id),
                  ),
                ],
              });
            }
            if (1 !== e.schemaVersion)
              throw new Error("数据版本不匹配，请从展示设置恢复初始数据。");
            const s = [...t.classes],
              l = (e) => {
                let a = s.find(
                  (a) => a.name === e && "organization-1" === a.organizationId,
                );
                a ||
                  ((a = {
                    id: "class-legacy-" + s.length,
                    name: e,
                    organizationId: "organization-1",
                  }),
                  s.push(a));
                return a.id;
              },
              n = e.assignments.map((e) => ({
                ...e,
                classId: l(e.className),
              })),
              i = e.students.map((e) => ({
                ...e,
                classId: l(e.className),
              }));
            return prepareTeacherState({
              schemaVersion: 4,
              accounts: createAccounts(i),
              organizations: t.organizations,
              teacherClassIds: s.map((e) => e.id),
              classes: s,
              assignments: [
                ...n,
                ...t.assignments.filter((e) => !n.some((a) => a.id === e.id)),
              ],
              students: [
                ...i,
                ...t.students.filter((e) => !i.some((a) => a.id === e.id)),
              ],
              submissions: e.submissions,
            });
          })(s, clock())
        : createSeed(clock()),
    );
    (s && 6 === s.schemaVersion) || storage.write(this.state);
  }
  read() {
    return clone(this.state);
  }
  commit(state) {
    this.storage.write(state);
    this.state = state;
  }
  async signIn(role) {
    assertActiveRole(role);
    const a = this.read();
    "teacher" === role
      ? (a.teacherAccount.signedIn = true)
      : (a.accounts[role].signedIn = true);
    this.commit(a);
  }
  previewBinding(code, role) {
    assertActiveRole(role);
    return clone(
      "teacher" === role
        ? (function (e, a) {
            if (!e.teacherAccount.signedIn)
              throw new Error("请先登录，再输入教师邀请码。");
            if (e.teacherAccount.teacherId)
              throw new Error("当前教师身份已绑定，信息有误请联系学校管理员。");
            const t = a.trim().toUpperCase();
            if (!t) throw new Error("请输入学校提供的邀请码。");
            const s = TEACHER_INVITATIONS.find((e) => e.code === t);
            if (!s && STUDENT_INVITATIONS.some((e) => e.code === t))
              throw new Error("这是学生邀请码，请向学校获取教师邀请码。");
            if (!s) throw new Error("邀请码不存在，请核对后重新输入。");
            if ("active" !== s.status)
              throw new Error("邀请码已过期，请联系学校管理员重新获取。");
            const l = e.teachers.find((e) => e.id === s.teacherId),
              n = e.organizations.filter((e) =>
                l?.organizationIds.includes(e.id),
              );
            if (!l || !n.length || n.length !== new Set(l.organizationIds).size)
              throw new Error("对应教师档案暂不可绑定，请联系学校管理员核对。");
            const i = e.classes.filter(
              (e) =>
                l.classIds.includes(e.id) &&
                l.organizationIds.includes(e.organizationId),
            );
            if (i.length !== new Set(l.classIds).size)
              throw new Error("任教信息暂不可用，请联系学校管理员核对。");
            return {
              code: t,
              role: "teacher",
              teacher: l,
              organizations: n,
              classes: i,
            };
          })(this.state, code)
        : previewStudentBinding(this.state, code, role),
    );
  }
  async bindInvitation(code, role) {
    assertActiveRole(role);
    const t = this.previewBinding(code, role),
      s = this.read();
    "teacher" === t.role
      ? ((s.teacherAccount = {
          signedIn: true,
          teacherId: t.teacher.id,
        }),
        (s.teacherClassIds = t.classes.map((e) => e.id)))
      : (s.accounts[t.role] = {
          signedIn: true,
          studentId: t.student.id,
        });
    this.commit(s);
    return clone(t);
  }
  async restartBinding(role) {
    assertActiveRole(role);
    const a = this.read();
    "teacher" === role
      ? (a.teacherAccount = {
          signedIn: false,
          teacherId: null,
        })
      : (a.accounts[role] = {
          signedIn: false,
          studentId: null,
        });
    this.commit(a);
  }
  learner(role) {
    if (role !== "student") throw new Error("请选择学生身份。 ");
    const a = getBoundStudent(this.state, role);
    if (!a) throw new Error("请先登录并完成学习档案绑定。");
    return a;
  }
  teacher(role) {
    if ("teacher" !== role) throw new Error("此操作需要教师身份。");
    const a = getBoundTeacher(this.state);
    if (!a) throw new Error("请先登录并完成教师身份绑定。");
    return a;
  }
  teachingClass(classId, role) {
    this.teacher(role);
    const t = this.state.classes.find((a) => a.id === classId);
    if (!t) throw new Error("请选择任教班级。");
    if (!getTeacherClasses(this.state).some((a) => a.id === classId))
      throw new Error("该班级不在你的任教范围内。");
    return t;
  }
  teachingSubmission(submissionId, role) {
    const t = this.get(this.state, submissionId),
      s = this.state.assignments.find((e) => e.id === t.assignmentId);
    if (!s) throw new Error("作业不存在。");
    this.teachingClass(s.classId, role);
  }
  get(state, submissionId) {
    const t = state.submissions.find((e) => e.id === submissionId);
    if (!t) throw new Error("没有找到这份作品。");
    return t;
  }
  latest(assignmentId, studentId) {
    return clone(
      this.state.submissions
        .filter(
          (t) => t.assignmentId === assignmentId && t.studentId === studentId,
        )
        .sort((e, a) => a.version - e.version)[0] || null,
    );
  }
  feedback(submissionId, role) {
    assertActiveRole(role);
    const t = this.get(this.state, submissionId);
    if (
      ("teacher" === role && this.teachingSubmission(submissionId, role),
      "teacher" !== role && t.studentId !== this.learner(role).id)
    )
      throw new Error("只能查看当前关联学生的反馈。");
    return t.published ? clone(t.published) : null;
  }
  async saveDraft(submissionId, review, role) {
    this.teachingSubmission(submissionId, role);
    const s = this.read(),
      l = this.get(s, submissionId);
    if ("pending" !== l.status) throw new Error("这份作品当前不能修改草稿。");
    l.draft = clone(review);
    this.commit(s);
  }
  async publish(submissionId, review, role) {
    this.teachingSubmission(submissionId, role);
    const s = validateReview(review);
    if (s) throw new Error(s);
    const l = this.read(),
      n = this.get(l, submissionId);
    if ("pending" !== n.status)
      throw new Error("反馈已经发布或作品仍在处理中，请刷新查看。");
    n.draft = clone(review);
    n.published = clone(review);
    n.status = "published";
    n.publishedAt = this.clock().toISOString();
    n.publishedBy = teacherSummary(this.teacher(role));
    this.commit(l);
  }
  async submit(assignmentId, photos, note, role, fail = false) {
    if (role !== "student") throw new Error("此入口仅供学生提交。");
    const n = this.state.assignments.find((a) => a.id === assignmentId);
    if (!n) throw new Error("作业不存在。");
    const i = this.learner(role);
    if (i.archived)
      throw new Error("当前学生已不在班级，原作品保留，请联系学校管理员。");
    if (n.classId !== i.classId)
      throw new Error("只能提交当前学生所在班级的作业。");
    if (Date.parse(n.dueAt) <= this.clock().getTime())
      throw new Error("作业已截止，暂不能提交。");
    if (!photos.length || photos.length > 6)
      throw new Error("请添加 1–6 张作品图片。");
    if (new Set(photos.map((e) => e.id)).size !== photos.length)
      throw new Error("图片重复，请重新选择。");
    const u = this.latest(assignmentId, i.id);
    if (u && "published" !== u.status)
      throw new Error("本轮作品已提交，请等待老师发布反馈后再订正。");
    if (fail) throw new Error("提交失败，图片已保留，请重试。");
    const d = this.read(),
      o = this.clock().toISOString(),
      c = {
        id: `submission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        assignmentId,
        studentId: i.id,
        version: (u?.version || 0) + 1,
        photos: clone(photos),
        note: note.trim(),
        actor: role,
        submittedAt: o,
        status: "processing",
        draft: emptyReview(),
        published: null,
        publishedAt: null,
      };
    d.submissions.push(c);
    this.commit(d);
    return clone(c);
  }
  async finishAnalysis(submissionId, fail = false) {
    const t = this.read(),
      s = this.get(t, submissionId);
    ("processing" !== s.status && "failed" !== s.status) ||
      ((s.status = fail ? "failed" : "pending"),
      fail ||
        (s.draft = s.photos.every((e) => e.sample)
          ? sampleReview()
          : emptyReview()),
      this.commit(t));
  }
  async manualReview(submissionId, role) {
    this.teachingSubmission(submissionId, role);
    const t = this.read(),
      s = this.get(t, submissionId);
    if ("failed" !== s.status && "processing" !== s.status)
      throw new Error("当前作品无需转入人工批阅。");
    s.status = "pending";
    s.draft = emptyReview();
    this.commit(t);
  }
  async createAssignment(input, role) {
    const t = this.teachingClass(input.classId, role);
    if (!input.title.trim() || !input.requirements.trim())
      throw new Error("请填写作业标题和要求。");
    if (
      !Number.isFinite(Date.parse(input.dueAt)) ||
      Date.parse(input.dueAt) <= this.clock().getTime()
    )
      throw new Error("截止时间需要晚于现在。");
    const s = this.read(),
      l = {
        ...input,
        title: input.title.trim(),
        requirements: input.requirements.trim(),
        id: `assignment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        className: t.name,
        createdAt: this.clock().toISOString(),
        teacher: teacherSummary(this.teacher(role)),
      };
    s.assignments.unshift(l);
    this.commit(s);
    return clone(l);
  }
  prepareClassPractice() {
    const e = withClassPractice(this.state, this.clock());
    e !== this.state && this.commit(e);
  }
  reset() {
    const e = createSeed(this.clock());
    this.commit(
      this.state.classPracticeVersion ? withClassPractice(e, this.clock()) : e,
    );
  }
}
