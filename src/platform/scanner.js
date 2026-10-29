import { MAX_PHOTO_BYTES } from "./photos.js";
import { fitRect } from "./scanGeometry.js";
import { browserScanError, nativeScanError, scanAccessError } from "./scanAccess.js";

const api = (method, options = {}) => new Promise((resolve, reject) => uni[method]({ ...options, success: resolve, fail: reject }));

export async function authorizeScanCamera() {
  // #ifdef MP-WEIXIN
  const app = typeof wx !== "undefined" && wx.getAppAuthorizeSetting?.();
  if (app?.cameraAuthorized === "denied")
    throw scanAccessError("手机系统已禁止微信使用相机。请在手机设置中开启微信的相机权限后重试。", "wx-system-camera", "app-settings");
  const setting = await api("getSetting");
  if (setting.authSetting?.["scope.camera"] === false)
    throw scanAccessError("已拒绝本小程序的摄像头授权。请点击“打开小程序权限设置”允许摄像头，再重新开启。", "wx-camera-denied", "mini-settings");
  // Mount <camera> and let WeChat enforce privacy/permission and show its native
  // consent UI. A separate getPrivacySetting failure is not a camera rejection.
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
    fail: failure => reject(nativeScanError(failure)),
  }));
}

export async function openScanSettings() { await api("openSetting"); }
export function openScanPrivacyContract() {
  // #ifdef MP-WEIXIN
  if (typeof wx !== "undefined" && wx.openPrivacyContract)
    return new Promise((resolve, reject) => wx.openPrivacyContract({ success: resolve,
      fail: failure => reject(nativeScanError(failure, "privacy")),
    }));
  // #endif
  return Promise.reject(new Error("当前微信不支持打开隐私指引，请更新微信后重试。"));
}
export function openScanAppSettings() {
  // #ifdef MP-WEIXIN
  if (typeof wx !== "undefined" && wx.openAppAuthorizeSetting)
    return new Promise((resolve, reject) => wx.openAppAuthorizeSetting({ success: resolve, fail: reject }));
  // #endif
  return Promise.reject(new Error("请打开手机设置，在微信的权限中允许相机。"));
}

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
    // #ifdef H5
    if (transient.delete(path) && path?.startsWith("blob:")) URL.revokeObjectURL(path);
    // #endif
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
  async function drawOutline(corners, frameWidth, frameHeight, stage, cover = true, confirmed = true) {
    outline.width = Math.round(stage.width); outline.height = Math.round(stage.height);
    const rect = fitRect(frameWidth, frameHeight, outline.width, outline.height, cover);
    const ctx = outline.getContext("2d");
    ctx.clearRect(0, 0, outline.width, outline.height);
    ctx.beginPath();
    corners.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](rect.left + p.x * rect.width, rect.top + p.y * rect.height));
    ctx.closePath(); ctx.fillStyle = confirmed ? "rgba(0,214,178,0.16)" : "rgba(255,192,80,0.12)"; ctx.fill();
    ctx.strokeStyle = confirmed ? "#00d6b2" : "#ffc050"; ctx.lineWidth = 2; ctx.stroke();
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

export async function chooseScanSource(source = "album") {
  return (await chooseScanSources(source, 1))[0] || null;
}

