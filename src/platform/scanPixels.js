// Copy packed RGBA pixels without constructing a temporary view for each pixel.
export function downsampleScanImage(image, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  if (scale === 1) return image;
  const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const packed = image.data.buffer && image.data.byteOffset % 4 === 0
    ? new Uint32Array(image.data.buffer, image.data.byteOffset, image.width * image.height) : null;
  const output = new Uint32Array(data.buffer);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = Math.min(image.height - 1, Math.floor(y / scale)) * image.width + Math.min(image.width - 1, Math.floor(x / scale));
    const to = y * width + x;
    if (packed) output[to] = packed[from];
    else for (let c = 0; c < 4; c++) data[to * 4 + c] = image.data[from * 4 + c];
  }
  return { width, height, data };
}

export function scanImageRegion(image, left, top, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(start, start + width * 4), y * width * 4);
  }
  return { width, height, data };
}
