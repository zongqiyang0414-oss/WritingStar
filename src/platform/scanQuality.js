// Keep live detection small; only the captured still uses this detail budget.
// Scans have a separate JPEG budget from ordinary submission photos (800 KiB).
export const SCAN_SOURCE_MAX_EDGE = 2800;
export const SCAN_OUTPUT_MAX_EDGE = 2400;
export const MAX_SCAN_BYTES = 1536 * 1024;
export const SCAN_JPEG_QUALITIES = [.94, .9, .86, .82];
