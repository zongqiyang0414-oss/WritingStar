<script setup>
import { computed, getCurrentInstance, nextTick, ref, shallowRef, watch } from "vue";
import { onHide, onLoad, onReady, onResize, onShow, onUnload } from "@dcloudio/uni-app";
import { processScanPixels } from "../../platform/scanProcessing.js";
import ScanImageViewer from "../../components/ScanImageViewer.vue";
import { LivePaperDetector, selectCaptureDetection } from "../../platform/paperScanCapture.js";
import { AutoScanGate } from "../../platform/autoScan.js";
import { clamp, fitRect, validQuad } from "../../platform/scanGeometry.js";
import { MAX_PHOTOS } from "../../platform/photos.js";
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
const pending = shallowRef(null), corners = ref([]), stage = ref({ width: 300, height: 400, left: 0, top: 0 });
const captureFlight = shallowRef(null), thumbnailPulse = ref(false);
const flightStyle = computed(() => {
  const flight = captureFlight.value;
  return flight ? { left: `${flight.left}px`, top: `${flight.top}px`, width: `${flight.width}px`, height: `${flight.height}px`,
    transform: flight.moving ? `translate(${flight.dx}px, ${flight.dy}px) scale(${flight.scale})` : "translate(0px, 0px) scale(1)" } : {};
});
const current = computed(() => pages.value[selected.value]);
const full = computed(() => pages.value.length >= capacity.value);
const fit = computed(() => pending.value ? fitRect(pending.value.width, pending.value.height, stage.value.width, stage.value.height) : stage.value);
const processingText = computed(() => [importStatus.value, processingStage.value || "正在处理扫描件…"].filter(Boolean).join(" "));
const frameText = computed(() => busy.value ? processingText.value : full.value ? "本次页数已满，请检查后完成" : waiting.value && automatic.value ? "本页已扫描，请移开后放入下一张" : notice.value);
const gate = new AutoScanGate();
const liveDetector = new LivePaperDetector();
const initialized = ref(false), delivered = ref(false);
let renderer, rendererPromise, nativeContext, browserCamera, stopFrames, channel, foreground = true, disposed = false, resumePicker;
let epoch = 0, lastFrame = 0, drawing = false, lastDetection = null, dragging = -1, replacing = -1, choosing = false;
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
  if (importQueue.value.length && !busy.value && !pending.value) processImportQueue();
});
onResize(async () => { cancelCaptureFeedback(); await nextTick(); if (!disposed) await measure(); });
watch([mode, error, () => pages.value.length, waiting], async () => { await nextTick(); if (!disposed) await measure(); });
onHide(() => { foreground = false; releaseCamera(); });
onUnload(() => {
  disposed = true; resumePicker?.(); releaseCamera(); renderer?.dispose();
});

