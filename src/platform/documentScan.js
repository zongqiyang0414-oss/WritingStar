import { clamp, convexHull, hullToQuad, orderQuad, polygonArea, validQuad, projectiveMap, projectiveCoefficients, distance } from "./scanGeometry.js";
import { documentAppearance, hasInternalMaterialBoundary } from "./documentSurface.js";

const luminance = (data, i) => (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;

// Sample in image coordinates so detection and the full-quality still share the
// same normalized corners, including when the analysis image is downscaled.
function sample(gray, width, height, x, y) {
  x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
  const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
  const nx = Math.min(width - 1, ix + 1), ny = Math.min(height - 1, iy + 1);
  return gray[iy * width + ix] * (1 - dx) * (1 - dy) + gray[iy * width + nx] * dx * (1 - dy)
    + gray[ny * width + ix] * (1 - dx) * dy + gray[ny * width + nx] * dx * dy;
}

// Hull vertices are only proposals. Fit each physical border to many samples,
// then intersect neighboring lines; dilation and raster stair-steps must not
// determine the final crop. Contrast farther across the line rejects printed
// rules whose two sides are actually the same paper surface.
function fitBorder(quad, side, gray, width, height) {
  const a = quad[side], b = quad[(side + 1) % 4];
  const ax = a.x * (width - 1), ay = a.y * (height - 1);
  const dx = (b.x - a.x) * (width - 1), dy = (b.y - a.y) * (height - 1), length = Math.hypot(dx, dy);
  const tx = dx / length, ty = dy / length, nx = -ty, ny = tx;
  const points = [], search = Math.max(3, Math.min(7, Math.max(width, height) * .018));
  for (let index = 0; index < 36; index++) {
    const along = length * (.07 + index / 35 * .86), x = ax + tx * along, y = ay + ty * along;
    let best = null;
    for (let offset = -search; offset <= search; offset += .5) {
      const px = x + nx * offset, py = y + ny * offset;
      const near = sample(gray, width, height, px + nx * 1.25, py + ny * 1.25) - sample(gray, width, height, px - nx * 1.25, py - ny * 1.25);
      const across = sample(gray, width, height, px + nx * 4, py + ny * 4) - sample(gray, width, height, px - nx * 4, py - ny * 4);
      if (Math.abs(across) < 5 || near * across <= 0) continue;
      const strength = Math.min(Math.abs(near), Math.abs(across)) - Math.abs(offset) * .15;
      if (!best || strength > best.strength) best = { along, offset, strength, across };
    }
    if (best && best.strength >= 3.5) points.push(best);
  }
  if (points.length < 22) return null;
  const polarity = Math.sign(points.reduce((total, p) => total + Math.sign(p.across), 0));
  let retained = points.filter(p => Math.sign(p.across) === polarity);
  if (retained.length < 22) return null;
  let intercept = 0, slope = 0;
  for (let pass = 0; pass < 3; pass++) {
    let weight = 0, sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (const p of retained) {
      // Cap weights so a few black characters cannot pull the paper edge inward.
      const w = Math.min(30, p.strength);
      weight += w; sumX += p.along * w; sumY += p.offset * w; sumXX += p.along * p.along * w; sumXY += p.along * p.offset * w;
    }
    const denominator = weight * sumXX - sumX * sumX;
    if (Math.abs(denominator) < 1e-6) return null;
    slope = (weight * sumXY - sumX * sumY) / denominator;
    intercept = (sumY - slope * sumX) / weight;
    retained = retained.filter(p => Math.abs(p.offset - intercept - slope * p.along) < 1.8);
    if (retained.length < 20) return null;
  }
  const normalX = nx - slope * tx, normalY = ny - slope * ty;
  return { x: normalX, y: normalY, c: normalX * ax + normalY * ay + intercept,
    support: retained.length / 36, contrast: retained.reduce((sum, p) => sum + Math.abs(p.across), 0) / retained.length, polarity };
}

function refineQuad(quad, gray, width, height) {
  const lines = quad.map((_, side) => fitBorder(quad, side, gray, width, height));
  if (lines.some(line => !line)) return null;
  // A sheet separates two surfaces in a consistent direction. Mixed polarity
  // usually indicates an interior table, crossed shadows, or unrelated objects.
  if (Math.abs(lines.reduce((sum, line) => sum + line.polarity, 0)) < 2) return null;
  const corners = lines.map((line, index) => {
    const previous = lines[(index + 3) % 4], det = previous.x * line.y - line.x * previous.y;
    if (Math.abs(det) < .15) return { x: NaN, y: NaN };
    return { x: (previous.c * line.y - line.c * previous.y) / det / (width - 1),
      y: (previous.x * line.c - line.x * previous.c) / det / (height - 1) };
  });
  if (!validQuad(corners, .12) || corners.some(p => p.x < .012 || p.y < .012 || p.x > .988 || p.y > .988)) return null;
  const sides = corners.map((p, i) => distance({ x: p.x * width, y: p.y * height }, { x: corners[(i + 1) % 4].x * width, y: corners[(i + 1) % 4].y * height }));
  if (Math.max(...sides) / Math.min(...sides) > 3.4) return null;
  const support = lines.reduce((sum, line) => sum + line.support, 0) / 4;
  const confidence = clamp(.5 * support + .3 * Math.min(...lines.map(line => line.support)) + .2 * Math.min(1, Math.min(...lines.map(line => line.contrast)) / 18));
  return { corners, confidence, score: polygonArea(corners) * confidence };
}

// Overlapping sheets can belong to a single bright component. Recover proposals
// from long, independently supported lines instead of taking that merged hull.
function lineQuads(gray, width, height) {
  const diagonal = Math.ceil(Math.hypot(width, height)), bins = diagonal * 2 + 1, angles = 90;
  const votes = new Uint16Array(angles * bins);
  const cos = Array.from({ length: angles }, (_, i) => Math.cos(i * Math.PI / angles));
  const sin = Array.from({ length: angles }, (_, i) => Math.sin(i * Math.PI / angles));
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const i = y * width + x, gx = gray[i + 1] - gray[i - 1], gy = gray[i + width] - gray[i - width];
    if (Math.hypot(gx, gy) < 7) continue;
    const angle = Math.round((Math.atan2(gy, gx) + Math.PI) % Math.PI * angles / Math.PI) % angles;
    for (let delta = -2; delta <= 2; delta++) {
      const a = (angle + delta + angles) % angles, rho = Math.round(x * cos[a] + y * sin[a]) + diagonal;
      votes[a * bins + rho]++;
    }
  }
  const peaks = [], minimum = Math.min(width, height) * .24;
  for (let a = 0; a < angles; a++) for (let r = 1; r < bins - 1; r++) {
    const v = votes[a * bins + r];
    if (v >= minimum && v >= votes[a * bins + r - 1] && v >= votes[a * bins + r + 1]) peaks.push({ a, c: r - diagonal, votes: v, x: cos[a], y: sin[a] });
  }
  peaks.sort((a, b) => b.votes - a.votes);
  const lines = [];
  for (const line of peaks) {
    if (lines.some(other => {
      const dot = line.x * other.x + line.y * other.y;
      return Math.abs(dot) > .994 && Math.abs(line.c - Math.sign(dot) * other.c) < 6;
    })) continue;
    // Reject ink rules before combining lines. A rule is dark only on the line;
    // a physical edge separates different surface intensities on either side.
    let supported = 0;
    const tx = -line.y, ty = line.x;
    for (let t = -diagonal; t <= diagonal; t += 4) {
      const x = line.x * line.c + tx * t, y = line.y * line.c + ty * t;
      if (x < 6 || y < 6 || x >= width - 6 || y >= height - 6) continue;
      const inside = sample(gray, width, height, x + line.x * 4, y + line.y * 4);
      const outside = sample(gray, width, height, x - line.x * 4, y - line.y * 4);
      if (Math.abs(inside - outside) > 7) supported++;
    }
    if (supported < Math.min(width, height) * .065) continue;
    lines.push(line);
    if (lines.length === 28) break;
  }
  const pairs = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j], dot = a.x * b.x + a.y * b.y;
    if (Math.abs(dot) > .94 && Math.abs(a.c - Math.sign(dot) * b.c) > Math.min(width, height) * .23) pairs.push([a, b]);
  }
  const intersect = (a, b) => {
    const det = a.x * b.y - a.y * b.x;
    return { x: (a.c * b.y - a.y * b.c) / det / (width - 1), y: (a.x * b.c - a.c * b.x) / det / (height - 1) };
  };
  const proposals = [];
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
    const [a, b] = pairs[i], [c, d] = pairs[j];
    if (Math.abs(a.x * c.x + a.y * c.y) > .4) continue;
    const quad = orderQuad([intersect(a, c), intersect(a, d), intersect(b, c), intersect(b, d)]);
    if (!validQuad(quad, .12) || quad.some(p => p.x < .01 || p.x > .99 || p.y < .01 || p.y > .99)) continue;
    proposals.push({ quad, score: polygonArea(quad) * Math.min(a.votes, b.votes, c.votes, d.votes) });
  }
  proposals.sort((a, b) => b.score - a.score);
  return proposals.slice(0, 24).map(p => p.quad);
}

