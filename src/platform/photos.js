export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 800 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validatePhotoSizes(sizes, existingCount = 0) {
  if (sizes.length + existingCount > MAX_PHOTOS)
    throw new Error("最多添加 6 张图片，请减少数量。");
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0))
    throw new Error("图片无法读取，请重新选择。");
}

function photo(url, name) {
  return {
    id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    name,
    sample: false,
  };
}

// H5 keeps data URLs so that original photos survive refreshes in browser storage.
// #ifdef H5
export async function optimizeBrowserPhoto(file) {
  if (file.size <= MAX_PHOTO_BYTES) return file;
  const objectUrl = URL.createObjectURL(file), image = new Image();
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("图片无法读取，请重新选择。")); image.src = objectUrl; });
    const ratio = Math.min(1, 2600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    try {
      for (const quality of [.9, .8, .7, .6, .5]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
      }
      throw new Error("照片自动优化后仍过大，请靠近作品、减少背景后重新拍摄。");
    } finally { canvas.width = canvas.height = 0; }
  } finally { URL.revokeObjectURL(objectUrl); }
}
function chooseBrowserPhotos(existingCount) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_TYPES.join(",");
    input.multiple = true;
    input.oncancel = () => resolve([]);
    input.onchange = async () => {
      try {
        const files = Array.from(input.files || []);
        if (files.some((file) => !IMAGE_TYPES.includes(file.type)))
          throw new Error("请使用 JPG、PNG 或 WebP 图片。");
        validatePhotoSizes(
          files.map((file) => file.size),
          existingCount,
        );
        const photos = [];
        // Sequential processing bounds peak memory for a full six-page upload.
        for (const file of files) {
          const optimized = await optimizeBrowserPhoto(file);
          const url = await new Promise((read, fail) => {
            const reader = new FileReader(); reader.onerror = () => fail(new Error("图片读取失败，请重新选择。"));
            reader.onload = () => read(String(reader.result)); reader.readAsDataURL(optimized);
          });
          photos.push(photo(url, file.name));
        }
        resolve(photos);
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}
// #endif

// #ifndef H5
export async function optimizeDevicePhoto(file) {
  if (file.size <= MAX_PHOTO_BYTES) return file.path;
  const info = await new Promise((resolve, reject) => uni.getImageInfo({ src: file.path, success: resolve, fail: () => reject(new Error("图片无法读取，请重新选择。")) }));
  const ratio = Math.min(1, 2600 / Math.max(info.width, info.height));
  for (const quality of [85, 70, 55, 40]) {
    const compressed = await new Promise((resolve, reject) => uni.compressImage({ src: file.path, quality, compressedWidth: Math.round(info.width * ratio), compressedHeight: Math.round(info.height * ratio), success: resolve, fail: () => reject(new Error("照片自动优化失败，请重新选择。")) }));
    const result = await new Promise((resolve, reject) => uni.getFileInfo({ filePath: compressed.tempFilePath, success: resolve, fail: () => reject(new Error("图片无法读取，请重新选择。")) }));
    if (result.size <= MAX_PHOTO_BYTES) return compressed.tempFilePath;
  }
  throw new Error("照片自动优化后仍过大，请靠近作品、减少背景后重新拍摄。");
}
export function chooseDevicePhotos(existingCount) {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: MAX_PHOTOS - existingCount,
      sourceType: ["album", "camera"],
      sizeType: ["original"],
      success: async (result) => {
        try {
          const files = Array.from(result.tempFiles);
          validatePhotoSizes(
            files.map((file) => file.size),
            existingCount,
          );
          const photos = [];
          for (const file of files) {
            const path = await optimizeDevicePhoto(file);
            const saved = await new Promise((resolve, reject) => uni.saveFile({ tempFilePath: path, success: resolve, fail: () => reject(new Error("图片保存失败，请检查设备存储后重试。")) }));
            photos.push(photo(saved.savedFilePath, "作品照片"));
          }
          resolve(photos);
        } catch (error) {
          reject(error);
        }
      },
      fail: (result) =>
        result.errMsg.includes("cancel")
          ? resolve([])
          : reject(new Error("选择图片失败，请重试。")),
    });
  });
}
// #endif

export async function pickPhotos(existingCount = 0) {
  if (existingCount >= MAX_PHOTOS) throw new Error("最多添加 6 张图片。");
  // #ifdef H5
  return chooseBrowserPhotos(existingCount);
  // #endif
  // #ifndef H5
  return chooseDevicePhotos(existingCount);
  // #endif
}
