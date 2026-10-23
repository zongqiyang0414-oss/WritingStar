import { classAssignments, studentReports, latestSubmission } from "./school.js";
import { total } from "./rubric.js";

export function mean(values) {
  const a = values.filter((e) => null !== e);
  return a.length
    ? Math.round((a.reduce((e, a) => e + a, 0) / a.length) * 10) / 10
    : null;
}
export function formatDate(value, includeTime = false) {
  if (!value) return "不限";
  const t = new Date(value);
  return (
    `${t.getMonth() + 1}月${t.getDate()}日` +
    (includeTime
      ? ` ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
      : "")
  );
}
export function rankedStudents(state, classId, category, query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const l = studentReports(state, classId).sort((e, a) => {
    const s = e[category],
      l = a[category];
    return s === l
      ? e.name.localeCompare(a.name, "zh-CN") || e.id.localeCompare(a.id)
      : null === s
        ? 1
        : null === l
          ? -1
          : l - s;
  });
  let n = null,
    i = 0;
  return l
    .map((e, a) => {
      const s = e[category];
      null !== s && s !== n && (i = a + 1);
      n = s;
      return {
        ...e,
        rank: null === s ? null : i,
      };
    })
    .filter((e) =>
      e.name.toLocaleLowerCase().includes(normalizedQuery),
    );
}
export function studentHistory(state, classId, studentId) {
  if (!state.students.some((e) => e.id === studentId && e.classId === classId))
    return [];
  return classAssignments(state, classId)
    .map(assignment => ({ assignment, submission: latestSubmission(state, assignment.id, studentId) }))
    .filter(item => item.submission)
    .map(({ assignment, submission }) => ({
      ...submission,
      assignment,
      handwriting: submission.published ? total(submission.published.handwriting) : null,
      composition: submission.published ? total(submission.published.composition) : null,
    }));
}

export function studentSummary(state, classId, studentId) {
  if (!state.students.find((e) => e.id === studentId && e.classId === classId))
    return null;
  const s = studentHistory(state, classId, studentId);
  const n = s.filter(item => item.published);
  return {
    studentId,
    classId,
    handwriting: mean(n.map((e) => e.handwriting)),
    composition: mean(n.map((e) => e.composition)),
    feedbackCount: n.length,
    submissionCount: s.length,
  };
}
