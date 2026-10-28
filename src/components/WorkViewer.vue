<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onResize } from "@dcloudio/uni-app";
import { displayPhoto } from "../services/presentation.js";

const props = defineProps({ photos: { type: Array, default: () => [] }, page: { type: Number, default: 0 }, title: { type: String, default: "作业原图" } });
const emit = defineEmits(["update:page"]);
const instance = getCurrentInstance();
let resizeObserver, lastPanAt = 0;
const zoom = ref(1), resetKey = ref(0), width = ref(300), dimensions = ref({}), failed = ref(false);
const index = computed(() => Math.max(0, Math.min(props.page, props.photos.length - 1)));
const current = computed(() => props.photos[index.value]);
const size = computed(() => dimensions.value[current.value?.id || current.value?.url] || { width: 1, height: 1 });
const landscape = computed(() => size.value.width > size.value.height);
const height = computed(() => Math.round(Math.max(180, Math.min(460, width.value * size.value.height / size.value.width))));
function fit() { zoom.value = 1; resetKey.value++; }
// Background AI polling replaces snapshots; keep reading position for the same image.
watch([() => current.value?.id, () => current.value?.url], () => { fit(); failed.value = false; });
function select(page) { if (page >= 0 && page < props.photos.length) emit("update:page", page); }
function loaded(event) {
  const { width, height } = event.detail;
  if (current.value && width > 0 && height > 0) dimensions.value[current.value.id || current.value.url] = { width, height };
  failed.value = false;
}
function scale(event) { const value = Number(event.detail.scale); if (Number.isFinite(value)) zoom.value = Math.max(1, Math.min(4, value)); }
function adjust(amount) { zoom.value = Math.max(1, Math.min(4, Math.round((zoom.value + amount) * 10) / 10)); }
function pan(event) { if (event.detail.source) lastPanAt = Date.now(); }
function preview(fromImage = false) { if (fromImage && Date.now() - lastPanAt < 300) return; if (current.value) uni.previewImage({ urls: props.photos.map(photo => displayPhoto(photo.url)), current: index.value }); }
async function measure() {
  await nextTick();
  uni.createSelectorQuery().in(instance.proxy).select('.work-viewer-canvas').boundingClientRect(rect => { if (rect?.width) width.value = rect.width; }).exec();
}
onMounted(() => {
  measure();
  // #ifdef H5
  const element = instance.proxy.$el?.querySelector('.work-viewer-canvas');
  if (element && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(([entry]) => { if (entry.contentRect.width) width.value = entry.contentRect.width; });
    resizeObserver.observe(element);
  }
  // #endif
});
onUnmounted(() => resizeObserver?.disconnect());
onResize(measure);
</script>

<template>
  <view class="work-viewer">
    <view class="work-viewer-heading"><view class="strong">{{ title }}</view><text class="tiny subtle">第 {{ photos.length ? index + 1 : 0 }} / {{ photos.length }} 页</text></view>
    <template v-if="current">
      <movable-area class="work-viewer-canvas" :style="{ height: height + 'px' }" scale-area>
        <movable-view :key="resetKey" class="work-viewer-movable" :direction="zoom > 1 ? 'all' : 'none'" :animation="false" scale :scale-min="1" :scale-max="4" :scale-value="zoom" @scale="scale" @change="pan">
          <image class="work-viewer-image" :src="displayPhoto(current.url)" mode="aspectFit" :aria-label="`作业原图，第${index + 1}页`" @load="loaded" @error="failed = true" @click="preview(true)" />
        </movable-view>
      </movable-area>
      <view v-if="failed" class="small subtle work-viewer-hint">图片暂时无法加载，请稍后重试或全屏查看。</view>
      <view class="work-viewer-toolbar">
        <view class="work-viewer-zoom"><button class="secondary" aria-label="缩小作品" :disabled="zoom <= 1" @click="adjust(-.5)">−</button><text class="tiny">{{ Math.round(zoom * 100) }}%</text><button class="secondary" aria-label="放大作品" :disabled="zoom >= 4" @click="adjust(.5)">＋</button></view>
        <button class="text-button" :disabled="zoom <= 1" @click="fit">整页</button>
        <button class="text-button" @click="preview(false)">全屏查看</button>
      </view>
      <view class="small subtle work-viewer-hint">{{ landscape ? '横向作品可放大后拖动查看，或全屏放大阅读。' : '可放大、拖动查看，点击图片可全屏阅读。' }}</view>
      <view v-if="photos.length > 1" class="work-viewer-pagination"><button class="secondary" :disabled="index <= 0" @click="select(index - 1)">上一页</button><view class="work-viewer-pages"><button v-for="(photo, pageIndex) in photos" :key="photo.id || pageIndex" :class="['work-viewer-page', { active: index === pageIndex }]" :aria-label="`查看第${pageIndex + 1}页`" :aria-pressed="index === pageIndex" @click="select(pageIndex)">{{ pageIndex + 1 }}</button></view><button class="secondary" :disabled="index >= photos.length - 1" @click="select(index + 1)">下一页</button></view>
    </template>
    <view v-else class="small subtle work-viewer-hint">暂无可查看的作品图片。</view>
  </view>
</template>

<style scoped>
.work-viewer { min-width: 0; width: 100%; }
.work-viewer-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.work-viewer-canvas { display: block; width: 100%; overflow: hidden; background: #edf1ed; border-radius: 9px; }
.work-viewer-movable, .work-viewer-image { display: block; width: 100%; height: 100%; }
.work-viewer-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
.work-viewer-zoom { display: flex; align-items: center; gap: 8px; }
.work-viewer-zoom .secondary { width: auto; flex-shrink: 0; padding: 4px 10px; font-size: 17px; }
.work-viewer-toolbar .text-button { padding: 6px 0; font-size: 12px; }
.work-viewer-hint { margin-top: 10px; font-size: 11px; line-height: 1.7; }
.work-viewer-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.work-viewer-pagination .secondary { width: auto; flex-shrink: 0; padding: 7px 10px; font-size: 12px; }
.work-viewer-pages { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.work-viewer-page { padding: 5px 9px; font-size: 12px; background: #eff3ed; border-radius: 6px; color: #536c5d; }
.work-viewer-page.active { background: #26765a; color: white; }
</style>
