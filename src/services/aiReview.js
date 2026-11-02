import { AdministrationService } from "./administration.js";
import { sampleReview } from "./seed.js";
import { DIMENSION_IDS, validateReview, total } from "./rubric.js";
import { activeStudents, formerAssignmentStudents, latestSubmission } from "./school.js";
import { canResubmit } from "./submissionPolicy.js";
import { teacherSummary } from "./identity.js";

const copy = (value) => JSON.parse(JSON.stringify(value));
export const AI_RUNNING = ["queued", "reading", "reviewing"];
export const AI_RETRYABLE = ["failed", "unavailable"];
export const AI_LABELS = {
  notStarted: "待AI批阅", queued: "排队中", reading: "识别作品中",
  reviewing: "双写分析中", completed: "AI已完成", failed: "批阅失败",
  unavailable: "AI服务暂不可用", cancelled: "已转老师批阅", missing: "未提交", published: "教师已完成批阅",
};

export const AI_STUDENT_RETRY_LIMIT = 2;
export const AI_STUDENT_DAILY_RETRY_LIMIT = 5;
export const AI_RETRY_COOLDOWN_MS = 60_000;
const DAY = 24 * 60 * 60 * 1000;

// The mock service persists these limits. A real job endpoint must enforce the
// same checks atomically with authenticated student IDs and server timestamps.
export function studentAiRetryPolicy(state, submission, now) {
  const task = submission.aiReview;
  const ownTimes = task?.studentRetryTimes || [];
  const recent = state.submissions.filter(item => item.studentId === submission.studentId)
    .flatMap(item => item.aiReview?.studentRetryTimes || [])
    .map(Date.parse).filter(time => Number.isFinite(time) && time > now.getTime() - DAY).sort((a, b) => a - b);
  const remaining = Math.max(0, AI_STUDENT_RETRY_LIMIT - ownTimes.length);
  const dailyRemaining = Math.max(0, AI_STUDENT_DAILY_RETRY_LIMIT - recent.length);
  const last = recent[recent.length - 1];
  const nextRetryAt = last === undefined ? null : new Date(last + AI_RETRY_COOLDOWN_MS).toISOString();
  let reason = "";
  if (submission.status === "published") reason = "老师已完成批阅，无需重复生成。";
  else if (latestSubmission(state, submission.assignmentId, submission.studentId)?.id !== submission.id) reason = "只能重试最新提交的作品。";
  else if (task?.state === "unavailable" && !submission.photos.every(photo => photo.sample)) reason = "AI服务尚未开通，暂时无法生成结果，请等待老师批阅。";
  else if (!AI_RETRYABLE.includes(task?.state)) reason = "仅批阅失败或结果获取失败时可以重试。";
  else if (!remaining) reason = "本份作品的重试次数已用完，请等待老师批阅。";
  else if (!dailyRemaining) reason = "24小时内已重试5次，请稍后再试，或等待老师批阅。";
  return { remaining, dailyRemaining, nextRetryAt, reason };
}

export function createAiTask(submission, source, now, fail = false) {
  return {
    id: `ai-${submission.id}-${(submission.aiReview?.attempt || 0) + 1}`,
    attempt: (submission.aiReview?.attempt || 0) + 1,
    state: "queued", source, queuedAt: now.toISOString(), startedAt: null,
    completedAt: null, result: null, resultSource: null, error: "",
    simulateFailure: fail,
    autoRetryCount: 0,
    reportedAt: null,
    studentRetryTimes: [...(submission.aiReview?.studentRetryTimes || [])],
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
    task.error = "本次分析没有完成，作品已保留，可用原图重试。";
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
    task.error = "AI服务尚未开通，暂时无法生成结果。作品已保存，可等待老师批阅。";
  }
  if (["processing", "failed"].includes(submission.status)) submission.status = "pending";
}

function publicationError(review) {
  try {
    for (const category of ["handwriting", "composition"]) {
      if (!review?.[category]?.comments || DIMENSION_IDS.some((id) => typeof review[category].comments[id] !== "string"))
        return "评价内容不完整，请先单份核对。";
    }
    return validateReview(review);
  } catch {
    return "评价内容不完整，请先单份核对。";
  }
}

function hasDraftContent(review) {
  if (!review || typeof review !== "object") return !!review;
  return !!review.nextSteps || ["handwriting", "composition"].some((category) => {
    const item = review[category];
    return !!item?.summary || Object.values(item?.scores || {}).some((value) => value !== null && value !== undefined)
      || Object.values(item?.comments || {}).some(Boolean);
  });
}

export function aiQualityAttention(submission) {
  if (!submission || submission.status === "published") return [];
  const task = submission.aiReview;
  const reasons = [];
  if (task?.qualityFlags?.includes("wrongImage")) reasons.push("疑似传错图片");
  if (task?.qualityFlags?.includes("unreadable")) reasons.push("内容无法有效识别");
  const review = task?.result;
  for (const [category, label] of [["handwriting", "书写"], ["composition", "写作"]]) {
    const score = review?.[category]?.scores ? total(review[category]) : null;
    if (score !== null && score < 60) reasons.push(`${label}低于60分`);
  }
  return reasons;
}

