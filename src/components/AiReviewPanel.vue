<script setup>
import WorkViewer from "./WorkViewer.vue";
import { canResubmit as resubmissionOpen } from "../services/submissionPolicy.js";
import { computed, onUnmounted, ref, watch } from "vue";
import { AI_RUNNING, aiQualityAttention } from "../services/aiReview.js";
import { presentReview } from "../services/presentation.js";
import { rubric, total } from "../services/rubric.js";

const props = defineProps({ submission: {}, assignment: {}, student: {}, task: {}, teacher: Boolean, busy: Boolean, canResubmit: Boolean, canAllowResubmission: Boolean });
const emit = defineEmits(["start", "manual"]);
const clock = ref(Date.now());
const timer = setInterval(() => { clock.value = Date.now(); }, 1000);
onUnmounted(() => clearInterval(timer));
const retry = computed(() => props.task?.retry);
const retrySeconds = computed(() => Math.max(0, Math.ceil(((Date.parse(retry.value?.nextRetryAt || "") || 0) - clock.value) / 1000)));
const retryEnabled = computed(() => !!retry.value && !retry.value.reason && !retrySeconds.value && !props.busy);
const category = ref("handwriting"), collapsedDimensions = ref([]), photoIndex = ref(0);
const phase = computed(() => props.task?.state || "notStarted");
const running = computed(() => AI_RUNNING.includes(phase.value));
const result = computed(() => props.task?.result ? presentReview(props.task.result) : null);
const attention = computed(() => aiQualityAttention(props.submission));
const wrongPhoto = computed(() => props.task?.qualityFlags?.some(flag => ["wrongImage", "unreadable"].includes(flag)));
const progress = computed(() => ({ queued: 8, reading: 33, reviewing: 72, completed: 100 })[phase.value] || 0);
const step = computed(() => ({ queued: 0, reading: 1, reviewing: 2, completed: 3 })[phase.value] || 0);
const steps = ["识别作品与页序", "分析书写与写作", "整理评分和建议"];
watch(() => props.submission?.id, () => { category.value = "handwriting"; collapsedDimensions.value = []; photoIndex.value = 0; });
watch(category, () => { collapsedDimensions.value = []; });
function toggleDimension(id) {
  collapsedDimensions.value = collapsedDimensions.value.includes(id)
    ? collapsedDimensions.value.filter(item => item !== id)
    : [...collapsedDimensions.value, id];
}

</script>

