// Rename the original demonstration school without overwriting a school name
// that has since been customized. This migration also runs for schema 6 data.
function migrateDemonstrationSchool(state) {
  if (!state.organizations?.some((item) => item.id === "organization-1" && item.name === "星河小学")) return state;
  return {
    ...state,
    organizations: state.organizations.map((item) =>
      item.id === "organization-1" && item.name === "星河小学"
        ? { ...item, name: "甲秀小学" }
        : item,
    ),
  };
}

export function migrateStudentEntry(state) {
  if (state.schemaVersion === 6) return migrateDemonstrationSchool(state);
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
  return migrateDemonstrationSchool(next);
}
