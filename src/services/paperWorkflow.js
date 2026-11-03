import { canResubmit } from "./submissionPolicy.js";
import { assignmentStudents, studentHasAssignment } from "./school.js";
// Local prototype contract; opaque card IDs identify records, not authentication.
export const PAPER_VERSION = 1;
export const MAX_SCAN_PAGES = 60;
export function paperId(prefix = "card") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
function checksum(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}
export function pageCount(value = 2) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 6) throw new Error("答题卡页数需为 1–6 页。");
  return count;
}
export function createPaperPacket(state, assignment, count = 2, previous = null) {
  const pages = pageCount(count);
  const cards = assignmentStudents(state, assignment).map(student => ({
    id: previous?.cards.find(card => card.studentId === student.id)?.id || paperId(),
    studentId: student.id, studentName: student.name,
    studentNumber: student.studentNumber || "", className: assignment.className,
  }));
  const activeIds = new Set(cards.map(card => card.studentId));
  return {
    version: PAPER_VERSION, pages,
    // Keep issued IDs for historical records and students later restored to class.
    cards: [...cards, ...(previous?.cards || []).filter(card => !activeIds.has(card.studentId))],
  };
}
export function encodePaperCode(card, page, total) {
  if (!card?.id || !Number.isInteger(page) || page < 1 || page > pageCount(total)) throw new Error("答题卡页码无效。");
  const body = `WS1|${card.id}|${page}|${total}`;
  return `${body}|${checksum(body)}`;
}
export function decodePaperCode(input) {
  const value = String(input || "").trim();
  const [version, cardId, rawPage, rawTotal, check, extra] = value.split("|");
  const page = Number(rawPage), total = Number(rawTotal);
  if (version !== "WS1" || !cardId || extra !== undefined || !Number.isInteger(page) || !Number.isInteger(total)
      || page < 1 || page > total || total > 6 || total < 1
      || checksum([version, cardId, rawPage, rawTotal].join("|")) !== check)
    throw new Error("学生码无法识别，请重新拍摄或人工确认。");
  return { cardId, page, total };
}
export function resolvePaperCode(state, assignmentId, code) {
  const parsed = decodePaperCode(code);
  const assignment = state.assignments.find(a => a.id === assignmentId);
  const card = assignment?.paperPacket?.cards.find(c => c.id === parsed.cardId);
  if (!card) throw new Error("学生码不属于本次作业，请核对答题卡。");
  if (assignment.paperPacket.pages !== parsed.total) throw new Error("答题卡版本不匹配，请使用本次作业的答题卡。");
  const student = state.students.find(s => s.id === card.studentId);
  if (!student || student.archived || student.classId !== assignment.classId) throw new Error("该学生已调班或归档，请联系老师确认。");
  if (!studentHasAssignment(assignment, student.id)) throw new Error("该学生未接取本次作业。");
  return { ...parsed, student, card };
}
// Always re-resolve QR identity from the current registry at submission time.
export function scanGroups(state, assignmentId, rows, ownStudentId = "") {
  const assignment = state.assignments.find(a => a.id === assignmentId);
  const packet = assignment?.paperPacket;
  const groups = new Map(), unresolved = [];
  for (const row of rows) {
    try {
      if (!row.photo?.id || !row.photo.url) throw new Error("照片无法读取，请重新添加。");
      let match;
      if (row.code) match = resolvePaperCode(state, assignmentId, row.code);
      else {
        if (!row.manual || !row.studentId) throw new Error("未识别学生码，待人工确认。");
        const card = packet?.cards.find(c => c.studentId === row.studentId);
        const student = state.students.find(s => s.id === row.studentId && !s.archived && s.classId === assignment.classId);
        if (!card || !student || !studentHasAssignment(assignment, student.id)) throw new Error("请选择本次作业的在班学生。");
        const page = Number(row.page);
        if (!Number.isInteger(page) || page < 1 || page > packet.pages) throw new Error("请核对页面序号。");
        match = { card, student, page, total: packet.pages };
      }
      if (ownStudentId && match.student.id !== ownStudentId) throw new Error("这张答题卡属于其他学生，请上传本人的答题卡。");
      if (!groups.has(match.student.id)) groups.set(match.student.id, {
        student: match.student, card: match.card, total: match.total, rows: [], issues: [], warnings: [], missingPages: [],
      });
      groups.get(match.student.id).rows.push({ ...row, page: match.page, manual: !row.code });
    } catch (failure) { unresolved.push({ ...row, issue: failure.message }); }
  }
  for (const group of groups.values()) {
    group.rows.sort((a, b) => a.page - b.page);
    const pages = group.rows.map(r => r.page);
    if (new Set(pages).size !== pages.length) group.issues.push("存在重复页，请移除或重新确认页码");
    if (new Set(group.rows.map(r => r.photo.id)).size !== group.rows.length) group.issues.push("同一张照片被重复添加");
    const missing = Array.from({length: group.total}, (_, i) => i + 1).filter(p => !pages.includes(p));
    group.missingPages = missing;
    if (missing.length) group.warnings.push(`缺少第 ${missing.join("、")} 页；如只写了部分页，可直接提交现有页面`);
    const latest = state.submissions.filter(s => s.assignmentId === assignmentId && s.studentId === group.student.id)
      .sort((a, b) => b.version - a.version)[0];
    if (latest && (!ownStudentId || !canResubmit(latest))) group.issues.push(ownStudentId
      ? "作品已提交，需老师同意后才能重新提交"
      : "该生已提交；重新提交需老师同意后由学生本人上传");
    group.ready = group.issues.length === 0;
  }
  return { groups: [...groups.values()], unresolved };
}
export function validatePaperBatch(state, assignmentId, rows, ownStudentId = "", allowIncomplete = false) {
  if (!rows.length || rows.length > MAX_SCAN_PAGES) throw new Error("每批请添加 1–60 页答题卡。");
  if (new Set(rows.map(r => r.id)).size !== rows.length || new Set(rows.map(r => r.photo?.id)).size !== rows.length)
    throw new Error("同一张扫描照片不能重复提交。");
  const result = scanGroups(state, assignmentId, rows, ownStudentId);
  if (result.unresolved.length) throw new Error(result.unresolved[0].issue);
  const invalid = result.groups.find(g => !g.ready);
  if (invalid) throw new Error(`${invalid.student.name}：${invalid.issues.join("；")}。`);
  const incomplete = result.groups.find(group => group.missingPages.length);
  if (incomplete && !allowIncomplete) throw new Error(`${incomplete.student.name}：缺少第 ${incomplete.missingPages.join("、")} 页，请确认仅提交现有页面。`);
  return result.groups;
}
