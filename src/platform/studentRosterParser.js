import { read, utils } from "xlsx";
import { unzipSync, strFromU8 } from "fflate";
import { MAX_ROSTER_STUDENTS, validateRosterFile } from "../services/studentRosterPolicy.js";

const MAX_EXPANDED_BYTES = 20 * 1024 * 1024;
const nameHeaders = new Set(["姓名", "学生姓名", "学生名字", "name", "studentname"]);
const numberHeaders = new Set(["学号", "学生学号", "学生编号", "studentnumber", "studentid"]);
const header = (value) => String(value ?? "").trim().toLowerCase().replace(/[\s*＊（()）]/g, "");
const text = (value) => String(value ?? "").trim();

function gridRows(grid, sheet = "", optionalHeader = false) {
  const headerIndex = grid.slice(0, 20).findIndex((cells) => cells.some((cell) => nameHeaders.has(header(cell))));
  if (headerIndex < 0) {
    if (optionalHeader) return [];
    throw new Error("未找到“姓名”列，请在表格前20行内添加“姓名”表头，可同时添加“学号”列。");
  }
  const columns = grid[headerIndex];
  const nameColumn = columns.findIndex((cell) => nameHeaders.has(header(cell)));
  const numberColumn = columns.findIndex((cell) => numberHeaders.has(header(cell)));
  const rows = [];
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const cells = grid[index] || [];
    if (!cells.some((cell) => text(cell))) continue;
    if (nameHeaders.has(header(cells[nameColumn])) && (numberColumn < 0 || numberHeaders.has(header(cells[numberColumn])))) continue;
    rows.push({ name: text(cells[nameColumn]), studentNumber: numberColumn < 0 ? "" : text(cells[numberColumn]), row: index + 1, ...(sheet ? { sheet } : {}) });
  }
  return rows;
}

function checkedZip(bytes, onlyDocument = false) {
  let expanded = 0;
  return unzipSync(bytes, { filter: (entry) => {
    expanded += entry.originalSize;
    if (!Number.isFinite(expanded) || expanded > MAX_EXPANDED_BYTES) throw new Error("文件解压后过大，请只保留学生名单后重新导入。");
    return onlyDocument && entry.name === "word/document.xml";
  } });
}

function xmlText(value) {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (entity, code, named) => {
    if (code) {
      const number = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named.toLowerCase()];
  });
}

/** Word tables are parsed locally without relying on browser-only DOMParser. */
export function parseWordRoster(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("该Word文件包含不支持的XML声明，请重新另存为.docx。");
  const rows = [];
  const tables = [...xml.matchAll(/<(?:[\w.-]+:)?tbl\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?tbl\s*>/g)];
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
    const table = tables[tableIndex][1];
    if (/<(?:[\w.-]+:)?tbl\b/.test(table)) throw new Error("名单不支持嵌套表格，请整理为普通的姓名、学号表格。");
    const grid = [...table.matchAll(/<(?:[\w.-]+:)?tr\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?tr\s*>/g)].map((match) =>
      [...match[1].matchAll(/<(?:[\w.-]+:)?tc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?tc\s*>/g)].map((cell) =>
        [...cell[1].matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t\s*>/g)].map((part) => xmlText(part[1])).join("")));
    rows.push(...gridRows(grid, `表格${tableIndex + 1}`, true));
  }
  if (!rows.length) throw new Error("Word中没有找到学生名单，请使用含“姓名”表头的普通表格，可另加“学号”列。");
  return rows;
}

function documentXml(bytes) {
  if (bytes[0] === 255 && bytes[1] === 254 || bytes[0] === 254 && bytes[1] === 255) {
    const littleEndian = bytes[0] === 255;
    let result = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) result += String.fromCharCode(littleEndian ? bytes[index] + bytes[index + 1] * 256 : bytes[index] * 256 + bytes[index + 1]);
    return result;
  }
  return strFromU8(bytes);
}

export function parseRosterBytes(data, fileName) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  validateRosterFile({ name: fileName, size: bytes.byteLength });
  let rows;
  try {
    if (/\.docx$/i.test(fileName)) {
      const document = checkedZip(bytes, true)["word/document.xml"];
      if (!document) throw new Error("文件不是有效的Word文档，请重新另存为.docx。");
      rows = parseWordRoster(documentXml(document));
    } else {
      if (/\.xlsx$/i.test(fileName)) checkedZip(bytes);
      const workbook = read(bytes, { type: "array", cellHTML: false, cellFormula: false, sheetRows: MAX_ROSTER_STUDENTS + 22 });
      rows = [];
      for (const name of workbook.SheetNames) {
        const metadata = workbook.Workbook?.Sheets?.find((sheet) => sheet.name === name);
        if (metadata?.Hidden) continue;
        const sheet = workbook.Sheets[name];
        if (!sheet?.["!ref"]) continue;
        const range = utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
        if (range.e.r > MAX_ROSTER_STUDENTS + 20 || range.e.c > 100) throw new Error("表格范围过大，请只保留姓名、学号列及500名以内学生。");
        const grid = utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: true, range: 0 });
        rows.push(...gridRows(grid, name, true));
      }
      if (!rows.length) throw new Error("未找到学生名单，请在表格前20行内添加“姓名”表头，可另加“学号”列。");
    }
  } catch (error) {
    if (/名单|文件|Word|表格|姓名/.test(error?.message || "")) throw error;
    throw new Error("文件无法读取，请检查是否损坏或加密，并重新另存为Excel或Word表格。");
  }
  if (rows.length > MAX_ROSTER_STUDENTS) throw new Error(`每批最多导入${MAX_ROSTER_STUDENTS}名学生，请分批导入。`);
  return rows;
}
