export function migrateStudentEntry(state) {
  if (state.schemaVersion === 6) return state;
  const next = JSON.parse(JSON.stringify(state));
  const accounts = next.accounts || {};
  const student = accounts.student || {
    signedIn: false,
    studentId: null,
  };
  const parent = accounts.parent;
  const bound = (account) =>
    account &&
    account.signedIn &&
    next.students.some((item) => item.id === account.studentId);
  next.accounts = {
    student: bound(student) ? student : bound(parent) ? parent : student,
  };
  if (parent) next.legacyParentAccount = JSON.parse(JSON.stringify(parent));
  next.schemaVersion = 6;
  next.studentEntryVersion = 1;
  return next;
}
