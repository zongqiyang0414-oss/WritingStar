import qrcode from "qrcode-generator";
import { encodePaperCode } from "../services/paperWorkflow.js";

// PDF coordinates: preserve the approved A3 landscape front/back layout.
export const CARD_WIDTH = 1191, CARD_HEIGHT = 842;
export const CARD_PAPER = { width: 1190.55, height: 841.89 };
// One 19 mm code per column. The original writing-grid header band is cleared
// below, leaving the registration marks and every writing row untouched.
export const CARD_QR_SIZE = 54;
export function cardQrRegions(page) {
  return [201, 575, 949].map(x => ({ x, y: 14, width: CARD_QR_SIZE, height: CARD_QR_SIZE }));
}
// v0.26 pages stay readable after redistributing the current page's codes.
export function legacyCardQrRegions(page) {
  const left = page === 1 ? 64 : 820;
  return [0, 132, 264].map(offset => ({ x: left + offset, y: 54, width: 68, height: 68 }));
}
const backgroundLoads = new Map();
export function cardBackgroundPath(page) {
  return `/static/paper/fangyuan-${page === 1 ? 1 : 2}.png`;
}
export function loadAnswerCardBackground(page) {
  const path = cardBackgroundPath(page);
  if (!backgroundLoads.has(path)) {
    const loading = new Promise((resolve, reject) => {
      // #ifdef H5
      if (typeof Image !== "undefined") {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("作业模板加载失败，请重试。"));
        image.src = `${import.meta.env?.BASE_URL || "/"}${path.slice(1)}`;
      }
      // #endif
      // #ifndef H5
      if (typeof Image === "undefined") uni.getImageInfo({ src: path,
        success: result => resolve(result.path), fail: () => reject(new Error("作业模板加载失败，请重试。")) });
      // #endif
    }).catch(failure => { backgroundLoads.delete(path); throw failure; });
    backgroundLoads.set(path, loading);
  }
  return backgroundLoads.get(path);
}

export function loadAnswerCardIllustration(source) {
  if (!source) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    // #ifdef H5
    if (typeof Image !== "undefined") {
      const picture = new Image();
      picture.onload = () => resolve({ source: picture, width: picture.naturalWidth || picture.width, height: picture.naturalHeight || picture.height });
      picture.onerror = () => reject(new Error("题目插图加载失败，请重新选择图片后发布。"));
      picture.src = source;
    }
    // #endif
    // #ifndef H5
    if (typeof Image === "undefined") uni.getImageInfo({ src: source,
      success: result => resolve({ source: result.path, width: result.width, height: result.height }),
      fail: () => reject(new Error("题目插图加载失败，请重新选择图片后发布。")) });
    // #endif
  });
}

