<script setup>
import { computed, getCurrentInstance, nextTick, ref, shallowRef, watch } from "vue";
import { onHide, onLoad, onReady, onResize, onShow, onUnload } from "@dcloudio/uni-app";
import { createScanProcessor } from "../../platform/scanProcessor.js";
import { createScanJobs, scanCallback } from "../../platform/scanAsync.js";
import ScanImageViewer from "../../components/ScanImageViewer.vue";
import { LivePaperDetector, selectCaptureDetection } from "../../platform/paperScanCapture.js";
import { AutoScanGate } from "../../platform/autoScan.js";
import { fitRect } from "../../platform/scanGeometry.js";
import { MAX_PHOTOS } from "../../platform/photos.js";
import { decodePaperCode } from "../../services/paperWorkflow.js";
import { nativeScanError } from "../../platform/scanAccess.js";
import { authorizeScanCamera, chooseScanSources, createScanRenderer, openScanSettings, openScanAppSettings, openScanPrivacyContract, persistScanPages, startNativeFrames, takeNativePhoto } from "../../platform/scanner.js";
// #ifdef H5
import { openBrowserCamera } from "../../platform/scanner.js";
// #endif

const instance = getCurrentInstance().proxy;
const mode = ref("live"), automatic = ref(true), busy = ref(false), saving = ref(false), cameraMounted = ref(false), cameraReady = ref(false);
const errorAction = ref(""), errorDetail = ref("");
const realtime = ref(true), starting = ref(false), error = ref(""), notice = ref("将整张作业放入画面，四周留出一些背景");
const outlineUrl = ref(""), progress = ref(0), waiting = ref(false), pages = shallowRef([]), selected = ref(0), capacity = ref(MAX_PHOTOS);
const paperBatch = ref(false);
const importQueue = shallowRef([]), importStatus = ref(""), processingStage = ref("");
const importsPaused = ref(false), jobs = createScanJobs();
const stage = ref({ width: 300, height: 400, left: 0, top: 0 });
const captureFlight = shallowRef(null), thumbnailPulse = ref(false);
const flightStyle = computed(() => {
  const flight = captureFlight.value;
  return flight ? { left: `${flight.left}px`, top: `${flight.top}px`, width: `${flight.width}px`, height: `${flight.height}px`,
    transform: flight.moving ? `translate(${flight.dx}px, ${flight.dy}px) scale(${flight.scale})` : "translate(0px, 0px) scale(1)" } : {};
});
const current = computed(() => pages.value[selected.value]);
const full = computed(() => pages.value.length >= capacity.value);
const processingText = computed(() => [importStatus.value, processingStage.value || "正在读取原照片…"].filter(Boolean).join(" "));
const frameText = computed(() => busy.value ? processingText.value : full.value ? "本次页数已满，请结束拍照" : waiting.value && automatic.value ? "本页已收好，换上下一张即可自动拍照" : notice.value);
const gate = new AutoScanGate();
const liveDetector = new LivePaperDetector();
const processor = createScanProcessor();
const initialized = ref(false), delivered = ref(false);
let renderer, rendererPromise, nativeContext, browserCamera, stopFrames, channel, foreground = true, disposed = false, resumePicker;
let epoch = 0, lastFrame = 0, drawing = false, lastDetection = null, choosing = false;
let detectionErrors = 0, lastDetectionTime = 0, outlineDrawing = false;
let flightStart, flightEnd, pulseEnd, flightResolve, flightSequence = 0;

onLoad(options => {
  paperBatch.value = options?.batch === "paper";
  const maximum = paperBatch.value ? 60 : MAX_PHOTOS;
  const count = Number(options?.remaining);
  capacity.value = Number.isFinite(count) && count > 0 ? Math.min(maximum, Math.floor(count)) : maximum;
  channel = instance.getOpenerEventChannel?.();
});
onReady(() => {
  initialized.value = true;
  measure();
  // Open the camera only from a click; page navigation/onReady is not a camera
  // gesture on mobile browsers. Canvas initialization must not block access.
});
onShow(() => {
  foreground = true; resumePicker?.();
  if (importQueue.value.length && !importsPaused.value && !busy.value) processImportQueue();
});
onResize(async () => { cancelCaptureFeedback(); await nextTick(); if (!disposed) await measure(); });
watch([mode, error, () => pages.value.length, waiting], async () => { await nextTick(); if (!disposed) await measure(); });
onHide(() => { foreground = false; if (!jobs.cancel()) releaseCamera(); });
onUnload(() => {
  disposed = true; resumePicker?.(); if (!jobs.cancel()) releaseCamera(); processor.dispose(); renderer?.dispose();
});

