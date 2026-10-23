import { samplePhotos, sampleReview } from "./seed.js";
import { rubric } from "./rubric.js";

/** Append fictional revision examples without touching a learner's existing work. */
export function withRevisionPractice(state, now) {
  if (state.revisionPracticeVersion === 1) return state;
  const next = { ...state, revisionPracticeVersion: 1 };
  const student = state.students.find(item => item.id === "student-1" && item.name === "小禾");
  if (!student) return next;
  const exampleId = "assignment-xiaohe-revision-example";
  if (state.assignments.some(item => item.id === exampleId)) return next;
  const schoolClass = state.classes.find(item => item.id === student.classId);
  if (!schoolClass) return next;
  const assignment = { id: exampleId, title: "校园里的一次发现（订正示例）", classId: schoolClass.id, className: schoolClass.name, createdAt: new Date(now.getTime() - 5 * 86400000).toISOString(), dueAt: "", requirements: "观察校园的一处变化，按建议订正，用三次示例记录体验分数变化。" };
  const teacher = state.teachers.find(item => item.classIds.includes(assignment.classId));
  const publishedBy = { id: teacher?.id || "teacher-chen", name: teacher?.name || "陈老师", initial: teacher?.initial || "陈", subject: teacher?.subject || "语文" };
  const base = Math.min(Date.parse(assignment.createdAt) + 86400000, now.getTime() - 4 * 86400000);
  const submissions = [[56,58],[73,76],[87,89]].map(([writing, composition], index) => {
    const review = sampleReview();
    for (const [category, score] of [["handwriting", writing], ["composition", composition]]) {
      let remaining = score;
      rubric[category].forEach(dimension => { const value = Math.floor(score * dimension.max / 100); review[category].scores[dimension.id] = value; remaining -= value; });
      for (const dimension of rubric[category]) { const extra = Math.min(remaining, dimension.max - review[category].scores[dimension.id]); review[category].scores[dimension.id] += extra; remaining -= extra; }
      review[category].summary = index === 0 ? "已记录初稿。继续整理段落和字的间距，把发现写具体。" : index === 1 ? "订正后层次更清楚，字距逐渐均匀，还可补充观察细节。" : "本次订正内容具体、条理清楚，书写也更加稳定。";
    }
    review.nextSteps = index < 2 ? "补充一处具体观察，留意行间距。" : "保持本次修改方法，在下一次练习中继续运用。";
    const submittedAt = new Date(base + index * 86400000).toISOString();
    return { id: `revision-demo-xiaohe-${index + 1}`, assignmentId: assignment.id, studentId: student.id, version: index + 1, photos: JSON.parse(JSON.stringify(samplePhotos)), note: "", actor: "student", submittedAt, status: "published", draft: review, published: JSON.parse(JSON.stringify(review)), publishedAt: submittedAt, publishedBy, example: true };
  });
  return { ...next, assignments: [...state.assignments, assignment], submissions: [...state.submissions, ...submissions] };
}
