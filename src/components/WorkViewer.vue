<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onResize } from "@dcloudio/uni-app";
import { displayPhoto } from "../services/presentation.js";
import { createScanRenderer } from "../platform/scanner.js";
import { createWorkOrientation } from "../platform/imageOrientation.js";
import { landscapePageHeight } from "../platform/pageInsets.js";

const props = defineProps({ photos: { type: Array, default: () => [] }, page: { type: Number, default: 0 }, title: { type: String, default: "作业原图" } });
const emit = defineEmits(["update:page"]);
const instance = getCurrentInstance();
let resizeObserver;
let orientation, orientationPromise, mounted = false, disposed = false, orientationEpoch = 0;
const views = new Map(), viewRevision = ref(0), orienting = ref(false), orientationError = ref("");
const width = ref(300), windowHeight = ref(0), failed = ref(false);
const index = computed(() => Math.max(0, Math.min(props.page, props.photos.length - 1)));
const current = computed(() => props.photos[index.value]);
const source = computed(() => current.value ? displayPhoto(current.value.url) : "");
const shownSource = computed(() => { viewRevision.value; return views.get(source.value)?.url || source.value; });
const height = computed(() => landscapePageHeight(width.value, windowHeight.value));
watch([() => current.value?.id, () => current.value?.url], () => { failed.value = false; orientationError.value = ""; if (mounted) correctDirection(); });
function select(page) { if (page >= 0 && page < props.photos.length) emit("update:page", page); }
function loaded(event, url) {
  if (url !== shownSource.value) return;
  failed.value = false;
}
async function ensureOrientation() {
  if (!orientationPromise) orientationPromise = nextTick().then(() => createScanRenderer(instance.proxy, {
    workSelector: "#work-orientation-canvas", outlineSelector: "#work-orientation-outline",
  })).then(renderer => {
    if (disposed) { renderer.dispose(); throw new Error("查看器已关闭。"); }
    orientation = createWorkOrientation(renderer); return orientation;
  }).catch(error => { orientationPromise = null; throw error; });
  return orientationPromise;
}
async function correctDirection(manual = false) {
  if (!source.value || disposed) return;
  // Captured scans already used the verified template/QR direction at full
  // resolution. Do not decode and re-export another smaller viewer copy.
  if (!manual && current.value?.orientationChecked) {
    if (!views.has(source.value)) views.set(source.value,{url:source.value,quarterTurns:0,automatic:true});
    viewRevision.value++;return;
  }
  const original = source.value, token = ++orientationEpoch;
  orienting.value = true; orientationError.value = "";
  try {
    const editor = await ensureOrientation();
    const result = await (manual ? editor.rotate(original) : editor.inspect(original));
    if (disposed) return;
    views.set(original, result); viewRevision.value++;
  } catch {
    if (!disposed && token === orientationEpoch && manual) orientationError.value = "方向调整未完成，请稍后重试。";
  } finally { if (!disposed && token === orientationEpoch) orienting.value = false; }
}
async function preview() {
  if (!current.value || disposed) return;
  const token = ++orientationEpoch, page = index.value;
  orienting.value = true;
  try {
    let editor;
    try { editor = await ensureOrientation(); } catch { /* Original preview remains available. */ }
    const urls = [];
    for (const photo of props.photos) {
      const original = displayPhoto(photo.url);
      let result;
      try { result = views.get(original) || (photo.orientationChecked ? {url:original,quarterTurns:0,automatic:true} : editor && await editor.inspect(original)); } catch { /* Keep unreadable/CORS originals. */ }
      if (disposed || token !== orientationEpoch) return;
      if (result) views.set(original, result);
      urls.push(result?.url || original);
    }
    viewRevision.value++;
    uni.previewImage({ urls, current: page });
  } finally { if (!disposed && token === orientationEpoch) orienting.value = false; }
}
async function measure() {
  await nextTick();
  // #ifdef H5
  windowHeight.value = window.innerHeight;
  // #endif
  // #ifdef MP-WEIXIN
  const info = uni.getWindowInfo?.() || uni.getSystemInfoSync?.() || {};
  windowHeight.value = info.windowHeight || 0;
  // #endif
  uni.createSelectorQuery().in(instance.proxy).select('.work-viewer-canvas').boundingClientRect(rect => { if (rect?.width) width.value = rect.width; }).exec();
}
onMounted(() => {
  mounted = true; correctDirection();
  measure();
  // #ifdef H5
  const element = instance.proxy.$el?.querySelector('.work-viewer-canvas');
  if (element && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(([entry]) => { if (entry.contentRect.width) width.value = entry.contentRect.width; });
    resizeObserver.observe(element);
  }
  // #endif
});
onUnmounted(() => { disposed = true; orientationEpoch++; resizeObserver?.disconnect(); orientation?.dispose(); views.clear(); });
onResize(measure);
</script>

