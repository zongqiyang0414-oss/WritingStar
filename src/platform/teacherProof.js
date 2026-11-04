const MAX_PROOF_BYTES = 2 * 1024 * 1024;
function proofType(name, type = "") {
  if (/\.pdf$/i.test(name) || type === "application/pdf") return "application/pdf";
  if (/\.png$/i.test(name) || type === "image/png") return "image/png";
  if (/\.webp$/i.test(name) || type === "image/webp") return "image/webp";
  if (/\.jpe?g$/i.test(name) || type === "image/jpeg") return "image/jpeg";
  throw new Error("请选择 JPG、PNG、WebP 图片或 PDF 证明材料。");
}
function validateProof(file) {
  const type = proofType(file.name, file.type);
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PROOF_BYTES) throw new Error("证明材料需在2 MB以内，请重新选择。");
  return type;
}
const proofExtension = type => ({ "application/pdf": "pdf", "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" })[type];
function deviceProofType(data) {
  const bytes = new Uint8Array(data);
  if (!bytes.length || bytes.length > MAX_PROOF_BYTES) throw new Error("证明材料需在2 MB以内，请重新选择。");
  const starts = values => values.every((value, index) => bytes[index] === value);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  throw new Error("请选择 JPG、PNG、WebP 图片或 PDF 证明材料。");
}
export function chooseWeixinTeacherProof() {
  return new Promise((resolve, reject) => {
    const failed = error => /cancel/.test(error.errMsg || "") ? resolve(null) : reject(new Error("证明材料选择失败，请重试。"));
    const selected = file => {
      if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PROOF_BYTES) { reject(new Error("证明材料需在2 MB以内，请重新选择。")); return; }
      wx.getFileSystemManager().readFile({ filePath: file.path, success: result => {
        try {
          // Original iPhone/album images may be PNG even when the temporary
          // filename has no extension. Derive the MIME from the actual bytes.
          const type = deviceProofType(result.data), extension = proofExtension(type);
          const name = file.name ? file.name.replace(/\.(pdf|png|webp|jpe?g)$/i, "") + `.${extension}` : `教师证明.${extension}`;
          resolve({ name, type, size: result.data.byteLength, url: `data:${type};base64,${wx.arrayBufferToBase64(result.data)}` });
        } catch (error) { reject(error); }
      }, fail: () => reject(new Error("证明材料读取失败，请重试。")) });
    };
    uni.showActionSheet({ itemList: ["拍照或从相册选择", "选择图片或PDF文件"], success: result => {
      if (result.tapIndex === 0) uni.chooseImage({ count: 1, sizeType: ["original"], success: result => selected(result.tempFiles[0]), fail: failed });
      else wx.chooseMessageFile({ count: 1, type: "file", extension: ["jpg", "jpeg", "png", "webp", "pdf"], success: result => selected(result.tempFiles[0]), fail: failed });
    }, fail: failed });
  });
}
let previewSequence = 0;
export async function previewWeixinTeacherProof(proof) {
  const match = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(proof?.url || "");
  if (!match) throw new Error("证明材料格式无法预览，请重新上传。");
  const fs = wx.getFileSystemManager(), prefix = "writingstar-proof-preview-";
  const filePath = `${wx.env.USER_DATA_PATH}/${prefix}${Date.now()}-${++previewSequence}.${proofExtension(match[1])}`;
  // Native image/document viewers need a local file and may read it after the
  // success callback. Keep this generated file until the next preview; clean
  // only files with our dedicated prefix, never an uploaded source or state.
  await new Promise(resolve => fs.readdir({ dirPath: wx.env.USER_DATA_PATH, success: result => {
    const stale = result.files.filter(name => name.startsWith(prefix));
    Promise.all(stale.map(name => new Promise(done => fs.unlink({ filePath: `${wx.env.USER_DATA_PATH}/${name}`, complete: done })))).then(resolve);
  }, fail: resolve }));
  try {
    await new Promise((resolve, reject) => fs.writeFile({ filePath, data: match[2], encoding: "base64", success: resolve, fail: () => reject(new Error("证明预览文件无法生成。")) }));
    await new Promise((resolve, reject) => {
      const callbacks = { success: resolve, fail: () => reject(new Error("证明材料预览失败，请重试。")) };
      if (match[1] === "application/pdf") uni.openDocument({ filePath, fileType: "pdf", ...callbacks });
      else uni.previewImage({ urls: [filePath], current: filePath, ...callbacks });
    });
  } catch (error) {
    fs.unlink({ filePath, fail: () => {} });
    throw error;
  }
}
export function chooseTeacherProof() {
  // #ifdef H5
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) { resolve(null); return; }
      try {
        const type = validateProof(file), reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type, size: file.size, url: `data:${type};base64,${String(reader.result).split(",")[1]}` });
        reader.onerror = () => reject(new Error("证明材料读取失败，请重新选择。")); reader.readAsDataURL(file);
      } catch (error) { reject(error); }
    }; input.click();
  });
  // #endif
  // #ifdef MP-WEIXIN
  return chooseWeixinTeacherProof();
  // #endif
}
export async function previewTeacherProof(proof) {
  if (!proof?.url) return;
  // #ifdef H5
  if (proof.type !== "application/pdf") { uni.previewImage({ urls: [proof.url], current: proof.url }); return; }
  const response = await fetch(proof.url), url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  // #endif
  // #ifdef MP-WEIXIN
  await previewWeixinTeacherProof(proof);
  // #endif
}
