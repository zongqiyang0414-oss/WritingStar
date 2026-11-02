import { rectifyDocument, enhanceDocument } from "./documentScan.js";
import { readPaperScanCode, readPaperScanMark } from "./scanCode.js";
import { rotateImagePixels } from "./imageOrientation.js";
import { SCAN_OUTPUT_MAX_EDGE } from "./scanQuality.js";

export async function processScanPixels(image, corners, { readCode = true, identifyOnly = false, sourceCodeFallback = false, cancelled = () => false, maxEdge = SCAN_OUTPUT_MAX_EDGE, aspectRatio = 0, cooperative = true, onStage = () => {} } = {}) {
  const check = () => { if (cancelled()) throw new Error("扫描已暂停，请重试。"); };
  check();
  if (identifyOnly) {
    // This is a bounded analysis copy, never the file saved or shown to the
    // teacher. Only the confirmed paper region can contribute a student code.
    if (!readCode || !corners) return { image, code: "" };
    onStage("正在识别学生码…");
    const region = await rectifyDocument(image, corners, { maxEdge: 1600, cancelled, cooperative });
    check();
    const { code, quarterTurns } = readPaperScanMark(region);
    check();
    return { image, code, quarterTurns };
  }
  onStage("正在拉正纸面…");
  // Uncertain borders still retain the whole frame, with the same bounded
  // output budget and bilinear sampling as a corrected page.
  const fullFrame = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  let output = corners || Math.max(image.width, image.height) > maxEdge
    ? await rectifyDocument(image, corners || fullFrame, { maxEdge, aspectRatio: corners ? aspectRatio : image.width / image.height, cancelled, cooperative }) : image;
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
  const enhanced = await enhanceDocument(output, cancelled, { cooperative });
  check();
  return { image: enhanced, code };
}
