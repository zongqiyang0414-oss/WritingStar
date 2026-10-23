<script setup>
import { onMounted, onUnmounted, ref } from "vue";
const props = defineProps({ modal: Boolean, error: Boolean });
const emit = defineEmits(["dismiss"]);
const offset = ref(0), dragging = ref(false), closing = ref(false);
const panel = ref(null);
let startY = 0, timer, removeMouseDrag;
const y = event => event.touches?.[0]?.clientY ?? event.changedTouches?.[0]?.clientY ?? event.clientY ?? 0;
function start(event) {
  if (event.target?.closest?.("button, uni-button, input, textarea")) return;
  startY = y(event); dragging.value = true;
  if (event.pointerId !== undefined) event.currentTarget?.setPointerCapture?.(event.pointerId);
}
function move(event) { if (dragging.value) offset.value = Math.min(0, y(event) - startY); }
function dismiss() { closing.value = true; timer = setTimeout(() => emit("dismiss"), 160); }
function end() { if (!dragging.value) return; dragging.value = false; if (offset.value < -28) dismiss(); else offset.value = 0; }
// uni-app's H5 event normalizer drops PointerEvent coordinates. Use native
// mouse pointer events there; touch events retain their coordinates on both targets.
// #ifdef H5
onMounted(() => {
  const element = panel.value?.$el ?? panel.value;
  const mouseStart = event => { if (event.pointerType === "mouse") start(event); };
  const mouseMove = event => { if (event.pointerType === "mouse") move(event); };
  const mouseEnd = event => { if (event.pointerType === "mouse") end(); };
  const listeners = [["pointerdown", mouseStart], ["pointermove", mouseMove], ["pointerup", mouseEnd], ["pointercancel", mouseEnd]];
  listeners.forEach(([name, handler]) => element.addEventListener(name, handler));
  removeMouseDrag = () => listeners.forEach(([name, handler]) => element.removeEventListener(name, handler));
});
// #endif
onUnmounted(() => { clearTimeout(timer); removeMouseDrag?.(); });
</script>

<template>
  <view :class="['slide-down-layer', { 'slide-down-modal': modal }]">
    <view ref="panel" :class="['slide-down-panel', { 'is-error': error, dragging, closing, 'is-dialog': modal }]" :style="{ transform: `translateY(${offset}px)` }" :role="modal ? 'dialog' : error ? 'alert' : 'status'" :aria-modal="modal || undefined" @touchstart="start" @touchmove="move" @touchend="end" @touchcancel="end">
      <view class="slide-down-grip"><view class="slide-down-grip-line" /></view>
      <button v-if="!modal" class="slide-down-close" aria-label="收起提示" @click="dismiss">×</button>
      <slot />
    </view>
  </view>
</template>

<style scoped>
.slide-down-layer { position: fixed; inset: 0; z-index: 1100; padding: calc(12px + env(safe-area-inset-top)) 18px 0; pointer-events: none; display: flex; align-items: flex-start; justify-content: center; }
.slide-down-modal { pointer-events: auto; background: rgba(32,55,45,.3); }
.slide-down-panel { position: relative; width: 100%; max-width: 540px; padding: 21px 40px 19px 20px; border-radius: 0 0 16px 16px; color: white; background: #253f35; box-shadow: 0 8px 24px rgba(28,52,39,.16); pointer-events: auto; line-height: 1.7; font-size: 14px; animation: slide-down-enter .2s ease-out; transition: transform .16s ease, opacity .16s ease; touch-action: none; }
.slide-down-panel.is-error { background: #813e31; }
.slide-down-panel.is-dialog { max-width: 420px; max-height: 80vh; overflow-y: auto; padding: 28px 24px 24px; color: #253f35; background: white; touch-action: pan-y; }
.slide-down-panel.dragging { transition: none; animation: none; }
.slide-down-panel.closing { transform: translateY(-130%) !important; opacity: 0; }
.slide-down-grip { position: absolute; top: 0; left: 0; width: 100%; height: 26px; touch-action: none; }
.slide-down-grip-line { width: 34px; height: 3px; margin: 7px auto 0; border-radius: 3px; background: currentColor; opacity: .25; }
.slide-down-close { position: absolute; top: 13px; right: 12px; font-size: 22px; color: inherit; padding: 0 3px; line-height: 1.2; }
@keyframes slide-down-enter { from { transform: translateY(-125%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>