function measure() {
  return scanCallback(resolve => uni.createSelectorQuery().in(instance).select("#scan-stage").boundingClientRect(rect => {
    if (rect?.width) stage.value = rect;
    resolve();
  }).exec(), { timeout: 1000 }).catch(() => {});
}
function clearOutline() {
  const old = outlineUrl.value; outlineUrl.value = "";
  if (old) renderer?.remove(old);
}
function releaseCamera() {
  renderer?.cancelPending();
  processor.cancel();
  cancelCaptureFeedback();
  epoch++; stopFrames?.(); stopFrames = null; browserCamera?.close(); browserCamera = null;
  nativeContext = null; cameraMounted.value = false; cameraReady.value = false; starting.value = false;
  lastDetection = null; lastDetectionTime = 0; lastFrame = 0; detectionErrors = 0; liveDetector.reset(); gate.restart(); progress.value = 0; waiting.value = gate.locked; clearOutline();
}
function interruptProcessing(reason) {
  if (reason?.code === "SCAN_TIMEOUT" && importStatus.value) importsPaused.value = true;
  renderer?.cancelPending(); releaseCamera(); automatic.value = false;
}
function stopProcessing() {
  if (importStatus.value) importsPaused.value = true;
  jobs.cancel();
}
function resumeImports() {
  if (busy.value || !importQueue.value.length) return;
  importsPaused.value = false; clearError(); processImportQueue();
}
function cancelCaptureFeedback() {
  flightSequence++; clearTimeout(flightStart); clearTimeout(flightEnd); clearTimeout(pulseEnd);
  captureFlight.value = null; thumbnailPulse.value = false; flightResolve?.(false); flightResolve = null;
}
async function animateCapture(entry, token) {
  cancelCaptureFeedback();
  // #ifdef MP-WEIXIN
  // Floating native cover-view animations can leave iOS camera hit testing
  // above the page controls. Keep feedback in the existing thumbnail instead.
  if (token !== epoch || disposed || !foreground || mode.value !== "live") return false;
  thumbnailPulse.value = true;
  pulseEnd = setTimeout(() => { thumbnailPulse.value = false; }, 280);
  return true;
  // #endif
  // #ifdef H5
  const sequence = flightSequence;
  await nextTick();
  const rects = await new Promise(resolve => {
    const result = {};
    const timeout = setTimeout(() => resolve({}), 180);
    try {
      uni.createSelectorQuery().in(instance).select(".scanner-page").boundingClientRect(rect => { result.page = rect; })
        .select("#scan-stage").boundingClientRect(rect => { result.stage = rect; })
        .select("#scan-capture-thumb").boundingClientRect(rect => { result.thumb = rect; }).exec(() => { clearTimeout(timeout); resolve(result); });
    } catch { clearTimeout(timeout); resolve({}); }
  });
  if (sequence !== flightSequence || token !== epoch || disposed || !foreground || mode.value !== "live") return false;
  const { page, stage: area, thumb } = rects;
  if (!page?.width || !area?.width || !thumb?.width) return false;
  const from = fitRect(entry.previewWidth, entry.previewHeight, area.width, area.height);
  const to = fitRect(entry.previewWidth, entry.previewHeight, thumb.width, thumb.height);
  const left = area.left - page.left + from.left, top = area.top - page.top + from.top;
  captureFlight.value = { url: entry.photo.url, left, top, width: from.width, height: from.height,
    dx: thumb.left - page.left + to.left - left, dy: thumb.top - page.top + to.top - top, scale: to.width / from.width, moving: false };
  const completed = new Promise(resolve => { flightResolve = resolve; });
  await nextTick();
  // Commit the full-sized photograph first, then let CSS move the same image.
  // No canvas export or detector work is needed for the feedback animation.
  flightStart = setTimeout(() => {
    if (sequence !== flightSequence) return;
    captureFlight.value = { ...captureFlight.value, moving: true };
    flightEnd = setTimeout(() => {
      if (sequence !== flightSequence) return;
      captureFlight.value = null; thumbnailPulse.value = true;
      pulseEnd = setTimeout(() => { thumbnailPulse.value = false; }, 280);
      flightResolve?.(true); flightResolve = null;
    }, 540);
  }, 60);
  return completed;
  // #endif
}
async function ensureRenderer() {
  if (renderer) return renderer;
  if (!rendererPromise) rendererPromise = createScanRenderer(instance).then(value => {
    if (disposed) { value.dispose(); throw new Error("扫描已关闭。"); }
    renderer = value; return value;
  }).finally(() => { rendererPromise = null; });
  return rendererPromise;
}
function clearError() { error.value = ""; errorAction.value = ""; errorDetail.value = ""; }
function showFailure(failure, operation = "camera") {
  let reason = failure;
  // #ifdef MP-WEIXIN
  reason = failure?.action !== undefined || failure?.message && !failure?.errMsg ? failure : nativeScanError(failure, operation);
  // #endif
  error.value = reason?.message || "操作失败，请重试。";
  errorAction.value = reason?.action || "";
  errorDetail.value = reason?.detail || reason?.errMsg || "";
}
async function startCamera() {
  if (!initialized.value || disposed || !foreground || starting.value || busy.value || full.value) return;
  releaseCamera();
  mode.value = "live"; clearError(); starting.value = true; realtime.value = true;
  notice.value = "正在打开相机…";
  const token = epoch;
  try {
    // #ifdef MP-WEIXIN
    await authorizeScanCamera();
    if (disposed || !foreground || token !== epoch) return;
    cameraMounted.value = true;
    // #endif
    // #ifdef H5
    // No asynchronous query/initialization may precede getUserMedia: retain the
    // trusted click. The host stays mounted while reviewing a captured page.
    const camera = await openBrowserCamera(document.getElementById("scan-browser-camera"), frame => receiveFrame(frame));
    if (disposed || !foreground || token !== epoch) { camera.close(); return; }
    browserCamera = camera; cameraReady.value = true; starting.value = false;
    notice.value = "将整张作业放入画面，四周留出一些背景";
    // #endif
  } catch (failure) {
    if (token !== epoch || disposed) return;
    releaseCamera(); notice.value = "相机暂未开启，也可以从相册添加";
    showFailure(failure);
  }
}
function nativeReady() {
  if (!cameraMounted.value || !foreground || disposed) return;
  nativeContext = uni.createCameraContext(); cameraReady.value = true; starting.value = false;
  notice.value = "将整张作业放入画面，四周留出一些背景";
  resumeNativeFrames();
}
function resumeNativeFrames() {
  if (!nativeContext || !foreground || disposed || busy.value || mode.value !== "live" || !cameraReady.value || full.value) return;
  stopFrames?.();
  stopFrames = startNativeFrames(nativeContext, frame => receiveFrame({ ...frame, data: new Uint8ClampedArray(frame.data) }), () => {
    realtime.value = false; automatic.value = false; clearOutline();
    notice.value = "此设备暂不支持实时框选；可直接拍摄原照片";
  });
}
function cameraError(event) { releaseCamera(); showFailure(event?.detail || event); }
function cameraStopped() { if (cameraMounted.value) { releaseCamera(); notice.value = "相机已暂停，点击继续开启"; } }
async function settings() {
  try { await openScanSettings(); if (foreground) await startCamera(); }
  catch (failure) { showFailure(failure); }
}
async function systemSettings() {
  try { await openScanAppSettings(); }
  catch (failure) { error.value = failure.message || "请打开手机设置，在微信权限中允许相机。"; }
}
function permissionHelp() {
  uni.showModal({ title: "相机授权说明", showCancel: false, content: errorAction.value.startsWith("privacy")
    ? "管理员在电脑浏览器打开 mp.weixin.qq.com，登录AppID为wxe3fefef9eaab17c3的小程序。进入“设置→服务内容声明→用户隐私保护指引”，补充摄像头（拍摄纸质作业）、选中的照片或视频信息（导入作业图片），按平台提示提交并确认生效。手机微信设置里没有这个配置；仅查看指引也不等于已经同意授权。"
    : "在 Chrome 地址栏的网站信息中，允许此网站使用相机。手机还需在系统设置中允许 Chrome 使用相机。请通过 HTTPS 地址直接打开网站；嵌入页可能不支持授权。相册和系统相机可单独使用。" });
}
async function privacyContract() {
  try { await openScanPrivacyContract(); }
  catch (failure) { showFailure(failure); }
}
function copyError() { uni.setClipboardData({ data: `写字星 v0.21.0 扫描
${error.value}
${errorDetail.value}`, fail: () => uni.showModal({ title: "请长按复制错误详情", showCancel: false,
  content: errorDetail.value || error.value }) }); }
