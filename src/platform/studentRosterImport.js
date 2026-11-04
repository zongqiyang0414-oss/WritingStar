import { validateRosterFile } from "../services/studentRosterPolicy.js";
export { MAX_ROSTER_FILE_BYTES, validateRosterFile } from "../services/studentRosterPolicy.js";
// #ifdef H5
import { parseRosterBytes } from "./studentRosterParser.js";
export { parseRosterBytes, parseWordRoster } from "./studentRosterParser.js";
// #endif

export function chooseRosterFile() {
  // #ifdef H5
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".xlsx,.xls,.docx,.doc";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      try { const file = input.files?.[0]; resolve(file ? { file: validateRosterFile(file), rows: parseRosterBytes(await file.arrayBuffer(), file.name) } : null); }
      catch (error) { reject(error); }
    };
    input.click();
  });
  // #endif
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => wx.chooseMessageFile({ count: 1, type: "file", extension: ["xlsx", "xls", "docx", "doc"],
    success: async (result) => {
      try {
        const file = validateRosterFile(result.tempFiles[0]);
        const rows = await readNativeRoster(file);
        resolve(rows ? { file, rows } : null);
      } catch (error) { reject(error); }
    },
    fail: (error) => /cancel/.test(error.errMsg || "") ? resolve(null) : reject(new Error("无法选择名单文件，请重试。")),
  }));
  // #endif
}

const safeCell = (value) => {
  let result = String(value ?? "");
  if (/^[=+@\-\t\r\n]/.test(result)) result = "'" + result;
  return result;
};
export function credentialsText(rows) {
  return [["姓名", "班级", "学号", "账号", "初始密码"], ...rows.map((row) => [row.name, row.className, row.studentNumber, row.username, row.password])]
    .map((cells) => cells.map((cell) => safeCell(cell).replace(/[\t\r\n]/g, " ")).join("\t")).join("\n");
}

export function downloadCredentials(rows) {
  const csv = "\ufeff" + [["姓名", "班级", "学号", "账号", "初始密码"], ...rows.map((row) => [row.name, row.className, row.studentNumber, row.username, row.password])]
    .map((cells) => cells.map((cell) => '"' + safeCell(cell).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  // #ifdef H5
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "学生账号密码.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve();
  // #endif
  // #ifdef MP-WEIXIN
  const filePath = `${wx.env.USER_DATA_PATH}/学生账号密码-${Date.now()}.csv`;
  const fs = wx.getFileSystemManager();
  const cleanup = () => fs.unlink({ filePath, fail: () => {} });
  return new Promise((resolve, reject) => fs.writeFile({ filePath, data: csv, encoding: "utf8",
    success: () => wx.shareFileMessage({ filePath, fileName: "学生账号密码.csv", success: () => { cleanup(); resolve(); }, fail: (error) => { cleanup(); /cancel/.test(error.errMsg || "") ? resolve() : reject(new Error("导出失败，可使用复制账号名单。")); } }),
    fail: () => reject(new Error("导出失败，可使用复制账号名单。")),
  }));
  // #endif
}

// #ifdef MP-WEIXIN
function readNativeRoster(file) {
  return new Promise((resolve, reject) => {
    let settled = false;
    wx.loadSubpackage({ name: "roster-import", success: () => {
      uni.navigateTo({ url: "/roster-import/index", events: {
        parsed: (rows) => { settled = true; setTimeout(() => resolve(rows), 150); },
        cancelled: () => { settled = true; resolve(null); },
        failed: (message) => { settled = true; reject(new Error(message || "名单读取失败，请重试。")); },
      }, success: (result) => result.eventChannel.emit("roster", file),
      fail: () => { if (!settled) reject(new Error("名单导入页面无法打开，请重试。")); } });
    }, fail: () => reject(new Error("名单模块加载失败，请检查网络后重试。")) });
  });
}
// #endif