export function chooseScanSources(source = "album", remaining = 1) {
  const limit = source === "camera" ? 1 : Math.max(0, Math.floor(remaining));
  if (!limit) return Promise.resolve([]);
  // #ifdef H5
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp";
    input.multiple = source === "album" && limit > 1;
    if (source === "camera") input.setAttribute("capture", "environment");
    input.style.cssText = "position:fixed;left:-10000px;width:1px;height:1px";
    document.body.appendChild(input);
    const finish = paths => { input.remove(); resolve(paths); };
    const fail = error => { input.remove(); reject(error); };
    input.oncancel = () => finish([]);
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length > limit) { fail(new Error(`还可添加 ${limit} 页，请减少所选图片。`)); return; }
      if (files.some(file => file.size > 20 * 1024 * 1024)) { fail(new Error("请选择每张 20 MB 以内的照片。")); return; }
      if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
        fail(new Error("请选择 JPG、PNG 或 WebP 图片。")); return;
      }
      // Decode sequentially during processing instead of retaining every full
      // photo as a base64 string. The renderer owns these temporary object URLs.
      finish(files.map(file => URL.createObjectURL(file)));
    };
    try { input.click(); } catch (error) { fail(error); }
  });
  // #endif
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    const fail = failure => /cancel/i.test(failure.errMsg || "") ? resolve([]) : reject(nativeScanError(failure, source));
    const finish = paths => paths?.length ? resolve(paths.slice(0, limit)) : reject(new Error("未读到选择的照片，请重试。"));
    // The native picker owns privacy consent; album access never needs camera
    // permission. WeChat allows at most nine still images per picker session.
    if (source === "album" && typeof wx !== "undefined" && wx.chooseMedia) wx.chooseMedia({
      count: Math.min(9, limit), mediaType: ["image"], sourceType: [source], sizeType: ["original"],
      success: result => finish(result.tempFiles?.map(file => file.tempFilePath)), fail,
    });
    else uni.chooseImage({ count: Math.min(9, limit), sourceType: [source], sizeType: ["original"],
      success: result => finish(result.tempFilePaths), fail,
    });
  });
  // #endif
}

// #ifdef H5
export async function openBrowserCamera(host, onFrame) {
  if (window.isSecureContext === false) throw scanAccessError("当前网页不是安全连接，Chrome 不允许直接使用摄像头。请通过 HTTPS 打开网站，或使用系统相机／相册扫描。", "web-insecure", "web-help");
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (policy?.allowsFeature && !policy.allowsFeature("camera"))
    throw scanAccessError("当前嵌入页面禁止使用摄像头。请在 Chrome 新标签页直接打开完整网站后扫描；也可以使用系统相机或相册。", "web-policy", "web-help");
  if (!navigator.mediaDevices?.getUserMedia) throw scanAccessError("当前浏览器不支持实时相机。可使用系统相机拍摄，或从相册扫描。", "web-camera-unsupported");
  if (!host) throw new Error("相机预览区尚未就绪，请重新打开扫描页。");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }); }
  catch (failure) { throw browserScanError(failure); }
  const video = document.createElement("video"), canvas = document.createElement("canvas");
  video.muted = true; video.autoplay = true; video.playsInline = true;
  video.setAttribute("playsinline", "true"); video.setAttribute("webkit-playsinline", "true");
  // Keep the full sensor frame visible, including the paper edges in landscape
  // video on a portrait phone. The outline uses the same contain transform.
  video.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
  video.srcObject = stream; host.appendChild(video);
  let timer, closed = false;
  const close = () => { closed = true; clearInterval(timer); stream.getTracks().forEach(track => track.stop()); video.srcObject = null; video.remove(); };
  try { await video.play(); }
  catch { close(); throw new Error("相机预览启动失败，请点击重新开启。"); }
  timer = setInterval(() => {
    if (closed || !video.videoWidth || video.readyState < 2) return;
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }, 200);
  return { close, matchesFrame(width, height) {
    // Analysis sizes are rounded to whole pixels; allow that sub-pixel aspect
    // error, while rejecting a changed camera orientation or stream format.
    return width > 0 && height > 0 && Math.abs(width / height - video.videoWidth / video.videoHeight) < .005;
  }, capture() {
    if (closed || !video.videoWidth || video.readyState < 2) throw new Error("相机还未就绪，请稍后重试。");
    const shot = document.createElement("canvas"); shot.width = video.videoWidth; shot.height = video.videoHeight;
    shot.getContext("2d").drawImage(video, 0, 0);
    return shot.toDataURL("image/jpeg", 0.96);
  } };
}
// #endif
