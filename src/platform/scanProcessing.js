import { rectifyDocument, enhanceDocument } from "./documentScan.js";
import { readPaperScanCode } from "./scanCode.js";
import { SCAN_OUTPUT_MAX_EDGE } from "./scanQuality.js";

export async function processScanPixels(image, corners, { readCode = true, sourceCodeFallback = false, cancelled = () => false, maxEdge = SCAN_OUTPUT_MAX_EDGE, aspectRatio = 0, cooperative = true, onStage = () => {} } = {}) {
  const check = () => { if (cancelled()) throw new Error("扫描已暂停，请重试。"); };
  check();
  onStage("正在拉正纸面…");
  // Uncertain borders still retain the whole frame, with the same bounded
  // output budget and bilinear sampling as a corrected page.
  const fullFrame = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const output = corners || Math.max(image.width, image.height) > maxEdge
    ? await rectifyDocument(image, corners || fullFrame, { maxEdge, aspectRatio: corners ? aspectRatio : image.width / image.height, cancelled, cooperative }) : image;
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
  onStage("正在去阴影、提亮纸面…");
  const enhanced = await enhanceDocument(output, cancelled, { cooperative });
  check();
  return { image: enhanced, code };
}
