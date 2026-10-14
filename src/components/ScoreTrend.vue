<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { TrendPoint } from '../services/analytics';
import { chartPadding, trendScale, trendX, trendY } from '../services/trendLayout';
const props = defineProps<{points: TrendPoint[]; title: string; subtitle: string}>();
const instance = getCurrentInstance();
const canvasId = `score-trend-${instance?.uid ?? 0}`;
const containerWidth = ref(320);
const chartWidth = computed(() => Math.max(1, Math.floor(containerWidth.value)));
const scale = computed(() => trendScale(props.points));
const selectedId = ref('');
const selectedIndex = computed(() => Math.max(0, props.points.findIndex(p => p.id === selectedId.value)));
const selected = computed(() => props.points[selectedIndex.value]);
const seriesVisible = ref({handwriting: true, composition: true});
const anySeriesVisible = computed(() => seriesVisible.value.handwriting || seriesVisible.value.composition);
const scoredCount = computed(() => props.points.filter(p =>
  (seriesVisible.value.handwriting && p.handwriting !== null) || (seriesVisible.value.composition && p.composition !== null)).length);
const height = computed(() => Math.max(232, scale.value.ticks.length * 18 + 32));
let drawVersion = 0;
const {left, right, top, bottom} = chartPadding;
const x = (i: number) => trendX(i, props.points.length, chartWidth.value);
const y = (score: number) => trendY(score, scale.value, height.value);

