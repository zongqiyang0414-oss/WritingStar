<script setup>
import { TREND_PADDING } from "./trendLayout.js";
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

const props = defineProps({
  points: {},
  title: {},
  subtitle: {},
});
const instance = getCurrentInstance(),
  canvasId = `score-trend-${instance?.uid ?? 0}`,
  plotWidth = ref(320),
  canvasWidth = computed(() => Math.max(1, Math.floor(plotWidth.value))),
  scale = computed(() =>
    (function (e) {
      const a = e
          .flatMap((e) => [e.handwriting, e.composition])
          .filter((e) => null !== e && Number.isFinite(e)),
        t = Math.max(0, 5 * Math.floor(Math.min(60, ...a) / 5));
      return {
        minimum: t,
        maximum: 100,
        step: 5,
        ticks: Array.from(
          {
            length: (100 - t) / 5 + 1,
          },
          (e, a) => t + 5 * a,
        ),
      };
    })(props.points),
  ),
  selectedId = ref(""),
  selectedIndex = computed(() =>
    Math.max(
      0,
      props.points.findIndex((e) => e.id === selectedId.value),
    ),
  ),
  selectedPoint = computed(() => props.points[selectedIndex.value]),
  visibleSeries = ref({
    handwriting: true,
    composition: true,
  }),
  hasVisibleSeries = computed(
    () => visibleSeries.value.handwriting || visibleSeries.value.composition,
  ),
  publishedPointCount = computed(
    () =>
      props.points.filter(
        (e) =>
          (visibleSeries.value.handwriting && null !== e.handwriting) ||
          (visibleSeries.value.composition && null !== e.composition),
      ).length,
  ),
  canvasHeight = computed(() =>
    Math.max(232, 18 * scale.value.ticks.length + 32),
  );
let mounted = false,
  drawRequest = 0,
  measureRequest = 0,
  drawQueued = false,
  resizeTimer = null;
// #ifdef H5
let drawFrame = 0;
// #endif

// All watchers share one pending draw, using the latest data after DOM updates.
function queueDraw() {
  if (!mounted || drawQueued) return;
  drawQueued = true;
  const request = drawRequest;
  nextTick(() => {
    if (!mounted || request !== drawRequest) return;
    // Canvas dimensions need two browser frames to settle on H5.
    // #ifdef H5
    drawFrame = requestAnimationFrame(() => {
      drawFrame = requestAnimationFrame(() => {
        drawFrame = 0;
        flushDraw(request);
      });
    });
    // #endif
    // #ifndef H5
    flushDraw(request);
    // #endif
  });
}
function flushDraw(request) {
  if (!mounted || request !== drawRequest) return;
  drawQueued = false;
  draw();
}
function queueMeasure() {
  if (!mounted) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    measure();
  }, 80);
}
const { left: left, right: right, top: top, bottom: bottom } = TREND_PADDING,
  xFor = (e) => {
    return (
      (t = e),
      (s = props.points.length),
      (l = canvasWidth.value),
      s < 2
        ? l / 2
        : TREND_PADDING.left +
          (t * (l - TREND_PADDING.left - TREND_PADDING.right)) / (s - 1)
    );
    var t, s, l;
  },
  yFor = (e) =>
    (function (e, a, t) {
      return (
        TREND_PADDING.top +
        ((a.maximum - e) / (a.maximum - a.minimum)) *
          (t - TREND_PADDING.top - TREND_PADDING.bottom)
      );
    })(e, scale.value, canvasHeight.value);
function draw() {
  if (!mounted || !instance?.proxy) return;
  const s = uni.createCanvasContext(canvasId, instance.proxy);
  s.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
  s.setFontSize(10);
  s.setTextAlign("right");
  s.setTextBaseline("middle");
  for (const a of scale.value.ticks) {
    s.setStrokeStyle("#e8eee8");
    s.setLineWidth(1);
    s.beginPath();
    s.moveTo(left, yFor(a));
    s.lineTo(canvasWidth.value - right, yFor(a));
    s.stroke();
    s.setFillStyle("#87958d");
    s.fillText(String(a), left - 8, yFor(a));
  }
  selectedPoint.value &&
    (s.setStrokeStyle("#dce8df"),
    s.beginPath(),
    s.moveTo(xFor(selectedIndex.value), top),
    s.lineTo(xFor(selectedIndex.value), canvasHeight.value - bottom),
    s.stroke());
  for (const [t, l] of [
    ["handwriting", "#26765a"],
    ["composition", "#bf8e45"],
  ]) {
    if (!visibleSeries.value[t]) continue;
    s.setStrokeStyle(l);
    s.setLineWidth(2.5);
    let e = null;
    props.points.forEach((a, l) => {
      const n = a[t];
      if (null === n) return void (e = null);
      const i = {
        x: xFor(l),
        y: yFor(n),
      };
      e && (s.beginPath(), s.moveTo(e.x, e.y), s.lineTo(i.x, i.y), s.stroke());
      s.setFillStyle("#ffffff");
      s.beginPath();
      s.arc(i.x, i.y, l === selectedIndex.value ? 4.5 : 3, 0, 2 * Math.PI);
      s.fill();
      s.stroke();
      e = i;
    });
  }
  s.setTextAlign("center");
  s.setFillStyle("#87958d");
  props.points.forEach((e, a) =>
    s.fillText(String(a + 1), xFor(a), canvasHeight.value - 10),
  );
  s.draw();
}
function measure() {
  if (!mounted || !instance?.proxy) return;
  const request = ++measureRequest;
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select(".trend-plot")
    .boundingClientRect((rect) => {
      if (!mounted || request !== measureRequest) return;
      if (rect?.width) plotWidth.value = rect.width;
      queueDraw();
    })
    .exec();
}
function choosePoint(e) {
  if (!props.points.length) return;
  const t =
    props.points.length < 2
      ? 0
      : Math.max(
          0,
          Math.min(
            props.points.length - 1,
            Math.round(
              (e.detail.x - left) /
                ((canvasWidth.value - left - right) /
                  (props.points.length - 1)),
            ),
          ),
        );
  selectedId.value = props.points[t].id;
}
watch(
  // Labels and detail text update reactively without redrawing the canvas.
  () => props.points.map(({ id, handwriting, composition }) => [
    id,
    handwriting,
    composition,
  ]),
  () => {
    const points = props.points;
    if (!points.some((point) => point.id === selectedId.value)) {
      let latestPublished;
      for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].handwriting !== null || points[i].composition !== null) {
          latestPublished = points[i];
          break;
        }
      }
      selectedId.value = latestPublished?.id || points[0]?.id || "";
    }
    queueDraw();
  },
  { immediate: true, flush: "post" },
);
watch(
  [
    selectedId,
    canvasWidth,
    canvasHeight,
    () => visibleSeries.value.handwriting,
    () => visibleSeries.value.composition,
  ],
  queueDraw,
  { flush: "post" },
);
onMounted(() => {
  mounted = true;
  nextTick(measure);
  uni.onWindowResize(queueMeasure);
});
onBeforeUnmount(() => {
  mounted = false;
  drawRequest++;
  measureRequest++;
  clearTimeout(resizeTimer);
  // #ifdef H5
  cancelAnimationFrame(drawFrame);
  // #endif
  uni.offWindowResize(queueMeasure);
});
</script>

