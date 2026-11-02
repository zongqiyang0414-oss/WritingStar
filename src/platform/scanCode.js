import jsQR from "jsqr";
import { downsampleScanImage, scanImageRegion } from "./scanPixels.js";

const decode = image => jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data || "";

export function readPaperScanCode(image) {
  // Approved landscape sheets put the QR below the front identity panel or
  // in the back's right blank panel. Old portrait sheets remain readable.
  if (image.width > image.height && image.width >= 500) {
    for (const x of [.12, .75]) {
      const region = scanImageRegion(image, Math.floor(image.width * x), Math.floor(image.height * .20),
        Math.ceil(image.width * .16), Math.ceil(image.height * .20));
      const found = decode(downsampleScanImage(region, 720));
      if (found) return found;
    }
  }
  if (image.width >= 500 && image.height >= 600) {
    const left = Math.floor(image.width * .62), height = Math.ceil(image.height * .29);
    const region = scanImageRegion(image, left, 0, image.width - left, height);
    const found = decode(downsampleScanImage(region, 720));
    if (found) return found;
  }
  return decode(downsampleScanImage(image, 1600));
}
