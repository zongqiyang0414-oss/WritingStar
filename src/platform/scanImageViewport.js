import { clamp, fitRect } from "./scanGeometry.js";

// Image coordinates stay anchored beneath the fingers during a pinch. Bounds
// use the contained paper, so dragging cannot lose a page in the letterbox.
export class ScanImageViewport {
  constructor() { this.bounds = { width: 1, height: 1, imageWidth: 1, imageHeight: 1 }; this.reset(); }
  reset() { this.view = { scale: 1, x: 0, y: 0 }; this.gesture = null; return this.view; }
  resize(bounds) { this.bounds = bounds; return this.reset(); }
  constrain(scale, x, y) {
    scale = clamp(scale, 1, 5);
    const { width, height, imageWidth, imageHeight } = this.bounds;
    const fit = fitRect(imageWidth, imageHeight, width, height);
    const maxX = Math.max(0, (fit.width * scale - width) / 2), maxY = Math.max(0, (fit.height * scale - height) / 2);
    this.view = { scale, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
    return this.view;
  }
  start(points) {
    if (!points.length) { this.gesture = null; return; }
    const pair = points.length > 1;
    const center = pair ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
    this.gesture = { pair, center, distance: pair ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0, view: { ...this.view } };
  }
  move(points) {
    if (!points.length) return this.view;
    if (!this.gesture || this.gesture.pair !== (points.length > 1)) { this.start(points); return this.view; }
    const { pair, center, distance, view } = this.gesture;
    if (!pair) return this.constrain(view.scale, view.x + points[0].x - center.x, view.y + points[0].y - center.y);
    const middle = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    const scale = clamp(view.scale * Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) / Math.max(1, distance), 1, 5);
    return this.atPoint(scale, center, middle, view);
  }
  atPoint(scale, point, target = point, previous = this.view) {
    scale = clamp(scale, 1, 5);
    const cx = this.bounds.width / 2, cy = this.bounds.height / 2, ratio = scale / previous.scale;
    return this.constrain(scale, target.x - cx - (point.x - cx - previous.x) * ratio, target.y - cy - (point.y - cy - previous.y) * ratio);
  }
}
