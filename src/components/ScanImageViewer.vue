<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onResize } from "@dcloudio/uni-app";
import { ScanImageViewport, scanPageSwipe } from "../platform/scanImageViewport.js";

const props = defineProps({ src: { type: String, required: true }, urls: { type: Array, default: () => [] } });
const emit = defineEmits(["page"]);
const instance = getCurrentInstance(), viewport = new ScanImageViewport();
const view = ref({ ...viewport.view }), size = ref({ width: 1, height: 1 });
const transform = computed(() => ({ transform: `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.scale})` }));
let rect = { left: 0, top: 0, width: 1, height: 1 }, observer, moved = false, startPoint, suppressClickUntil = 0, disposed = false;
let swipeStart, swipeEnd, swipeTime = 0, multiTouch = false, swipeScale = 1;
const update = value => { view.value = { ...value }; };
function points(event) { return Array.from(event.touches || []).slice(0, 2).map(t => ({ x: t.clientX - rect.left, y: t.clientY - rect.top })); }
async function measure() {
  await nextTick();
  if (disposed) return;
  uni.createSelectorQuery().in(instance.proxy).select(".scan-image-viewer").boundingClientRect(value => {
    if (disposed || !value?.width || !value?.height) return;
    const changed = value.width !== rect.width || value.height !== rect.height;
    rect = value;
    if (changed) update(viewport.resize({ width: rect.width, height: rect.height, imageWidth: size.value.width, imageHeight: size.value.height }));
  }).exec();
}
function loaded(event) {
  size.value = event.detail;
  update(viewport.resize({ width: rect.width, height: rect.height, imageWidth: size.value.width, imageHeight: size.value.height }));
  measure();
}
function start(event) {
  const touches = points(event);
  if (touches.length === 1) { swipeStart = touches[0]; swipeEnd = touches[0]; swipeTime = Date.now(); multiTouch = false; swipeScale = view.value.scale; }
  else multiTouch = true;
  moved = touches.length > 1; startPoint = touches[0]; viewport.start(touches);
}
function move(event) {
  const touches = points(event);
  if (touches.length > 1) multiTouch = true;
  if (touches[0]) swipeEnd = touches[0];
  if (touches.length > 1 || startPoint && touches[0] && Math.hypot(touches[0].x - startPoint.x, touches[0].y - startPoint.y) > 6) moved = true;
  update(viewport.move(touches));
}
function end(event) {
  if (moved) suppressClickUntil = Date.now() + 400;
  if (!(event.touches || []).length) {
    const change = scanPageSwipe(swipeStart, swipeEnd, { scale: Math.max(swipeScale, view.value.scale), multiTouch, duration: Date.now() - swipeTime, width: rect.width });
    swipeStart = null;
    if (change) emit("page", change);
  }
  viewport.start(points(event));
}
function cancel() { swipeStart = null; multiTouch = true; viewport.start([]); suppressClickUntil = Date.now() + 400; }
function preview() {
  if (Date.now() < suppressClickUntil) return;
  uni.previewImage({ urls: props.urls.length ? props.urls : [props.src], current: props.src });
}
function wheel(event) {
  suppressClickUntil = Date.now() + 400;
  update(viewport.atPoint(view.value.scale * Math.exp(-event.deltaY * .002), { x: event.clientX - rect.left, y: event.clientY - rect.top }));
}
watch(() => props.src, () => { cancel(); update(viewport.reset()); size.value = { width: 1, height: 1 }; });
onMounted(() => {
  measure();
  // #ifdef H5
  if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(measure); observer.observe(instance.proxy.$el); }
  // #endif
});
onResize(measure);
onUnmounted(() => { disposed = true; observer?.disconnect(); cancel(); });
</script>

<template>
  <view class="scan-image-viewer" aria-label="扫描图片，原倍率左右滑动翻页，双指放大后拖动，轻点查看全图" @touchstart.stop="start" @touchmove.stop.prevent="move" @touchend.stop="end" @touchcancel.stop="cancel" @click.stop="preview" @wheel.prevent="wheel">
    <image class="scan-result scan-zoom-image" :src="src" mode="aspectFit" :style="transform" @load="loaded" />
  </view>
</template>

<style scoped>
.scan-image-viewer { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
.scan-zoom-image { position: absolute; inset: 0; width: 100%; height: 100%; transform-origin: center center; pointer-events: none; }
/* #ifdef H5 */
.scan-image-viewer { cursor: zoom-in; }
.scan-zoom-image { user-select: none; will-change: transform; }
/* #endif */
</style>
