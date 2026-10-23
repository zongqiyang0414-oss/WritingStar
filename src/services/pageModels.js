import {
  activeStudents,
  assignmentCounts,
  classAssignments,
  latestSubmission,
} from "./school.js";
import { formatDate, mean, rankedStudents, studentHistory } from "./analytics.js";
import { organizationForClass } from "./identity.js";
import { total } from "./rubric.js";

// These models cross the component boundary on mini programs. Keep only values
// needed for display: photos, review drafts and account data stay in the store.
const modelCache = new WeakMap();
function cachedModel(state, group, key, build) {
  // Mutable fixtures/callers must continue to see in-place updates. The app
  // provides immutable snapshots, whose derived models can safely be reused.
  if (!Object.isFrozen(state)) return build();
  let cache = modelCache.get(state);
  if (!cache) modelCache.set(state, (cache = new Map()));
  const cacheKey = JSON.stringify([group, key]);
  if (!cache.has(cacheKey)) cache.set(cacheKey, build());
  return cache.get(cacheKey);
}

export function classStatisticsModel(state, classId, now) {
  const model = cachedModel(state, "statistics", classId, () => {
    const students = activeStudents(state, classId);
    const assignments = classAssignments(state, classId);
    return {
      studentCount: students.length,
      assignments: [...assignments].reverse().map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        dueAt: assignment.dueAt,
        counts: assignmentCounts(state, assignment),
      })),
      trend: assignments.map((assignment) => {
        const published = students
          .map((student) =>
            latestSubmission(state, assignment.id, student.id)?.published,
          )
          .filter(Boolean);
        return {
          id: assignment.id,
          label: assignment.title,
          note: `已审核 ${published.length} / ${students.length} 人`,
          detail: `布置：${formatDate(assignment.createdAt)} · 截止：${formatDate(assignment.dueAt)}`,
          handwriting: mean(published.map((review) => total(review.handwriting))),
          composition: mean(published.map((review) => total(review.composition))),
        };
      }),
    };
  });
  const rows = model.assignments.map((assignment) => ({
    ...assignment,
    ongoing: !assignment.dueAt || Date.parse(assignment.dueAt) > now,
  }));
  const ongoing = rows.filter((assignment) => assignment.ongoing).length;
  return {
    ...model,
    ongoing,
    closed: rows.length - ongoing,
    assignments: rows,
  };
}

export function studentRankingModel(state, classId, category, query = "") {
  const model = cachedModel(state, "ranking", [classId, category], () => ({
    studentCount: activeStudents(state, classId).length,
    className: state.classes.find((schoolClass) => schoolClass.id === classId)?.name,
    organizationName: organizationForClass(state, classId)?.name,
    ranks: rankedStudents(state, classId, category).map((student) => ({
      id: student.id,
      name: student.name,
      initial: student.initial,
      handwriting: student.handwriting,
      composition: student.composition,
      feedbackCount: student.feedbackCount,
      rank: student.rank,
    })),
  }));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return model;
  return {
    ...model,
    ranks: model.ranks.filter((student) =>
      student.name.toLocaleLowerCase().includes(normalizedQuery),
    ),
  };
}

export function studentGrowthModel(
  state,
  classId,
  studentId,
  category = "handwriting",
  audience = "teacher",
) {
  return cachedModel(state, "growth", [classId, studentId, category, audience], () => {
    const student = state.students.find(
      (entry) => entry.id === studentId && entry.classId === classId,
    );
    const submissions = studentHistory(state, classId, studentId);
    const history = submissions.map((submission) => ({
      id: submission.id,
      status: submission.status,
      published: Boolean(submission.published),
      submittedAt: submission.submittedAt,
      assignment: { title: submission.assignment.title },
      handwriting: submission.handwriting,
      composition: submission.composition,
    }));
    const published = submissions.filter(item => item.published);
    const rankEntry =
      student && audience === "teacher"
        ? studentRankingModel(state, classId, category).ranks.find((entry) => entry.id === studentId)
        : null;
    return {
      student: student
        ? { id: student.id, name: student.name, initial: student.initial, className: student.className }
        : null,
      rankEntry: rankEntry ? { rank: rankEntry.rank } : null,
      summary: student
        ? {
            studentId,
            classId,
            handwriting: mean(published.map((submission) => submission.handwriting)),
            composition: mean(published.map((submission) => submission.composition)),
            feedbackCount: published.length,
            submissionCount: history.length,
          }
        : null,
      history,
      trend: history.map((submission) => ({
        id: submission.id,
        label: submission.assignment.title,
        note: submission.published ? "已审核成绩" : "待审核成绩",
        detail: `提交：${formatDate(submission.submittedAt, true)}`,
        handwriting: submission.handwriting,
        composition: submission.composition,
      })),
      organizationName: organizationForClass(state, classId)?.name,
    };
  });
}

export function teachingClassesModel(state, classes, classId, query = "") {
  const key = [classId, classes.map((schoolClass) => [schoolClass.id, schoolClass.name])];
  const model = cachedModel(state, "teaching", key, () => {
    const rows = classes.map((schoolClass) => ({
      id: schoolClass.id,
      name: schoolClass.name,
      studentCount: activeStudents(state, schoolClass.id).length,
      assignmentCount: classAssignments(state, schoolClass.id).length,
    }));
    const submittedAssignments = new Map();
    for (const submission of state.submissions) {
      if (!submittedAssignments.has(submission.studentId)) submittedAssignments.set(submission.studentId, new Set());
      submittedAssignments.get(submission.studentId).add(submission.assignmentId);
    }
    const members = activeStudents(state, classId).map((student) => ({
      id: student.id,
      name: student.name,
      initial: student.initial,
      studentNumber: student.studentNumber,
      submissionCount: submittedAssignments.get(student.id)?.size || 0,
    }));
    return {
      classes: rows,
      currentClass: rows.find((schoolClass) => schoolClass.id === classId) || null,
      totalStudents: rows.reduce((count, schoolClass) => count + schoolClass.studentCount, 0),
      members,
    };
  });
  const normalizedQuery = query.trim().toLowerCase();
  return {
    ...model,
    filteredMembers: model.members.filter(
      (student) =>
        student.name.toLowerCase().includes(normalizedQuery) ||
        student.studentNumber?.toLowerCase().includes(normalizedQuery),
    ),
  };
}


export function submissionRecordsModel(state, studentId) {
  return cachedModel(state, "records", studentId, () => state.assignments
    .map(assignment => ({ assignment, submission: latestSubmission(state, assignment.id, studentId) }))
    .filter(item => item.submission)
    .sort((a, b) => b.assignment.createdAt.localeCompare(a.assignment.createdAt) || b.assignment.id.localeCompare(a.assignment.id))
    .map(({ assignment, submission }) => ({
      id: submission.id, assignmentId: assignment.id, title: assignment.title,
      submittedAt: submission.submittedAt, date: formatDate(submission.submittedAt, true),
      pageCount: submission.photos.length, published: !!submission.published,
      handwriting: submission.published ? total(submission.published.handwriting) : null,
      composition: submission.published ? total(submission.published.composition) : null,
      submittedBy: submission.actor === "teacher" ? submission.submittedBy?.name || "教师" : "",
    })));
}
