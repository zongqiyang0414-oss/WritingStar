import { activeStudents, assignmentCompleted } from "./school.js";

// Enrollment history is unavailable for old records: preserve the current
// roster as baseline rather than guessing who joined before this update.
export function prepareAssignmentParticipants(state) {
  if (state.assignments.every(item => Array.isArray(item.participantIds))) return state;
  return { ...state, assignments: state.assignments.map(item => Array.isArray(item.participantIds) ? item : {
    ...item, participantIds: activeStudents(state, item.classId).map(student => student.id),
  }) };
}

export function updateAssignmentParticipants(previous, next, now) {
  const before = new Map(previous.assignments.map(item => [item.id, item]));
  let changed = false;
  const assignments = next.assignments.map(assignment => {
    const old = before.get(assignment.id);
    const baseline = old?.participantIds || (old ? activeStudents(previous, old.classId).map(student => student.id) : []);
    const ids = new Set(baseline);
    // Completion must be checked before adding students to the class.
    if (!old || !assignmentCompleted(previous, old, now.getTime()))
      for (const student of activeStudents(next, assignment.classId)) ids.add(student.id);
    const participantIds = [...ids];
    if (Array.isArray(assignment.participantIds) && participantIds.length === assignment.participantIds.length && participantIds.every((id, index) => id === assignment.participantIds[index])) return assignment;
    changed = true;
    return { ...assignment, participantIds };
  });
  return changed ? { ...next, assignments } : next;
}
