import { clamp } from './scanGeometry.js';

// Illumination-normalized opponent colors keep a shadowed sheet in the same
// appearance class. A compact color dictionary separates neutral paper, wood,
// and colored objects; thresholding luminance alone cannot do that.
export function documentAppearance(data, sourceWidth, sourceHeight, width, height, segment = true) {
  const red = new Float32Array(width * height), blue = new Float32Array(width * height);
  const blueEdge = new Uint8Array(width * height), redEdge = new Uint8Array(width * height);
  let minRed = Infinity, maxRed = -Infinity, minBlue = Infinity, maxBlue = -Infinity;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.round(x / (width - 1) * (sourceWidth - 1)), sy = Math.round(y / (height - 1) * (sourceHeight - 1));
    const i = (sy * sourceWidth + sx) * 4, r = data[i], g = data[i + 1], b = data[i + 2], sum = Math.max(60, r + g + b), to = y * width + x;
    red[to] = (r - g) / sum * 300; blue[to] = (2 * b - r - g) / sum * 300;
    minRed = Math.min(minRed, red[to]); maxRed = Math.max(maxRed, red[to]); minBlue = Math.min(minBlue, blue[to]); maxBlue = Math.max(maxBlue, blue[to]);
    redEdge[to] = clamp(128 + red[to], 0, 255); blueEdge[to] = clamp(128 + blue[to], 0, 255);
  }
  const varying = maxRed - minRed > 6 || maxBlue - minBlue > 6;
  if (!segment || !varying) return { masks: [], channels: varying ? [blueEdge, redEdge] : [], red, blue, varying };
  const samples = [];
  for (let i = 0; i < red.length; i += 7) samples.push(i);
  const centers = [{ r: red[samples[0]], b: blue[samples[0]] }];
  // Farthest-point initialization is deterministic and avoids random frame jitter.
  for (let k = 1; k < 6; k++) {
    let farthest = 0, chosen = 0;
    for (const i of samples) {
      const distance = Math.min(...centers.map(c => (c.r - red[i]) ** 2 + (c.b - blue[i]) ** 2));
      if (distance > farthest) { farthest = distance; chosen = i; }
    }
    if (farthest < 36) break;
    centers.push({ r: red[chosen], b: blue[chosen] });
  }
  if (centers.length === 1) return { masks: [], channels: [], red, blue, varying: false };
  for (let pass = 0; pass < 6; pass++) {
    const totals = centers.map(() => ({ r: 0, b: 0, count: 0 }));
    for (const i of samples) {
      let best = 0, distance = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const d = (centers[k].r - red[i]) ** 2 + (centers[k].b - blue[i]) ** 2;
        if (d < distance) { distance = d; best = k; }
      }
      totals[best].r += red[i]; totals[best].b += blue[i]; totals[best].count++;
    }
    for (let k = 0; k < centers.length; k++) if (totals[k].count) centers[k] = { r: totals[k].r / totals[k].count, b: totals[k].b / totals[k].count };
  }
  const labels = new Uint8Array(red.length), counts = new Uint32Array(centers.length);
  for (let i = 0; i < red.length; i++) {
    let best = 0, distance = Infinity;
    for (let k = 0; k < centers.length; k++) {
      const d = (centers[k].r - red[i]) ** 2 + (centers[k].b - blue[i]) ** 2;
      if (d < distance) { distance = d; best = k; }
    }
    labels[i] = best; counts[best]++;
  }
  const masks = [];
  for (let k = 0; k < centers.length; k++) if (counts[k] > red.length * .04) {
    masks.push(labels.map(label => label === k ? 1 : 0));
    // Nearby appearance classes can be two exposures of the same material.
    const neighbors = centers.map((c, j) => j === k || Math.hypot(c.r - centers[k].r, c.b - centers[k].b) < 10);
    if (neighbors.filter(Boolean).length > 1) masks.push(labels.map(label => neighbors[label] ? 1 : 0));
  }
  return { masks, channels: [blueEdge, redEdge], red, blue, varying };
}

// A candidate's four lines can be individually strong while bounding paper
// plus a strip of desk. Look for a coherent material change across both blank
// side margins inside the proposed crop. Ink rules have the same material on
// both sides; illumination gradients largely cancel in normalized chroma.
export function hasInternalMaterialBoundary(corners, appearance, width, height, project) {
  if (!appearance.varying) return false;
  const read = (field, u, v) => {
    const p = project(u, v), x = clamp(Math.round(p.x * (width - 1)), 0, width - 1), y = clamp(Math.round(p.y * (height - 1)), 0, height - 1);
    return field[y * width + x];
  };
  for (let axis = 0; axis < 2; axis++) for (let along = .08; along <= .925; along += .0125) {
    const differences = [];
    for (const across of [.055, .10, .15, .85, .90, .945]) {
      const u = axis ? along : across, v = axis ? across : along, du = axis ? .017 : 0, dv = axis ? 0 : .017;
      differences.push({ r: read(appearance.red, u + du, v + dv) - read(appearance.red, u - du, v - dv),
        b: read(appearance.blue, u + du, v + dv) - read(appearance.blue, u - du, v - dv) });
    }
    const median = key => differences.map(p => p[key]).sort((a, b) => a - b)[3];
    const r = median('r'), b = median('b'), magnitude = Math.hypot(r, b);
    if (magnitude < 10) continue;
    const supported = differences.filter(d => (d.r * r + d.b * b) / magnitude > 7);
    if (supported.length >= 5) return true;
  }
  return false;
}
