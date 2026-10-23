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
import { canResubmit, prepareSubmissionPolicy } from "./submissionPolicy.js";
import { emptyReview, validateReview } from "./rubric.js";
import { migrateStudentEntry } from "./migration.js";
import { withClassPractice } from "./classPractice.js";
import { prepareAdministration, previewAdminBinding } from "./administration.js";
import { AiReviewService, AI_RUNNING, createAiTask, settleAiTask } from "./aiReview.js";

import { latestSubmission } from "./school.js";
import { createPaperPacket, pageCount, paperId, resolvePaperCode, validatePaperBatch } from "./paperWorkflow.js";
import { BUILTIN_ASSIGNMENT_TEMPLATES, assignmentContent } from "./assignmentTemplates.js";

export const clone = (e) => JSON.parse(JSON.stringify(e));
function freezeSnapshot(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeSnapshot(child);
  return Object.freeze(value);
}
export class MockService extends AiReviewService {
  constructor(storage, clock = () => new Date()) {
    super();
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
    this.state = prepareAdministration(this.state);
    const prepared = prepareSubmissionPolicy(this.state);
    const policyChanged = prepared !== this.state;
    this.state = prepared;
    (s && 6 === s.schemaVersion && s.administrationVersion === 1 && !policyChanged) || storage.write(this.state);
  }
  read() {
    return clone(this.state);
  }
  snapshot() {
    return freezeSnapshot(this.state);
  }
  commit(state) {
    this.storage.write(state);
    this.state = state;
  }
  updateSubmission(submissionId, changes) {
    const current = this.get(this.state, submissionId),
      submissions = [...this.state.submissions];
    submissions[submissions.indexOf(current)] = { ...current, ...changes };
    this.commit({ ...this.state, submissions });
  }
  async signIn(role) {
    assertActiveRole(role);
    this.commit(
      role === "admin"
        ? { ...this.state, adminAccount: { ...this.state.adminAccount, signedIn: true } }
        : role === "teacher"
        ? {
            ...this.state,
            teacherAccount: { ...this.state.teacherAccount, signedIn: true },
          }
        : {
            ...this.state,
            accounts: {
              ...this.state.accounts,
              [role]: { ...this.state.accounts[role], signedIn: true },
            },
          },
    );
  }
  previewBinding(code, role) {
    assertActiveRole(role);
    if (role === "admin") return clone(previewAdminBinding(this.state, code));
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
      s = { ...this.state };
    "admin" === t.role
      ? (s.adminAccount = { signedIn: true, administratorId: t.administrator.id })
      : "teacher" === t.role
      ? ((s.teacherAccount = {
          signedIn: true,
          teacherId: t.teacher.id,
        }),
        (s.teacherClassIds = t.classes.map((e) => e.id)))
      : (s.accounts = {
          ...this.state.accounts,
          [t.role]: { signedIn: true, studentId: t.student.id },
        });
    this.commit(s);
    return clone(t);
  }
  async restartBinding(role) {
    assertActiveRole(role);
    const a = { ...this.state };
    "admin" === role
      ? (a.adminAccount = { signedIn: false, administratorId: null })
      : "teacher" === role
      ? (a.teacherAccount = {
          signedIn: false,
          teacherId: null,
        })
      : (a.accounts = {
          ...this.state.accounts,
          [role]: { signedIn: false, studentId: null },
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
    return clone(latestSubmission(this.state, assignmentId, studentId));
  }
  feedback(submissionId, role) {
    assertActiveRole(role);
    if (role === "admin") throw new Error("查看作品反馈需要教师或学生身份。");
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
    const l = this.get(this.state, submissionId);
    if (this.latest(l.assignmentId, l.studentId)?.id !== l.id || canResubmit(l) || "pending" !== l.status) throw new Error("这份作品当前不能修改草稿，请查看最新提交。");
    this.updateSubmission(submissionId, { draft: clone(review), ...(l.aiReview && { draftRevision: (l.draftRevision || 0) + 1 }) });
  }
  async publish(submissionId, review, role) {
    this.teachingSubmission(submissionId, role);
    const s = validateReview(review);
    if (s) throw new Error(s);
    const n = this.get(this.state, submissionId);
    if (this.latest(n.assignmentId, n.studentId)?.id !== n.id || canResubmit(n)) throw new Error("已同意学生重新提交，请等待新的作品。");
    if ("pending" !== n.status)
      throw new Error("作品已完成审核或作品仍在处理中，请刷新查看。");
    this.updateSubmission(submissionId, {
      draft: clone(review),
      published: clone(review),
      status: "published",
      publishedAt: this.clock().toISOString(),
      publishedBy: teacherSummary(this.teacher(role)),
      ...(n.aiReview && AI_RUNNING.includes(n.aiReview.state) && { aiReview: { ...n.aiReview, state: "cancelled" } }),
    });
  }
  async submit(assignmentId, photos, note, role, fail = false, failAnalysis = false) {
    if (role !== "student") throw new Error("此入口仅供学生提交。");
    const n = this.state.assignments.find((a) => a.id === assignmentId);
    if (!n) throw new Error("作业不存在。");
    const i = this.learner(role);
    if (i.archived)
      throw new Error("当前学生已不在班级，原作品保留，请联系学校管理员。");
    if (n.classId !== i.classId)
      throw new Error("只能提交当前学生所在班级的作业。");
    if (Date.parse(n.dueAt) <= this.clock().getTime() && !canResubmit(this.latest(assignmentId, i.id)))
      throw new Error("作业已截止，暂不能提交。");
    return saveSubmission(this, assignmentId, i, photos, note, role, fail, failAnalysis);
  }
  async submitForStudent(assignmentId, studentId, photos, note, role, fail = false, failAnalysis = false) {
    const assignment = this.state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) throw new Error("作业不存在。");
    this.teachingClass(assignment.classId, role);
    const student = this.state.students.find((item) => item.id === studentId);
    if (!student || student.archived || student.classId !== assignment.classId)
      throw new Error("请选择本班在班学生，不能为已调班或归档的学生代交。");
    return saveSubmission(this, assignmentId, student, photos, note, role, fail, failAnalysis);
  }
  async issuePaperCards(assignmentId, role, pages = 2) {
    const assignment = this.state.assignments.find(a => a.id === assignmentId);
    if (!assignment) throw new Error("作业不存在。");
    this.teachingClass(assignment.classId, role);
    const paperPacket = createPaperPacket(this.state, assignment, assignment.paperPacket?.pages || pages, assignment.paperPacket);
    this.commit({ ...this.state, assignments: this.state.assignments.map(a => a.id === assignmentId ? { ...a, paperPacket } : a) });
    return this.paperCards(assignmentId, role);
  }
  paperCards(assignmentId, role) {
    const assignment = this.state.assignments.find(a => a.id === assignmentId);
    if (!assignment) throw new Error("作业不存在。");
    let own = null;
    if (role === "teacher") this.teachingClass(assignment.classId, role);
    else {
      own = this.learner(role);
      if (own.archived || own.classId !== assignment.classId) throw new Error("只能查看本人所在班级的答题卡。");
    }
    if (!assignment.paperPacket) return [];
    return clone(assignment.paperPacket.cards.filter(card => (!own || card.studentId === own.id)
      && this.state.students.some(s => s.id === card.studentId && s.classId === assignment.classId && !s.archived)));
  }
  paperMatch(assignmentId, code, role) {
    const match = resolvePaperCode(this.state, assignmentId, code);
    if (!this.paperCards(assignmentId, role).some(c => c.id === match.card.id)) throw new Error("只能识别本人的答题卡。");
    return clone(match);
  }
  async submitPaperBatch(assignmentId, rows, role, fail = false, failAnalysis = false) {
    const assignment = this.state.assignments.find(a => a.id === assignmentId);
    if (!assignment) throw new Error("作业不存在。");
    let own = "";
    if (role === "teacher") this.teachingClass(assignment.classId, role);
    else {
      const student = this.learner(role);
      if (student.archived || student.classId !== assignment.classId) throw new Error("只能提交本人所在班级的答题卡。");
      if (Date.parse(assignment.dueAt) <= this.clock().getTime() && !canResubmit(this.latest(assignmentId, student.id))) throw new Error("作业已截止，请联系老师补交。");
      own = student.id;
    }
    const groups = validatePaperBatch(this.state, assignmentId, rows, own);
    if (fail) throw new Error("提交失败，扫描页面已保留，请重试。");
    const batchId = paperId("batch");
    const submissions = groups.map(group => {
      const submission = buildSubmission(this, assignmentId, group.student, group.rows.map(r => r.photo), "", role, false, failAnalysis);
      submission.paper = {
        batchId, cardId: group.card.id, source: role === "teacher" ? "teacher-scan" : "student-paper",
        pages: group.rows.map(r => ({ page: r.page, manual: r.manual })),
      };
      return submission;
    });
    // One write: storage errors never leave a partially submitted class batch.
    this.commit({ ...this.state, submissions: [...consumeResubmissions(this, submissions), ...submissions] });
    return clone(submissions);
  }
  async agreeResubmission(submissionId, role) {
    this.teachingSubmission(submissionId, role);
    const current = this.get(this.state, submissionId);
    const assignment = this.state.assignments.find(item => item.id === current.assignmentId);
    const student = this.state.students.find(item => item.id === current.studentId);
    if (!student || student.archived || student.classId !== assignment.classId) throw new Error("只能同意本班在班学生重新提交。");
    if (this.latest(current.assignmentId, current.studentId)?.id !== current.id) throw new Error("作品已更新，请查看最新提交。");
    if (canResubmit(current)) return;
    this.updateSubmission(submissionId, { resubmission: { allowedAt: this.clock().toISOString(), allowedBy: teacherSummary(this.teacher(role)) } });
  }
  async setExcellent(submissionId, enabled, role) {
    this.teachingSubmission(submissionId, role);
    if (typeof enabled !== "boolean") throw new Error("请选择是否设为优秀作业。");
    const submission = this.get(this.state, submissionId);
    if (enabled && (this.latest(submission.assignmentId, submission.studentId)?.id !== submission.id || submission.status !== "published" || !submission.published))
      throw new Error("请先完成审核，再设为优秀作业。");
    if (Boolean(submission.excellent) === enabled) return;
    this.updateSubmission(submissionId, {
      excellent: enabled
        ? { selectedAt: this.clock().toISOString(), selectedBy: teacherSummary(this.teacher(role)) }
        : null,
    });
  }
  excellentWorks(classId, role, assignmentId = "") {
    if (role === "teacher") this.teachingClass(classId, role);
    else {
      const student = this.learner(role);
      if (student.archived || student.classId !== classId)
        throw new Error("只能查看当前所在班级的优秀作业。");
    }
    const assignments = new Map(this.state.assignments
      .filter((item) => item.classId === classId)
      .map((item) => [item.id, item]));
    if (assignmentId && !assignments.has(assignmentId)) throw new Error("作业不属于当前班级。");
    return clone(this.state.submissions
      .filter((item) => this.latest(item.assignmentId, item.studentId)?.id === item.id && item.excellent && item.status === "published" && item.published && assignments.has(item.assignmentId) && (!assignmentId || item.assignmentId === assignmentId))
      .sort((a, b) => b.excellent.selectedAt.localeCompare(a.excellent.selectedAt) || b.submittedAt.localeCompare(a.submittedAt))
      .map((item) => ({
        id: item.id,
        assignmentId: item.assignmentId,
        title: assignments.get(item.assignmentId).title,
        className: assignments.get(item.assignmentId).className,
        studentName: this.state.students.find((student) => student.id === item.studentId)?.name || "同学",
        version: item.version,
        pageCount: item.photos.length,
        cover: item.photos[0]?.url || "",
        selectedAt: item.excellent.selectedAt,
        selectedBy: item.excellent.selectedBy,
      })));
  }
  excellentWork(submissionId, role) {
    const submission = this.get(this.state, submissionId);
    const assignment = this.state.assignments.find((item) => item.id === submission.assignmentId);
    if (!assignment) throw new Error("作业不存在。");
    const summary = this.excellentWorks(assignment.classId, role).find((item) => item.id === submissionId);
    if (!summary) throw new Error("这份作品尚未设为优秀作业或已取消展示。");
    // Only the selected version's formally published evaluation is shared.
    // Drafts, AI task data, private notes and account data stay private.
    return { ...summary, photos: clone(submission.photos), published: clone(submission.published) };
  }
  async finishAnalysis(submissionId, fail = false) {
    const current = this.get(this.state, submissionId);
    if (current.status === "published") return;
    if (current.aiReview) {
      if (!AI_RUNNING.includes(current.aiReview.state) && current.aiReview.state !== "failed") return;
      const submission = clone(current);
      if (submission.aiReview.state === "failed") submission.aiReview = createAiTask(submission, submission.aiReview.source, this.clock());
      settleAiTask(submission, this.clock(), fail);
      this.updateSubmission(submissionId, submission);
      return;
    }
    if (current.status !== "processing" && current.status !== "failed") return;
    this.updateSubmission(submissionId, {
      status: fail ? "failed" : "pending",
      ...(!fail && { draft: current.photos.every((photo) => photo.sample) ? sampleReview() : emptyReview() }),
    });
  }
  async manualReview(submissionId, role) {
    this.teachingSubmission(submissionId, role);
    const s = this.get(this.state, submissionId);
    if ("failed" !== s.status && "processing" !== s.status)
      throw new Error("当前作品无需转入人工批阅。");
    this.updateSubmission(submissionId, {
      status: "pending",
      draft: emptyReview(),
      draftRevision: (s.draftRevision || 0) + 1,
      ...(s.aiReview && AI_RUNNING.includes(s.aiReview.state) && { aiReview: { ...s.aiReview, state: "cancelled" } }),
    });
  }
  async createAssignment(input, role) {
    const assignments = await this.createAssignments({ ...input, classIds: [input.classId] }, role);
    return assignments[0];
  }
  async createAssignments(input, role) {
    this.teacher(role);
    const classIds = Array.isArray(input.classIds) ? [...new Set(input.classIds)] : [];
    if (!classIds.length) throw new Error("请选择发布班级。");
    // Validate the complete batch before a single storage write.
    const classes = classIds.map((classId) => this.teachingClass(classId, role));
    const content = assignmentContent(input);
    const dueAt = typeof input.dueAt === "string" ? input.dueAt.trim() : "";
    if (dueAt && (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= this.clock().getTime()))
      throw new Error("截止时间需要晚于现在。");
    const createdAt = this.clock().toISOString();
    const teacher = teacherSummary(this.teacher(role));
    const assignments = classes.map((schoolClass, index) => ({
      ...content,
      dueAt,
      classId: schoolClass.id,
      id: `assignment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
      className: schoolClass.name,
      createdAt,
      teacher,
    }));
    const pages = pageCount(input.paperPages ?? 2);
    for (const assignment of assignments) assignment.paperPacket = createPaperPacket(this.state, assignment, pages);
    this.commit({ ...this.state, assignments: [...assignments, ...this.state.assignments] });
    return clone(assignments);
  }
  assignmentTemplates(role) {
    const teacher = this.teacher(role);
    return clone([
      ...(this.state.assignmentTemplates || []).filter((item) => item.ownerTeacherId === teacher.id),
      ...BUILTIN_ASSIGNMENT_TEMPLATES,
    ]);
  }
  async saveAssignmentTemplate(input, role) {
    const teacher = this.teacher(role);
    const content = assignmentContent(input);
    const templates = this.state.assignmentTemplates || [];
    const current = input.id ? templates.find((item) => item.id === input.id && item.ownerTeacherId === teacher.id) : null;
    if (input.id && !current) throw new Error("只能修改自己的作业模板。");
    const template = {
      ...content,
      id: current?.id || `template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ownerTeacherId: teacher.id,
      createdAt: current?.createdAt || this.clock().toISOString(),
      updatedAt: this.clock().toISOString(),
      builtin: false,
    };
    this.commit({
      ...this.state,
      assignmentTemplates: current ? templates.map((item) => item.id === current.id ? template : item) : [template, ...templates],
    });
    return clone(template);
  }
  async deleteAssignmentTemplate(id, role) {
    const teacher = this.teacher(role);
    const templates = this.state.assignmentTemplates || [];
    if (!templates.some((item) => item.id === id && item.ownerTeacherId === teacher.id))
      throw new Error("只能删除自己的作业模板。");
    this.commit({
      ...this.state,
      assignmentTemplates: templates.filter((item) => item.id !== id),
    });
  }
  prepareClassPractice() {
    const e = withClassPractice(this.state, this.clock());
    e !== this.state && this.commit(e);
  }
  reset() {
    const e = createSeed(this.clock());
    this.commit(
      prepareAdministration(this.state.classPracticeVersion ? withClassPractice(e, this.clock()) : e),
    );
  }
}

function saveSubmission(service, assignmentId, student, photos, note, role, fail, failAnalysis) {
    const c = buildSubmission(service, assignmentId, student, photos, note, role, fail, failAnalysis);
    service.commit({ ...service.state, submissions: [...consumeResubmissions(service, [c]), c] });
    return clone(c);
}
function buildSubmission(service, assignmentId, student, photos, note, role, fail, failAnalysis) {
    if (!photos.length || photos.length > 6)
      throw new Error("请添加 1–6 张作品图片。");
    if (new Set(photos.map((e) => e.id)).size !== photos.length)
      throw new Error("图片重复，请重新选择。");
    const u = latestSubmission(service.state, assignmentId, student.id);
    if (u && (role !== "student" || !canResubmit(u)))
      throw new Error("作品已提交，需老师同意后才能重新提交。");
    if (fail) throw new Error("提交失败，图片已保留，请重试。");
    const o = service.clock().toISOString(),
      c = {
        id: `submission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        assignmentId,
        studentId: student.id,
        version: (u?.version || 0) + 1,
        photos: clone(photos),
        note: note.trim(),
        actor: role,
        ...(role === "teacher" && { submittedBy: teacherSummary(service.teacher(role)) }),
        submittedAt: o,
        status: "processing",
        draft: emptyReview(),
        published: null,
        publishedAt: null,
        draftRevision: 0,
      };
    c.aiReview = createAiTask(c, role, service.clock(), failAnalysis);
    return c;
}
function consumeResubmissions(service, additions) {
  const previous = new Map(additions.map(item => [latestSubmission(service.state, item.assignmentId, item.studentId)?.id, item.submittedAt]));
  return service.state.submissions.map(item => previous.has(item.id) ? {
    ...item,
    resubmission: { ...item.resubmission, consumedAt: previous.get(item.id) },
    ...(item.aiReview && AI_RUNNING.includes(item.aiReview.state) && { aiReview: { ...item.aiReview, state: "cancelled" } }),
  } : item);
}