<template>
  <view class="work-viewer">
    <view class="work-viewer-heading"><view class="strong">{{ title }}</view><view class="work-viewer-heading-actions"><button v-if="current" class="text-button work-viewer-rotate" aria-label="顺时针旋转作业90度" :disabled="orienting" @click="correctDirection(true)">↻ 旋转</button><text class="tiny subtle">第 {{ photos.length ? index + 1 : 0 }} / {{ photos.length }} 页</text></view></view>
    <template v-if="current">
      <view class="work-viewer-canvas" :style="{ height: height + 'px' }">
        <image :key="shownSource" class="work-viewer-image" :src="shownSource" mode="aspectFit" :aria-label="`查看作业全图，第${index + 1}页`" @load="loaded($event, shownSource)" @error="failed = true" @click="preview" />
      </view>
      <view v-if="orientationError" class="small subtle work-viewer-hint">{{ orientationError }}</view>
      <view v-if="failed" class="small subtle work-viewer-hint">图片暂时无法加载，请稍后重试或全屏查看。</view>
      <view v-if="photos.length > 1" class="work-viewer-pagination"><button class="secondary" :disabled="index <= 0" @click="select(index - 1)">上一页</button><view class="work-viewer-pages"><button v-for="(photo, pageIndex) in photos" :key="photo.id || pageIndex" :class="['work-viewer-page', { active: index === pageIndex }]" :aria-label="`查看第${pageIndex + 1}页`" :aria-pressed="index === pageIndex" @click="select(pageIndex)">{{ pageIndex + 1 }}</button></view><button class="secondary" :disabled="index >= photos.length - 1" @click="select(index + 1)">下一页</button></view>
    </template>
    <view v-else class="small subtle work-viewer-hint">暂无可查看的作品图片。</view>
    <!-- #ifdef MP-WEIXIN -->
    <canvas id="work-orientation-canvas" type="2d" class="work-orientation-canvas" />
    <canvas id="work-orientation-outline" type="2d" class="work-orientation-canvas" />
    <!-- #endif -->
  </view>
</template>

<style scoped>
.work-viewer { min-width: 0; width: 100%; }
.work-viewer-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.work-viewer-heading-actions { display: flex; align-items: center; gap: 10px; }
.work-viewer-rotate { padding: 0; font-size: 12px; }
.work-orientation-canvas { position: fixed; left: -10000px; top: 0; width: 1px; height: 1px; pointer-events: none; }
.work-viewer-canvas { display: block; width: 100%; overflow: hidden; background: #edf1ed; border-radius: 9px; }
.work-viewer-image { display: block; width: 100%; height: 100%; }
.work-viewer-hint { margin-top: 10px; font-size: 11px; line-height: 1.7; }
.work-viewer-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.work-viewer-pagination .secondary { width: auto; flex-shrink: 0; padding: 7px 10px; font-size: 12px; }
.work-viewer-pages { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.work-viewer-page { padding: 5px 9px; font-size: 12px; background: #eff3ed; border-radius: 6px; color: #536c5d; }
.work-viewer-page.active { background: #26765a; color: white; }
</style>
