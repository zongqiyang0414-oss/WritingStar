import { total } from "./rubric.js";

export const taskStatuses = ["未提交", "待审核", "已完成"];
const submissionIndexes = new WeakMap();
function submissionIndex(state) {
  const submissions = state.submissions,
    immutable = Object.isFrozen(submissions);
  if (immutable && submissionIndexes.has(submissions))
    return submissionIndexes.get(submissions);
  const index = {
    latest: new Map(),
    byStudent: new Map(),
  };
  const addLatest = (target, submission) => {
    let students = target.get(submission.assignmentId);
    if (!students) target.set(submission.assignmentId, (students = new Map()));
    const previous = students.get(submission.studentId);
    // Preserve the first stored entry when versions tie, as stable sort did.
    if (!previous || submission.version > previous.version)
      students.set(submission.studentId, submission);
  };
  for (const submission of submissions) {
    addLatest(index.latest, submission);
    let history = index.byStudent.get(submission.studentId);
    if (!history) index.byStudent.set(submission.studentId, (history = []));
    history.push(submission);
  }
  // Only cache immutable snapshots. Plain caller-owned state may change in place.
  if (immutable) submissionIndexes.set(submissions, index);
  return index;
}
export function activeStudents(state, classId) {
  return state.students.filter((e) => e.classId === classId && !e.archived);
}
export function taskStatus(submission) {
  return submission
    ? "published" === submission.status
      ? "已完成"
      : "待审核"
    : "未提交";
}
export function latestSubmission(state, assignmentId, studentId) {
  return submissionIndex(state).latest.get(assignmentId)?.get(studentId) || null;
}
export function latestPublishedSubmission(state, assignmentId, studentId) {
  const latest = latestSubmission(state, assignmentId, studentId);
  return latest?.published ? latest : null;
}
export function studentSubmissions(state, studentId) {
  return [...(submissionIndex(state).byStudent.get(studentId) || [])];
}
export function classAssignments(state, classId) {
  return state.assignments
    .filter((e) => e.classId === classId)
    .sort(
      (e, a) =>
        e.createdAt.localeCompare(a.createdAt) || e.id.localeCompare(a.id),
    );
}
/** Former members remain reviewable under the original assignment's class. */
export function formerAssignmentStudents(state, assignmentId) {
  const assignment = state.assignments.find((item) => item.id === assignmentId);
  if (!assignment) return [];
  return state.students
    .filter((item) => item.archived || item.classId !== assignment.classId)
    .map((student) => ({ ...student, submission: latestSubmission(state, assignmentId, student.id) }))
    .filter((item) => item.submission);
}
export function assignmentCounts(state, assignment) {
  const t = activeStudents(state, assignment.classId),
    latest = submissionIndex(state).latest.get(assignment.id),
    s = {
      missing: 0,
      pending: 0,
      completed: 0,
      total: t.length,
    };
  for (const l of t) {
    const t = taskStatus(latest?.get(l.id));
    "未提交" === t ? s.missing++ : "待审核" === t ? s.pending++ : s.completed++;
  }
  return s;
}
export function average(values) {
  const a = values.filter((e) => null !== e);
  return a.length
    ? Math.round((a.reduce((e, a) => e + a, 0) / a.length) * 10) / 10
    : null;
}
export function studentReports(state, classId) {
  const assignments = classAssignments(state, classId),
    index = submissionIndex(state);
  return activeStudents(state, classId).map((student) => {
    let missing = 0,
      pending = 0,
      completed = 0,
      feedbackCount = 0;
    const handwriting = [],
      composition = [];
    for (const assignment of assignments) {
      const submission = index.latest.get(assignment.id)?.get(student.id),
        published = submission?.published;
      if (!submission) missing++;
      else if (submission.status === "published") completed++;
      else pending++;
      if (published) {
        feedbackCount++;
        handwriting.push(total(published.handwriting));
        composition.push(total(published.composition));
      }
    }
    return {
      ...student,
      missing,
      pending,
      completed,
      feedbackCount,
      handwriting: average(handwriting),
      composition: average(composition),
    };
  });
}