// Conservative glyph widths keep long Chinese titles inside the blank panel
// with identical line breaks on browser and native canvas implementations.
function wrapText(value, width, size) {
  const lines = []; let line = "", used = 0;
  for (const char of String(value || "").replace(/\r\n?/g, "\n").trim()) {
    if (char === "\n") { lines.push(line); line = ""; used = 0; continue; }
    const advance = size * (/[^\x00-\xff]/.test(char) ? 1 : .66);
    if (line && used + advance > width) { lines.push(line); line = ""; used = 0; }
    line += char; used += advance;
  }
  if (line) lines.push(line);
  return lines;
}
export function qrMatrix(code) {
  const qr = qrcode(0, "M"); qr.addData(code); qr.make();
  return Array.from({length: qr.getModuleCount()}, (_, y) => Array.from({length: qr.getModuleCount()}, (_, x) => qr.isDark(y, x)));
}
// Shared drawing instructions keep downloaded, printed and mini-program cards identical.
export function cardDrawing(assignment, card, page) {
  const code = encodePaperCode(card, page, assignment.paperPacket.pages), matrix = qrMatrix(code), commands = [];
  const rect = (x, y, w, h, color) => commands.push({ kind: "rect", x, y, w, h, color });
  const text = (value, x, y, size = 16, color = "#263d34") => commands.push({ kind: "text", value, x, y, size, color });
  rect(0, 0, CARD_WIDTH, CARD_HEIGHT, "#ffffff");
  commands.push({ kind: "image", source: cardBackgroundPath(page), x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT });
  const front = page === 1, left = front ? 64 : 820;
  const block = (value, x, y, width, size, maxLines, leading = size * 1.35) => {
    const lines = wrapText(value, width, size);
    for (let i = 0; i < Math.min(lines.length, maxLines); i++)
      text(lines[i] + (i === maxLines - 1 && lines.length > maxLines ? "…" : ""), x, y + i * leading, size);
    return Math.min(lines.length, maxLines);
  };
  // Preserve the original mind map, writing outline, grids and all 9/6 marks.
  rect(left - 8, 53, 346, front ? 361 : 748, "#ffffff");
  const writingColumns = front ? [427, 801.25] : [50.25, 425];
  for (const x of writingColumns) rect(x - .5, 53, 351, 22.5, "#ffffff");
  for (const region of cardQrRegions(page)) {
    const unit = region.width / (matrix.length + 8);
    rect(region.x, region.y, region.width, region.height, "#ffffff");
    for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix.length; x++)
      if (matrix[y][x]) rect(region.x + (x + 4) * unit, region.y + (y + 4) * unit, unit + .08, unit + .08, "#000000");
  }
  text(`第 ${page} / ${assignment.paperPacket.pages} 页 · 三栏顶部均可识别`, left, 84, 9, "#46554c");
  const titleLines = block(assignment.title, left, 108, 330, 20, 4, 24);
  const identityY = 108 + (Math.max(1, titleLines) - 1) * 24 + 30;
  block(`班级：${card.className}`, left, identityY, 185, 11, 1);
  block(`姓名：${card.studentName}`, left + 195, identityY, 140, 11, 1);
  block(`学号：${card.studentNumber || "—"}`, left, identityY + 20, 230, 11, 1);
  text("分数：________", left + 245, identityY + 20, 11);
  let followingY = identityY + 47;
  const illustrationOnPage = front && !!assignment.illustration;
  if (assignment.requirements?.trim()) {
    const contentY = followingY + 24;
    const lastLineY = front ? (illustrationOnPage ? 275 : 389) : 775;
    const maxLines = Math.max(1, Math.floor((lastLineY - contentY) / 18) + 1);
    text("题目要求", left, followingY, 14, "#172b22");
    const used = block(assignment.requirements, left, contentY, 330, 14, maxLines, 18);
    followingY = contentY + used * 18 + 8;
    if (wrapText(assignment.requirements, 330, 14).length > maxLines) {
      text("完整要求请查看学生端本次作业。", left, followingY, 9, "#46554c");
      followingY += 18;
    }
  }
  if (illustrationOnPage) {
    // The illustration follows the prompt; it never paints the original mind map.
    const top = followingY + 4, imageY = top + 22, height = Math.max(12, Math.min(140, 408 - imageY));
    text("题目插图", left, top + 12, 12);
    commands.push({ kind: "illustration", source: assignment.illustration, x: left, y: imageY, w: 330, h: height });
  }
  text(code, left, 808, 7, "#46554c");
  return { commands, code };
}
export function drawAnswerCard(ctx, assignment, card, page, background, illustration) {
  const { commands, code } = cardDrawing(assignment, card, page);
  for (const c of commands) {
    if (ctx.setFillStyle) ctx.setFillStyle(c.color); else ctx.fillStyle = c.color;
    if (c.kind === "rect") ctx.fillRect(c.x, c.y, c.w, c.h);
    if (c.kind === "image") ctx.drawImage(background || c.source, c.x, c.y, c.w, c.h);
    if (c.kind === "illustration" && illustration) {
      const ratio = Math.min(c.w / illustration.width, c.h / illustration.height);
      const width = illustration.width * ratio, height = illustration.height * ratio;
      ctx.drawImage(illustration.source, c.x + (c.w - width) / 2, c.y + (c.h - height) / 2, width, height);
    }
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
export async function answerCardImage(assignment, card, page, scale = 1.5) {
  const [background, illustration] = await Promise.all([loadAnswerCardBackground(page), loadAnswerCardIllustration(page === 1 ? assignment.illustration : "")]);
  const canvas = document.createElement("canvas"); canvas.width = CARD_WIDTH * scale; canvas.height = CARD_HEIGHT * scale;
  const ctx = canvas.getContext("2d"); ctx.scale(scale, scale); drawAnswerCard(ctx, assignment, card, page, background, illustration);
  return canvas.toDataURL("image/png");
}
export async function downloadAnswerCard(assignment, card, page) {
  const link = document.createElement("a"); link.href = await answerCardImage(assignment, card, page, 2);
  link.download = `${assignment.title}-${card.studentName}-第${page}页.png`; link.click();
}
export async function printAnswerCards(assignment, cards, onProgress = () => {}) {
  if (!cards.length) throw new Error("暂无可打印的答题卡。");
  // A same-page frame avoids popup blockers. Generate one page at a time so a
  // whole class does not allocate a hundred large canvases/data URLs at once.
  const frame = document.createElement("iframe");
  frame.title = `${assignment.title} · 答题卡打印`;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0";
  document.body.append(frame);
  const urls = [], doc = frame.contentDocument;
  let cleanupTimer;
  const cleanup = () => { clearTimeout(cleanupTimer); frame.remove(); for (const url of urls) URL.revokeObjectURL(url); };
  try {
    const illustration = await loadAnswerCardIllustration(assignment.illustration);
    doc.title = frame.title;
    const style = doc.createElement("style");
    style.textContent = "@page{size:A3 landscape;margin:0}html,body{margin:0;padding:0}img{display:block;width:420mm;height:297mm;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}";
    doc.head.append(style);
    const total = cards.length * assignment.paperPacket.pages;
    let completed = 0;
    for (const card of cards) for (let page = 1; page <= assignment.paperPacket.pages; page++) {
      const background = await loadAnswerCardBackground(page);
      const canvas = document.createElement("canvas"); canvas.width = CARD_WIDTH * 1.5; canvas.height = CARD_HEIGHT * 1.5;
      const ctx = canvas.getContext("2d"); ctx.scale(1.5, 1.5); drawAnswerCard(ctx, assignment, card, page, background, illustration);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("答题卡生成失败，请重试。")), "image/png"));
      canvas.width = canvas.height = 0;
      const url = URL.createObjectURL(blob); urls.push(url);
      const img = doc.createElement("img"); img.alt = `${card.studentName} 第${page}页`;
      const loaded = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("打印图片加载失败，请重试。")); });
      img.src = url; doc.body.append(img); await loaded;
      onProgress(++completed, total);
      if (completed % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (doc.fonts?.ready) await doc.fonts.ready;
    frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    // Fallback for browsers without afterprint, including a cancelled dialog.
    cleanupTimer = setTimeout(cleanup, 5 * 60 * 1000);
    frame.contentWindow.focus(); frame.contentWindow.print();
  } catch (failure) { cleanup(); throw failure; }
}
// #endif
