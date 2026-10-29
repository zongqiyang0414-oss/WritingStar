import { analyzeDocument } from "./documentScan.js";
import { detectPaperCorners, readStudentCode } from "./documentScanner.js";
import { validQuad } from "./scanGeometry.js";

function downsample(image, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  if (scale === 1) return image;
  const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.min(image.height - 1, Math.floor(y / scale)) * image.width + Math.min(image.width - 1, Math.floor(x / scale))) * 4;
    data.set(image.data.subarray(from, from + 4), (y * width + x) * 4);
  }
  return { data, width, height };
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

// Read the identifier before enhancement, then retry on the rectified pixels.
// A missing code stays unresolved for the existing manual-confirmation workflow.
export function captureStudentCode(image) {
  return readStudentCode(downsample(image, 1600));
}