<template>
  <view class="trend-card card">
    <view class="trend-heading">
      <view class="section-title">
        {{ title }}
      </view>
      <text class="tiny subtle"> {{ scale.minimum }}—100分 </text>
    </view>
    <view class="small subtle trend-subtitle">
      {{ subtitle }}
    </view>
    <view class="trend-legend">
      <button
        :class="[
          'trend-series-toggle',
          'handwriting',
          { active: visibleSeries.handwriting },
        ]"
        aria-label="书写曲线"
        :aria-pressed="visibleSeries.handwriting"
        @click="(e) => (visibleSeries.handwriting = !visibleSeries.handwriting)"
      >
        <view class="series-swatch">
          <view class="series-swatch-line" />
          <view class="series-swatch-dot" />
        </view>
        <text> 书写 </text>
      </button>
      <button
        :class="[
          'trend-series-toggle',
          'composition',
          { active: visibleSeries.composition },
        ]"
        aria-label="写作曲线"
        :aria-pressed="visibleSeries.composition"
        @click="(e) => (visibleSeries.composition = !visibleSeries.composition)"
      >
        <view class="series-swatch">
          <view class="series-swatch-line" />
          <view class="series-swatch-dot" />
        </view>
        <text> 写作 </text>
      </button>
      <text class="tiny subtle series-hint"> 轻点切换 </text>
    </view>
    <view class="trend-plot-wrap">
      <view class="trend-plot">
        <canvas
          :id="canvasId"
          :canvas-id="canvasId"
          class="trend-canvas"
          :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"
          @click="choosePoint"
        />
      </view>
      <template v-if="hasVisibleSeries">
        <template v-if="publishedPointCount" />
        <template v-else>
          <view :key="1" class="trend-empty">
            <view class="strong"> 暂无已发布成绩 </view>
            <view class="small subtle">
              老师发布反馈后，这里会显示成绩变化。
            </view>
          </view>
        </template>
      </template>
      <template v-else>
        <view :key="0" class="trend-empty">
          <view class="strong"> 选择要查看的成绩曲线 </view>
          <view class="small subtle"> 点击上方书写或写作，即可显示趋势。 </view>
        </view>
      </template>
    </view>
    <template v-if="points.length">
      <view :key="0" class="trend-point-buttons">
        <template v-for="(item1, index1) in points" :key="item1.id">
          <button
            :class="[
              'trend-point-button',
              { active: selectedPoint?.id === item1.id },
            ]"
            :aria-label="
              '第' +
              (index1 + 1) +
              '项，' +
              item1.label +
              (item1.shortLabel ? '，' + item1.shortLabel : '')
            "
            :aria-pressed="selectedPoint?.id === item1.id"
            @click="(a) => (selectedId = item1.id)"
          >
            {{ index1 + 1 }}
          </button>
        </template>
      </view>
    </template>
    <template v-if="selectedPoint">
      <view :key="1" class="trend-selected">
        <view class="trend-selected-heading">
          <view class="strong">
            {{ selectedIndex + 1 }} · {{ selectedPoint.label }}
          </view>
          <text class="tiny subtle">
            {{ selectedPoint.note }}
          </text>
        </view>
        <template v-if="selectedPoint.detail">
          <view :key="0" class="tiny subtle trend-selected-detail">
            {{ selectedPoint.detail }}
          </view>
        </template>
        <view class="trend-values">
          <text>
            书写
            <text class="strong">
              {{ selectedPoint.handwriting ?? "—" }}
            </text>
          </text>
          <text>
            写作
            <text class="strong">
              {{ selectedPoint.composition ?? "—" }}
            </text>
          </text>
        </view>
      </view>
    </template>
    <template v-if="1 === publishedPointCount">
      <view :key="2" class="tiny subtle trend-hint">
        已有1个成绩点，更多成绩发布后可查看连线趋势。
      </view>
    </template>
    <template v-else>
      <template v-if="points.length > 1 && hasVisibleSeries">
        <view :key="3" class="tiny subtle trend-hint">
          点击序号，查看对应作文与成绩。
        </view>
      </template>
    </template>
  </view>
</template>
