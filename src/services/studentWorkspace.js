import { classAssignments, latestSubmission } from "./school.js";
import { canResubmit } from "./submissionPolicy.js";

export const STUDENT_TASK_CATEGORIES = [
  { id: "unsubmitted", label: "未提交" },
  { id: "submitted", label: "已提交" },
  { id: "reviewed", label: "已批阅" },
  { id: "resubmit", label: "需重交" },
  { id: "expired", label: "已截止" },
];

export function studentTaskCategory(assignment, submission, now = Date.now()) {
  // An explicit teacher permission can cross the deadline; submitted work
  // remains submitted/reviewed when its assignment deadline passes.
  if (canResubmit(submission)) return "resubmit";
  if (submission?.status === "published") return "reviewed";
  if (submission) return "submitted";
  return assignment?.dueAt && Date.parse(assignment.dueAt) <= Number(now) ? "expired" : "unsubmitted";
}

export function studentSubmissionLabel(submission) {
  return canResubmit(submission) ? "需重交" : submission?.status === "published" ? "已批阅" : submission ? "已提交" : "未提交";
}

export function studentTasks(state, studentId, now = Date.now()) {
  const student = state.students.find(item => item.id === studentId);
  if (!student) return [];
  return [...classAssignments(state, student.classId)].reverse().map(assignment => {
    const submission = latestSubmission(state, assignment.id, studentId);
    return { assignment, category: studentTaskCategory(assignment, submission, now) };
  });
}

export function studentNotifications(state, studentId) {
  const student = state.students.find(item => item.id === studentId);
  if (!student) return [];
  const reads = state.studentNotificationReads?.[studentId] || {}, messages = [];
  const add = (type, assignment, time, submission = null) => {
    if (!time) return;
    const id = `${type}:${submission?.id || assignment.id}:${time}`;
    const labels = { assignment: "新布置的作业", returned: "作业需重新提交", reviewed: "教师批阅完成" };
    messages.push({ id, type, label: labels[type], title: assignment.title, assignmentId: assignment.id,
      submissionId: submission?.id || "", createdAt: time, read: !!reads[id] });
  };
  for (const assignment of state.assignments) {
    const currentClass = !student.archived && assignment.classId === student.classId;
    const latest = latestSubmission(state, assignment.id, studentId);
    if (currentClass) add("assignment", assignment, assignment.createdAt);
    // Keep results consistent with records/growth: superseded submissions do
    // not expose an older result while a newer work is awaiting feedback.
    if (!latest) continue;
    if (currentClass && canResubmit(latest)) add("returned", assignment, latest.resubmission.allowedAt, latest);
    if (latest.status === "published" && latest.published) add("reviewed", assignment, latest.publishedAt, latest);
  }
  return messages.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
