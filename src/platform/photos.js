export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 800 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validatePhotoSizes(sizes, existingCount = 0) {
  if (sizes.length + existingCount > MAX_PHOTOS)
    throw new Error("最多添加 6 张图片，请减少数量。");
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0))
    throw new Error("图片无法读取，请重新选择。");
  if (sizes.some((size) => size > MAX_PHOTO_BYTES))
    throw new Error("单张图片不能超过 800 KB，请压缩后重试。");
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
        const photos = await Promise.all(
          files.map(
            (file) =>
              new Promise((read, fail) => {
                const reader = new FileReader();
                reader.onerror = () =>
                  fail(new Error("图片读取失败，请重新选择。"));
                reader.onload = () =>
                  read(photo(String(reader.result), file.name));
                reader.readAsDataURL(file);
              }),
          ),
        );
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
export function chooseDevicePhotos(existingCount) {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: MAX_PHOTOS - existingCount,
      sourceType: ["album", "camera"],
      success: async (result) => {
        try {
          const files = Array.from(result.tempFiles);
          validatePhotoSizes(
            files.map((file) => file.size),
            existingCount,
          );
          const photos = await Promise.all(
            files.map(
              (file) =>
                new Promise((save, fail) => {
                  uni.saveFile({
                    tempFilePath: file.path,
                    success: (saved) =>
                      save(photo(saved.savedFilePath, "作品照片")),
                    fail: () =>
                      fail(new Error("图片保存失败，请检查设备存储后重试。")),
                  });
                }),
            ),
          );
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
