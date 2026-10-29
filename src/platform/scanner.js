import { MAX_PHOTO_BYTES } from "./photos.js";
import { fitRect } from "./scanGeometry.js";

const api = (method, options = {}) => new Promise((resolve, reject) => uni[method]({ ...options, success: resolve, fail: reject }));

export async function authorizeScanCamera() {
  // #ifdef MP-WEIXIN
  if (typeof wx !== "undefined" && wx.requirePrivacyAuthorize) {
    await new Promise((resolve, reject) => wx.requirePrivacyAuthorize({ success: resolve, fail: () => reject(new Error("需要同意隐私保护指引后才能使用相机。")) }));
  }
  const setting = await api("getSetting");
  if (setting.authSetting["scope.camera"] === false) throw new Error("相机权限已关闭，请在设置中允许使用相机。");
  try { await api("authorize", { scope: "scope.camera" }); }
  catch { throw new Error("未获得相机权限。可以打开设置授权，或从相册扫描。"); }
  // #endif
}

export function startNativeFrames(context, callback, onError) {
  if (typeof context?.onCameraFrame !== "function") { onError(); return () => {}; }
  let active = true, listener;
  try {
    listener = context.onCameraFrame(frame => { if (active) callback(frame); });
    listener.start({ fail: () => { if (active) onError(); } });
  } catch { onError(); }
  return () => { active = false; try { listener?.stop(); } catch { /* Already stopped by the camera. */ } };
}

export function takeNativePhoto(context) {
  return new Promise((resolve, reject) => context.takePhoto({
    quality: "high", success: result => resolve(result.tempImagePath),
    fail: () => reject(new Error("拍摄失败，请保持相机开启后重试。")),
  }));
}

export async function openScanSettings() { await api("openSetting"); }

