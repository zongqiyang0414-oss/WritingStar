import jsQR from "jsqr";
import { paperId, decodePaperCode } from "../services/paperWorkflow.js";
import { analyzeDocument } from "./documentScan.js";
import { processScanPixels } from "./scanProcessing.js";

// Four solid corner marks give a stable target even on a light desktop.
export function detectPaperCorners({ data, width, height }, { markersOnly = false } = {}) {
  const seen = new Uint8Array(width * height), candidates = [];
  const dark = i => data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2] < 210;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || !dark(start)) continue;
    const stack = [start]; seen[start] = 1;
    let count = 0, left = width, top = height, right = 0, bottom = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % width, y = Math.floor(p / width);
      count++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const n of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (n >= 0 && n < seen.length && !seen[n] && dark(n)) { seen[n] = 1; stack.push(n); }
      }
    }
    const w = right - left + 1, h = bottom - top + 1;
    if (w >= width * .006 && h >= height * .004 && w < width * .09 && h < height * .09
        && w / h > .55 && w / h < 1.8 && count / (w * h) > .72)
      candidates.push({ x: (left + right) / 2, y: (top + bottom) / 2 });
  }
  const regions = [
    candidates.filter(p => p.x < width * .4 && p.y < height * .4).sort((a, b) => a.x + a.y - b.x - b.y),
    candidates.filter(p => p.x > width * .6 && p.y < height * .4).sort((a, b) => b.x - b.y - a.x + a.y),
    candidates.filter(p => p.x > width * .6 && p.y > height * .6).sort((a, b) => b.x + b.y - a.x - a.y),
    candidates.filter(p => p.x < width * .4 && p.y > height * .6).sort((a, b) => b.y - b.x - a.y + a.x),
  ];
  let corners = regions.every(r => r.length) ? regions.map(r => r[0]) : null;
  if (corners) {
    const center = { x: corners.reduce((s, p) => s + p.x, 0) / 4, y: corners.reduce((s, p) => s + p.y, 0) / 4 };
    corners = corners.map(p => ({ x: Math.max(0, Math.min(width - 1, center.x + (p.x - center.x) * 1.065)),
      y: Math.max(0, Math.min(height - 1, center.y + (p.y - center.y) * 1.065)) }));
  } else {
    if (markersOnly) return null;
    // Light sheet on a darker surface. Reject frames where the full background is light.
    const points = [];
    for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      if (data[i] > 190 && data[i + 1] > 190 && data[i + 2] > 190) points.push({ x, y });
    }
    if (points.length < width * height / 9 * .24) return null;
    corners = [points.reduce((a, b) => a.x + a.y < b.x + b.y ? a : b),
      points.reduce((a, b) => a.x - a.y > b.x - b.y ? a : b),
      points.reduce((a, b) => a.x + a.y > b.x + b.y ? a : b),
      points.reduce((a, b) => a.y - a.x > b.y - b.x ? a : b)];
    if (corners.some(p => p.x <= 2 || p.y <= 2 || p.x >= width - 4 || p.y >= height - 4)) return null;
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = distance(corners[0], corners[1]), h = distance(corners[0], corners[3]);
  if (w < width * .35 || h < height * .35 || w / h < .35 || w / h > 2.86) return null;
  if (distance(corners[2], corners[3]) / w < .6 || distance(corners[2], corners[3]) / w > 1.6) return null;
  return corners;
}

// A-series paper keeps its physical proportions in either orientation.
export function paperOutputSize(corners, shortSide = 1240) {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const horizontal = distance(corners[0], corners[1]) + distance(corners[3], corners[2]);
  const vertical = distance(corners[0], corners[3]) + distance(corners[1], corners[2]);
  const longSide = Math.round(shortSide * Math.SQRT2);
  return horizontal > vertical ? { width: longSide, height: shortSide } : { width: shortSide, height: longSide };
}

// Maps normalized output coordinates onto the photographed quadrilateral.
export function perspectivePoint(corners, u, v) {
  const [a, b, c, d] = corners;
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(det) < 1e-8 ? 0 : (dx3 * dy2 - dx2 * dy3) / det;
  const h = Math.abs(det) < 1e-8 ? 0 : (dx1 * dy3 - dx3 * dy1) / det;
  const denominator = g * u + h * v + 1;
  return { x: ((b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v + a.x) / denominator,
    y: ((b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v + a.y) / denominator };
}
export function readStudentCode(imageData) {
  return jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" })?.data || "";
}
export function rectifyPaperPixels(pixels, corners, width = 1240, height = 1754) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const point = perspectivePoint(corners, x / (width - 1), y / (height - 1));
    const px = Math.max(0, Math.min(pixels.width - 1, Math.round(point.x))), py = Math.max(0, Math.min(pixels.height - 1, Math.round(point.y)));
    const from = (py * pixels.width + px) * 4, to = (y * width + x) * 4;
    data[to] = pixels.data[from]; data[to + 1] = pixels.data[from + 1]; data[to + 2] = pixels.data[from + 2]; data[to + 3] = 255;
  }
  return {data, width, height};
}

// #ifdef H5
export async function loadScanImage(url) {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("图片无法读取，请换一张重试。")); image.src = url; });
  return image;
}
function canvasFor(source, max = 1600) {
  const sw = source.videoWidth || source.naturalWidth || source.width, sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) throw new Error("相机尚未就绪，请稍后再拍。");
  const ratio = Math.min(1, max / Math.max(sw, sh)), canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * ratio); canvas.height = Math.round(sh * ratio);
  canvas.getContext("2d", {willReadFrequently: true}).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
export function inspectScanFrame(source) {
  const canvas = canvasFor(source, 480), context = canvas.getContext("2d", {willReadFrequently: true});
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  const detected = analyzeDocument(data);
  const corners = detected?.corners.map(p => ({ x: p.x * (canvas.width - 1), y: p.y * (canvas.height - 1) }))
    || detectPaperCorners(data, { markersOnly: true });
  return { corners, markerEstimate: !detected && !!corners, width: canvas.width, height: canvas.height };
}
export async function processScanSource(source, name = "作业原照片", originalUrl = source.src) {
  if (!originalUrl?.startsWith("data:image/")) throw new Error("请从原照片文件导入，以便保留完整图片。");
  const canvas = canvasFor(source), context = canvas.getContext("2d", {willReadFrequently:true});
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height), inspect = inspectScanFrame(source);
  const corners = inspect.corners?.map(p => ({x:p.x/(inspect.width-1),y:p.y/(inspect.height-1)}));
  let code = "";
  try {
    const result = await processScanPixels(pixels, corners || null, {identifyOnly:true});
    try { decodePaperCode(result.code); code = result.code.trim(); } catch { /* No verified student identity. */ }
  } catch {
    // Identification is optional; retain the valid original for manual matching.
  } finally { canvas.width = canvas.height = 1; }
  return {id:paperId("scan"),photo:{id:paperId("photo"),url:originalUrl,name,sample:false,original:true,
    width:source.naturalWidth||source.width,height:source.naturalHeight||source.height},code,corrected:false,manual:false};
}
export function chooseScanFiles(remaining = 60) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp"; input.multiple = true;
    input.oncancel = () => resolve([]);
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length > remaining) { reject(new Error(`本批还可添加 ${remaining} 页，请分批导入。`)); return; }
      if (files.some(f => !["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 20 * 1024 * 1024)) {
        reject(new Error("请使用 20 MB 以内的 JPG、PNG 或 WebP 图片。")); return;
      }
      resolve(files);
    }; input.click();
  });
}
// #endif
