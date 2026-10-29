import { distance } from "./scanGeometry.js";

export function fingerprintDifference(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  const meanA = a.reduce((s, n) => s + n, 0) / a.length, meanB = b.reduce((s, n) => s + n, 0) / b.length;
  return a.reduce((sum, value, i) => sum + Math.abs((value - meanA) - (b[i] - meanB)), 0) / a.length;
}

export class AutoScanGate {
  constructor() { this.restart(); this.locked = false; this.lastFingerprint = null; }
  restart() { this.anchor = null; this.since = null; this.missingSince = null; this.changedSince = null; this.previousTime = null; }
  captured(detection) { this.locked = true; this.lastFingerprint = detection?.fingerprint; this.restart(); }
  nextPage() { this.locked = false; this.restart(); }
  update(detection, time) {
    // A suspended stream or returning from the background cannot finish a countdown.
    if (this.previousTime !== null && time - this.previousTime > 800) this.restart();
    this.previousTime = time;
    if (!detection || detection.confidence < 0.7) {
      this.anchor = null; this.since = null; this.changedSince = null;
      this.missingSince ??= time;
      if (time - this.missingSince >= 650) this.locked = false;
      return { capture: false, progress: 0, waiting: this.locked };
    }
    this.missingSince = null;
    if (this.locked) {
      if (fingerprintDifference(this.lastFingerprint, detection.fingerprint) > 0.085) {
        this.changedSince ??= time;
        if (time - this.changedSince >= 900) this.nextPage();
      } else this.changedSince = null;
      if (this.locked) return { capture: false, progress: 0, waiting: true };
    }
    if (!this.anchor || detection.corners.some((p, i) => distance(p, this.anchor[i]) > 0.018)) {
      this.anchor = detection.corners.map(p => ({ ...p })); this.since = time;
    }
    const progress = Math.min(1, (time - this.since) / 1200);
    return { capture: progress >= 1, progress, waiting: false };
  }
}
