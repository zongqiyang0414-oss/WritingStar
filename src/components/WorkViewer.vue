<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onResize } from "@dcloudio/uni-app";
import { displayPhoto } from "../services/presentation.js";

const props = defineProps({ photos: { type: Array, default: () => [] }, page: { type: Number, default: 0 }, title: { type: String, default: "作业原图" } });
const emit = defineEmits(["update:page"]);
const instance = getCurrentInstance();
let resizeObserver;
const width = ref(300), dimensions = ref({}), failed = ref(false);
const index = computed(() => Math.max(0, Math.min(props.page, props.photos.length - 1)));
const current = computed(() => props.photos[index.value]);
const size = computed(() => dimensions.value[current.value?.id || current.value?.url] || { width: 1, height: 1 });
const height = computed(() => Math.round(Math.max(180, Math.min(460, width.value * size.value.height / size.value.width))));
watch([() => current.value?.id, () => current.value?.url], () => { failed.value = false; });
function select(page) { if (page >= 0 && page < props.photos.length) emit("update:page", page); }
function loaded(event) {
  const { width, height } = event.detail;
  if (current.value && width > 0 && height > 0) dimensions.value[current.value.id || current.value.url] = { width, height };
  failed.value = false;
}
function preview() { if (current.value) uni.previewImage({ urls: props.photos.map(photo => displayPhoto(photo.url)), current: index.value }); }
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
      <view class="work-viewer-canvas" :style="{ height: height + 'px' }">
        <image class="work-viewer-image" :src="displayPhoto(current.url)" mode="aspectFit" :aria-label="`查看作业全图，第${index + 1}页`" @load="loaded" @error="failed = true" @click="preview" />
      </view>
      <view v-if="failed" class="small subtle work-viewer-hint">图片暂时无法加载，请稍后重试或全屏查看。</view>
      <view v-if="photos.length > 1" class="work-viewer-pagination"><button class="secondary" :disabled="index <= 0" @click="select(index - 1)">上一页</button><view class="work-viewer-pages"><button v-for="(photo, pageIndex) in photos" :key="photo.id || pageIndex" :class="['work-viewer-page', { active: index === pageIndex }]" :aria-label="`查看第${pageIndex + 1}页`" :aria-pressed="index === pageIndex" @click="select(pageIndex)">{{ pageIndex + 1 }}</button></view><button class="secondary" :disabled="index >= photos.length - 1" @click="select(index + 1)">下一页</button></view>
    </template>
    <view v-else class="small subtle work-viewer-hint">暂无可查看的作品图片。</view>
  </view>
</template>

<style scoped>
.work-viewer { min-width: 0; width: 100%; }
.work-viewer-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.work-viewer-canvas { display: block; width: 100%; overflow: hidden; background: #edf1ed; border-radius: 9px; }
.work-viewer-image { display: block; width: 100%; height: 100%; }
.work-viewer-hint { margin-top: 10px; font-size: 11px; line-height: 1.7; }
.work-viewer-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.work-viewer-pagination .secondary { width: auto; flex-shrink: 0; padding: 7px 10px; font-size: 12px; }
.work-viewer-pages { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.work-viewer-page { padding: 5px 9px; font-size: 12px; background: #eff3ed; border-radius: 6px; color: #536c5d; }
.work-viewer-page.active { background: #26765a; color: white; }
</style>
