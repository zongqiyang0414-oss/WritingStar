import { classAssignments, studentReports } from "./school.js";
import { total } from "./rubric.js";

export function mean(values) {
  const a = values.filter((e) => null !== e);
  return a.length
    ? Math.round((a.reduce((e, a) => e + a, 0) / a.length) * 10) / 10
    : null;
}
export function formatDate(value, includeTime = false) {
  const t = new Date(value);
  return (
    `${t.getMonth() + 1}月${t.getDate()}日` +
    (includeTime
      ? ` ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
      : "")
  );
}
export function rankedStudents(state, classId, category, query = "") {
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
      e.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    );
}
export function studentHistory(state, classId, studentId) {
  if (!state.students.some((e) => e.id === studentId && e.classId === classId))
    return [];
  const s = classAssignments(state, classId);
  return state.submissions
    .filter(
      (e) =>
        e.studentId === studentId && s.some((a) => a.id === e.assignmentId),
    )
    .sort(
      (e, a) =>
        e.submittedAt.localeCompare(a.submittedAt) ||
        e.version - a.version ||
        e.id.localeCompare(a.id),
    )
    .map((e) => ({
      ...e,
      assignment: s.find((a) => a.id === e.assignmentId),
      handwriting: e.published ? total(e.published.handwriting) : null,
      composition: e.published ? total(e.published.composition) : null,
    }));
}
export function studentSummary(state, classId, studentId) {
  if (!state.students.find((e) => e.id === studentId && e.classId === classId))
    return null;
  const s = studentHistory(state, classId, studentId),
    l = new Map();
  for (const i of s)
    i.published &&
      (!l.has(i.assignmentId) || l.get(i.assignmentId).version < i.version) &&
      l.set(i.assignmentId, i);
  const n = [...l.values()];
  return {
    studentId,
    classId,
    handwriting: mean(n.map((e) => e.handwriting)),
    composition: mean(n.map((e) => e.composition)),
    feedbackCount: n.length,
    submissionCount: s.length,
    revisionCount: s.filter((e) => e.version > 1).length,
  };
}
