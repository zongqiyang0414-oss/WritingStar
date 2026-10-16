import { AdministrationService } from "./administration.js";
import { sampleReview } from "./seed.js";
import { emptyReview } from "./rubric.js";
import { activeStudents, formerAssignmentStudents, latestSubmission } from "./school.js";

const copy = (value) => JSON.parse(JSON.stringify(value));
export const AI_RUNNING = ["queued", "reading", "reviewing"];
export const AI_RETRYABLE = ["failed", "unavailable"];
export const AI_LABELS = {
  notStarted: "待AI批阅", queued: "排队中", reading: "识别作品中",
  reviewing: "双写分析中", completed: "AI已完成", failed: "批阅失败",
  unavailable: "等待批阅结果", cancelled: "已转老师批阅", missing: "未提交", published: "老师已发布",
};

export function createAiTask(submission, source, now, fail = false) {
  return {
    id: `ai-${submission.id}-${(submission.aiReview?.attempt || 0) + 1}`,
    attempt: (submission.aiReview?.attempt || 0) + 1,
    state: "queued", source, queuedAt: now.toISOString(), startedAt: null,
    completedAt: null, result: null, resultSource: null, error: "",
    simulateFailure: fail,
    initializeDraft: submission.status === "processing" && !submission.draftRevision,
  };
}

/** Results come only from the built-in fictional exercise, never from an uploaded photo. */
export function settleAiTask(submission, now, fail = false) {
  const task = submission.aiReview;
  if (!task || !AI_RUNNING.includes(task.state) || submission.status === "published") return;
  task.completedAt = now.toISOString();
  if (fail) {
    task.state = "failed";
    task.error = "本次批阅没有完成，作品已保留，可重试或请老师批阅。";
    if (submission.status === "processing") submission.status = "failed";
    return;
  }
  if (submission.photos.length && submission.photos.every((photo) => photo.sample)) {
    task.state = "completed";
    task.result = sampleReview();
    task.resultSource = "sample";
    if (task.initializeDraft && !submission.draftRevision && submission.status === "processing")
      submission.draft = copy(task.result);
  } else {
    task.state = "unavailable";
    task.error = "作品已收到，暂未取得AI批阅结果。可稍后重试，或等待老师批阅。";
  }
  if (["processing", "failed"].includes(submission.status)) submission.status = "pending";
}

export function aiAssignmentRows(state, assignmentId) {
  const assignment = state.assignments.find((item) => item.id === assignmentId);
  if (!assignment) return [];
  const current = activeStudents(state, assignment.classId);
  const former = formerAssignmentStudents(state, assignmentId);
  return [...current, ...former].map((student) => {
    const submission = latestSubmission(state, assignmentId, student.id);
    const phase = !submission ? "missing" : submission.status === "published" ? "published" : submission.aiReview?.state || "notStarted";
    return {
      student, submission, phase, label: AI_LABELS[phase],
      former: student.archived || student.classId !== assignment.classId,
      eligible: !!submission && submission.status !== "published" && (!submission.aiReview || AI_RETRYABLE.includes(phase)),
    };
  });
}

export function aiAssignmentSummary(rows) {
  const count = (phases) => rows.filter((item) => phases.includes(item.phase)).length;
  return {
    total: rows.length,
    submitted: rows.filter((item) => item.submission).length,
    missing: count(["missing"]), eligible: rows.filter((item) => item.eligible).length,
    running: count(AI_RUNNING), completed: count(["completed"]),
    failed: count(["failed"]), unavailable: count(["unavailable"]),
    published: count(["published"]), notStarted: count(["notStarted"]),
  };
}

