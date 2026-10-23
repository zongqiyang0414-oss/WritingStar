/** A teacher grants one replacement upload for the current submission. */
export function canResubmit(submission) {
  return !!submission?.resubmission && !submission.resubmission.consumedAt;
}

/** Remove only the retired, known fictional multi-version exercise. */
export function prepareSubmissionPolicy(state) {
  const assignmentId = "assignment-xiaohe-revision-example";
  const demoIds = new Set(["revision-demo-xiaohe-1", "revision-demo-xiaohe-2", "revision-demo-xiaohe-3"]);
  const submissions = state.submissions.filter(item => !(item.assignmentId === assignmentId && item.example === true && demoIds.has(item.id)));
  const assignments = state.assignments.flatMap(item => {
    if (item.id !== assignmentId || item.title !== "校园里的一次发现（订正示例）") return [item];
    return submissions.some(submission => submission.assignmentId === assignmentId)
      ? [{ ...item, title: "校园里的一次发现", requirements: "观察校园的一处变化，把发现写具体。" }]
      : [];
  });
  if (submissions.length === state.submissions.length && assignments.length === state.assignments.length && assignments.every((item, index) => item === state.assignments[index]) && !("revisionPracticeVersion" in state)) return state;
  const { revisionPracticeVersion, ...next } = state;
  return { ...next, submissions, assignments };
}