/** Use the same candidate for the displayed count and the atomic publication. */
export function aiPublishStatus(submission) {
  const unavailable = { publishable: false, publishSource: null, publishIssue: "" };
  if (!submission || submission.status === "published" || submission.aiReview?.state !== "completed") return unavailable;
  if (canResubmit(submission)) return { ...unavailable, publishIssue: "等待学生重新提交" };
  const attention = aiQualityAttention(submission);
  if (attention.length) return { ...unavailable, publishIssue: "需逐份审核：" + attention.join("、") };
  const aiError = publicationError(submission.aiReview.result);
  if (aiError) return { ...unavailable, publishIssue: aiError };
  if (submission.status !== "pending") return { ...unavailable, publishIssue: "作品状态待核对，请先单份查看。" };
  // Older drafts may predate draftRevision. Preserve their existing edits too.
  const teacherEdited = submission.draftRevision > 0 || (hasDraftContent(submission.draft)
    && JSON.stringify(submission.draft) !== JSON.stringify(submission.aiReview.result));
  const publishSource = teacherEdited ? "teacher" : "ai";
  const review = teacherEdited ? submission.draft : submission.aiReview.result;
  const issue = publicationError(review);
  return { publishable: !issue, publishSource, publishIssue: issue || "" };
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
      ...aiPublishStatus(submission),
      qualityReasons: aiQualityAttention(submission),
      needsAttention: aiQualityAttention(submission).length > 0,
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
    attention: rows.filter(item => item.needsAttention).length,
    waiting: rows.filter(item => ["notStarted", "failed", "unavailable", "cancelled"].includes(item.phase)).length,
    readyToPublish: rows.filter((item) => item.publishable).length,
    requiresReview: rows.filter((item) => item.phase === "completed" && !item.publishable && !canResubmit(item.submission)).length,
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
      autoRetryCount: task.autoRetryCount || 0, reportedAt: task.reportedAt || null, qualityFlags: task.qualityFlags || [],
      ...(role === "student" && task.state !== "completed" ? { retry: studentAiRetryPolicy(this.state, submission, this.clock()) } : {}),
    });
  }
  prepareAutoAi() {
    const candidates = this.state.submissions.filter(item => item.status !== "published" && !item.aiReview && this.latest(item.assignmentId, item.studentId)?.id === item.id);
    if (!candidates.length) return;
    const next = this.read();
    for (const candidate of candidates) {
      const item = this.get(next, candidate.id);
      item.aiReview = createAiTask(item, item.actor === "teacher" ? "teacher" : "student", this.clock());
    }
    this.commit(next);
  }
  async startAiReview(submissionId, role, fail = false) {
    const submission = this.authorizeAiSubmission(submissionId, role);
    if (submission.status === "published") throw new Error(role === "student" ? "教师已完成批阅，本轮不再重复AI批阅。" : "老师已完成审核，本轮不再重复AI批阅。");
    if (this.latest(submission.assignmentId, submission.studentId)?.id !== submission.id)
      throw new Error("请对最新提交的作品进行AI批阅。");
    if (submission.aiReview && (AI_RUNNING.includes(submission.aiReview.state) || submission.aiReview.state === "completed"))
      return this.aiResult(submissionId, role);
    const now = this.clock();
    const retrying = role === "student" && !!submission.aiReview;
    if (retrying) {
      const policy = studentAiRetryPolicy(this.state, submission, now);
      if (policy.reason) throw new Error(policy.reason);
      if (policy.nextRetryAt && Date.parse(policy.nextRetryAt) > now.getTime())
        throw new Error(`请等待 ${Math.ceil((Date.parse(policy.nextRetryAt) - now.getTime()) / 1000)} 秒后再重试。`);
    }
    const next = this.read();
    const item = this.get(next, submissionId);
    item.aiReview = createAiTask(item, role, now, fail);
    if (retrying) item.aiReview.studentRetryTimes.push(now.toISOString());
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
      throw new Error("当前没有可应用的AI建议，或老师已完成审核。");
    item.draft = copy(item.aiReview.result);
    item.draftRevision = (item.draftRevision || 0) + 1;
    this.commit(next);
  }
  async publishAiBatch(assignmentId, role) {
    const assignment = this.state.assignments.find((item) => item.id === assignmentId);
    this.teachingClass(assignment?.classId || "", role);
    const rows = aiAssignmentRows(this.state, assignmentId);
    const candidates = rows.filter((row) => row.publishable);
    const result = {
      published: candidates.map((row) => row.submission.id),
      skipped: rows.length - candidates.length,
      requiresReview: rows.filter((row) => row.phase === "completed" && !row.publishable && !canResubmit(row.submission)).map((row) => row.submission.id),
      sources: { ai: candidates.filter((row) => row.publishSource === "ai").length, teacher: candidates.filter((row) => row.publishSource === "teacher").length },
    };
    if (!candidates.length) return result;
    const next = this.read();
    const publishedAt = this.clock().toISOString();
    const publishedBy = teacherSummary(this.teacher(role));
    for (const row of candidates) {
      const item = this.get(next, row.submission.id);
      const review = copy(row.publishSource === "teacher" ? item.draft : item.aiReview.result);
      item.draft = copy(review);
      item.published = review;
      item.status = "published";
      item.publishedAt = publishedAt;
      item.publishedBy = copy(publishedBy);
    }
    // One write makes failure roll back the complete set, including snapshots.
    this.commit(next);
    return result;
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
      if (task.state === "failed") {
        if ((task.autoRetryCount || 0) < 1) {
          const retry = createAiTask(item, task.source, now, task.simulateFailure);
          retry.autoRetryCount = 1;
          item.aiReview = retry;
          if (item.status === "failed") item.status = "processing";
        }
      }
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