async function waitForPickerReturn() {
  if (foreground || disposed) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { resumePicker = null; reject(new Error("请返回扫描页面后重新选择照片。")); }, 5000);
    resumePicker = () => { clearTimeout(timeout); resumePicker = null; resolve(); };
  });
}
async function receiveFrame(frame) {
  const now = Date.now();
  if (disposed || !foreground || !cameraReady.value || mode.value !== "live" || busy.value || drawing || full.value || now - lastFrame < 180) return;
  lastFrame = now;
  const token = epoch;
  drawing = true;
  try {
    const detection = liveDetector.update(frame, now);
    detectionErrors = 0;
    const state = gate.update(detection, now); progress.value = state.progress; waiting.value = state.waiting;
    lastDetection = detection ? { ...detection, corners: state.corners || detection.corners, frameWidth: frame.width, frameHeight: frame.height } : null;
    lastDetectionTime = now;
    // Capture before exporting another outline PNG. Rendering time must not
    // cancel a hold that already contains enough fresh stable observations.
    if (automatic.value && realtime.value && state.capture && token === epoch) {
      await capture(true); return;
    }
    if (detection) {
      if (!outlineDrawing) updateLiveOutline(lastDetection, frame, token);
      notice.value = detection.autoEligible === false ? "边缘尚不完整，请露出纸张四边；也可直接拍摄原照片"
        : !automatic.value ? "已框住纸张，点击下方拍摄"
        : state.reason === "moving" ? "检测到移动，请放稳纸张"
        : state.reason === "uncertain" ? "正在确认纸张边缘，请保持稳定"
        : `已找到纸张，保持稳定 ${Math.round(progress.value * 100)}%`;
    } else {
      clearOutline(); notice.value = "寻找纸张边缘，请放平作业并避开遮挡";
    }
  } catch {
    if (token !== epoch || disposed) return;
    gate.restart(); progress.value = 0; clearOutline();
    if (++detectionErrors >= 3) { realtime.value = false; automatic.value = false; }
    notice.value = "正在重新识别，也可以直接拍摄原照片";
  } finally { drawing = false; }
}
async function updateLiveOutline(detection, frame, token) {
  outlineDrawing = true;
  let cover = true;
  // #ifdef H5
  cover = false;
  // #endif
  try {
    await ensureRenderer();
    const path = await renderer.drawOutline(detection.corners, frame.width, frame.height, stage.value, cover, detection.autoEligible !== false);
    // Native PNG export may finish after newer frames. Do not restore an old
    // outline after the page moved, disappeared or the camera was released.
    if (token !== epoch || disposed || !lastDetection || detection.corners.some((p, i) => Math.hypot(p.x - lastDetection.corners[i].x, p.y - lastDetection.corners[i].y) > .03)) {
      renderer.remove(path); return;
    }
    const old = outlineUrl.value; outlineUrl.value = path; if (old) renderer.remove(old);
  } catch {
    if (token === epoch && !disposed) clearOutline();
  } finally { outlineDrawing = false; }
}
function toggleAutomatic() {
  automatic.value = !automatic.value; gate.restart(); progress.value = 0;
}