// Bounded analysis with both contrast polarities. Otsu separates the surfaces;
// histogram quantiles and connected edges cover shadows and printed worksheets.
export function analyzeDocument(image, { previousCorners = null, trackingOnly = false } = {}) {
  if (!image?.data || image.width < 16 || image.height < 16 || image.data.length < image.width * image.height * 4) return null;
  const scale = Math.min(1, 384 / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const gray = new Uint8Array(width * height), histogram = new Uint32Array(256);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.round(x / (width - 1) * (image.width - 1)), sy = Math.round(y / (height - 1) * (image.height - 1));
    const value = luminance(image.data, (sy * image.width + sx) * 4);
    gray[y * width + x] = value; histogram[value]++;
  }
  let appearance = documentAppearance(image.data, image.width, image.height, width, height, false);
  const supportedSurface = candidate => candidate && !hasInternalMaterialBoundary(candidate.corners, appearance, width, height, projectiveMap(candidate.corners));
  // Refit the four observed borders before searching the entire image again.
  // Every frame still has to support all four real surface transitions.
  if (validQuad(previousCorners, .12)) {
    for (const channel of [gray, ...appearance.channels]) {
      const tracked = refineQuad(previousCorners, channel, width, height);
      if (supportedSurface(tracked) && tracked.confidence >= .7) return describeDocument(tracked, gray, width, height);
    }
  }
  if (trackingOnly) return null;
  appearance = documentAppearance(image.data, image.width, image.height, width, height);
  let sum = 0, count = 0, leftSum = 0, variance = 0, otsu = 128;
  for (let i = 0; i < 256; i++) sum += histogram[i] * i;
  const quantiles = [];
  for (let i = 0; i < 255; i++) {
    count += histogram[i]; leftSum += histogram[i] * i;
    for (const fraction of [.2, .5, .8]) if (count >= gray.length * fraction && quantiles.length < [.2, .5, .8].indexOf(fraction) + 1) quantiles.push(i);
    if (!count || count === gray.length) continue;
    const difference = leftSum / count - (sum - leftSum) / (gray.length - count);
    const value = count * (gray.length - count) * difference * difference;
    if (value > variance) { variance = value; otsu = i; }
  }
  if (!variance && !appearance.channels.length) return null;
  const thresholds = [...new Set([otsu, ...quantiles.slice(0, -1).map((value, i) => Math.round((value + quantiles[i + 1]) / 2))])];
  const masks = thresholds.flatMap(threshold => [gray.map(v => v > threshold ? 1 : 0), gray.map(v => v <= threshold ? 1 : 0)]);
  masks.push(...appearance.masks);
  const edges = new Uint8Array(gray.length);
  // A low absolute floor allows pale paper on a pale desk; line fitting below
  // requires a coherent, long border and rejects isolated texture/noise.
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const i = y * width + x;
    const gx = gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1] - gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1];
    const gy = gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1] - gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1];
    if (Math.abs(gx) + Math.abs(gy) > 24) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) edges[i + dy * width + dx] = 1;
  }
  masks.push(edges);
  let best = null;
  const queue = new Int32Array(gray.length);
  for (const mask of masks) {
    for (let start = 0; start < mask.length; start++) {
      if (mask[start] !== 1) continue;
      let head = 0, tail = 1, touchesFrame = false;
      queue[0] = start; mask[start] = 2;
      const boundary = [];
      while (head < tail) {
        const i = queue[head++], x = i % width, y = Math.floor(i / width);
        let edge = false;
        if (!x || !y || x === width - 1 || y === height - 1) touchesFrame = true;
        for (let direction = 0; direction < 4; direction++) {
          // Avoid allocating four coordinate arrays for every component pixel.
          if ((direction === 0 && x === 0) || (direction === 1 && x === width - 1)
            || (direction === 2 && y === 0) || (direction === 3 && y === height - 1)) { edge = true; continue; }
          const ni = i + (direction === 0 ? -1 : direction === 1 ? 1 : direction === 2 ? -width : width);
          if (mask[ni] === 1) { mask[ni] = 2; queue[tail++] = ni; }
          else if (mask[ni] === 0) edge = true;
        }
        if (edge) boundary.push({ x: x / (width - 1), y: y / (height - 1) });
      }
      // Keep visited pixels distinct from background. Clearing them would turn
      // every processed component interior into a boundary for its neighbors.
      if (touchesFrame || tail < gray.length * .006 || boundary.length < 4) continue;
      const hull = convexHull(boundary), quad = hullToQuad(hull);
      if (!validQuad(quad, .12) || polygonArea(quad) / polygonArea(hull) < .86) continue;
      for (const channel of [gray, ...appearance.channels]) {
        const candidate = refineQuad(quad, channel, width, height);
        if (supportedSurface(candidate) && (!best || candidate.score > best.score)) best = candidate;
      }
    }
  }
  // Run the bounded line search only when components do not yield a strong
  // sheet. This covers stacked pages without adding work to clean frames.
  if (!best || best.confidence < .82) for (const channel of [gray, ...appearance.channels]) for (const quad of lineQuads(channel, width, height)) {
    const candidate = refineQuad(quad, channel, width, height);
    if (supportedSurface(candidate) && (!best || candidate.score > best.score)) best = candidate;
  }
  if (!best) return null;
  return describeDocument(best, gray, width, height);
}