export class AiReviewService extends AdministrationService {
  authorizeAiSubmission(submissionId, role) {
    if (role === "teacher") this.teachingSubmission(submissionId, role);
    else if (role === "student") {
      if (this.get(this.state, submissionId).studentId !== this.learner(role).id)
        throw new Error("只能查看当前学生自己的AI批阅。");
    } else throw new Error("AI批阅需要教师或学生身份。");
    return this.get(this.state, submissionId);
  }
  aiResult(submissionId, role) {
    const submission = this.authorizeAiSubmission(submissionId, role);
    const task = submission.aiReview;
    if (!task) return null;
    // Never expose the teacher's draft through the student AI result endpoint.
    return copy({
      id: task.id, attempt: task.attempt, state: task.state,
      queuedAt: task.queuedAt, startedAt: task.startedAt, completedAt: task.completedAt,
      result: task.result, resultSource: task.resultSource, error: task.error,
    });
  }
  async startAiReview(submissionId, role, fail = false) {
    const submission = this.authorizeAiSubmission(submissionId, role);
    if (submission.status === "published") throw new Error("老师已发布反馈，本轮不再重复AI批阅。");
    if (this.latest(submission.assignmentId, submission.studentId)?.id !== submission.id)
      throw new Error("请对最新一版作品进行AI批阅。");
    if (submission.aiReview && (AI_RUNNING.includes(submission.aiReview.state) || submission.aiReview.state === "completed"))
      return this.aiResult(submissionId, role);
    const next = this.read();
    const item = this.get(next, submissionId);
    item.aiReview = createAiTask(item, role, this.clock(), fail);
    if (item.status === "failed") item.status = "processing";
    this.commit(next);
    return this.aiResult(submissionId, role);
  }
  async startAiBatch(assignmentId, role, retryOnly = false, fail = false) {
    const assignment = this.state.assignments.find((item) => item.id === assignmentId);
    this.teachingClass(assignment?.classId || "", role);
    const candidates = aiAssignmentRows(this.state, assignmentId)
      .filter((item) => item.eligible && (!retryOnly || AI_RETRYABLE.includes(item.phase)));
    if (!candidates.length) return { queued: [], skipped: aiAssignmentRows(this.state, assignmentId).length };
    const next = this.read();
    for (const row of candidates) {
      const item = this.get(next, row.submission.id);
      item.aiReview = createAiTask(item, "teacher-batch", this.clock(), fail);
      if (item.status === "failed") item.status = "processing";
    }
    this.commit(next);
    return { queued: candidates.map((row) => row.submission.id), skipped: aiAssignmentRows(next, assignmentId).length - candidates.length };
  }
  async applyAiReview(submissionId, role) {
    this.teachingSubmission(submissionId, role);
    const next = this.read();
    const item = this.get(next, submissionId);
    if (item.status !== "pending" || item.aiReview?.state !== "completed" || !item.aiReview.result)
      throw new Error("当前没有可应用的AI建议，或老师已发布反馈。");
    item.draft = copy(item.aiReview.result);
    item.draftRevision = (item.draftRevision || 0) + 1;
    this.commit(next);
  }
  /** Local mock worker. A backend job service must replace this before real AI integration. */
  advanceAiReviews() {
    if (!this.state.submissions.some((item) => AI_RUNNING.includes(item.aiReview?.state))) return false;
    const next = this.read();
    const now = this.clock();
    for (const item of next.submissions) {
      const task = item.aiReview;
      if (!task || !["reading", "reviewing"].includes(task.state)) continue;
      if (item.status === "published") { task.state = "cancelled"; continue; }
      const elapsed = now.getTime() - Date.parse(task.startedAt);
      if (elapsed >= 2600) settleAiTask(item, now, task.simulateFailure);
      else if (elapsed >= 1100) task.state = "reviewing";
    }
    const working = next.submissions.filter((item) => ["reading", "reviewing"].includes(item.aiReview?.state)).length;
    const waiting = next.submissions.filter((item) => item.aiReview?.state === "queued")
      .sort((a, b) => a.aiReview.queuedAt.localeCompare(b.aiReview.queuedAt));
    for (const item of waiting.slice(0, Math.max(0, 3 - working))) {
      item.aiReview.state = "reading";
      item.aiReview.startedAt = now.toISOString();
    }
    if (JSON.stringify(next) === JSON.stringify(this.state)) return false;
    this.commit(next);
    return true;
  }
}
