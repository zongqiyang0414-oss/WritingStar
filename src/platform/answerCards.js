import qrcode from "qrcode-generator";
import { encodePaperCode } from "../services/paperWorkflow.js";

export const CARD_WIDTH = 794, CARD_HEIGHT = 1123;
export function qrMatrix(code) {
  const qr = qrcode(0, "M"); qr.addData(code); qr.make();
  return Array.from({length: qr.getModuleCount()}, (_, y) => Array.from({length: qr.getModuleCount()}, (_, x) => qr.isDark(y, x)));
}
// Shared drawing instructions keep downloaded, printed and mini-program cards identical.
export function cardDrawing(assignment, card, page) {
  const code = encodePaperCode(card, page, assignment.paperPacket.pages), matrix = qrMatrix(code), commands = [];
  const rect = (x, y, w, h, color) => commands.push({ kind: "rect", x, y, w, h, color });
  const text = (value, x, y, size = 16, color = "#263d34") => commands.push({ kind: "text", value, x, y, size, color });
  const line = (x, y, x2, y2, color = "#c5d3ca") => commands.push({ kind: "line", x, y, x2, y2, color });
  rect(0, 0, CARD_WIDTH, CARD_HEIGHT, "#ffffff");
  for (const [x, y] of [[24, 24], [758, 24], [758, 1087], [24, 1087]]) rect(x, y, 12, 12, "#000000");
  text("写字星  /  WRITINGSTAR", 52, 65, 15, "#257b61");
  const title = assignment.title.length > 24 ? assignment.title.slice(0, 23) + "…" : assignment.title;
  text(title, 52, 108, 26);
  text(`${card.className}   姓名：${card.studentName}`, 52, 147, 18);
  text(`学号：${card.studentNumber || "—"}     第 ${page} / ${assignment.paperPacket.pages} 页`, 52, 178, 16);
  const size = 132, unit = size / (matrix.length + 8), qx = 610, qy = 82;
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix.length; x++)
    if (matrix[y][x]) rect(qx + (x + 4) * unit, qy + (y + 4) * unit, unit + .08, unit + .08, "#000000");
  text("学生专属码 · 请保持清晰", 604, 232, 11, "#46554c");
  line(52, 252, 742, 252);
  const requirements = assignment.requirements.replace(/\s+/g, " ");
  text("本次要求", 52, 279, 14);
  const chunks = Array.from(requirements.matchAll(/.{1,43}/gu)).map(match => match[0]);
  for (let i = 0; i < Math.min(chunks.length, 3); i++) text(chunks[i] + (i === 2 && chunks.length > 3 ? "…" : ""), 52, 303 + i * 21, 14);
  if (chunks.length > 3) text("完整作业要求请查看学生端本次作业。", 52, 372, 11, "#65756b");
  text("题目：", 52, 394, 16); line(106, 400, 742, 400);
  const left = 52, top = 430, cell = 34.5, cols = 20, rows = 18;
  for (let x = 0; x <= cols; x++) line(left + x * cell, top, left + x * cell, top + rows * cell);
  for (let y = 0; y <= rows; y++) line(left, top + y * cell, left + cols * cell, top + y * cell);
  text("A4 原比例打印 · 请勿裁去四角定位标记与学生码 · 完成后逐页拍照上传", 52, 1080, 12, "#65756b");
  text(code, 52, 1103, 8, "#46554c");
  return { commands, code };
}
export function drawAnswerCard(ctx, assignment, card, page) {
  const { commands, code } = cardDrawing(assignment, card, page);
  for (const c of commands) {
    if (ctx.setFillStyle) ctx.setFillStyle(c.color); else ctx.fillStyle = c.color;
    if (c.kind === "rect") ctx.fillRect(c.x, c.y, c.w, c.h);
    if (c.kind === "text") {
      if (ctx.setFontSize) ctx.setFontSize(c.size); else ctx.font = `${c.size}px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
      ctx.fillText(c.value, c.x, c.y);
    }
    if (c.kind === "line") {
      if (ctx.setStrokeStyle) ctx.setStrokeStyle(c.color); else ctx.strokeStyle = c.color;
      if (ctx.setLineWidth) ctx.setLineWidth(.65); else ctx.lineWidth = .65;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x2, c.y2); ctx.stroke();
    }
  }
  return code;
}

// #ifdef H5
export function answerCardImage(assignment, card, page, scale = 1.5) {
  const canvas = document.createElement("canvas"); canvas.width = CARD_WIDTH * scale; canvas.height = CARD_HEIGHT * scale;
  const ctx = canvas.getContext("2d"); ctx.scale(scale, scale); drawAnswerCard(ctx, assignment, card, page);
  return canvas.toDataURL("image/png");
}
export function downloadAnswerCard(assignment, card, page) {
  const link = document.createElement("a"); link.href = answerCardImage(assignment, card, page, 2);
  link.download = `${assignment.title}-${card.studentName}-第${page}页.png`; link.click();
}
export function printAnswerCards(assignment, cards) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("浏览器阻止了打印窗口，请允许弹出窗口后重试。");
  const doc = popup.document; doc.title = "写字星 · 答题卡打印";
  const style = doc.createElement("style");
  style.textContent = "@page{size:A4;margin:0}body{margin:0;background:#e6ece7;font-family:sans-serif}img{display:block;width:210mm;height:297mm;margin:8mm auto;break-after:page}button{display:block;margin:24px auto;padding:12px 28px;background:#257b61;color:white;border:0;border-radius:10px;cursor:pointer}@media print{body{background:white}img{margin:0}button{display:none}}";
  doc.head.append(style);
  const button = doc.createElement("button"); button.textContent = "打印 / 另存为 PDF（A4，缩放 100%）"; button.onclick = () => popup.print(); doc.body.append(button);
  for (const card of cards) for (let page = 1; page <= assignment.paperPacket.pages; page++) {
    const img = doc.createElement("img"); img.alt = `${card.studentName} 第${page}页`; img.src = answerCardImage(assignment, card, page); doc.body.append(img);
  }
  popup.focus();
}
// #endif
