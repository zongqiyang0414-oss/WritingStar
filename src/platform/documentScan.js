import { clamp, convexHull, hullToQuad, polygonArea, validQuad, projectiveMap, distance } from "./scanGeometry.js";

const luminance = (data, i) => (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;

// Bounded, low-resolution analysis; never pass full camera frames into Vue state.
export function analyzeDocument(image) {
  const scale = Math.min(1, 256 / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const gray = new Uint8Array(width * height), histogram = new Uint32Array(256);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (Math.min(image.height - 1, Math.floor(y / scale)) * image.width + Math.min(image.width - 1, Math.floor(x / scale))) * 4;
    const value = luminance(image.data, i);
    gray[y * width + x] = value; histogram[value]++;
  }
  let sum = 0, count = 0, leftSum = 0, variance = 0, otsu = 128;
  for (let i = 0; i < 256; i++) sum += histogram[i] * i;
  for (let i = 0; i < 255; i++) {
    count += histogram[i]; leftSum += histogram[i] * i;
    if (!count || count === gray.length) continue;
    const difference = leftSum / count - (sum - leftSum) / (gray.length - count);
    const value = count * (gray.length - count) * difference * difference;
    if (value > variance) { variance = value; otsu = i; }
  }
  const gradient = new Uint16Array(gray.length);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const gx = gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1] - gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1];
    const gy = gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1] - gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1];
    gradient[i] = Math.abs(gx) + Math.abs(gy);
  }
  const masks = [otsu + 10, otsu + 35, 185].map(threshold => gray.map(v => v > Math.min(235, threshold) ? 1 : 0));
  // Connected edge contours supplement brightness segmentation on shaded paper.
  const edges = new Uint8Array(gray.length);
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const i = y * width + x;
    if (gradient[i] > 110) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) edges[i + dy * width + dx] = 1;
  }
  masks.push(edges);
  let best = null;
  for (const mask of masks) {
    const queue = new Int32Array(mask.length);
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start]) continue;
      let head = 0, tail = 1;
      queue[0] = start; mask[start] = 0;
      const boundary = [];
      while (head < tail) {
        const i = queue[head++], x = i % width, y = Math.floor(i / width);
        let edge = false;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy, ni = ny * width + nx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) { edge = true; continue; }
          if (mask[ni] === 1) { mask[ni] = 2; queue[tail++] = ni; }
          else if (mask[ni] === 0) edge = true;
        }
        // Mark visited separately so component interiors do not all enter hull sorting.
        mask[i] = 2;
        if (edge) boundary.push({ x: x / (width - 1), y: y / (height - 1) });
      }
      for (let i = 0; i < tail; i++) mask[queue[i]] = 0;
      if (tail < gray.length * 0.025 || boundary.length < 4) continue;
      const hull = convexHull(boundary), quad = hullToQuad(hull);
      if (!validQuad(quad, 0.15) || polygonArea(quad) / polygonArea(hull) < 0.88) continue;
      if (quad.some(p => p.x < 0.012 || p.y < 0.012 || p.x > 0.988 || p.y > 0.988)) continue;
      const sides = quad.map((p, i) => distance({ x: p.x * width, y: p.y * height }, { x: quad[(i + 1) % 4].x * width, y: quad[(i + 1) % 4].y * height }));
      if (Math.max(...sides) / Math.min(...sides) > 3.4) continue;
      const supports = quad.map((p, side) => {
        const q = quad[(side + 1) % 4];
        let supported = 0;
        for (let t = 0.08; t < 0.95; t += 0.03) {
          const x = Math.round((p.x + (q.x - p.x) * t) * (width - 1));
          const y = Math.round((p.y + (q.y - p.y) * t) * (height - 1));
          let maximum = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) maximum = Math.max(maximum, gradient[clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)]);
          if (maximum > 85) supported++;
        }
        return supported / 29;
      });
      if (Math.min(...supports) < 0.48) continue;
      const confidence = supports.reduce((s, n) => s + n, 0) / 4;
      // Prefer the paper region over a similarly sized dilated edge contour;
      // the latter includes a thin strip of desk outside the physical border.
      const score = polygonArea(quad) * confidence * (mask === edges ? 0.94 : 1);
      if (!best || score > best.score) best = { corners: quad, confidence, score };
    }
  }
  if (!best) return null;
  const project = projectiveMap(best.corners), fingerprint = [];
  for (let y = 1; y <= 16; y++) for (let x = 1; x <= 12; x++) {
    const p = project(x / 13, y / 17);
    fingerprint.push(gray[Math.round(p.y * (height - 1)) * width + Math.round(p.x * (width - 1))] / 255);
  }
  return { corners: best.corners, confidence: best.confidence, fingerprint };
}

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));
function checkCancelled(cancelled) { if (cancelled()) throw new Error("扫描已暂停，请重试。"); }

