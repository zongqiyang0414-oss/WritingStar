// Platform-independent document geometry. Points are clockwise: TL, TR, BR, BL.
export const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function polygonArea(points) {
  return Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}
export function validQuad(points, minimumArea = 0.06) {
  return points?.length === 4 && points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)
    && polygonArea(points) >= minimumArea
    && points.every((p, i) => cross(p, points[(i + 1) % 4], points[(i + 2) % 4]) > 0.001);
}
export function orderQuad(points) {
  const center = points.reduce((c, p) => ({ x: c.x + p.x / 4, y: c.y + p.y / 4 }), { x: 0, y: 0 });
  const ordered = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const first = ordered.reduce((best, p, i) => p.x + p.y < ordered[best].x + ordered[best].y ? i : best, 0);
  return [...ordered.slice(first), ...ordered.slice(0, first)];
}
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = list => {
    const stack = [];
    for (const p of list) {
      while (stack.length > 1 && cross(stack[stack.length - 2], stack[stack.length - 1], p) <= 0) stack.pop();
      stack.push(p);
    }
    return stack.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
export function hullToQuad(hull) {
  // Max-area inscribed quadrilateral. Greedy triangle removal can discard a real
  // corner of a rasterized, slightly sloped paper edge before its nearby points.
  let best = null, maximum = 0;
  for (let a = 0; a < hull.length - 3; a++) for (let c = a + 2; c < hull.length - 1; c++) {
    let b = a + 1, d = c + 1, left = 0, right = 0;
    for (let i = a + 1; i < c; i++) {
      const area = Math.abs(cross(hull[a], hull[i], hull[c]));
      if (area > left) { left = area; b = i; }
    }
    for (let i = c + 1; i < hull.length; i++) {
      const area = Math.abs(cross(hull[a], hull[c], hull[i]));
      if (area > right) { right = area; d = i; }
    }
    if (left + right > maximum) { maximum = left + right; best = [hull[a], hull[b], hull[c], hull[d]]; }
  }
  return best ? orderQuad(best) : null;
}
// Unit square -> source quadrilateral homography (not a bounding-box crop).
export function projectiveCoefficients(q) {
  const [a, b, c, d] = q;
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-9) throw new Error("边角范围无效，请重新调整。");
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
  return { xx: b.x - a.x + g * b.x, xy: d.x - a.x + h * d.x, x0: a.x,
    yx: b.y - a.y + g * b.y, yy: d.y - a.y + h * d.y, y0: a.y, g, h };
}
export function projectiveMap(q) {
  const {xx, xy, x0, yx, yy, y0, g, h} = projectiveCoefficients(q);
  return (u, v) => {
    const denominator = g * u + h * v + 1;
    return {
      x: (xx * u + xy * v + x0) / denominator,
      y: (yx * u + yy * v + y0) / denominator,
    };
  };
}
export function fitRect(width, height, boxWidth, boxHeight, cover = false) {
  const scale = (cover ? Math.max : Math.min)(boxWidth / width, boxHeight / height);
  return { width: width * scale, height: height * scale, left: (boxWidth - width * scale) / 2, top: (boxHeight - height * scale) / 2 };
}
