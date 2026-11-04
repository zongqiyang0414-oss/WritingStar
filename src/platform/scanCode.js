import jsQR from "jsqr";
import { downsampleScanImage, scanImageRegion } from "./scanPixels.js";
import { decodePaperCode } from "../services/paperWorkflow.js";
import { qrMatrix, cardQrRegions, legacyCardQrRegions, CARD_WIDTH, CARD_HEIGHT } from "./answerCards.js";
import { projectiveMap } from "./scanGeometry.js";

const decode = image => jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });

export function readPaperScanMark(image) {
  // Try small native-resolution regions before the full-page preview. Include
  // all page rotations and both previous layouts; no resampling of the source.
  if (image.width >= 500 && image.height >= 500) {
    const turns = image.width > image.height ? [0, 2] : [1, 3];
    const boxes = [...cardQrRegions(1), ...legacyCardQrRegions(1), ...legacyCardQrRegions(2)];
    for (const turn of turns) for (const box of boxes) {
      const margin = 5;
      const u = (box.x - margin) / CARD_WIDTH, v = (box.y - margin) / CARD_HEIGHT;
      const w = (box.width + margin * 2) / CARD_WIDTH, h = (box.height + margin * 2) / CARD_HEIGHT;
      const regionBox = turn === 0 ? [u, v, w, h] : turn === 1 ? [1-v-h, u, h, w] : turn === 2 ? [1-u-w, 1-v-h, w, h] : [v, 1-u-w, h, w];
      const region = scanImageRegion(image, Math.floor(image.width * regionBox[0]), Math.floor(image.height * regionBox[1]),
        Math.ceil(image.width * regionBox[2]), Math.ceil(image.height * regionBox[3]));
      const found = decode(region);
      if (found) {
        try { decodePaperCode(found.data); return paperMark(found, region); } catch { /* Try the other printed copies. */ }
      }
    }
  }
  if (image.width > image.height && image.width >= 500) {
    for (const x of [.12, .75]) {
      const region = scanImageRegion(image, Math.floor(image.width * x), Math.floor(image.height * .20),
        Math.ceil(image.width * .16), Math.ceil(image.height * .20));
      const sample = downsampleScanImage(region, 720), found = decode(sample);
      if (found) return paperMark(found, sample);
    }
  }
  if (image.width >= 500 && image.height >= 600) {
    const left = Math.floor(image.width * .62), height = Math.ceil(image.height * .29);
    const region = scanImageRegion(image, left, 0, image.width - left, height);
    const sample = downsampleScanImage(region, 720), found = decode(sample);
    if (found) return paperMark(found, sample);
  }
  const sample = downsampleScanImage(image, 1600), found = decode(sample);
  return found ? paperMark(found, sample) : { code: "", quarterTurns: null };
}

function uprightModulesMatch(found, image) {
  // jsQR can decode a transposed/mirrored matrix without exposing that flag.
  // Verify the printed matrix before using its reported corners as direction.
  const matrix = qrMatrix(found.data), size = matrix.length, location = found.location;
  const map = projectiveMap([location.topLeftCorner, location.topRightCorner, location.bottomRightCorner, location.bottomLeftCorner]);
  const samples = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const point = map((x + .5) / size, (y + .5) / size);
    const px = Math.max(0, Math.min(image.width - 1, Math.round(point.x))), py = Math.max(0, Math.min(image.height - 1, Math.round(point.y)));
    const i = (py * image.width + px) * 4;
    samples.push((image.data[i] * 77 + image.data[i + 1] * 150 + image.data[i + 2] * 29) >> 8);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * .2)], high = sorted[Math.floor(sorted.length * .8)];
  if (high - low < 30) return false;
  const threshold = (low + high) / 2;
  let matches = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if ((samples[y * size + x] < threshold) === matrix[y][x]) matches++;
  return matches / samples.length >= .88;
}

function paperMark(found, image) {
  let quarterTurns = null;
  try {
    // Only our checksum-valid paper QR establishes the writing direction.
    decodePaperCode(found.data);
    const { topLeftCorner: a, topRightCorner: b, bottomLeftCorner: c } = found.location;
    const x = b.x - a.x, y = b.y - a.y, downX = c.x - a.x, downY = c.y - a.y;
    const angle = Math.atan2(y, x), nearest = Math.round(angle / (Math.PI / 2));
    if (x * downY - y * downX > 0 && Math.abs(angle - nearest * Math.PI / 2) < Math.PI / 7 && uprightModulesMatch(found, image))
      quarterTurns = ((-nearest % 4) + 4) % 4;
  } catch { /* Unrelated, mirrored or invalid codes must not rotate a photo. */ }
  return { code: found.data, quarterTurns };
}

export function readPaperScanCode(image) { return readPaperScanMark(image).code; }
