import { clamp, validQuad } from "./scanGeometry.js";

// Crop an integer rectangle from the full-size photograph. Keep the native
// pixel grid: no arbitrary paper aspect ratio, perspective warp or resize.
export function photoCropBounds(corners, width, height) {
  if (!validQuad(corners, .005) || !Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2)
    throw new Error("请框住需要保留的照片范围。");
  const left = clamp(Math.floor(Math.min(...corners.map(p => p.x)) * width), 0, width - 1);
  const top = clamp(Math.floor(Math.min(...corners.map(p => p.y)) * height), 0, height - 1);
  const right = clamp(Math.ceil(Math.max(...corners.map(p => p.x)) * width), left + 1, width);
  const bottom = clamp(Math.ceil(Math.max(...corners.map(p => p.y)) * height), top + 1, height);
  return { left, top, width: right - left, height: bottom - top };
}

export function photoCropQuad(corners) {
  if (!validQuad(corners, .005)) throw new Error("请框住需要保留的照片范围。");
  const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y));
  const right = Math.max(...corners.map(p => p.x)), bottom = Math.max(...corners.map(p => p.y));
  return [{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
}
