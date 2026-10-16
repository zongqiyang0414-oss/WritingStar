import { total } from "./rubric.js";

export const taskStatuses = ["未提交", "待批阅", "已完成"];
export function activeStudents(state, classId) {
  return state.students.filter((e) => e.classId === classId && !e.archived);
}
export function taskStatus(submission) {
  return submission
    ? "published" === submission.status
      ? "已完成"
      : "待批阅"
    : "未提交";
}
export function latestSubmission(state, assignmentId, studentId) {
  return (
    state.submissions
      .filter(
        (e) => e.assignmentId === assignmentId && e.studentId === studentId,
      )
      .sort((e, a) => a.version - e.version)[0] || null
  );
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
    s = {
      missing: 0,
      pending: 0,
      completed: 0,
      total: t.length,
    };
  for (const l of t) {
    const t = taskStatus(latestSubmission(state, assignment.id, l.id));
    "未提交" === t ? s.missing++ : "待批阅" === t ? s.pending++ : s.completed++;
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
  const t = classAssignments(state, classId);
  return activeStudents(state, classId).map((a) => {
    const s = t.map((t) => latestSubmission(state, t.id, a.id)),
      l = t
        .map((t) => {
          var s;
          return state.submissions
            .filter(
              (e) =>
                e.assignmentId === t.id && e.studentId === a.id && e.published,
            )
            .sort((e, a) => a.version - e.version)[0]?.published;
        })
        .filter((e) => !!e);
    return {
      ...a,
      missing: s.filter((e) => !e).length,
      pending: s.filter((e) => e && "published" !== e.status).length,
      completed: s.filter((e) => "published" === e?.status).length,
      feedbackCount: l.length,
      handwriting: average(l.map((e) => total(e.handwriting))),
      composition: average(l.map((e) => total(e.composition))),
    };
  });
}
