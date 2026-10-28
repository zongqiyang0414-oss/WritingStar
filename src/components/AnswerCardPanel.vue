<script setup>
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { drawAnswerCard, CARD_WIDTH, CARD_HEIGHT } from "../platform/answerCards.js";
// #ifdef H5
import { answerCardImage, printAnswerCards } from "../platform/answerCards.js";
// #endif
// #ifdef MP-WEIXIN
import { exportWeixinAnswerCards, openWeixinAnswerCards, shareWeixinAnswerCards } from "../platform/weixinAnswerCards.js";
// #endif
const props = defineProps({ assignment: Object, cards: Array, teacher: Boolean, busy: Boolean });
const emit = defineEmits(["issue", "scan"]);
const studentIndex = ref(0), page = ref(1), preview = ref(""), error = ref(""), working = ref(false), printProgress = ref("");
const generatedPdf = ref("");
const selected = computed(() => props.cards?.[studentIndex.value]);
const instance = getCurrentInstance();
let disposed = false;
onBeforeUnmount(() => { disposed = true; });
watch(() => [selected.value?.id, page.value], async () => {
  if (!selected.value) { preview.value = ""; return; }
  error.value = "";
  // #ifdef H5
  preview.value = answerCardImage(props.assignment, selected.value, page.value);
  // #endif
  // #ifndef H5
  await nextTick();
  const ctx = uni.createCanvasContext("answer-card-export", instance.proxy);
  drawAnswerCard(ctx, props.assignment, selected.value, page.value);
  ctx.draw(false, () => uni.canvasToTempFilePath({ canvasId: "answer-card-export", width: CARD_WIDTH, height: CARD_HEIGHT,
    destWidth: CARD_WIDTH * 2, destHeight: CARD_HEIGHT * 2, fileType: "png",
    success: result => { preview.value = result.tempFilePath; }, fail: () => { error.value = "答题卡生成失败，请返回重试。"; } }, instance.proxy));
  // #endif
}, { immediate: true });
async function print(all = false) {
  if (working.value || props.busy || !selected.value) return;
  error.value = ""; working.value = true;
  try {
    // #ifdef H5
    await printAnswerCards(props.assignment, all ? props.cards : [selected.value], (done, total) => { printProgress.value = `正在准备打印 ${done} / ${total} 页`; });
    // #endif
    // #ifdef MP-WEIXIN
    generatedPdf.value = "";
    await nextTick();
    const filePath = await exportWeixinAnswerCards(props.assignment, all ? [...props.cards] : [selected.value], {
      canvasId: "answer-card-print", scope: instance.proxy, cancelled: () => disposed,
      onProgress: (done, total) => { printProgress.value = `正在生成 PDF ${done} / ${total} 页，请稍候`; },
    });
    if (disposed) return;
    generatedPdf.value = filePath;
    await openWeixinAnswerCards(filePath);
    // #endif
  } catch (failure) { error.value = failure.message; }
  finally { working.value = false; printProgress.value = ""; }
}
async function share() {
  // #ifdef MP-WEIXIN
  if (!generatedPdf.value || working.value) return;
  error.value = "";
  try { await shareWeixinAnswerCards(generatedPdf.value); }
  catch (failure) { error.value = failure.message; }
  // #endif
}
function zoom() { if (preview.value) uni.previewImage({urls: [preview.value]}); }
</script>
<template>
  <view class="paper-workspace">
    <view class="paper-heading"><view class="paper-overline">题目</view><view class="paper-title">{{ assignment.title }}</view><view class="small subtle">作业布置流程</view></view>
    <view class="paper-steps"><view><text>01</text> 打印专属卡</view><view><text>02</text> 纸上完成</view><view><text>03</text> 上传批阅</view></view>
    <view v-if="!assignment.paperPacket || !cards.length" class="card paper-empty">
      <view class="section-title">{{ teacher ? '生成学生专属答题卡' : '老师尚未生成你的答题卡' }}</view>
      <view class="small subtle spaced-small">{{ teacher ? '每页均带学生码、页码和四角定位标记，便于自动归档。' : '请联系老师生成后，在这里下载打印。' }}</view>
      <button v-if="teacher" class="primary full-width spaced" :disabled="busy" @click="emit('issue')">生成全班答题卡</button>
    </view>
    <template v-else>
      <view class="card paper-card-controls">
        <view class="paper-inline"><view><view class="strong">{{ teacher ? '选择学生' : selected?.studentName + '的专属答题卡' }}</view><view class="tiny subtle">A4 · 共 {{ assignment.paperPacket.pages }} 页 · 黑白打印即可</view></view><text class="paper-count">{{ cards.length }} 人</text></view>
        <picker v-if="teacher" :disabled="working" :range="cards" range-key="studentName" :value="studentIndex" @change="studentIndex = Number($event.detail.value); page = 1"><view class="paper-select">{{ selected?.studentName }} <text>切换学生 ﹀</text></view></picker>
        <view class="paper-page-controls"><button class="text-button" :disabled="working || page <= 1" @click="page--">‹ 上一页</button><text>第 {{ page }} / {{ assignment.paperPacket.pages }} 页</text><button class="text-button" :disabled="working || page >= assignment.paperPacket.pages" @click="page++">下一页 ›</button></view>
      </view>
      <view class="paper-preview" @click="zoom"><image v-if="preview" :src="preview" mode="widthFix" class="paper-preview-image" /><view v-else class="small subtle">正在生成答题卡…</view></view>
      <view class="paper-code-caption">学生码与作业、学生及页码绑定。请勿裁切二维码和四角。</view>
      <view class="card paper-actions">
        <button class="primary full-width" :disabled="busy || working || !selected" @click="print(false)">打印 / 下载此生 PDF</button>
        <button v-if="teacher" class="text-button full-width spaced-small" :disabled="busy || working" @click="print(true)">打印全班 · {{ cards.length * assignment.paperPacket.pages }} 页</button>
        <!-- #ifdef MP-WEIXIN -->
        <button v-if="generatedPdf" class="text-button full-width spaced-small" :disabled="working" @click="share">转发已生成 PDF</button>
        <!-- #endif -->
        <button class="text-button full-width spaced-small" :disabled="busy || working" @click="emit('scan')">{{ teacher ? '去批量扫描收件箱' : '已完成，上传答题卡' }} ›</button>
      </view>
      <!-- #ifdef MP-WEIXIN -->
      <view class="small subtle spaced-small">生成后打开 PDF，可通过右上角菜单转发给打印服务。打印时选择 A4、原比例 100%。</view>
      <!-- #endif -->
      <view v-if="!teacher" class="notice">家长可协助打印：A4 纸、原比例 100%，完成后逐页上传，系统自动对应学生信息。</view>
      <view v-if="printProgress" class="small subtle paper-print-progress" role="status" aria-live="polite">{{ printProgress }}</view>
    </template>
    <view v-if="error" class="paper-error" role="alert">{{ error }}</view>
    <!-- #ifndef H5 -->
    <canvas canvas-id="answer-card-export" id="answer-card-export" :style="{width: CARD_WIDTH + 'px', height: CARD_HEIGHT + 'px'}" class="paper-export-canvas" />
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <canvas canvas-id="answer-card-print" id="answer-card-print" :style="{width: CARD_WIDTH + 'px', height: CARD_HEIGHT + 'px'}" class="paper-export-canvas" />
    <!-- #endif -->
  </view>
</template>