<template>
  <view v-if="submission" class="ai-review-panel">
    <view class="ai-work-context">
      <view class="avatar pale">{{ student?.initial || '学' }}</view>
      <view class="grow"><view class="strong">{{ student?.name }}</view><view class="tiny subtle">{{ assignment?.title }}</view></view>
      <text class="ai-type-tag">双写 AI</text>
    </view>

    <view class="card ai-original-work"><WorkViewer :photos="submission.photos" v-model:page="photoIndex" title="作业详情" /><view v-if="submission.note" class="paragraph small subtle">{{ submission.note }}</view></view>

    <view v-if="resubmissionOpen(submission)" class="notice">{{ teacher ? '作业已打回，待学生重新提交' : '老师已同意你重新提交一次。' }}</view>
    <view v-if="running" class="card ai-progress-card" role="status" aria-live="polite">
      <view class="card-top"><view class="strong">{{ phase === 'queued' ? '等待开始批阅' : '正在双写批阅' }}</view><text class="small subtle">{{ Math.max(0, step) }} / 3 步</text></view>
      <view class="ai-progress-track"><view class="ai-progress-fill" :style="{ width: progress + '%' }" /></view>
      <view v-for="(label, index) in steps" :key="label" :class="['ai-progress-step', { done: step > index + 1, current: step === index + 1 }]"><view class="ai-step-mark">{{ step > index + 1 ? '✓' : index + 1 }}</view><view class="grow">{{ label }}</view><text class="tiny">{{ step > index + 1 ? '已完成' : step === index + 1 ? '进行中' : '等待中' }}</text></view>
    </view>

    <template v-else-if="result">
      <view v-if="attention.length" class="notice">{{ attention.join('、') }}{{ teacher ? '，请逐份审核' : '，请核对本次作品' }}</view>
      <view class="ai-result-source"><view class="section-title">AI批阅结果</view><text v-if="task.resultSource === 'sample'" class="ai-example-tag">示例结果</text></view>
      <view class="ai-score-grid">
        <view class="ai-score-card"><view class="small">书写评价</view><view class="ai-score-value">{{ total(result.handwriting) ?? '—' }}<text> / 100</text></view><view class="tiny subtle">笔画 · 结构 · 章法</view></view>
        <view class="ai-score-card ai-score-writing"><view class="small">写作评价</view><view class="ai-score-value">{{ total(result.composition) ?? '—' }}<text> / 100</text></view><view class="tiny subtle">内容 · 情感 · 表达</view></view>
      </view>

        <view class="card ai-next-steps"><view class="section-title">批阅建议</view><view class="paragraph small ai-preserve-lines">{{ result.nextSteps }}</view></view>
        <view class="section-heading"><view class="section-title">五大思维</view></view>
        <view class="category-switch ai-category-switch"><button :class="{ active: category === 'handwriting' }" @click="category = 'handwriting'">书写评价</button><button :class="{ active: category === 'composition' }" @click="category = 'composition'">写作评价</button></view>
        <view class="card ai-dimensions"><view class="section-title ai-summary-title">总体评价</view><view class="paragraph small ai-preserve-lines">{{ result[category].summary }}</view>
          <view v-for="item in rubric[category]" :key="item.id" class="ai-dimension">
            <button class="ai-dimension-toggle" :aria-expanded="!collapsedDimensions.includes(item.id)" @click="toggleDimension(item.id)"><text>{{ item.name }}</text><view class="grow" /><text class="strong">{{ result[category].scores[item.id] ?? '—' }} / {{ item.max }}</text><view class="review-collapse-label"><text>{{ collapsedDimensions.includes(item.id) ? '展开' : '收起' }}</text><view :class="['review-chevron', { expanded: !collapsedDimensions.includes(item.id) }]" /></view></button>
            <view v-if="!collapsedDimensions.includes(item.id)" class="ai-dimension-comment small subtle ai-preserve-lines">{{ result[category].comments[item.id] || '本项暂无具体建议。' }}</view>
          </view>
        </view>

      <view class="ai-learning-note small">AI可能出错，请核查重要信息。</view>
    </template>

    <view v-else class="card ai-empty-result" role="status">
      <view class="section-title">{{ wrongPhoto ? '请核对本次作品，等待老师处理' : phase === 'failed' ? 'AI批阅失败，作品已保存' : phase === 'unavailable' ? 'AI服务暂不可用，作品已保存' : phase === 'cancelled' ? '老师批阅中' : '作品已保存，等待批阅' }}</view>
      <view v-if="wrongPhoto" class="paragraph small">{{ attention.join('、') }}</view>
      <view v-else-if="phase === 'unavailable'" class="paragraph small">AI服务尚未开通，本次暂时无法生成结果。老师批阅完成后，可在作业记录中查看反馈。</view>
      <view v-else-if="phase === 'failed'" class="paragraph small">{{ task?.autoRetryCount ? '已自动重试一次，仍未完成。' : '本次批阅未完成。' }}可以使用原图重新批阅，无需再次上传。</view>
      <view v-else class="paragraph small">老师完成批阅后，可在作业记录中查看反馈。</view>
      <template v-if="teacher && submission.status !== 'published' && !resubmissionOpen(submission)">
        <view class="paragraph small">你可以直接进行教师批阅，填写评分和评语后发布反馈。</view>
        <button class="primary full-width spaced" :disabled="busy" @click="emit('manual')">教师批阅</button>
      </template>
      <template v-if="!teacher && !wrongPhoto && ['failed', 'unavailable'].includes(phase)">
        <button v-if="phase === 'failed' || !retry?.reason" class="primary full-width spaced" :disabled="!retryEnabled" @click="emit('start')">{{ busy ? '正在安排…' : retrySeconds && !retry?.reason ? `请在 ${retrySeconds} 秒后重试` : '用原图重新批阅' }}</button>
        <view v-if="phase === 'failed'" class="paragraph small subtle">{{ retry?.reason || `本份作品还可重试 ${retry?.remaining || 0} 次；每次间隔60秒，24小时内最多5次。` }}</view>
      </template>
    </view>


  </view>
</template>
