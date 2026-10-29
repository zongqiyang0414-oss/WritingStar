import { analyzeDocument } from "./documentScan.js";
import { detectPaperCorners } from "./documentScanner.js";
import { validQuad } from "./scanGeometry.js";
import { downsampleScanImage } from "./scanPixels.js";
import { readPaperScanCode } from "./scanCode.js";

function downsample(image, maxEdge) {
  return downsampleScanImage(image, maxEdge);
}

// Retain v0.12 paper corner-mark detection on pale desks. The general detector
// supplies the live document outline when the paper edge is visible.
export function analyzePaperCapture(image) {
  const small = downsample(image, 480);
  const detected = analyzeDocument(small);
  if (detected) return detected;
  const corners = detectPaperCorners(small, { markersOnly: true })?.map(p => ({ x: p.x / (small.width - 1), y: p.y / (small.height - 1) }));
  // Printed marks can guide a manual crop, but do not prove that all four
  // physical edges are visible. Never promote this estimate to an auto shutter.
  return validQuad(corners, 0.15) ? { corners, confidence: 0.65, autoEligible: false, fingerprint: [] } : null;
}

export class LivePaperDetector {
  constructor() { this.reset(); }
  reset() { this.previous = null; this.lastSearch = -Infinity; }
  update(image, time = Date.now()) {
    if (this.previous) {
      const tracked = analyzeDocument(image, { previousCorners: this.previous.corners, trackingOnly: true });
      if (tracked) { this.previous = tracked; return tracked; }
      this.previous = null;
    }
    // An empty/noisy scene must not monopolize the UI with global searches.
    if (time - this.lastSearch < 400) return null;
    this.lastSearch = time;
    const found = analyzePaperCapture(image);
    if (found?.autoEligible !== false && found?.confidence >= .7) this.previous = found;
    return found;
  }
}

export function selectCaptureDetection(image, preview, sameFrame, detect = analyzePaperCapture) {
  // Browser snapshots and preview use the same video sensor/FOV. Keep the
  // confirmed selection instead of independently switching to another sheet.
  if (sameFrame && preview?.confidence >= .7 && preview.autoEligible !== false && validQuad(preview.corners, .15)) return preview;
  const found = detect(image);
  // Native preview and still FOV may differ. An implausibly different result
  // needs corner confirmation, rather than silently selecting another page.
  if (preview && found && found.corners.some((p, i) => Math.hypot(p.x - preview.corners[i].x, p.y - preview.corners[i].y) > .12))
    return { ...found, confidence: .65, autoEligible: false };
  return found;
}

// Retained for callers that only need to read a card identifier.
export function captureStudentCode(image) {
  return readPaperScanCode(image);
}
