import type { Assignment, PrototypeState, Submission } from './model';
import { total } from './rubric';

export const taskStatuses = ['未提交', '待批阅', '已完成'] as const;
export type TaskStatus = typeof taskStatuses[number];

export function taskStatus(submission?: Submission | null): TaskStatus {
  return !submission ? '未提交' : submission.status === 'published' ? '已完成' : '待批阅';
}

export function latestSubmission(state: PrototypeState, assignmentId: string, studentId: string) {
  return state.submissions.filter(s => s.assignmentId === assignmentId && s.studentId === studentId)
    .sort((a, b) => b.version - a.version)[0] || null;
}

export function classAssignments(state: PrototypeState, classId: string) {
  return state.assignments.filter(a => a.classId === classId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function assignmentCounts(state: PrototypeState, assignment: Assignment) {
  const students = state.students.filter(s => s.classId === assignment.classId);
  const counts = {missing: 0, pending: 0, completed: 0, total: students.length};
  for (const student of students) {
    const status = taskStatus(latestSubmission(state, assignment.id, student.id));
    if (status === '未提交') counts.missing++;
    else if (status === '待批阅') counts.pending++;
    else counts.completed++;
  }
  return counts;
}

export function activeCounts(state: PrototypeState, classId: string, now = Date.now()) {
  return classAssignments(state, classId).filter(a => Date.parse(a.dueAt) > now)
    .reduce((all, a) => {
      const counts = assignmentCounts(state, a);
      return {missing: all.missing + counts.missing, pending: all.pending + counts.pending,
        completed: all.completed + counts.completed, total: all.total + counts.total};
    }, {missing: 0, pending: 0, completed: 0, total: 0});
}

function mean(values: (number | null)[]) {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? Math.round(valid.reduce((sum, n) => sum + n, 0) / valid.length * 10) / 10 : null;
}

export function studentReports(state: PrototypeState, classId: string) {
  const assignments = classAssignments(state, classId);
  return state.students.filter(s => s.classId === classId).map(student => {
    const current = assignments.map(a => latestSubmission(state, a.id, student.id));
    const reviews = assignments.map(a => state.submissions.filter(s => s.assignmentId === a.id &&
      s.studentId === student.id && s.published).sort((x, y) => y.version - x.version)[0]?.published)
      .filter(review => !!review);
    return {...student, missing: current.filter(s => !s).length,
      pending: current.filter(s => s && s.status !== 'published').length,
      completed: current.filter(s => s?.status === 'published').length,
      feedbackCount: reviews.length,
      handwriting: mean(reviews.map(r => total(r.handwriting))),
      composition: mean(reviews.map(r => total(r.composition)))};
  });
}
