import { distance, validQuad } from "./scanGeometry.js";

const HOLD_MS = 1200;
const FRAME_GAP_MS = 800;
const DETECTION_GRACE_MS = 650;
const REMOVAL_MS = 900;
const MIN_CONFIDENCE = 0.7;

const copyCorners = corners => corners.map(p => ({ ...p }));
const reliable = detection => Number.isFinite(detection?.confidence)
  && detection.autoEligible !== false && detection.confidence >= MIN_CONFIDENCE && validQuad(detection.corners, 0.15);

function stableAgainst(corners, anchor) {
  if (!anchor) return false;
  let squared = 0, dx = 0, dy = 0;
  for (let i = 0; i < 4; i++) {
    const delta = distance(corners[i], anchor[i]);
    // Allow one rasterized corner to wobble without accepting whole-page motion.
    if (delta > 0.032) return false;
    squared += delta * delta;
    dx += corners[i].x - anchor[i].x; dy += corners[i].y - anchor[i].y;
  }
  return Math.sqrt(squared / 4) <= 0.019 && Math.hypot(dx / 4, dy / 4) <= 0.014;
}

export function fingerprintDifference(a, b) {
  if (!a?.length || a.length !== b?.length || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return 0;
  const meanA = a.reduce((s, n) => s + n, 0) / a.length, meanB = b.reduce((s, n) => s + n, 0) / b.length;
  return a.reduce((sum, value, i) => sum + Math.abs((value - meanA) - (b[i] - meanB)), 0) / a.length;
}

export class AutoScanGate {
  constructor() { this.restart(); this.locked = false; this.lastFingerprint = null; }
  resetHold() { this.anchor = null; this.held = 0; this.samples = 0; this.history = []; this.lastReliableTime = null; this.previousReliable = false; this.emitted = false; }
  resetChange() { this.changedSince = null; this.changedAnchor = null; this.changedFingerprint = null; }
  restart() { this.resetHold(); this.resetChange(); this.missingSince = null; this.previousTime = null; }
  captured(detection) { this.locked = true; this.lastFingerprint = detection?.fingerprint?.slice(); this.restart(); }
  nextPage() { this.locked = false; this.restart(); }
  update(detection, time) {
    // Only fresh observed frames count. Background time, repeated timestamps and
    // a clock adjustment can never complete either countdown.
    if (!Number.isFinite(time)) { this.restart(); return this.state(false, "uncertain"); }
    const elapsed = this.previousTime === null ? 0 : time - this.previousTime;
    if (this.previousTime !== null && (elapsed <= 0 || elapsed > FRAME_GAP_MS)) {
      this.restart();
      if (elapsed <= 0) return this.state(false, "uncertain");
    }
    this.previousTime = time;
    if (!reliable(detection)) {
      this.resetChange();
      this.previousReliable = false;
      // A confidence dip is not evidence that the already-scanned page left.
      if (!detection) {
        this.missingSince ??= time;
        if (time - this.missingSince >= REMOVAL_MS) this.locked = false;
      } else this.missingSince = null;
      if (this.lastReliableTime === null || time - this.lastReliableTime > DETECTION_GRACE_MS) this.resetHold();
      return this.state(false, detection ? "uncertain" : "searching");
    }
    this.missingSince = null;
    if (this.locked) {
      if (fingerprintDifference(this.lastFingerprint, detection.fingerprint) > 0.085) {
        // Require a consistent new page; moving the old page through noisy
        // fingerprints must not re-arm automatic capture.
        if (!stableAgainst(detection.corners, this.changedAnchor)
          || fingerprintDifference(this.changedFingerprint, detection.fingerprint) > 0.06) {
          this.changedSince = time; this.changedAnchor = copyCorners(detection.corners);
          this.changedFingerprint = detection.fingerprint.slice();
        }
        if (time - this.changedSince >= 900) { this.nextPage(); this.previousTime = time; }
      } else this.resetChange();
      if (this.locked) return this.state(false, "waiting");
    }
    const expired = this.lastReliableTime !== null && time - this.lastReliableTime > DETECTION_GRACE_MS;
    const moved = this.anchor && !stableAgainst(detection.corners, this.anchor);
    if (!this.anchor || expired || moved) {
      this.resetHold(); this.anchor = copyCorners(detection.corners);
    } else if (this.previousReliable) {
      this.held += elapsed;
    }
    this.samples++; this.lastReliableTime = time; this.previousReliable = true;
    this.history.push(copyCorners(detection.corners));
    if (this.history.length > 5) this.history.shift();
    const capture = !this.emitted && this.held >= HOLD_MS && this.samples >= 5;
    if (capture) this.emitted = true;
    return this.state(capture, moved ? "moving" : "steady");
  }
  state(capture, reason) {
    const corners = !this.locked && this.history.length >= 3 ? this.history[0].map((_, index) => {
      const median = axis => this.history.map(quad => quad[index][axis]).sort((a, b) => a - b)[Math.floor(this.history.length / 2)];
      return { x: median("x"), y: median("y") };
    }) : null;
    return { capture, corners: validQuad(corners, .15) ? corners : null, progress: this.locked ? 0 : Math.min(1, this.held / HOLD_MS), waiting: this.locked, reason: this.locked ? "waiting" : reason };
  }
}
