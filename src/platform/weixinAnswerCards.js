import { CARD_WIDTH, CARD_HEIGHT, CARD_PAPER, drawAnswerCard, loadAnswerCardBackground } from "./answerCards.js";
import { createImagePdf } from "./imagePdf.js";

function call(target, name, options, scope) {
  return new Promise((resolve, reject) => target[name]({ ...options, success: resolve, fail: reject }, scope));
}
const filename = value => String(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 48);

export async function exportWeixinAnswerCards(assignment, cards, { canvasId, scope, onProgress = () => {}, cancelled = () => false }) {
  if (!cards?.length || !Number.isInteger(assignment.paperPacket?.pages) || assignment.paperPacket.pages < 1)
    throw new Error("暂无可打印的答题卡。");
  const fs = wx.getFileSystemManager(), directory = `${wx.env.USER_DATA_PATH}/writingstar-print`;
  const filePath = `${directory}/${filename(assignment.title)}-${cards.length === 1 ? filename(cards[0].studentName) : "全班"}答题卡.pdf`;
  const total = cards.length * assignment.paperPacket.pages;
  try {
    // This dedicated directory contains generated print files only. Never touch
    // submissions, saved photos, or the application's persistent storage.
    try { await call(fs, "access", { path: directory }); }
    catch { await call(fs, "mkdir", { dirPath: directory, recursive: true }); }
    const previous = await call(fs, "readdir", { dirPath: directory });
    for (const name of previous.files.filter(name => name.endsWith(".pdf")))
      await call(fs, "unlink", { filePath: `${directory}/${name}` });
    await call(fs, "writeFile", { filePath, data: new ArrayBuffer(0) });
    const pdf = await createImagePdf(data => call(fs, "appendFile", { filePath, data }));
    let done = 0;
    onProgress(0, total);
    for (const card of cards) for (let page = 1; page <= assignment.paperPacket.pages; page++) {
      if (cancelled()) throw new Error("已停止生成答题卡。");
      const ctx = uni.createCanvasContext(canvasId, scope);
      const background = await loadAnswerCardBackground(page);
      if (cancelled()) throw new Error("已停止生成答题卡。");
      drawAnswerCard(ctx, assignment, card, page, background);
      await new Promise(resolve => ctx.draw(false, resolve));
      const image = await call(uni, "canvasToTempFilePath", { canvasId, width: CARD_WIDTH, height: CARD_HEIGHT,
        destWidth: CARD_WIDTH * 2, destHeight: CARD_HEIGHT * 2, fileType: "jpg", quality: .9 }, scope);
      try {
        const result = await call(fs, "readFile", { filePath: image.tempFilePath });
        await pdf.addPage(result.data, CARD_WIDTH * 2, CARD_HEIGHT * 2, CARD_PAPER);
      } finally {
        // Release each temporary raster as soon as it has been appended.
        try { await call(fs, "unlink", { filePath: image.tempFilePath }); } catch { /* system temp cleanup remains available */ }
      }
      onProgress(++done, total);
    }
    if (cancelled()) throw new Error("已停止生成答题卡。");
    await pdf.finish();
    return filePath;
  } catch (failure) {
    try { await call(fs, "unlink", { filePath }); } catch { /* no partial file may exist */ }
    throw new Error(failure.message || "PDF生成失败，请检查手机存储空间后重试。");
  }
}

export async function openWeixinAnswerCards(filePath) {
  try { await call(uni, "openDocument", { filePath, fileType: "pdf", showMenu: true }); }
  catch { throw new Error("PDF已生成，但未能打开。可点击下方“转发已生成 PDF”交给打印服务。"); }
}

export async function shareWeixinAnswerCards(filePath) {
  try { await call(wx, "shareFileMessage", { filePath }); }
  catch (failure) {
    if (!failure.errMsg?.includes("cancel")) throw new Error("PDF转发失败，请重新打开PDF后使用右上角菜单。");
  }
}
