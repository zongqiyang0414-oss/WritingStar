<script setup>
import { computed, getCurrentInstance, nextTick, ref, shallowRef, watch } from "vue";
import { onHide, onLoad, onReady, onResize, onShow, onUnload } from "@dcloudio/uni-app";
import { enhanceDocument, rectifyDocument } from "../../platform/documentScan.js";
import { analyzePaperCapture, captureStudentCode } from "../../platform/paperScanCapture.js";
import { AutoScanGate } from "../../platform/autoScan.js";
import { clamp, fitRect, validQuad } from "../../platform/scanGeometry.js";
import { MAX_PHOTOS } from "../../platform/photos.js";
import { authorizeScanCamera, chooseScanSource, createScanRenderer, openScanSettings, persistScanPages, startNativeFrames, takeNativePhoto } from "../../platform/scanner.js";
// #ifdef H5
import { openBrowserCamera } from "../../platform/scanner.js";
// #endif

const instance = getCurrentInstance().proxy;
const mode = ref("live"), automatic = ref(false), busy = ref(false), saving = ref(false), cameraMounted = ref(false), cameraReady = ref(false);
const realtime = ref(true), starting = ref(false), error = ref(""), notice = ref("将整张作业放入画面，四周留出一些背景");
const outlineUrl = ref(""), progress = ref(0), waiting = ref(false), pages = shallowRef([]), selected = ref(0), capacity = ref(MAX_PHOTOS);
const paperBatch = ref(false);
const pending = shallowRef(null), corners = ref([]), stage = ref({ width: 300, height: 400, left: 0, top: 0 });
const current = computed(() => pages.value[selected.value]);
const full = computed(() => pages.value.length >= capacity.value);
const fit = computed(() => pending.value ? fitRect(pending.value.width, pending.value.height, stage.value.width, stage.value.height) : stage.value);
const frameText = computed(() => busy.value ? "正在裁切、矫正并增强纸面…" : full.value ? "本次页数已满，请检查后完成" : waiting.value && automatic.value ? "本页已扫描，请移开后放入下一张" : notice.value);
const gate = new AutoScanGate();
const initialized = ref(false), delivered = ref(false);
let renderer, nativeContext, browserCamera, stopFrames, channel, foreground = true, disposed = false;
let epoch = 0, lastFrame = 0, drawing = false, lastDetection = null, dragging = -1, replacing = -1, choosing = false;

