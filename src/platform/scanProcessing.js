import { rectifyDocument, enhanceDocument } from "./documentScan.js";
import { readPaperScanCode } from "./scanCode.js";

export async function processScanPixels(image, corners, { readCode = true, sourceCodeFallback = false, cancelled = () => false, maxEdge = 1800, onStage = () => {} } = {}) {
  const check = () => { if (cancelled()) throw new Error("扫描已暂停，请重试。"); };
  check();
  onStage("正在拉正纸面…");
  const output = corners ? await rectifyDocument(image, corners, { maxEdge, cancelled }) : image;
  check();
  let code = "";
  if (readCode) {
    onStage("正在识别学生码…");
    code = readPaperScanCode(output);
    // Marker estimates can trim a QR quiet zone. Only those uncertain crops
    // retry the original; reliable physical borders do not scan it twice.
    if (!code && sourceCodeFallback && corners) code = readPaperScanCode(image);
    check();
  }
  onStage("正在提亮纸面…");
  const enhanced = await enhanceDocument(output, cancelled);
  check();
  return { image: enhanced, code };
}
