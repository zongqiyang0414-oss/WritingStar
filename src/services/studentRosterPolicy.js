export const MAX_ROSTER_STUDENTS = 500;
export const MAX_ROSTER_FILE_BYTES = 5 * 1024 * 1024;

export function validateRosterFile(file) {
  if (/\.doc$/i.test(file?.name || "")) throw new Error("暂不支持旧版.doc文件，请在Word中另存为.docx后导入。");
  if (!/\.(xlsx|xls|docx)$/i.test(file?.name || "")) throw new Error("请选择Excel（.xlsx、.xls）或Word（.docx）名单。");
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_ROSTER_FILE_BYTES) throw new Error("名单文件需在5 MB以内，且不能为空。");
  return file;
}
