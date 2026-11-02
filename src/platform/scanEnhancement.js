import { clamp } from "./scanGeometry.js";

const clock = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));
const luminance = (r, g, b) => (r * 77 + g * 150 + b * 29) / 256;
function checkCancelled(cancelled) { if (cancelled()) throw new Error("扫描已暂停，请重试。"); }

// White-document Retinex: estimate the illumination/colour of the paper,
// then recover reflectance in each channel. Ink is excluded from the estimate;
// no OCR, generated pixels, binary threshold or global greyscale conversion.
export async function enhanceDocument(image, cancelled = () => false, { cooperative = true } = {}) {
  const { width, height, data } = image;
  if (!width || !height || !data || data.length < width * height * 4) throw new Error("无法读取扫描图片，请重新选择。");
  checkCancelled(cancelled);
  // At most 128 cells along the long edge; at least 8 source pixels per cell.
  // This follows lighting more locally than the old fixed 32px grey tiles.
  const cell = Math.max(8, Math.ceil(Math.max(width, height) / 128));
  const columns = Math.ceil(width / cell), rows = Math.ceil(height / cell), size = columns * rows;
  const red = new Float32Array(size), green = new Float32Array(size), blue = new Float32Array(size);
  const light = new Float32Array(size), histogram = new Uint16Array(256);
  const stride = Math.max(1, Math.floor(cell / 8));
  let yieldAt = clock() + 10;
  for (let cy = 0; cy < rows; cy++) {
    if (cooperative && clock() >= yieldAt) { checkCancelled(cancelled); await nextTick(); yieldAt = clock() + 10; }
    for (let cx = 0; cx < columns; cx++) {
      histogram.fill(0);
      const x0 = cx * cell, x1 = Math.min(width, x0 + cell), y0 = cy * cell, y1 = Math.min(height, y0 + cell);
      let count = 0;
      for (let y = y0; y < y1; y += stride) for (let x = x0; x < x1; x += stride) {
        const i = (y * width + x) * 4;
        histogram[Math.floor(luminance(data[i], data[i + 1], data[i + 2]))]++; count++;
      }
      let threshold = 255, upper = 0;
      while (threshold > 0 && upper < count * .25) upper += histogram[threshold--];
      threshold++;
      let r = 0, g = 0, b = 0, n = 0;
      // Sample all channels at the same bright-paper pixels. Independent RGB
      // quantiles could combine unrelated ink colours into a false white point.
      for (let y = y0; y < y1; y += stride) for (let x = x0; x < x1; x += stride) {
        const i = (y * width + x) * 4;
        if (Math.floor(luminance(data[i], data[i + 1], data[i + 2])) < threshold) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      const index = cy * columns + cx;
      red[index] = r / Math.max(1, n); green[index] = g / Math.max(1, n); blue[index] = b / Math.max(1, n);
      light[index] = luminance(red[index], green[index], blue[index]);
    }
  }
  // Estimate the broad paper colour from the brightest cells. The ratio test
  // below masks coloured stamps/ink even when a stroke fills an entire cell.
  const ordered = Array.from(light).sort((a, b) => a - b);
  const bright = ordered[Math.floor((size - 1) * .8)];
  let wr = 0, wg = 0, wb = 0, whiteCount = 0;
  for (let i = 0; i < size; i++) if (light[i] >= bright) { wr += red[i]; wg += green[i]; wb += blue[i]; whiteCount++; }
  wr = Math.max(32, wr / whiteCount); wg = Math.max(32, wg / whiteCount); wb = Math.max(32, wb / whiteCount);
  const reliable = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const r = red[i] / wr, g = green[i] / wg, b = blue[i] / wb;
    const largest = Math.max(r, g, b), smallest = Math.min(r, g, b);
    reliable[i] = largest > .28 && smallest / Math.max(.01, largest) > .68 ? 1 : 0;
  }
  // A wide grey stroke may fill a sampling cell and look like neutral paper.
  // Mask small, enclosed dark regions at several lighting levels before fitting
  // the surface. Smooth shading has little contrast across a level-set border;
  // page-wide shadows touch the frame. Both remain illumination observations.
  const visited = new Uint8Array(size), queue = new Uint32Array(size);
  for (const level of [.35, .5, .65, .8, .9]) {
    visited.fill(0);
    const threshold = bright * level;
    for (let start = 0; start < size; start++) {
      if (visited[start] || light[start] >= threshold) continue;
      let head = 0, tail = 1, touchesFrame = false, inside = 0, outside = 0, boundary = 0;
      queue[0] = start; visited[start] = 1;
      while (head < tail) {
        const i = queue[head++], x = i % columns, y = Math.floor(i / columns);
        inside += light[i];
        if (!x || !y || x === columns - 1 || y === rows - 1) touchesFrame = true;
        for (let direction = 0; direction < 4; direction++) {
          if ((!x && direction === 0) || (x === columns - 1 && direction === 1) || (!y && direction === 2) || (y === rows - 1 && direction === 3)) continue;
          const j = i + (direction === 0 ? -1 : direction === 1 ? 1 : direction === 2 ? -columns : columns);
          if (light[j] >= threshold) { outside += light[j]; boundary++; }
          else if (!visited[j]) { visited[j] = 1; queue[tail++] = j; }
        }
      }
      if (!touchesFrame && tail >= 2 && tail < size * .12 && boundary && inside / tail < outside / boundary * .82)
        for (let n = 0; n < tail; n++) reliable[queue[n]] = 0;
    }
    if (cooperative && clock() >= yieldAt) { checkCancelled(cancelled); await nextTick(); yieldAt = clock() + 10; }
  }
  // Propagate paper through excluded foreground cells; each pass only reads
  // the preceding pass. Broad coloured artwork therefore keeps its colour,
  // while a stamp cannot become the illumination colour of its own interior.
  for (let pass = 0; pass < 6; pass++) {
    const available = reliable.slice();
    let missing = 0;
    for (let y = 0; y < rows; y++) {
      if (cooperative && clock() >= yieldAt) { checkCancelled(cancelled); await nextTick(); yieldAt = clock() + 10; }
      for (let x = 0; x < columns; x++) {
        const i = y * columns + x;
        if (available[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= columns || yy >= rows) continue;
          const j = yy * columns + xx;
          if (available[j]) { r += red[j]; g += green[j]; b += blue[j]; n++; }
        }
        if (n) { red[i] = r / n; green[i] = g / n; blue[i] = b / n; reliable[i] = 1; }
        else missing++;
      }
    }
    if (!missing) break;
  }
  for (let i = 0; i < size; i++) {
    if (!reliable[i]) { red[i] = wr; green[i] = wg; blue[i] = wb; }
    light[i] = luminance(red[i], green[i], blue[i]);
  }
  // Morphological closing on the illumination surface fills isolated dark
  // text cells, unlike max-dilation which spreads the bright side of a shadow
  // over its dark side. Broad and sloping shadows remain in the lighting field.
  const dilated = new Float32Array(size);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    let value = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      value = Math.max(value, light[clamp(y + dy, 0, rows - 1) * columns + clamp(x + dx, 0, columns - 1)]);
    dilated[y * columns + x] = value;
  }
  for (let y = 0; y < rows; y++) {
    if (cooperative && clock() >= yieldAt) { checkCancelled(cancelled); await nextTick(); yieldAt = clock() + 10; }
    for (let x = 0; x < columns; x++) {
      let value = 255;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        value = Math.min(value, dilated[clamp(y + dy, 0, rows - 1) * columns + clamp(x + dx, 0, columns - 1)]);
      const i = y * columns + x, gain = value / Math.max(1, light[i]);
      red[i] *= gain; green[i] *= gain; blue[i] *= gain;
    }
  }
  const left = new Int32Array(width), right = new Int32Array(width), mix = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const gx = clamp((x + .5) / cell - .5, 0, columns - 1), ix = Math.floor(gx);
    left[x] = ix; right[x] = Math.min(ix + 1, columns - 1); mix[x] = gx - ix;
  }
  // Continuous soft paper-white shoulder, with retained midtones and a modest
  // contrast gain. A 6% pencil mark stays grey instead of crossing a threshold.
  const tone = new Uint8ClampedArray(1025);
  for (let i = 0; i <= 1024; i++) tone[i] = 255 * Math.pow(clamp((i / 1024 - .012) / .98), 1.12);
  const fields = [red, green, blue], floors = [wr * .28, wg * .28, wb * .28];
  // Horizontal interpolation changes only at a lighting-grid row boundary.
  // Cache two RGB rows instead of doing twelve field reads per output pixel.
  let cachedRow = -1;
  const upper = fields.map(() => new Float32Array(width)), lower = fields.map(() => new Float32Array(width));
  for (let y = 0; y < height; y++) {
    if (cooperative && y % 8 === 0 && clock() >= yieldAt) { checkCancelled(cancelled); await nextTick(); yieldAt = clock() + 10; }
    const gy = clamp((y + .5) / cell - .5, 0, rows - 1), iy = Math.floor(gy), dy = gy - iy;
    const top = iy * columns, bottom = Math.min(iy + 1, rows - 1) * columns;
    if (cachedRow !== iy) {
      for (let channel = 0; channel < 3; channel++) for (let x = 0; x < width; x++) {
        const field = fields[channel], dx = mix[x];
        upper[channel][x] = field[top + left[x]] * (1 - dx) + field[top + right[x]] * dx;
        lower[channel][x] = field[bottom + left[x]] * (1 - dx) + field[bottom + right[x]] * dx;
      }
      cachedRow = iy;
    }
    const ur = upper[0], ug = upper[1], ub = upper[2], lr = lower[0], lg = lower[1], lb = lower[2];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = tone[Math.min(1024, Math.round(data[i] / Math.max(floors[0], ur[x] + (lr[x] - ur[x]) * dy) * 1024))];
      data[i + 1] = tone[Math.min(1024, Math.round(data[i + 1] / Math.max(floors[1], ug[x] + (lg[x] - ug[x]) * dy) * 1024))];
      data[i + 2] = tone[Math.min(1024, Math.round(data[i + 2] / Math.max(floors[2], ub[x] + (lb[x] - ub[x]) * dy) * 1024))];
    }
  }
  // Conservative edge restoration in the reflectance image. Three original
  // rows prevent feedback from previously sharpened pixels; connected dark
  // strokes get sharper without sharpening isolated bright-paper sensor noise.
  let previous = new Uint8ClampedArray(width * 4), current = data.slice(0, width * 4), next = data.slice(width * 4, width * 8);
  const fillLight = (pixels, values) => { for (let x = 0; x < width; x++) values[x] = luminance(pixels[x * 4], pixels[x * 4 + 1], pixels[x * 4 + 2]); };
  let previousLight = new Float32Array(width), currentLight = new Float32Array(width), nextLight = new Float32Array(width);
  fillLight(current, currentLight); fillLight(next, nextLight);
  for (let y = 0; y < height; y++) {
    if (cooperative && y % 8 === 0 && clock() >= yieldAt) { checkCancelled(cancelled); await nextTick(); yieldAt = clock() + 10; }
    if (y > 0 && y < height - 1) for (let x = 1; x < width - 1; x++) {
      const i = x * 4;
      const value = currentLight[x], l = currentLight[x - 1], r = currentLight[x + 1], u = previousLight[x], d = nextLight[x];
      const average = (l + r + u + d) / 4;
      if (value >= average || Math.min(Math.abs(l - value), Math.abs(r - value), Math.abs(u - value), Math.abs(d - value)) >= 12) continue;
      const darken = Math.min(14, (average - value) * .3), gain = Math.max(0, value - darken) / Math.max(1, value);
      const target = (y * width + x) * 4;
      data[target] = current[i] * gain; data[target + 1] = current[i + 1] * gain; data[target + 2] = current[i + 2] * gain;
    }
    const spare = previous; previous = current; current = next; next = spare;
    const spareLight = previousLight; previousLight = currentLight; currentLight = nextLight; nextLight = spareLight;
    if (y + 2 < height) { next.set(data.subarray((y + 2) * width * 4, (y + 3) * width * 4)); fillLight(next, nextLight); }
  }
  checkCancelled(cancelled);
  return image;
}
