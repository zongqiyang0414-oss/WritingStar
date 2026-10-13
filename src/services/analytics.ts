import type { Category, PrototypeState } from './model';
import { classAssignments, studentReports } from './school';
import { total } from './rubric';

export interface TrendPoint {
  id: string;
  label: string;
  shortLabel?: string;
  note: string;
  handwriting: number | null;
  composition: number | null;
}
function average(values: (number | null)[]) {
  const scores = values.filter((n): n is number => n !== null);
  return scores.length ? Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length * 10) / 10 : null;
}

// A class trend compares assignments in teaching order. Revisions contribute once per student.
export function classTrend(state: PrototypeState, classId: string): TrendPoint[] {
  const students = state.students.filter(s => s.classId === classId);
  return classAssignments(state, classId).map(assignment => {
    const reviews = students.map(student => state.submissions.filter(s => s.assignmentId === assignment.id &&
      s.studentId === student.id && s.published).sort((a, b) => b.version - a.version)[0]?.published)
      .filter(review => !!review);
    return {id: assignment.id, label: assignment.title, note: `已发布 ${reviews.length} / ${students.length} 人`,
      handwriting: average(reviews.map(r => total(r.handwriting))),
      composition: average(reviews.map(r => total(r.composition)))};
  });
}

// Rank before filtering, so searching never changes a student's class rank. Ties share a rank.
export function studentRanking(state: PrototypeState, classId: string, category: Category, query = '') {
  const reports = studentReports(state, classId).sort((a, b) => {
    const left = a[category]; const right = b[category];
    return left === right ? a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id) :
      left === null ? 1 : right === null ? -1 : right - left;
  });
  let previous: number | null = null;
  let rank = 0;
  return reports.map((student, index) => {
    const score = student[category];
    if (score !== null && score !== previous) rank = index + 1;
    previous = score;
    return {...student, rank: score === null ? null : rank};
  }).filter(student => student.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
}

export function studentAttempts(state: PrototypeState, classId: string, studentId: string) {
  if (!state.students.some(s => s.id === studentId && s.classId === classId)) return [];
  const assignments = classAssignments(state, classId);
  return state.submissions.filter(s => s.studentId === studentId && assignments.some(a => a.id === s.assignmentId))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.version - b.version || a.id.localeCompare(b.id))
    .map(submission => ({...submission, assignment: assignments.find(a => a.id === submission.assignmentId)!,
      handwriting: submission.published ? total(submission.published.handwriting) : null,
      composition: submission.published ? total(submission.published.composition) : null}));
}

export function studentTrend(state: PrototypeState, classId: string, studentId: string): TrendPoint[] {
  return studentAttempts(state, classId, studentId).map(s => ({id: s.id, label: s.assignment.title, shortLabel: `第 ${s.version} 版`,
    note: `第 ${s.version} 版 · ${s.published ? '已发布成绩' : '待发布成绩'}`,
    handwriting: s.handwriting, composition: s.composition}));
}