onLoad(options => {
  paperBatch.value = options?.batch === "paper";
  const maximum = paperBatch.value ? 60 : MAX_PHOTOS;
  const count = Number(options?.remaining);
  capacity.value = Number.isFinite(count) && count > 0 ? Math.min(maximum, Math.floor(count)) : maximum;
  channel = instance.getOpenerEventChannel?.();
});
onReady(async () => {
  try {
    renderer = await createScanRenderer(instance);
    initialized.value = true;
    if (disposed) { renderer.dispose(); return; }
    await measure();
    if (foreground) await startCamera();
  } catch (failure) { error.value = failure.message || "扫描初始化失败，请返回重试。"; }
});
onShow(() => { foreground = true; });
onResize(async () => { await nextTick(); if (!disposed) await measure(); });
watch([mode, error, () => pages.value.length, waiting], async () => { await nextTick(); if (!disposed) await measure(); });
onHide(() => { foreground = false; releaseCamera(); });
onUnload(() => {
  disposed = true; releaseCamera(); renderer?.dispose();
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
  epoch++; stopFrames?.(); stopFrames = null; browserCamera?.close(); browserCamera = null;
  nativeContext = null; cameraMounted.value = false; cameraReady.value = false; starting.value = false;
  lastDetection = null; gate.restart(); progress.value = 0; clearOutline();
}
async function startCamera() {
  if (!initialized.value || disposed || !foreground || starting.value || busy.value || full.value) return;
  releaseCamera();
  mode.value = "live"; error.value = ""; starting.value = true; realtime.value = true;
  notice.value = "正在打开相机…";
  const token = epoch;
  try {
    await nextTick(); await measure(); await authorizeScanCamera();
    if (disposed || !foreground || token !== epoch) return;
    // #ifdef MP-WEIXIN
    cameraMounted.value = true;
    // #endif
    // #ifdef H5
    const camera = await openBrowserCamera(document.getElementById("scan-browser-camera"), frame => receiveFrame(frame));
    if (disposed || !foreground || token !== epoch) { camera.close(); return; }
    browserCamera = camera; cameraReady.value = true; starting.value = false;
    notice.value = "将整张作业放入画面，四周留出一些背景";
    // #endif
  } catch (failure) {
    if (token !== epoch || disposed) return;
    releaseCamera(); notice.value = "相机暂未开启，也可以从相册扫描";
    error.value = failure.message || "无法打开相机，请检查权限后重试。";
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
function cameraError() { releaseCamera(); error.value = "相机未能启动，请检查相机权限或稍后重试。"; }
function cameraStopped() { if (cameraMounted.value) { releaseCamera(); notice.value = "相机已暂停，点击继续开启"; } }
async function settings() {
  try { await openScanSettings(); if (foreground) await startCamera(); }
  catch { error.value = "无法打开设置，请在微信小程序设置中开启相机权限。"; }
}
async function receiveFrame(frame) {
  const now = Date.now();
  if (disposed || !foreground || !cameraReady.value || mode.value !== "live" || busy.value || drawing || full.value || now - lastFrame < 280) return;
  lastFrame = now;
  const token = epoch;
  try {
    const detection = analyzePaperCapture(frame); lastDetection = detection;
    const state = gate.update(detection, now); progress.value = state.progress; waiting.value = state.waiting;
    if (detection) {
      drawing = true;
      const path = await renderer.drawOutline(detection.corners, frame.width, frame.height, stage.value);
      if (token !== epoch || disposed) { renderer.remove(path); return; }
      const old = outlineUrl.value; outlineUrl.value = path; if (old) renderer.remove(old);
      notice.value = automatic.value ? "已找到纸张，请保持稳定" : "已框住纸张，点击下方拍摄";
    } else {
      clearOutline(); notice.value = "寻找纸张边缘，请放平作业并避开遮挡";
    }
    if (automatic.value && realtime.value && state.capture && token === epoch) await capture(true);
  } catch {
    realtime.value = false; automatic.value = false; clearOutline();
    notice.value = "实时识别暂不可用，可以点击拍摄后调整边角";
  } finally { drawing = false; }
}
function toggleAutomatic() {
  automatic.value = !automatic.value; gate.restart(); progress.value = 0;
}
function nextPage() { gate.nextPage(); waiting.value = false; progress.value = 0; }

async function capture(fromAutomatic = false) {
  if (!cameraReady.value || busy.value || full.value) return;
  busy.value = true; error.value = "";
  const token = epoch, detection = lastDetection;
  try {
    let source;
    // #ifdef H5
    source = browserCamera.capture();
    // #endif
    // #ifdef MP-WEIXIN
    source = await takeNativePhoto(nativeContext);
    renderer.track(source);
    // #endif
    if (token !== epoch || disposed) { renderer.remove(source); return; }
    // Lock immediately; an interrupted processing attempt must not trigger a burst.
    gate.captured(detection); waiting.value = true; progress.value = 0;
    await processSource(source, fromAutomatic, token);
  } catch (failure) {
    if (!disposed) error.value = failure.message || "扫描失败，请重新拍摄。";
    automatic.value = false;
  } finally { busy.value = false; }
}
async function processSource(source, fromAutomatic, token) {
  const image = await renderer.read(source);
  if (token !== epoch || disposed) throw new Error("扫描已暂停，请重新拍摄。");
  // Detect again on the still image: frame and full-quality photo FOVs can differ.
  const detection = analyzePaperCapture(image);
  if (!detection || detection.confidence < 0.7) {
    busy.value = false;
    await editSource({ source, width: image.width, height: image.height, corners: detection?.corners }, -1);
    notice.value = "未识别到完整边缘，请拖动四角框住整张纸";
    return;
  }
  const output = await makePage(source, image, detection.corners, token);
  pages.value = [...pages.value, output]; selected.value = pages.value.length - 1;
  notice.value = "扫描件已加入，请移开本页后放入下一张";
  if (!fromAutomatic || full.value) { busy.value = false; reviewPage(selected.value); }
}
async function makePage(source, image, quad, token) {
  const cancelled = () => disposed || token !== epoch || !foreground;
  let code = captureStudentCode(image);
  const warped = await rectifyDocument(image, quad, { cancelled });
  if (!code) code = captureStudentCode(warped);
  const enhanced = await enhanceDocument(warped, cancelled);
  const url = await renderer.exportImage(enhanced);
  if (cancelled()) { renderer.remove(url); throw new Error("扫描已暂停，请重试。"); }
  return { source, code, width: image.width, height: image.height, corners: quad.map(p => ({ ...p })),
    photo: { id: `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`, url, name: "作业扫描件.jpg", sample: false } };
}
async function importPage() {
  if (busy.value || choosing || full.value) return;
  choosing = true; error.value = ""; releaseCamera();
  try {
    const source = await chooseScanSource();
    if (disposed || !source) return;
    renderer.track(source); busy.value = true;
    await processSource(source, false, epoch);
  } catch (failure) { if (!disposed) error.value = failure.message || "无法扫描这张图片，请重试。"; }
  finally { choosing = false; busy.value = false; }
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
    pages.value = updated; pending.value = null; mode.value = "review";
  } catch (failure) { if (!disposed) error.value = failure.message || "图片处理失败，请重试。"; }
  finally { busy.value = false; }
}
function cancelCorners() {
  if (busy.value) return;
  if (replacing < 0) renderer.remove(pending.value?.source);
  pending.value = null; error.value = "";
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
      <button class="scan-icon-button" aria-label="退出扫描" :disabled="busy" @click="leave">×</button>
      <view class="scan-heading"><text class="scan-title">作业扫描</text><text class="scan-subtitle">{{ mode === 'corners' ? '调整纸张四角' : mode === 'review' ? '检查扫描效果' : '自动框选 · 清晰留存' }}</text></view>
      <text class="scan-count">{{ pages.length }} / {{ capacity }} 页</text>
    </view>
    <view class="scan-status" role="status">{{ mode === 'live' ? frameText : busy ? (saving ? '正在保存扫描件…' : '正在裁切、矫正并增强纸面…') : mode === 'corners' ? '拖动四角框住纸张，保留完整笔迹' : '已裁切矫正 · 纸面增强，请检查笔迹和边缘' }}</view>
    <view id="scan-stage" class="scan-stage" @touchmove.stop.prevent="moveCorner" @touchend="dragging = -1" @touchcancel="dragging = -1" @mousemove="moveCorner" @mouseup="dragging = -1" @mouseleave="dragging = -1">
      <template v-if="mode === 'live'">
        <!-- #ifdef MP-WEIXIN -->
        <camera v-if="cameraMounted" id="scan-camera" class="scan-camera" device-position="back" flash="off" frame-size="medium" resolution="high" @initdone="nativeReady" @error="cameraError" @stop="cameraStopped">
          <cover-image v-if="outlineUrl" class="scan-outline" :src="outlineUrl" />
        </camera>
        <!-- #endif -->
        <!-- #ifdef H5 -->
        <view id="scan-browser-camera" class="scan-camera" />
        <image v-if="outlineUrl" class="scan-outline" :src="outlineUrl" mode="scaleToFill" />
        <!-- #endif -->
        <view v-if="!cameraMounted && !cameraReady" class="scan-empty">
          <view class="scan-empty-symbol">▣</view>
          <text>{{ starting ? '正在开启相机' : '对准作业，扫描成清晰的纸面' }}</text>
          <text class="scan-muted">纸张放平，保持光线均匀</text>
          <button v-if="!starting" class="scan-primary" :disabled="busy || full || !initialized" @click="startCamera">{{ full ? '已达到页数上限' : '开启相机' }}</button>
          <!-- #ifdef MP-WEIXIN -->
          <button v-if="error && !starting" class="scan-text-button" @click="settings">打开相机权限设置</button>
          <!-- #endif -->
        </view>
      </template>
      <image v-else-if="mode === 'review' && current" class="scan-result" :src="current.photo.url" mode="aspectFit" />
      <template v-else-if="mode === 'corners' && pending">
        <image class="scan-result" :src="pending.source" mode="aspectFit" />
        <view v-for="(point, index) in corners" :key="'edge-' + index" class="scan-edit-edge" :style="edgeStyle(point, index)" />
        <view v-for="(point, index) in corners" :key="index" class="scan-corner" :style="pointStyle(point)" @touchstart.stop.prevent="dragging = index" @mousedown.stop.prevent="dragging = index">{{ index + 1 }}</view>
      </template>
    </view>
    <view v-if="error" class="scan-error" role="alert">{{ error }}</view>
    <view class="scan-controls">
      <template v-if="mode === 'live'">
        <view class="scan-mode-row">
          <button :class="['scan-mode-toggle', { active: automatic }]" :disabled="busy || !realtime" :aria-pressed="automatic" @click="toggleAutomatic"><text class="scan-toggle-dot" />自动扫描 {{ automatic ? '已开启' : '已关闭' }}</button>
          <text class="scan-muted">{{ automatic ? '放稳后自动拍摄' : '点击按钮拍摄' }}</text>
        </view>
        <view class="scan-progress"><view :style="{ width: automatic && !waiting ? Math.round(progress * 100) + '%' : '0%' }" /></view>
        <button v-if="automatic && waiting" class="scan-text-button scan-next" :disabled="busy" @click="nextPage">已换好下一页，继续识别</button>
        <view class="scan-actions">
          <button class="scan-side-action" :disabled="busy || full || !initialized" @click="importPage"><text class="scan-action-icon">▧</text><text>从相册扫描</text></button>
          <button class="scan-shutter" aria-label="拍摄扫描" :disabled="busy || !cameraReady || full" @click="capture(false)"><view class="scan-shutter-inner" /></button>
          <button class="scan-side-action" :disabled="busy || !pages.length" @click="reviewPage(pages.length - 1)"><image v-if="pages.length" class="scan-thumb" :src="pages[pages.length - 1].photo.url" mode="aspectFill" /><text v-else class="scan-action-icon">▤</text><text>已扫描 {{ pages.length }} 页</text></button>
        </view>
        <button v-if="pages.length" class="scan-primary scan-finish" :disabled="busy" @click="finish">完成，添加 {{ pages.length }} 页</button>
      </template>
      <template v-else-if="mode === 'review'">
        <view class="scan-pagination"><button :disabled="busy || selected === 0" @click="selected--">‹ 上一页</button><text>{{ selected + 1 }} / {{ pages.length }}</text><button :disabled="busy || selected >= pages.length - 1" @click="selected++">下一页 ›</button></view>
        <view class="scan-review-actions"><button class="scan-secondary" :disabled="busy" @click="editSource(current, selected)">调整边角</button><button class="scan-secondary" :disabled="busy" @click="removePage">删除此页</button></view>
        <view class="scan-review-actions"><button class="scan-secondary" :disabled="busy || full" @click="startCamera">继续扫描</button><button class="scan-primary" :disabled="busy || delivered" @click="finish">完成 {{ pages.length }} 页</button></view>
      </template>
      <template v-else>
        <view class="scan-review-actions"><button class="scan-secondary" :disabled="busy" @click="cancelCorners">取消调整</button><button class="scan-primary" :disabled="busy" @click="confirmCorners">确认并处理</button></view>
      </template>
    </view>
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
.scan-thumb { width: 30px; height: 36px; border: 1px solid #fff; border-radius: 3px; }
.scan-primary, .scan-secondary { font-size: 14px; line-height: 22px; padding: 11px 16px; margin: 0; border-radius: 10px; font-weight: 600; }
.scan-primary { color: #052c21; background: #31dfb3; }
.scan-secondary { color: #e6f5ee; background: #263d33; }
.scan-finish { width: 100%; margin-top: 12px; }
.scan-text-button { background: transparent; color: #6ee2c1; font-size: 12px; line-height: 20px; padding: 4px; }
.scan-next { margin: 0 auto 8px; }
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
