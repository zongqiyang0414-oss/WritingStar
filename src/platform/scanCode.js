import jsQR from "jsqr";
import { downsampleScanImage, scanImageRegion } from "./scanPixels.js";

const decode = image => jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data || "";

export function readPaperScanCode(image) {
  // Printed answer cards place the identifier at the top right. Try that small
  // area at full detail before a general search. Rotated/custom codes continue
  // to use the full-image fallback; the hint never excludes them.
  if (image.width >= 500 && image.height >= 600) {
    const left = Math.floor(image.width * .62), height = Math.ceil(image.height * .29);
    const region = scanImageRegion(image, left, 0, image.width - left, height);
    const found = decode(downsampleScanImage(region, 720));
    if (found) return found;
  }
  return decode(downsampleScanImage(image, 1600));
}