function measure() {
  return new Promise(resolve => uni.createSelectorQuery().in(instance).select("#scan-stage").boundingClientRect(rect => {
    if (rect?.width) stage.value = rect;
    resolve();
  }).exec());
}
function clearOutline() {
  const old = outlineUrl.value; outlineUrl.value = "";
  if (old) renderer?.remove(old);
}
function releaseCamera() {
  cancelCaptureFeedback();
  epoch++; stopFrames?.(); stopFrames = null; browserCamera?.close(); browserCamera = null;
  nativeContext = null; cameraMounted.value = false; cameraReady.value = false; starting.value = false;
  lastDetection = null; lastDetectionTime = 0; lastFrame = 0; detectionErrors = 0; liveDetector.reset(); gate.restart(); progress.value = 0; waiting.value = gate.locked; clearOutline();
}
function cancelCaptureFeedback() {
  flightSequence++; clearTimeout(flightStart); clearTimeout(flightEnd); clearTimeout(pulseEnd);
  captureFlight.value = null; thumbnailPulse.value = false; flightResolve?.(false); flightResolve = null;
}
async function animateCapture(entry, token) {
  cancelCaptureFeedback();
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
    releaseCamera(); notice.value = "相机暂未开启，也可以从相册扫描";
    showFailure(failure);
  }
}
function nativeReady() {
  if (!cameraMounted.value || !foreground || disposed) return;
  nativeContext = uni.createCameraContext(); cameraReady.value = true; starting.value = false;
  notice.value = "将整张作业放入画面，四周留出一些背景";
  stopFrames?.();
  stopFrames = startNativeFrames(nativeContext, frame => receiveFrame({ ...frame, data: new Uint8ClampedArray(frame.data) }), () => {
    realtime.value = false; automatic.value = false; clearOutline();
    notice.value = "此设备暂不支持实时框选；点击拍摄后识别边角";
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
    : "在 Chrome 地址栏的网站信息中，允许此网站使用相机。手机还需在系统设置中允许 Chrome 使用相机。请通过 HTTPS 地址直接打开网站；嵌入页可能不支持授权。也可以从相册导入。" });
}
async function privacyContract() {
  try { await openScanPrivacyContract(); }
  catch (failure) { showFailure(failure); }
}
function copyError() { uni.setClipboardData({ data: `写字星 v0.14.0 扫描
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
      notice.value = detection.autoEligible === false ? "边缘尚不完整，请露出纸张四边；也可拍摄后调角"
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
    notice.value = "正在重新识别，也可以点击拍摄后调整边角";
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
function nextPage() { gate.nextPage(); waiting.value = false; progress.value = 0; }

async function capture(fromAutomatic = false) {
  if (!cameraReady.value || busy.value || full.value) return;
  busy.value = true; error.value = "";
  const token = epoch, detection = Date.now() - lastDetectionTime < 650 ? lastDetection : null;
  try {
    let source;
    // #ifdef H5
    source = browserCamera.capture();
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
  } catch (failure) {
    if (!disposed) showFailure(failure);
    automatic.value = false;
  } finally { busy.value = false; }
}
async function processSource(source, fromAutomatic, token, fromImport = false, previewDetection = null, sameFrame = false) {
  processingStage.value = "正在读取照片…";
  await ensureRenderer();
  const image = await renderer.read(source);
  if (token !== epoch || disposed) throw new Error("扫描已暂停，请重新拍摄。");
  const detection = selectCaptureDetection(image, previewDetection, sameFrame);
  if (!detection || detection.confidence < 0.7) {
    busy.value = false;
    await editSource({ source, width: image.width, height: image.height, corners: detection?.corners, fromImport }, -1);
    notice.value = "未识别到完整边缘，请拖动四角框住整张纸";
    return;
  }
  const output = await makePage(source, image, detection.corners, token);
  pages.value = [...pages.value, output]; selected.value = pages.value.length - 1;
  notice.value = "扫描件已加入，请移开本页后放入下一张";
  if (!fromImport) {
    const feedback = animateCapture(output, token);
    // Automatic scanning remains live while the photo flies into the tray.
    // Manual capture opens review after landing so the destination stays visible.
    if (!fromAutomatic || full.value) await feedback;
  }
  if (token !== epoch || disposed || !foreground) return;
  if (!fromImport && (!fromAutomatic || full.value)) { busy.value = false; reviewPage(selected.value); }
}
async function makePage(source, image, quad, token) {
  const cancelled = () => disposed || token !== epoch || !foreground;
  const { image: enhanced, code } = await processScanPixels(image, quad, { cancelled, readCode: paperBatch.value,
    onStage: text => { if (!cancelled()) processingStage.value = text; } });
  processingStage.value = "正在生成扫描件…";
  const url = await renderer.exportImage(enhanced);
  if (cancelled()) { renderer.remove(url); throw new Error("扫描已暂停，请重试。"); }
  return { source, code, width: image.width, height: image.height, previewWidth: enhanced.width, previewHeight: enhanced.height, corners: quad.map(p => ({ ...p })),
    photo: { id: `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`, url, name: "作业扫描件.jpg", sample: false } };
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
    importQueue.value = sources;
    await processImportQueue();
  } catch (failure) { if (!disposed) showFailure(failure, sourceType); }
  finally { choosing = false; busy.value = false; }
}
async function processImportQueue() {
  busy.value = true;
  try {
    while (importQueue.value.length && !full.value && !disposed && foreground) {
      const source = importQueue.value[0];
      importQueue.value = importQueue.value.slice(1);
      importStatus.value = `正在处理所选图片，还剩 ${importQueue.value.length + 1} 张…`;
      const token = epoch;
      try { await processSource(source, false, token, true); }
      catch (failure) {
        if (disposed) return;
        if (!foreground || token !== epoch) { importQueue.value = [source, ...importQueue.value]; return; }
        renderer.remove(source); showFailure(failure, "album");
      }
      if (mode.value === "corners") return;
    }
    if (!disposed && pages.value.length) mode.value = "review";
  } finally {
    busy.value = false; importStatus.value = "";
    if (!disposed && foreground && importQueue.value.length && !pending.value && !full.value) nextTick(processImportQueue);
  }
}
function reviewPage(index) {
  if (busy.value || !pages.value[index]) return;
  releaseCamera(); selected.value = index; mode.value = "review"; error.value = "";
}
async function editSource(entry, index) {
  releaseCamera(); replacing = index; pending.value = entry; mode.value = "corners";
  corners.value = entry.corners?.map(p => ({ ...p })) || [{ x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 }, { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 }];
  await nextTick(); await measure();
}
function pointStyle(point) { return { left: `${fit.value.left + point.x * fit.value.width}px`, top: `${fit.value.top + point.y * fit.value.height}px` }; }
function edgeStyle(point, index) {
  const next = corners.value[(index + 1) % 4];
  const dx = (next.x - point.x) * fit.value.width, dy = (next.y - point.y) * fit.value.height;
  return { ...pointStyle(point), width: `${Math.hypot(dx, dy)}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)` };
}
function moveCorner(event) {
  if (dragging < 0 || busy.value) return;
  const touch = event.touches?.[0] || event;
  corners.value[dragging] = { x: clamp((touch.clientX - stage.value.left - fit.value.left) / fit.value.width), y: clamp((touch.clientY - stage.value.top - fit.value.top) / fit.value.height) };
}
async function confirmCorners() {
  if (busy.value || !pending.value) return;
  if (!validQuad(corners.value)) { error.value = "请按顺序框住纸张四角，边线不能交叉。"; return; }
  busy.value = true; error.value = ""; const token = epoch;
  try {
    const source = pending.value.source, image = await renderer.read(source);
    const output = await makePage(source, image, corners.value, token);
    const updated = [...pages.value];
    if (replacing >= 0) { renderer.remove(updated[replacing].photo.url); updated[replacing] = output; selected.value = replacing; }
    else { updated.push(output); selected.value = updated.length - 1; }
    const newlyCaptured = replacing < 0 && !pending.value.fromImport;
    pages.value = updated; pending.value = null;
    if (newlyCaptured) {
      mode.value = "live";
      await animateCapture(output, token);
    }
    if (token !== epoch || disposed || !foreground) return;
    mode.value = "review";
  } catch (failure) { if (!disposed) error.value = failure.message || "图片处理失败，请重试。"; }
  finally { busy.value = false; }
  if (!pending.value && importQueue.value.length) await processImportQueue();
}
async function cancelCorners() {
  if (busy.value) return;
  if (replacing < 0) renderer.remove(pending.value?.source);
  pending.value = null; error.value = "";
  if (importQueue.value.length) { mode.value = "live"; await processImportQueue(); return; }
  if (pages.value.length) mode.value = "review";
  else { mode.value = "live"; startCamera(); }
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
  if (!channel?.emit) { error.value = "请从作业提交页进入扫描，以便保存扫描件。"; return; }
  releaseCamera(); busy.value = saving.value = true; error.value = "";
  const token = epoch;
  try {
    const saved = await persistScanPages(renderer, pages.value.map(entry => entry.photo), () => disposed || token !== epoch);
    const result = paperBatch.value ? saved.map((photo, index) => ({
      id: photo.id, photo, code: pages.value[index].code || "", corrected: true, manual: false,
    })) : saved;
    channel.emit("scanned", result); delivered.value = true;
    uni.navigateBack({ fail: () => { error.value = "扫描件已添加，请返回作业提交页。"; } });
  } catch (failure) {
    if (!disposed) error.value = failure.message || "保存失败，扫描件仍在，请重试。";
  } finally { busy.value = saving.value = false; }
}
function leave() {
  if (busy.value) return;
  if (mode.value === "corners") { cancelCorners(); return; }
  if (mode.value === "review") { mode.value = "live"; startCamera(); return; }
  if (!pages.value.length && !pending.value || delivered.value) { uni.navigateBack(); return; }
  releaseCamera();
  uni.showModal({ title: "放弃本次扫描？", content: "尚未添加的扫描件将被丢弃。", confirmText: "放弃扫描", confirmColor: "#cc5544",
    success: result => { if (result.confirm) uni.navigateBack(); },
  });
}
</script>

<template>
  <view class="scanner-page">
    <view class="scan-header">
      <button class="scan-icon-button" :aria-label="mode === 'live' ? '退出扫描' : mode === 'corners' ? '取消调整' : '返回拍照界面'" :disabled="busy" @click="leave">{{ mode === 'live' ? '×' : '‹' }}</button>
      <view class="scan-heading"><text class="scan-title">作业扫描</text><text v-if="mode !== 'live'" class="scan-subtitle">{{ mode === 'corners' ? '调整纸张四角' : '检查扫描效果' }}</text></view>
      <text class="scan-count">{{ pages.length }} / {{ capacity }} 页</text>
    </view>
    <view class="scan-status" role="status">{{ mode === 'live' ? frameText : busy ? (saving ? '正在保存扫描件…' : processingText) : mode === 'corners' ? '拖动四角框住纸张，保留完整笔迹' + (importQueue.length ? ' · 后续还有 ' + importQueue.length + ' 张' : '') : '双指放大、拖动查看笔迹，轻点查看全图' }}</view>
    <view id="scan-stage" class="scan-stage" @touchmove.stop.prevent="moveCorner" @touchend="dragging = -1" @touchcancel="dragging = -1" @mousemove="moveCorner" @mouseup="dragging = -1" @mouseleave="dragging = -1">
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
          <view class="scan-empty-symbol" aria-hidden="true"><view class="scan-camera-lens" /></view>
          <text v-if="starting">正在开启相机</text>
          <button v-if="!starting" class="scan-primary" :disabled="busy || full || !initialized" @click="startCamera">{{ full ? '已达到页数上限' : '开启相机' }}</button>
          <!-- #ifdef MP-WEIXIN -->
          <button v-if="errorAction === 'mini-settings' && !starting" class="scan-text-button" @click="settings">打开小程序权限设置</button>
          <button v-if="errorAction === 'app-settings' && !starting" class="scan-text-button" @click="systemSettings">打开手机授权设置</button>
          <!-- #endif -->
        </view>
      </template>
      <ScanImageViewer v-else-if="mode === 'review' && current" :key="current.photo.id" :src="current.photo.url" :urls="pages.map(page => page.photo.url)" />
      <template v-else-if="mode === 'corners' && pending">
        <image class="scan-result" :src="pending.source" mode="aspectFit" />
        <view v-for="(point, index) in corners" :key="'edge-' + index" class="scan-edit-edge" :style="edgeStyle(point, index)" />
        <view v-for="(point, index) in corners" :key="index" class="scan-corner" :style="pointStyle(point)" @touchstart.stop.prevent="dragging = index" @mousedown.stop.prevent="dragging = index">{{ index + 1 }}</view>
      </template>
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
      <template v-if="mode === 'live'">
        <view class="scan-mode-row">
          <button :class="['scan-mode-toggle', { active: automatic }]" :disabled="busy || !realtime" :aria-pressed="automatic" @click="toggleAutomatic"><text class="scan-toggle-dot" />自动扫描 {{ automatic ? '已开启' : '已关闭' }}</button>
          <text class="scan-muted">{{ automatic ? '放稳后自动拍摄' : '点击按钮拍摄' }}</text>
        </view>
        <view class="scan-progress"><view :style="{ width: automatic && !waiting ? Math.round(progress * 100) + '%' : '0%' }" /></view>
        <button v-if="automatic && waiting" class="scan-text-button scan-next" :disabled="busy" @click="nextPage">已换好下一页，继续识别</button>
        <view class="scan-actions">
          <button class="scan-side-action" :disabled="busy || full || !initialized" @click="importPage('album')"><text class="scan-action-icon">▧</text><text>从相册扫描</text></button>
          <button class="scan-shutter" aria-label="拍摄扫描" :disabled="busy || !cameraReady || full" @click="capture(false)"><view class="scan-shutter-inner" /></button>
          <button class="scan-side-action" :disabled="busy || !pages.length" @click="reviewPage(pages.length - 1)"><view v-if="pages.length" id="scan-capture-thumb" :class="['scan-thumb-slot', { 'scan-thumb-arrived': thumbnailPulse }]"><image class="scan-thumb" :src="pages[pages.length - 1].photo.url" mode="aspectFit" /></view><text v-else class="scan-action-icon">▤</text><text>已扫描 {{ pages.length }} 页</text></button>
        </view>
        <button v-if="pages.length" class="scan-primary scan-finish" :disabled="busy" @click="finish">完成，添加 {{ pages.length }} 页</button>
      </template>
      <template v-else-if="mode === 'review'">
        <view class="scan-pagination"><button :disabled="busy || selected === 0" @click="selected--">‹ 上一页</button><text>{{ selected + 1 }} / {{ pages.length }}</text><button :disabled="busy || selected >= pages.length - 1" @click="selected++">下一页 ›</button></view>
        <view class="scan-review-actions"><button class="scan-secondary" :disabled="busy" @click="editSource(current, selected)">调整边角</button><button class="scan-secondary" :disabled="busy" @click="removePage">删除此页</button></view>
        <view class="scan-review-actions"><button class="scan-secondary" :disabled="busy || delivered" @click="finish">完成 {{ pages.length }} 页</button><button class="scan-primary" :disabled="busy || full" @click="startCamera">继续扫描</button></view>
      </template>
      <template v-else>
        <view class="scan-review-actions"><button class="scan-secondary" :disabled="busy" @click="cancelCorners">{{ importQueue.length ? '跳过此张' : '取消调整' }}</button><button class="scan-primary" :disabled="busy" @click="confirmCorners">确认并处理</button></view>
      </template>
    </view>
    <!-- #ifdef H5 -->
    <view v-if="captureFlight" :class="['scan-capture-flight', { 'scan-capture-moving': captureFlight.moving }]" :style="flightStyle" aria-hidden="true"><image class="scan-capture-photo" :src="captureFlight.url" mode="scaleToFill" /></view>
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <cover-view v-if="captureFlight" :class="['scan-capture-flight', { 'scan-capture-moving': captureFlight.moving }]" :style="flightStyle"><cover-image class="scan-capture-photo" :src="captureFlight.url" /></cover-view>
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
.scan-empty-symbol { position: relative; width: 56px; height: 40px; border: 3px solid #49d4b4; border-radius: 9px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; }
.scan-empty-symbol::before { content: ''; position: absolute; width: 22px; height: 8px; border: 3px solid #49d4b4; border-bottom: 0; border-radius: 5px 5px 0 0; top: -11px; left: 14px; }
.scan-camera-lens { width: 19px; height: 19px; border: 3px solid #49d4b4; border-radius: 50%; }
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
.scan-edit-edge { position: absolute; height: 2px; transform-origin: left center; background: #00efb9; pointer-events: none; }
.scan-corner { position: absolute; width: 36px; height: 36px; margin-left: -18px; margin-top: -18px; border-radius: 50%; border: 2px solid #fff; background: #008e71; color: #fff; font-size: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 9px #0008; touch-action: none; }
.scan-hidden-canvas { position: fixed; left: -5000px; top: -5000px; width: 2px; height: 2px; pointer-events: none; }
/* #ifdef MP-WEIXIN */
.scan-header { padding-right: 104px; }
.scan-count { display: none; }
/* #endif */
/* #ifdef H5 */
@media (min-width: 600px) { .scanner-page { max-width: 560px; left: 50%; right: auto; width: 100%; transform: translateX(-50%); } }
/* #endif */
</style>