async function draw() {
  const version = ++drawVersion;
  await nextTick();
  // #ifdef H5
  // Let uni-canvas resize its backing canvas after the Vue layout update.
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  // #endif
  if (version !== drawVersion || !instance?.proxy) return;
  const ctx = uni.createCanvasContext(canvasId, instance.proxy);
  ctx.clearRect(0, 0, chartWidth.value, height.value);
  ctx.setFontSize(10);
  ctx.setTextAlign('right');
  ctx.setTextBaseline('middle');
  for (const score of scale.value.ticks) {
    ctx.setStrokeStyle('#e8eee8'); ctx.setLineWidth(1);
    ctx.beginPath(); ctx.moveTo(left, y(score)); ctx.lineTo(chartWidth.value - right, y(score)); ctx.stroke();
    ctx.setFillStyle('#87958d'); ctx.fillText(String(score), left - 8, y(score));
  }
  if (selected.value) {
    ctx.setStrokeStyle('#dce8df'); ctx.beginPath(); ctx.moveTo(x(selectedIndex.value), top);
    ctx.lineTo(x(selectedIndex.value), height.value - bottom); ctx.stroke();
  }
  for (const [key, color] of [['handwriting', '#26765a'], ['composition', '#bf8e45']] as const) {
    if (!seriesVisible.value[key]) continue;
    ctx.setStrokeStyle(color); ctx.setLineWidth(2.5);
    let previous: {x: number; y: number} | null = null;
    props.points.forEach((point, i) => {
      const score = point[key];
      if (score === null) {previous = null; return;}
      const current = {x: x(i), y: y(score)};
      if (previous) {ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke();}
      ctx.setFillStyle('#ffffff'); ctx.beginPath(); ctx.arc(current.x, current.y, i === selectedIndex.value ? 4.5 : 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      previous = current;
    });
  }
  ctx.setTextAlign('center'); ctx.setFillStyle('#87958d');
  props.points.forEach((_p, i) => ctx.fillText(String(i + 1), x(i), height.value - 10));
  ctx.draw();
}
function measure() {
  if (!instance?.proxy) return;
  uni.createSelectorQuery().in(instance.proxy).select('.trend-plot').boundingClientRect(result => {
    const box = result as {width?: number} | null;
    if (box?.width) containerWidth.value = box.width;
    void draw();
  }).exec();
}
function selectPoint(event: {detail: {x: number}}) {
  if (!props.points.length) return;
  const i = props.points.length < 2 ? 0 : Math.max(0, Math.min(props.points.length - 1,
    Math.round((event.detail.x - left) / ((chartWidth.value - left - right) / (props.points.length - 1)))));
  selectedId.value = props.points[i].id;
}
watch(() => props.points, points => {
  if (!points.some(p => p.id === selectedId.value)) {
    selectedId.value = [...points].reverse().find(p => p.handwriting !== null || p.composition !== null)?.id || points[0]?.id || '';
  }
  void nextTick(measure);
}, {immediate: true, deep: true});
watch(selectedId, () => {void draw();});
watch(chartWidth, () => {void draw();});
watch(height, () => {void draw();});
watch(seriesVisible, () => {void draw();}, {deep: true});
onMounted(() => {measure(); uni.onWindowResize(measure);});
onUnmounted(() => {drawVersion++; uni.offWindowResize(measure);});
</script>

<template>
  <view class="trend-card card">
    <view class="trend-heading"><view class="section-title">{{ title }}</view><text class="tiny subtle">{{ scale.minimum }}—100分</text></view>
    <view class="small subtle trend-subtitle">{{ subtitle }}</view>
    <view class="trend-legend"><button :class="['trend-series-toggle', 'handwriting', {active:seriesVisible.handwriting}]" aria-label="书写曲线" :aria-pressed="seriesVisible.handwriting" @click="seriesVisible.handwriting=!seriesVisible.handwriting"><view class="series-swatch"><view class="series-swatch-line" /><view class="series-swatch-dot" /></view><text>书写</text></button><button :class="['trend-series-toggle', 'composition', {active:seriesVisible.composition}]" aria-label="写作曲线" :aria-pressed="seriesVisible.composition" @click="seriesVisible.composition=!seriesVisible.composition"><view class="series-swatch"><view class="series-swatch-line" /><view class="series-swatch-dot" /></view><text>写作</text></button><text class="tiny subtle series-hint">轻点切换</text></view>
    <view class="trend-plot-wrap">
      <view class="trend-plot">
        <canvas :id="canvasId" :canvas-id="canvasId" class="trend-canvas" :style="{width:chartWidth+'px', height:height+'px'}" @tap="selectPoint" />
      </view>
      <view v-if="!anySeriesVisible" class="trend-empty"><view class="strong">选择要查看的成绩曲线</view><view class="small subtle">点击上方书写或写作，即可显示趋势。</view></view>
      <view v-else-if="!scoredCount" class="trend-empty"><view class="strong">暂无已发布成绩</view><view class="small subtle">老师发布反馈后，这里会显示成绩变化。</view></view>
    </view>
    <view v-if="points.length" class="trend-point-buttons"><button v-for="(point,i) in points" :key="point.id" :class="['trend-point-button',{active:selected?.id===point.id}]" :aria-label="'第'+(i+1)+'项，'+point.label+(point.shortLabel ? '，'+point.shortLabel : '')" :aria-pressed="selected?.id===point.id" @click="selectedId=point.id">{{ i+1 }}</button></view>
    <view v-if="selected" class="trend-selected"><view class="trend-selected-heading"><view class="strong">{{ selectedIndex+1 }} · {{ selected.label }}</view><text class="tiny subtle">{{ selected.note }}</text></view><view v-if="selected.detail" class="tiny subtle trend-selected-detail">{{ selected.detail }}</view><view class="trend-values"><text>书写 <text class="strong">{{ selected.handwriting ?? '—' }}</text></text><text>写作 <text class="strong">{{ selected.composition ?? '—' }}</text></text></view></view>
    <view v-if="scoredCount===1" class="tiny subtle trend-hint">已有1个成绩点，更多成绩发布后可查看连线趋势。</view>
    <view v-else-if="points.length>1 && anySeriesVisible" class="tiny subtle trend-hint">点击序号，查看对应作文与成绩。</view>
  </view>
</template>
