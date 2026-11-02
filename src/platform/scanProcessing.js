import { rectifyDocument, enhanceDocument } from "./documentScan.js";
import { readPaperScanMark } from "./scanCode.js";
import { rotateImagePixels } from "./imageOrientation.js";

export async function processScanPixels(image, corners, { readCode = true, sourceCodeFallback = false, cancelled = () => false, maxEdge = 1800, onStage = () => {} } = {}) {
  const check = () => { if (cancelled()) throw new Error("扫描已暂停，请重试。"); };
  check();
  onStage("正在拉正纸面…");
  let output = corners ? await rectifyDocument(image, corners, { maxEdge, cancelled }) : image;
  check();
  let code = "";
  if (readCode) {
    onStage("正在识别学生码…");
    const mark = readPaperScanMark(output);
    code = mark.code;
    if (mark.quarterTurns) {
      onStage("正在校正作业方向…");
      output = await rotateImagePixels(output, mark.quarterTurns, cancelled);
    }
    // Marker estimates can trim a QR quiet zone. Only those uncertain crops
    // retry the original; reliable physical borders do not scan it twice.
    if (!code && sourceCodeFallback && corners) {
      const original = readPaperScanMark(image);
      code = original.code;
      if (original.quarterTurns) output = await rotateImagePixels(output, original.quarterTurns, cancelled);
    }
    check();
  }
  onStage("正在去阴影、提亮纸面…");
  const enhanced = await enhanceDocument(output, cancelled);
  check();
  return { image: enhanced, code };
}
