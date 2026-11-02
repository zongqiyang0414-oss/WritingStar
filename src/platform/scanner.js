import { MAX_PHOTO_BYTES } from "./photos.js";
import { fitRect } from "./scanGeometry.js";
import { browserScanError, nativeScanError, scanAccessError } from "./scanAccess.js";
import { scanCallback } from "./scanAsync.js";

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
  let active = true, listener, processing = false, nextFrameAt = 0;
  try {
    listener = context.onCameraFrame(frame => {
      if (!active || processing || Date.now() < nextFrameAt) return;
      processing = true;
      // The camera can deliver 30fps while JS detection takes much longer.
      // Drop surplus frames before allocating a pixel view and leave an input
      // window after each completed pass, rather than queueing work forever.
      let result;
      try { result = callback(frame); } catch { processing = false; nextFrameAt = Date.now() + 180; if (active) onError(); return; }
      Promise.resolve(result)
        .catch(() => { if (active) onError(); })
        .finally(() => { processing = false; nextFrameAt = Date.now() + 180; });
    });
    listener.start({ fail: () => { if (active) onError(); } });
  } catch { onError(); }
  return () => { active = false; try { listener?.stop(); } catch { /* Already stopped by the camera. */ } };
}

export function takeNativePhoto(context) {
  return scanCallback((resolve, reject) => context.takePhoto({
    quality: "high", success: result => resolve(result.tempImagePath),
    fail: failure => reject(nativeScanError(failure)),
  }), { message: "拍照等待超时，请重新开启相机后重试。", onLateValue: path => {
    // #ifdef MP-WEIXIN
    uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} });
    // #endif
  } });
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
  let work, outline, shape;
  // #ifdef H5
  work = document.createElement("canvas");
  outline = document.createElement("canvas");
  shape = document.createElement("canvas");
  // #endif
  // #ifdef MP-WEIXIN
  const result = await scanCallback(resolve => uni.createSelectorQuery().in(instance)
    .select("#scan-work-canvas").fields({ node: true, size: true })
    .select("#scan-outline-canvas").fields({ node: true, size: true })
    .select("#scan-shape-canvas").fields({ node: true, size: true }).exec(resolve),
  { timeout: 5000, message: "扫描画布未就绪，请重新打开扫描页面。" });
  work = result[0]?.node; outline = result[1]?.node; shape = result[2]?.node;
  // #endif
  if (!work || !outline) throw new Error("当前设备不支持扫描画布，请更新微信后重试。");
  const transient = new Set();
  let disposed = false, revision = 0, jpegQueue = Promise.resolve();
  const serializeImage = task => { const next = jpegQueue.catch(() => {}).then(task); jpegQueue = next; return next; };
  const check = token => { if (disposed || token !== revision) throw new Error("扫描已暂停，请重试。"); };
  const remove = path => {
    // #ifdef H5
    if (transient.delete(path) && path?.startsWith("blob:")) URL.revokeObjectURL(path);
    // #endif
    // #ifdef MP-WEIXIN
    if (transient.delete(path)) uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} });
    // #endif
  };
  async function encode(canvas, format = "jpg", quality = 0.9) {
    const token = revision;
    // #ifdef H5
    return canvas.toDataURL(format === "png" ? "image/png" : "image/jpeg", quality);
    // #endif
    // #ifdef MP-WEIXIN
    const result = await scanCallback((resolve, reject) => uni.canvasToTempFilePath({
      canvas, width: canvas.width, height: canvas.height, destWidth: canvas.width, destHeight: canvas.height,
      fileType: format, quality, success: resolve, fail: reject,
    }, instance), { message: "生成扫描件等待超时，已恢复操作，请重试。", onLateValue: result => {
      transient.add(result.tempFilePath); remove(result.tempFilePath);
    } });
    transient.add(result.tempFilePath);
    if (disposed || token !== revision) { remove(result.tempFilePath); throw new Error("扫描已暂停，请重试。"); }
    return result.tempFilePath;
    // #endif
  }
  async function flush(canvas, token) {
    // #ifdef MP-WEIXIN
    if (canvas.requestAnimationFrame) await scanCallback(resolve => canvas.requestAnimationFrame(resolve), { timeout: 250 }).catch(() => {});
    else await new Promise(resolve => setTimeout(resolve, 16));
    // #endif
    check(token);
  }
  async function uniqueImage(path, prefix, token) {
    // #ifdef H5
    return path;
    // #endif
    // #ifdef MP-WEIXIN
    // A canvas temp URI can be reused/cached by the native image component.
    // Each completed edit gets a new path, so its new pixels/dimensions reload.
    const target = `${wx.env.USER_DATA_PATH}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    try {
      await scanCallback((success, fail) => uni.getFileSystemManager().copyFile({ srcPath: path, destPath: target, success, fail }),
        { onLateValue: () => uni.getFileSystemManager().unlink({ filePath: target, fail: () => {} }) });
      transient.add(target);
      try { check(token); } catch (error) { remove(target); throw error; }
      return target;
    } finally { remove(path); }
    // #endif
  }
  async function read(path, canvas = work, maxEdge = 2200) {
    if (!canvas) throw new Error("当前设备暂不支持成片预览。");
    const token = revision;
    let img;
    // #ifdef H5
    img = new Image();
    // #endif
    // #ifdef MP-WEIXIN
    img = canvas.createImage();
    // #endif
    await scanCallback((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("照片读取失败，请重新拍摄。"));
      img.src = path;
    }, { message: "照片读取等待超时，请重新选择或拍摄。" });
    check(token);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  async function exportImage(image) {
    const token = revision;
    return serializeImage(async () => {
      check(token);
      work.width = image.width; work.height = image.height;
      const ctx = work.getContext("2d"), pixels = ctx.createImageData(image.width, image.height);
      pixels.data.set(image.data); ctx.putImageData(pixels, 0, 0);
      await flush(work, token);
      for (const quality of [0.92, 0.82, 0.7, 0.58]) {
        const path = await encode(work, "jpg", quality);
        let size = 0;
        // #ifdef H5
        size = Math.ceil((path.length - path.indexOf(",") - 1) * 3 / 4);
        // #endif
        // #ifdef MP-WEIXIN
        let info;
        try {
          info = await scanCallback((success, fail) => uni.getFileInfo({ filePath: path, success, fail }),
            { timeout: 5000, message: "扫描件校验等待超时，请重试。" });
          check(token);
        } catch (error) { remove(path); throw error; }
        size = info.size;
        // #endif
        if (size <= MAX_PHOTO_BYTES) return uniqueImage(path, "scan-preview", token);
        remove(path);
      }
      throw new Error("扫描图片较大，请缩小拍摄范围后重试。");
    });
  }
  async function exportPreview(image) {
    if (!shape) throw new Error("当前设备暂不支持成片预览。");
    const token = revision;
    return serializeImage(async () => {
      check(token);
      shape.width = image.width; shape.height = image.height;
      const ctx = shape.getContext("2d"), pixels = ctx.createImageData(image.width, image.height);
      pixels.data.set(image.data); ctx.putImageData(pixels, 0, 0);
      await flush(shape, token);
      return uniqueImage(await encode(shape, "jpg", .8), "shape-preview", token);
    });
  }
  async function drawOutline(corners, frameWidth, frameHeight, stage, cover = true, confirmed = true) {
    // #ifdef H5
    // A four-sided overlay does not need a per-frame canvas readback and PNG
    // encode. Keep it as a small vector image in the same display coordinates.
    const width = Math.round(stage.width), height = Math.round(stage.height);
    const display = fitRect(frameWidth, frameHeight, width, height, cover);
    const points = corners.map(p => `${display.left + p.x * display.width},${display.top + p.y * display.height}`).join(" ");
    const color = confirmed ? "#00d6b2" : "#ffc050";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${points}" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="2"/></svg>`);
    // #endif
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
      await scanCallback((resolve, reject) => uni.getFileSystemManager().copyFile({ srcPath: path, destPath: savedPath, success: resolve, fail: reject }),
        { onLateValue: () => uni.getFileSystemManager().unlink({ filePath: savedPath, fail: () => {} }) });
      return savedPath;
    }
    catch { throw new Error("扫描件保存失败，请检查设备存储后重试。"); }
    // #endif
  }
  return { read, exportImage, readPreview: path => read(path, shape, 600), exportPreview, drawOutline, persist, remove,
    cancelPending() { revision++; jpegQueue = Promise.resolve(); },
    track: path => transient.add(path),
    dispose() { disposed = true; [...transient].forEach(remove); work.width = work.height = outline.width = outline.height = 1; if (shape) shape.width = shape.height = 1; },
  };
}

export async function removeSavedScan(path) {
  // #ifdef MP-WEIXIN
  await scanCallback(resolve => uni.getFileSystemManager().unlink({ filePath: path, success: resolve, fail: resolve }), { timeout: 3000 }).catch(() => {});
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