async function capture(fromAutomatic = false) {
  if (!cameraReady.value || busy.value || full.value) return;
  busy.value = true; error.value = "";
  const token = epoch, detection = Date.now() - lastDetectionTime < 650 ? lastDetection : null;
  stopFrames?.(); stopFrames = null;
  processingStage.value = "正在拍摄照片…";
  try {
    await jobs.run(async () => {
      let source;
      // #ifdef H5
      source = await browserCamera.capture();
      // #endif
      // #ifdef MP-WEIXIN
      source = await takeNativePhoto(nativeContext);
      await ensureRenderer(); renderer.track(source);
      // #endif
      if (token !== epoch || disposed) { renderer.remove(source); return; }
      // Lock immediately; an interrupted processing attempt must not trigger a burst.
      gate.captured(detection); waiting.value = true; progress.value = 0;
      let sameFrame = false;
      // #ifdef H5
      sameFrame = !!detection && browserCamera.matchesFrame(detection.frameWidth, detection.frameHeight);
      // #endif
      await processSource(source, fromAutomatic, token, false, detection, sameFrame);
    }, { onInterrupt: interruptProcessing });
  } catch (failure) {
    if (failure?.code === "SCAN_TIMEOUT" && token === epoch) interruptProcessing(failure);
    if (!disposed) showFailure(failure);
    automatic.value = false;
  } finally { busy.value = false; processingStage.value = ""; resumeNativeFrames(); }
}
async function processSource(source, fromAutomatic, token, fromImport = false, previewDetection = null, sameFrame = false) {
  processingStage.value = "正在读取照片信息…";
  await ensureRenderer();
  // Small analysis pixels are used only for framing/code recognition. The
  // original camera/picker file remains the displayed and persisted photo.
  const image = await renderer.readAnalysis(source);
  if (token !== epoch || disposed) throw new Error("拍照已暂停，请重新拍摄。");
  const detection = selectCaptureDetection(image, previewDetection, sameFrame);
  const quad = detection?.confidence >= .7 && detection.autoEligible !== false ? detection.corners : null;
  const cancelled = () => disposed || token !== epoch || !foreground;
  let code = "";
  if (paperBatch.value && quad) {
    try {
      const identified = await processor.process(image, quad, { cancelled, identifyOnly: true,
        onStage: text => { if (!cancelled()) processingStage.value = text; } });
      try { decodePaperCode(identified.code); code = identified.code.trim(); } catch { /* Generic QR codes do not identify a student. */ }
    } catch (failure) {
      if (cancelled()) throw failure;
      // A failed identifier must not discard or re-encode a valid photograph.
    }
  }
  if (cancelled()) throw new Error("拍照已暂停，请重新拍摄。");
  gate.setIdentity(code);
  if (fromAutomatic && code && pages.value.some(page => page.code === code)) {
    if (!pages.value.some(page => page.source === source)) renderer.remove(source);
    notice.value = "本页已收好，请更换下一张";
    return;
  }
  const width = image.sourceWidth || image.width, height = image.sourceHeight || image.height;
  const captureCorners = quad?.map(p => ({ ...p })) || null;
  // Native capture/picker APIs may reuse temp URIs. Copy original bytes to an
  // owned unique URI, without encoding, so earlier pages cannot be overwritten.
  source = await renderer.keepOriginal(source);
  if (cancelled()) { renderer.remove(source); throw new Error("拍照已暂停，请重新拍摄。"); }
  const output = { source, code, corrected: false, width, height, previewWidth: width, previewHeight: height,
    photo: { id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`, url: source,
      name: "作业原照片", sample: false, original: true, width, height, captureCorners } };
  pages.value = [...pages.value, output]; selected.value = pages.value.length - 1;
  notice.value = "原照片已保留，请换上下一张";
  if (!fromImport) {
    const feedback = animateCapture(output, token);
    if (!fromAutomatic || full.value) await feedback;
  }
  if (token !== epoch || disposed || !foreground) return;
  if (!fromImport && (!fromAutomatic || full.value)) { busy.value = false; reviewPage(selected.value); }
}
async function importPage(sourceType = "album") {
  if (busy.value || choosing || full.value) return;
  choosing = true; clearError(); releaseCamera();
  try {
    const sources = await chooseScanSources(sourceType, capacity.value - pages.value.length);
    await waitForPickerReturn();
    if (!sources.length) return;
    await ensureRenderer(); sources.forEach(source => renderer.track(source));
    if (disposed) { sources.forEach(source => renderer.remove(source)); return; }
    importsPaused.value = false; importQueue.value = sources;
    await processImportQueue();
  } catch (failure) { if (!disposed) showFailure(failure, sourceType); }
  finally { choosing = false; busy.value = false; }
}
async function processImportQueue() {
  busy.value = true;
  try {
    while (importQueue.value.length && !importsPaused.value && !full.value && !disposed && foreground) {
      const source = importQueue.value[0];
      importQueue.value = importQueue.value.slice(1);
      importStatus.value = `正在添加所选照片，还剩 ${importQueue.value.length + 1} 张…`;
      const token = epoch;
      try { await jobs.run(() => processSource(source, false, token, true), { onInterrupt: interruptProcessing }); }
      catch (failure) {
        if (disposed) return;
        if (failure?.code === "SCAN_TIMEOUT" && token === epoch) interruptProcessing(failure);
        if (!foreground || token !== epoch) {
          importQueue.value = [source, ...importQueue.value];
          if (foreground) showFailure(failure, "album");
          return;
        }
        renderer.remove(source); showFailure(failure, "album");
      }
    }
    if (!disposed && pages.value.length) mode.value = "review";
  } finally {
    busy.value = false; importStatus.value = "";
    if (!disposed && foreground && !importsPaused.value && importQueue.value.length && !full.value) nextTick(processImportQueue);
  }
}
function reviewPage(index) {
  if (busy.value || !pages.value[index]) return;
  releaseCamera(); selected.value = index; mode.value = "review"; error.value = "";
}
function removePage() {
  const entry = current.value;
  if (!entry || busy.value) return;
  renderer.remove(entry.source); renderer.remove(entry.photo.url);
  pages.value = pages.value.filter((_, i) => i !== selected.value);
  selected.value = Math.max(0, Math.min(selected.value, pages.value.length - 1));
  if (!pages.value.length) { mode.value = "live"; startCamera(); }
}
async function finish() {
  if (!pages.value.length || busy.value || saving.value || delivered.value) return;
  if (!channel?.emit) { error.value = "请从作业提交页进入拍照，以便保存原照片。"; return; }
  releaseCamera(); busy.value = saving.value = true; error.value = "";
  const token = epoch;
  try {
    const saved = await persistScanPages(renderer, pages.value.map(entry => entry.photo), () => disposed || token !== epoch);
    const result = paperBatch.value ? saved.map((photo, index) => ({
      id: photo.id, photo, code: pages.value[index].code || "", corrected: pages.value[index].corrected !== false, manual: false,
    })) : saved;
    channel.emit("scanned", result); delivered.value = true;
    uni.navigateBack({ fail: () => { error.value = "原照片已添加，请返回作业提交页。"; } });
  } catch (failure) {
    if (!disposed) error.value = failure.message || "保存失败，原照片仍在，请重试。";
  } finally { busy.value = saving.value = false; }
}
function leave() {
  if (busy.value) return;
  if (!pages.value.length || delivered.value) { uni.navigateBack(); return; }
  releaseCamera();
  uni.showModal({ title: "放弃本次拍照？", content: "尚未添加的照片将被丢弃。", confirmText: "放弃拍照", confirmColor: "#cc5544",
    success: result => { if (result.confirm) uni.navigateBack(); },
  });
}
</script>

<template>
  <view class="scanner-page">
    <view class="scan-header">
      <button class="scan-icon-button" aria-label="退出扫描" :disabled="busy" @click="leave">×</button>
      <view class="scan-heading"><text class="scan-title">作业拍照</text><text class="scan-subtitle">{{ mode === 'review' ? '查看原照片' : '自动框选 · 原图保存' }}</text></view>
      <text class="scan-count">{{ pages.length }} / {{ capacity }} 页</text>
    </view>
    <view class="scan-status" role="status">{{ mode === 'live' ? frameText : busy ? (saving ? '正在保存原照片…' : processingText) : '双指放大、拖动查看笔迹，轻点查看全图' }}</view>
    <view class="scan-original-note">框线仅辅助取景，照片按原图保存</view>
    <view id="scan-stage" class="scan-stage">
      <!-- #ifdef H5 -->
      <view v-show="mode === 'live'" id="scan-browser-camera" class="scan-camera" />
      <!-- #endif -->
      <template v-if="mode === 'live'">
        <!-- #ifdef MP-WEIXIN -->
        <camera v-if="cameraMounted" id="scan-camera" class="scan-camera" device-position="back" flash="off" frame-size="medium" resolution="high" @initdone="nativeReady" @error="cameraError" @stop="cameraStopped">
          <cover-image v-if="outlineUrl" class="scan-outline" :src="outlineUrl" />
        </camera>
        <!-- #endif -->
        <!-- #ifdef H5 -->
        <image v-if="outlineUrl" class="scan-outline" :src="outlineUrl" mode="scaleToFill" />
        <!-- #endif -->
        <view v-if="!cameraMounted && !cameraReady && !captureFlight" class="scan-empty">
          <view class="scan-empty-symbol">▣</view>
          <text>{{ starting ? '正在开启相机' : '对准作业，自动拍摄原照片' }}</text>
          <text class="scan-muted">纸张放平，保持光线均匀</text>
          <button v-if="!starting" class="scan-primary" :disabled="busy || full || !initialized" @click="startCamera">{{ full ? '已达到页数上限' : '开启相机' }}</button>
          <!-- #ifdef MP-WEIXIN -->
          <button v-if="errorAction === 'mini-settings' && !starting" class="scan-text-button" @click="settings">打开小程序权限设置</button>
          <button v-if="errorAction === 'app-settings' && !starting" class="scan-text-button" @click="systemSettings">打开手机授权设置</button>
          <!-- #endif -->
          <button v-if="!starting" class="scan-text-button" :disabled="busy || full" @click="importPage('camera')">使用系统相机拍摄</button>
        </view>
      </template>
      <ScanImageViewer v-else-if="mode === 'review' && current" :key="current.photo.id" :src="current.photo.url" :urls="pages.map(page => page.photo.url)" />
    </view>
    <view v-if="error" class="scan-error" role="alert">
      <view>{{ error }}</view>
      <view class="scan-error-actions">
        <!-- #ifdef MP-WEIXIN -->
        <button v-if="errorAction === 'privacy' || errorAction === 'privacy-config'" class="scan-text-button" @click="privacyContract">查看隐私指引</button>
        <button v-if="errorAction === 'privacy' || errorAction === 'privacy-config'" class="scan-text-button" @click="permissionHelp">后台配置位置</button>
        <!-- #endif -->
        <button v-if="errorAction === 'web-help'" class="scan-text-button" @click="permissionHelp">查看授权说明</button>
        <button v-if="errorDetail" class="scan-text-button" @click="copyError">复制错误详情</button>
      </view>
      <!-- #ifdef MP-WEIXIN -->
      <text v-if="errorDetail" class="scan-error-detail" selectable>{{ errorDetail }}</text>
      <!-- #endif -->
    </view>
    <view class="scan-controls">
      <button v-if="busy && !saving" class="scan-text-button scan-stop" @click="stopProcessing">停止处理</button>
      <button v-if="!busy && importsPaused && importQueue.length" class="scan-text-button" @click="resumeImports">继续处理所选图片（{{ importQueue.length }} 张）</button>
      <template v-if="mode === 'live'">
        <view class="scan-mode-row">
          <button :class="['scan-mode-toggle', { active: automatic }]" :disabled="busy || !realtime" :aria-pressed="automatic" @click="toggleAutomatic"><text class="scan-toggle-dot" />自动拍照 {{ automatic ? '已开启' : '已关闭' }}</button>
          <text class="scan-muted">{{ automatic ? '放稳后自动拍摄' : '点击按钮拍摄' }}</text>
        </view>
        <view class="scan-progress"><view :style="{ width: automatic && !waiting ? Math.round(progress * 100) + '%' : '0%' }" /></view>
        <view class="scan-actions">
          <button class="scan-side-action" :disabled="busy || full || !initialized" @click="importPage('album')"><text class="scan-action-icon">▧</text><text>从相册添加</text></button>
          <button class="scan-shutter" aria-label="拍摄照片" :disabled="busy || !cameraReady || full" @click="capture(false)"><view class="scan-shutter-inner" /></button>
          <button class="scan-side-action" :disabled="busy || !pages.length" @click="reviewPage(pages.length - 1)"><view v-if="pages.length" id="scan-capture-thumb" :class="['scan-thumb-slot', { 'scan-thumb-arrived': thumbnailPulse }]"><image class="scan-thumb" :src="pages[pages.length - 1].photo.url" mode="aspectFit" /></view><text v-else class="scan-action-icon">▤</text><text>已拍摄 {{ pages.length }} 页</text></button>
        </view>
        <button v-if="pages.length" class="scan-primary scan-finish" :disabled="busy" @click="finish">结束拍照，添加 {{ pages.length }} 页</button>
      </template>
      <template v-else-if="mode === 'review'">
        <view class="scan-pagination"><button :disabled="busy || selected === 0" @click="selected--">‹ 上一页</button><text>{{ selected + 1 }} / {{ pages.length }}</text><button :disabled="busy || selected >= pages.length - 1" @click="selected++">下一页 ›</button></view>
        <view class="scan-review-actions"><button class="scan-secondary" :disabled="busy" @click="removePage">删除此页</button></view>
        <view class="scan-review-actions"><button class="scan-secondary" :disabled="busy || full" @click="startCamera">继续拍照</button><button class="scan-primary" :disabled="busy || delivered" @click="finish">完成 {{ pages.length }} 页</button></view>
      </template>
    </view>
    <!-- #ifdef H5 -->
    <view v-if="captureFlight" :class="['scan-capture-flight', { 'scan-capture-moving': captureFlight.moving }]" :style="flightStyle" aria-hidden="true"><image class="scan-capture-photo" :src="captureFlight.url" mode="scaleToFill" /></view>
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <canvas id="scan-work-canvas" type="2d" class="scan-hidden-canvas" />
    <canvas id="scan-outline-canvas" type="2d" class="scan-hidden-canvas" />
    <!-- #endif -->
  </view>
</template>

<style>
.scanner-page { position: fixed; inset: 0; display: flex; flex-direction: column; background: #111816; color: #fff; padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom); box-sizing: border-box; }
.scan-header { display: flex; align-items: center; gap: 12px; padding: 12px 18px; flex-shrink: 0; }
.scan-icon-button { background: transparent; color: #fff; font-size: 32px; width: 32px; padding: 0; margin: 0; line-height: 36px; }
.scan-heading { display: flex; flex: 1; flex-direction: column; gap: 3px; }
.scan-title { font-size: 18px; font-weight: 650; }
.scan-subtitle, .scan-count, .scan-muted { font-size: 12px; color: #a9bcb5; }
.scan-status { text-align: center; padding: 8px 14px 12px; font-size: 12px; line-height: 18px; flex-shrink: 0; }
.scan-stage { position: relative; flex: 1; min-height: 100px; background: #070d0b; overflow: hidden; touch-action: none; }
.scan-camera, .scan-outline, .scan-result { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.scan-outline { pointer-events: none; z-index: 2; }
.scan-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 16px; text-align: center; font-size: 14px; }
.scan-empty-symbol { font-size: 48px; color: #49d4b4; }
.scan-controls { flex-shrink: 0; padding: 14px 22px 18px; }
.scan-mode-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.scan-mode-toggle { display: flex; align-items: center; gap: 7px; padding: 6px 10px; margin: 0; background: #293b33; color: #e4eee8; border-radius: 20px; font-size: 12px; line-height: 20px; }
.scan-mode-toggle.active { background: #125c49; color: #baffea; }
.scan-toggle-dot { width: 7px; height: 7px; border-radius: 50%; background: #7e978d; }
.scan-mode-toggle.active .scan-toggle-dot { background: #35efbd; }
.scan-progress { height: 3px; margin: 9px 0 10px; background: #233a30; overflow: hidden; border-radius: 4px; }
.scan-progress view { height: 3px; background: #30dfb6; transition: width 0.2s linear; }
.scan-actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.scan-side-action { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 6px; padding: 0; margin: 0; font-size: 11px; line-height: 18px; background: transparent; color: #e4eee8; }
.scan-action-icon { font-size: 30px; height: 36px; line-height: 36px; }
.scan-shutter { display: flex; align-items: center; justify-content: center; width: 72px; height: 72px; margin: 0; padding: 5px; border: 3px solid #00d6b2; border-radius: 50%; background: transparent; }
.scan-shutter-inner { width: 56px; height: 56px; border-radius: 50%; background: #f5faf7; }
.scan-thumb-slot { display: flex; align-items: center; justify-content: center; width: 34px; height: 42px; border-radius: 4px; background: #fff; box-shadow: 3px -3px 0 #b0c4bb; }
.scan-thumb { width: 30px; height: 38px; border-radius: 3px; }
.scan-thumb-arrived { animation: scan-thumb-arrive .28s ease-out; }
.scan-capture-flight { position: absolute; z-index: 20; transform-origin: top left; pointer-events: none; overflow: hidden; background: #fff; border-radius: 6px; box-shadow: 0 8px 28px #0008; transition: transform .52s cubic-bezier(.3,.1,.25,1), border-radius .52s; }
.scan-capture-moving { border-radius: 3px; }
.scan-capture-photo { display: block; width: 100%; height: 100%; }
@keyframes scan-thumb-arrive { 0%, 100% { transform: scale(1); } 45% { transform: scale(1.16); } }
.scan-primary, .scan-secondary { font-size: 14px; line-height: 22px; padding: 11px 16px; margin: 0; border-radius: 10px; font-weight: 600; }
.scan-primary { color: #052c21; background: #31dfb3; }
.scan-secondary { color: #e6f5ee; background: #263d33; }
.scan-finish { width: 100%; margin-top: 12px; }
.scan-text-button { background: transparent; color: #6ee2c1; font-size: 12px; line-height: 20px; padding: 4px; }
.scan-next { margin: 0 auto 8px; }
.scan-error-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.scan-error-detail { display: block; margin-top: 5px; overflow-wrap: anywhere; word-break: break-all; }
.scan-error-actions .scan-text-button { margin: 4px 0 0; padding: 0; }
.scan-error { background: #502d27; color: #ffe4d9; font-size: 12px; line-height: 19px; padding: 9px 16px; flex-shrink: 0; }
.scan-pagination { display: flex; align-items: center; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
.scan-pagination button { color: #e4eee8; background: transparent; font-size: 12px; margin: 0; padding: 6px 0; }
.scan-review-actions { display: flex; gap: 10px; margin-top: 10px; }
.scan-review-actions button { flex: 1; }
.scan-original-note { padding: 0 14px 8px; text-align: center; color: #a9bcb5; font-size: 11px; }
.scan-hidden-canvas { position: fixed; left: -5000px; top: -5000px; width: 2px; height: 2px; pointer-events: none; }
/* #ifdef MP-WEIXIN */
.scan-header { padding-right: 104px; }
.scan-count { display: none; }
/* #endif */
/* #ifdef H5 */
@media (min-width: 600px) { .scanner-page { max-width: 560px; left: 50%; right: auto; width: 100%; transform: translateX(-50%); } }
/* #endif */
</style>