function describeDocument(best, gray, width, height) {
  const project = projectiveMap(best.corners), fingerprint = [];
  for (let y = 1; y <= 16; y++) for (let x = 1; x <= 12; x++) {
    const p = project(x / 13, y / 17);
    fingerprint.push(sample(gray, width, height, p.x * (width - 1), p.y * (height - 1)) / 255);
  }
  return { corners: best.corners, confidence: best.confidence, fingerprint };
}

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));
const clock = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
function checkCancelled(cancelled) { if (cancelled()) throw new Error("扫描已暂停，请重试。"); }

export async function rectifyDocument(image, corners, { maxEdge = 1800, cancelled = () => false } = {}) {
  if (!validQuad(corners)) throw new Error("请按顺序框住纸张四角，边线不能交叉。");
  const sourcePoints = corners.map(p => ({ x: p.x * (image.width - 1), y: p.y * (image.height - 1) }));
  const w = Math.max(distance(sourcePoints[0], sourcePoints[1]), distance(sourcePoints[2], sourcePoints[3]));
  const h = Math.max(distance(sourcePoints[0], sourcePoints[3]), distance(sourcePoints[1], sourcePoints[2]));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const width = Math.max(2, Math.round(w * scale)), height = Math.max(2, Math.round(h * scale));
  const m = projectiveCoefficients(sourcePoints), data = new Uint8ClampedArray(width * height * 4);
  const step = 1 / (width - 1), stepX = m.xx * step, stepY = m.yx * step, stepD = m.g * step;
  const source = image.data, maxX = image.width - 1, maxY = image.height - 1;
  let yieldAt = clock() + 10;
  checkCancelled(cancelled);
  for (let y = 0; y < height; y++) {
    if (y % 16 === 0 && clock() >= yieldAt) { checkCancelled(cancelled); await nextTick(); yieldAt = clock() + 10; }
    const v = y / (height - 1);
    let numX = m.xy * v + m.x0, numY = m.yy * v + m.y0, denominator = m.h * v + 1;
    for (let x = 0; x < width; x++) {
      const inverse = 1 / denominator;
      const sx = clamp(numX * inverse, 0, maxX), sy = clamp(numY * inverse, 0, maxY);
      numX += stepX; numY += stepY; denominator += stepD;
      const ix = Math.floor(sx), iy = Math.floor(sy), dx = sx - ix, dy = sy - iy;
      const a = (iy * image.width + ix) * 4, b = (iy * image.width + Math.min(ix + 1, image.width - 1)) * 4;
      const c = (Math.min(iy + 1, image.height - 1) * image.width + ix) * 4, d = (Math.min(iy + 1, image.height - 1) * image.width + Math.min(ix + 1, image.width - 1)) * 4;
      const target = (y * width + x) * 4;
      const wa = (1 - dx) * (1 - dy), wb = dx * (1 - dy), wc = (1 - dx) * dy, wd = dx * dy;
      data[target] = source[a] * wa + source[b] * wb + source[c] * wc + source[d] * wd;
      data[target + 1] = source[a + 1] * wa + source[b + 1] * wb + source[c + 1] * wc + source[d + 1] * wd;
      data[target + 2] = source[a + 2] * wa + source[b + 2] * wb + source[c + 2] * wc + source[d + 2] * wd;
      data[target + 3] = 255;
    }
  }
  checkCancelled(cancelled);
  return { width, height, data };
}

export { enhanceDocument } from "./scanEnhancement.js";