export async function rectifyDocument(image, corners, { maxEdge = 1800, cancelled = () => false } = {}) {
  if (!validQuad(corners)) throw new Error("请按顺序框住纸张四角，边线不能交叉。");
  const sourcePoints = corners.map(p => ({ x: p.x * (image.width - 1), y: p.y * (image.height - 1) }));
  const w = Math.max(distance(sourcePoints[0], sourcePoints[1]), distance(sourcePoints[2], sourcePoints[3]));
  const h = Math.max(distance(sourcePoints[0], sourcePoints[3]), distance(sourcePoints[1], sourcePoints[2]));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const width = Math.max(2, Math.round(w * scale)), height = Math.max(2, Math.round(h * scale));
  const project = projectiveMap(sourcePoints), data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (y % 48 === 0) { checkCancelled(cancelled); await nextTick(); }
    for (let x = 0; x < width; x++) {
      const p = project(x / (width - 1), y / (height - 1));
      const sx = clamp(p.x, 0, image.width - 1), sy = clamp(p.y, 0, image.height - 1);
      const ix = Math.floor(sx), iy = Math.floor(sy), dx = sx - ix, dy = sy - iy;
      const a = (iy * image.width + ix) * 4, b = (iy * image.width + Math.min(ix + 1, image.width - 1)) * 4;
      const c = (Math.min(iy + 1, image.height - 1) * image.width + ix) * 4, d = (Math.min(iy + 1, image.height - 1) * image.width + Math.min(ix + 1, image.width - 1)) * 4;
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) data[target + channel] = image.data[a + channel] * (1 - dx) * (1 - dy) + image.data[b + channel] * dx * (1 - dy) + image.data[c + channel] * (1 - dx) * dy + image.data[d + channel] * dx * dy;
      data[target + 3] = 255;
    }
  }
  checkCancelled(cancelled);
  return { width, height, data };
}

// Local paper-white correction, with continuous gray levels to retain pencil marks.
// No OCR, generated content, or hard black/white thresholding is used.
export async function enhanceDocument(image, cancelled = () => false) {
  const { width, height, data } = image, cell = 32;
  const columns = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const white = new Float32Array(columns * rows);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < columns; cx++) {
    const values = [];
    for (let y = cy * cell; y < Math.min(height, (cy + 1) * cell); y += 3)
      for (let x = cx * cell; x < Math.min(width, (cx + 1) * cell); x += 3) values.push(luminance(data, (y * width + x) * 4));
    values.sort((a, b) => a - b);
    white[cy * columns + cx] = Math.max(80, values[Math.floor(values.length * 0.9)]);
  }
  const background = white.map((value, i) => {
    const x = i % columns, y = Math.floor(i / columns);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) value = Math.max(value, white[clamp(y + dy, 0, rows - 1) * columns + clamp(x + dx, 0, columns - 1)]);
    return value;
  });
  for (let y = 0; y < height; y++) {
    if (y % 48 === 0) { checkCancelled(cancelled); await nextTick(); }
    for (let x = 0; x < width; x++) {
      const gx = clamp(x / cell - 0.5, 0, columns - 1), gy = clamp(y / cell - 0.5, 0, rows - 1);
      const ix = Math.floor(gx), iy = Math.floor(gy), dx = gx - ix, dy = gy - iy;
      const a = background[iy * columns + ix], b = background[iy * columns + Math.min(ix + 1, columns - 1)];
      const c = background[Math.min(iy + 1, rows - 1) * columns + ix], d = background[Math.min(iy + 1, rows - 1) * columns + Math.min(ix + 1, columns - 1)];
      const paper = a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
      const i = (y * width + x) * 4;
      const value = clamp((luminance(data, i) / paper * 255 - 6) * 255 / 245, 0, 255);
      data[i] = data[i + 1] = data[i + 2] = value;
    }
  }
  checkCancelled(cancelled);
  return image;
}
