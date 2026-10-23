import jsQR from "jsqr";
import { paperId } from "../services/paperWorkflow.js";

// Four solid corner marks give a stable target even on a light desktop.
export function detectPaperCorners({ data, width, height }) {
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
  if (w < width * .35 || h < height * .35 || w / h < .35 || w / h > 1.25) return null;
  if (distance(corners[2], corners[3]) / w < .6 || distance(corners[2], corners[3]) / w > 1.6) return null;
  return corners;
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
function canvasFor(source, max = 1800) {
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
  return { corners: detectPaperCorners(data), width: canvas.width, height: canvas.height };
}
export async function processScanSource(source, name = "扫描答题卡") {
  let canvas = canvasFor(source), context = canvas.getContext("2d", {willReadFrequently: true});
  let pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  let code = readStudentCode(pixels);
  const inspect = inspectScanFrame(source), corners = inspect.corners?.map(p => ({ x: p.x * canvas.width / inspect.width, y: p.y * canvas.height / inspect.height }));
  if (corners) {
    const output = document.createElement("canvas"); output.width = 1240; output.height = 1754;
    const out = output.getContext("2d"), target = out.createImageData(output.width, output.height);
    target.data.set(rectifyPaperPixels(pixels, corners, output.width, output.height).data);
    out.putImageData(target, 0, 0); canvas = output;
    if (!code) code = readStudentCode(target);
  }
  let url = canvas.toDataURL("image/jpeg", .86);
  if (url.length > 800 * 1024 * 4 / 3) url = canvas.toDataURL("image/jpeg", .65);
  if (url.length > 800 * 1024 * 4 / 3) throw new Error("扫描图片仍过大，请减少画面杂物后重试。");
  return { id: paperId("scan"), photo: { id: paperId("photo"), url, name, sample: false }, code, corrected: !!corners, manual: false };
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
