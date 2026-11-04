import { getBoundTeacher } from "./identity.js";
import { issueStudentCredentials } from "./accountRegistration.js";

import { MAX_ROSTER_STUDENTS } from "./studentRosterPolicy.js";
export { MAX_ROSTER_STUDENTS } from "./studentRosterPolicy.js";
const copy = (value) => JSON.parse(JSON.stringify(value));
const normalized = (value) => String(value ?? "").trim();
const key = (value) => normalized(value).toLowerCase();

function importClass(state, classId, role) {
  if (role !== "teacher") throw new Error("请使用教师账号导入学生。");
  const teacher = getBoundTeacher(state);
  if (!teacher) throw new Error("请先登录教师账号。");
  if (state.teacherAccount.mustChangePassword) throw new Error("请先修改初始密码。");
  const schoolClass = state.classes.find((item) => item.id === classId);
  if (!schoolClass || !teacher.classIds.includes(classId) || !teacher.organizationIds.includes(schoolClass.organizationId))
    throw new Error("只能向自己管理的班级导入学生。");
  return schoolClass;
}

/** Preview and commit share this validation. No row is silently skipped or merged. */
export function previewStudentImport(state, input, role = "teacher") {
  const schoolClass = importClass(state, input?.classId, role);
  if (!Array.isArray(input?.rows)) throw new Error("请先选择学生名单文件。");
  if (!input.rows.length) throw new Error("名单中没有学生，请检查姓名列。");
  if (input.rows.length > MAX_ROSTER_STUDENTS) throw new Error(`每批最多导入${MAX_ROSTER_STUDENTS}名学生，请分批导入。`);
  const organizationClasses = new Set(state.classes.filter((item) => item.organizationId === schoolClass.organizationId).map((item) => item.id));
  const existing = state.students.filter((item) => organizationClasses.has(item.classId));
  const existingNumbers = new Set(existing.filter((item) => item.studentNumber).map((item) => key(item.studentNumber)));
  const numbers = new Map(), names = new Map();
  const rows = input.rows.map((source, index) => ({
    row: Number.isInteger(source?.row) && source.row > 0 ? source.row : index + 2,
    ...(source?.sheet ? { sheet: normalized(source.sheet) } : {}),
    name: normalized(source?.name), studentNumber: normalized(source?.studentNumber), errors: [],
  }));
  for (const row of rows) {
    const name = key(row.name), number = key(row.studentNumber);
    if (!row.name) row.errors.push("请填写学生姓名");
    else if (row.name.length > 30 || /[\u0000-\u001f\u007f]/.test(row.name)) row.errors.push("姓名需为1至30个字，不能包含换行或制表符");
    if (row.studentNumber.length > 32 || /[\u0000-\u001f\u007f]/.test(row.studentNumber)) row.errors.push("学号最多32个字，不能包含换行或制表符");
    if (number) {
      if (existingNumbers.has(number)) row.errors.push("本校已有该学号（含已归档学生），请核对已有档案");
      if (numbers.has(number)) {
        row.errors.push("文件中学号重复");
        numbers.get(number).errors.push("文件中学号重复");
      } else numbers.set(number, row);
    }
    if (name) {
      const sameName = names.get(name) || [];
      sameName.push(row); names.set(name, sameName);
    }
  }
  // A supplied unique number distinguishes namesakes; a name alone cannot.
  for (const [name, group] of names) {
    if (group.some((row) => !row.studentNumber) && (group.length > 1 || existing.some((student) => key(student.name) === name)))
      for (const row of group) if (!row.studentNumber) row.errors.push("存在同名学生，请补充学号区分；已有学生无需重复导入");
  }
  const errors = rows.flatMap((row) => [...new Set(row.errors)].map((message) => ({ row: row.row, ...(row.sheet ? { sheet: row.sheet } : {}), message })));
  return { rows, errors, validCount: rows.filter((row) => !row.errors.length).length, totalCount: rows.length, canImport: !errors.length };
}

/** Return a new complete state; caller persists it once with its existing atomic commit. */
export function importStudentRoster(state, input, role = "teacher") {
  const schoolClass = importClass(state, input?.classId, role);
  const preview = previewStudentImport(state, input, role);
  if (!preview.canImport) throw new Error(`第${preview.errors[0].row}行：${preview.errors[0].message}。请修正名单后重新导入。`);
  const next = copy(state), students = [];
  const organizationClassIds = new Set(next.classes.filter((item) => item.organizationId === schoolClass.organizationId).map((item) => item.id));
  const usedNumbers = new Set(next.students.filter((item) => organizationClassIds.has(item.classId) && item.studentNumber).map((item) => key(item.studentNumber)));
  for (const row of preview.rows) if (row.studentNumber) usedNumbers.add(key(row.studentNumber));
  let sequence = 1;
  const timestamp = Date.now();
  for (const row of preview.rows) {
    let studentNumber = row.studentNumber;
    if (!studentNumber) {
      do { studentNumber = `S${String(sequence++).padStart(5, "0")}`; } while (usedNumbers.has(key(studentNumber)));
      usedNumbers.add(key(studentNumber));
    }
    const student = {
      id: `student-${timestamp}-${students.length}-${Math.random().toString(36).slice(2, 9)}`,
      name: row.name, initial: [...row.name][0], studentNumber,
      classId: schoolClass.id, className: schoolClass.name, archived: false,
    };
    next.students.push(student); students.push(student);
  }
  const credentials = issueStudentCredentials(next, students.map((student) => student.id));
  const teacher = getBoundTeacher(state);
  next.administrationEvents ||= [];
  next.administrationEvents.unshift({
    id: `management-import-${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
    organizationId: schoolClass.organizationId,
    description: `批量导入学生：${schoolClass.name} · ${students.length}人`,
    administratorId: teacher.id, administratorName: teacher.name,
    createdAt: new Date(timestamp).toISOString(),
  });
  return { state: next, credentials, students: copy(students) };
}