// Canvas nodes are used on WeChat; DOM canvas/video never enter the mini-program build.
export async function createScanRenderer(instance) {
  let work, outline;
  // #ifdef H5
  work = document.createElement("canvas");
  outline = document.createElement("canvas");
  // #endif
  // #ifdef MP-WEIXIN
  const result = await new Promise(resolve => uni.createSelectorQuery().in(instance)
    .select("#scan-work-canvas").fields({ node: true, size: true })
    .select("#scan-outline-canvas").fields({ node: true, size: true }).exec(resolve));
  work = result[0]?.node; outline = result[1]?.node;
  // #endif
  if (!work || !outline) throw new Error("当前设备不支持扫描画布，请更新微信后重试。");
  const transient = new Set();
  let disposed = false;
  const remove = path => {
    // #ifdef MP-WEIXIN
    if (transient.delete(path)) uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} });
    // #endif
  };
  async function encode(canvas, format = "jpg", quality = 0.9) {
    // #ifdef H5
    return canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", quality);
    // #endif
    // #ifdef MP-WEIXIN
    const result = await new Promise((resolve, reject) => uni.canvasToTempFilePath({
      canvas, width: canvas.width, height: canvas.height, destWidth: canvas.width, destHeight: canvas.height,
      fileType: format, quality, success: resolve, fail: reject,
    }, instance));
    transient.add(result.tempFilePath);
    if (disposed) { remove(result.tempFilePath); throw new Error("扫描已关闭。"); }
    return result.tempFilePath;
    // #endif
  }
  async function read(path) {
    let img;
    // #ifdef H5
    img = new Image();
    // #endif
    // #ifdef MP-WEIXIN
    img = work.createImage();
    // #endif
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("照片读取失败，请重新拍摄。"));
      img.src = path;
    });
    if (disposed) throw new Error("扫描已关闭。");
    const scale = Math.min(1, 2200 / Math.max(img.width, img.height));
    work.width = Math.max(1, Math.round(img.width * scale)); work.height = Math.max(1, Math.round(img.height * scale));
    const ctx = work.getContext("2d");
    ctx.drawImage(img, 0, 0, work.width, work.height);
    return ctx.getImageData(0, 0, work.width, work.height);
  }
  async function exportImage(image) {
    work.width = image.width; work.height = image.height;
    const ctx = work.getContext("2d"), pixels = ctx.createImageData(image.width, image.height);
    pixels.data.set(image.data); ctx.putImageData(pixels, 0, 0);
    for (const quality of [0.92, 0.82, 0.7, 0.58]) {
      const path = await encode(work, "jpg", quality);
      let size = 0;
      // #ifdef H5
      size = Math.ceil((path.length - path.indexOf(",") - 1) * 3 / 4);
      // #endif
      // #ifdef MP-WEIXIN
      const info = await api("getFileInfo", { filePath: path }); size = info.size;
      // #endif
      if (size <= MAX_PHOTO_BYTES) return path;
      remove(path);
    }
    throw new Error("扫描图片较大，请缩小拍摄范围后重试。");
  }
  async function drawOutline(corners, frameWidth, frameHeight, stage, cover = true) {
    outline.width = Math.round(stage.width); outline.height = Math.round(stage.height);
    const rect = fitRect(frameWidth, frameHeight, outline.width, outline.height, cover);
    const ctx = outline.getContext("2d");
    ctx.clearRect(0, 0, outline.width, outline.height);
    ctx.beginPath();
    corners.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](rect.left + p.x * rect.width, rect.top + p.y * rect.height));
    ctx.closePath(); ctx.fillStyle = "rgba(0,214,178,0.16)"; ctx.fill();
    ctx.strokeStyle = "#00d6b2"; ctx.lineWidth = 2; ctx.stroke();
    return encode(outline, "png");
  }
  async function persist(path) {
    // #ifdef H5
    return path;
    // #endif
    // #ifdef MP-WEIXIN
    // copyFile preserves the temp preview. saveFile moves it, which would make a
    // partially failed multi-page save impossible to retry after rollback.
    const savedPath = `${wx.env.USER_DATA_PATH}/scan-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    try {
      await new Promise((resolve, reject) => uni.getFileSystemManager().copyFile({ srcPath: path, destPath: savedPath, success: resolve, fail: reject }));
      return savedPath;
    }
    catch { throw new Error("扫描件保存失败，请检查设备存储后重试。"); }
    // #endif
  }
  return { read, exportImage, drawOutline, persist, remove,
    track: path => transient.add(path),
    dispose() { disposed = true; [...transient].forEach(remove); work.width = work.height = outline.width = outline.height = 1; },
  };
}

export async function removeSavedScan(path) {
  // #ifdef MP-WEIXIN
  await new Promise(resolve => uni.getFileSystemManager().unlink({ filePath: path, success: resolve, fail: resolve }));
  // #endif
}

export async function persistScanPages(renderer, photos, cancelled = () => false) {
  const saved = [];
  try {
    for (const photo of photos) {
      if (cancelled()) throw new Error("保存已中断，请重试。");
      saved.push({ ...photo, url: await renderer.persist(photo.url) });
      if (cancelled()) throw new Error("保存已中断，请重试。");
    }
    return saved;
  } catch (failure) {
    await Promise.all(saved.map(photo => removeSavedScan(photo.url)));
    throw failure;
  }
}

export function chooseScanSource() {
  // #ifdef H5
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp";
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      if (file.size > 20 * 1024 * 1024) { reject(new Error("请选择 20 MB 以内的照片。")); return; }
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("照片读取失败，请重新选择。")); reader.readAsDataURL(file);
    };
    input.click();
  });
  // #endif
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => uni.chooseImage({ count: 1, sourceType: ["album"], sizeType: ["original"],
    success: result => resolve(result.tempFilePaths[0]),
    fail: result => result.errMsg?.includes("cancel") ? resolve(null) : reject(new Error("选择照片失败，请重试。")),
  }));
  // #endif
}

// #ifdef H5
export async function openBrowserCamera(host, onFrame) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("此浏览器暂不能打开相机，请使用 HTTPS 页面或从相册扫描。");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }); }
  catch { throw new Error("相机未能打开，请允许相机权限并确认相机未被占用。"); }
  const video = document.createElement("video"), canvas = document.createElement("canvas");
  video.muted = true; video.autoplay = true; video.playsInline = true;
  video.setAttribute("playsinline", "true"); video.setAttribute("webkit-playsinline", "true");
  video.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
  video.srcObject = stream; host.appendChild(video);
  let timer, closed = false;
  const close = () => { closed = true; clearInterval(timer); stream.getTracks().forEach(track => track.stop()); video.srcObject = null; video.remove(); };
  try { await video.play(); }
  catch { close(); throw new Error("相机预览启动失败，请点击重新开启。"); }
  timer = setInterval(() => {
    if (closed || !video.videoWidth || video.readyState < 2) return;
    const scale = 256 / Math.max(video.videoWidth, video.videoHeight);
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }, 300);
  return { close, capture() {
    if (closed || !video.videoWidth || video.readyState < 2) throw new Error("相机还未就绪，请稍后重试。");
    const shot = document.createElement("canvas"); shot.width = video.videoWidth; shot.height = video.videoHeight;
    shot.getContext("2d").drawImage(video, 0, 0);
    return shot.toDataURL("image/jpeg", 0.96);
  } };
}
// #endif
