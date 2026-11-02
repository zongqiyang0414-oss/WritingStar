import { readPaperScanMark } from "./scanCode.js";

// Quarter-turn rotation copies RGBA pixels exactly, with no interpolation,
// stretching, OCR or changes to the original stored photograph.
export async function rotateImagePixels(image, turns, cancelled = () => false) {
  const rotation = ((turns % 4) + 4) % 4;
  const check = () => { if (cancelled()) throw new Error("方向校正已取消。"); };
  check();
  if (!rotation) return image;
  const width = rotation % 2 ? image.height : image.width, height = rotation % 2 ? image.width : image.height;
  const data = new Uint8ClampedArray(width * height * 4);
  const packed = image.data.byteOffset % 4 === 0 ? new Uint32Array(image.data.buffer, image.data.byteOffset, image.width * image.height) : null;
  const output = new Uint32Array(data.buffer);
  let yieldAt = Date.now() + 10;
  for (let y = 0; y < image.height; y++) {
    if (y % 16 === 0 && Date.now() >= yieldAt) { check(); await new Promise(resolve => setTimeout(resolve, 0)); yieldAt = Date.now() + 10; }
    for (let x = 0; x < image.width; x++) {
      const toX = rotation === 1 ? image.height - 1 - y : rotation === 2 ? image.width - 1 - x : y;
      const toY = rotation === 1 ? x : rotation === 2 ? image.height - 1 - y : image.width - 1 - x;
      const from = y * image.width + x, to = toY * width + toX;
      if (packed) output[to] = packed[from];
      else for (let c = 0; c < 4; c++) data[to * 4 + c] = image.data[from * 4 + c];
    }
  }
  check();
  return { width, height, data };
}

// One canvas queue bounds memory and prevents a late page from replacing the
// current one. Only generated previews are disposable; originals stay intact.
export function createWorkOrientation(renderer) {
  const results = new Map();
  let queue = Promise.resolve(), disposed = false;
  const enqueue = task => {
    const result = queue.catch(() => {}).then(() => { if (disposed) throw new Error("查看器已关闭。"); return task(); });
    queue = result;
    return result;
  };
  async function render(source, image, turns, automatic) {
    const previous = results.get(source);
    const pixels = await rotateImagePixels(image, turns, () => disposed);
    const url = turns ? await renderer.exportImage(pixels) : source;
    if (disposed) { if (url !== source) renderer.remove(url); throw new Error("查看器已关闭。"); }
    const result = { url, quarterTurns: turns, automatic };
    results.set(source, result);
    if (previous && previous.url !== source && previous.url !== url) renderer.remove(previous.url);
    return result;
  }
  return {
    inspect(source) { return enqueue(async () => {
      if (results.has(source)) return results.get(source);
      const image = await renderer.read(source);
      const mark = readPaperScanMark(image);
      return render(source, image, mark.quarterTurns || 0, mark.quarterTurns !== null);
    }); },
    rotate(source) { return enqueue(async () => {
      const previous = results.get(source);
      const image = await renderer.read(source);
      const initial = previous?.quarterTurns ?? readPaperScanMark(image).quarterTurns ?? 0;
      return render(source, image, (initial + 1) % 4, false);
    }); },
    dispose() { disposed = true; results.clear(); renderer.dispose(); },
  };
}
