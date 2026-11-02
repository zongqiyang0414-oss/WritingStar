// Legacy pixel-processing/export helpers only. Original-photo capture/import
// uses separate bounded analysis pixels and never applies these output limits.
export const SCAN_SOURCE_MAX_EDGE = 2800;
export const SCAN_OUTPUT_MAX_EDGE = 2400;
export const MAX_SCAN_BYTES = 1536 * 1024;
export const SCAN_JPEG_QUALITIES = [.94, .9, .86, .82];
