<script setup>
import { computed, ref, watch } from "vue";
import ReviewEditor from "./ReviewEditor.vue";
import { AI_RUNNING, AI_RETRYABLE, aiQualityAttention } from "../services/aiReview.js";
import { displayPhoto, presentReview } from "../services/presentation.js";
import { rubric, total } from "../services/rubric.js";

const props = defineProps({ submission: {}, assignment: {}, student: {}, task: {}, teacher: Boolean, busy: Boolean });
const emit = defineEmits(["start", "refresh", "review", "apply", "feedback", "report", "resubmit", "back"]);
const category = ref("handwriting"), collapsedDimensions = ref([]), photoIndex = ref(0), showWork = ref(false);
const editedReview = ref(null), editing = ref(false);
const phase = computed(() => props.task?.state || "notStarted");
const running = computed(() => AI_RUNNING.includes(phase.value));
const result = computed(() => editedReview.value);
const attention = computed(() => aiQualityAttention(props.submission));
const wrongPhoto = computed(() => props.task?.qualityFlags?.some(flag => ["wrongImage", "unreadable"].includes(flag)));
// Polling replaces task snapshots. Reset edits only when the actual result changes.
watch(() => JSON.stringify([props.submission?.id, props.task?.id, props.task?.result || null]), () => {
  editedReview.value = props.task?.result ? presentReview(props.task.result) : null;
  editing.value = false;
}, { immediate: true });
const progress = computed(() => ({ queued: 8, reading: 33, reviewing: 72, completed: 100 })[phase.value] || 0);
const step = computed(() => ({ queued: 0, reading: 1, reviewing: 2, completed: 3 })[phase.value] || 0);
const steps = ["识别作品与页序", "分析书写与写作", "整理评分和建议"];
watch(() => props.submission?.id, () => { category.value = "handwriting"; collapsedDimensions.value = []; photoIndex.value = 0; showWork.value = false; });
watch(category, () => { collapsedDimensions.value = []; });
function toggleDimension(id) {
  collapsedDimensions.value = collapsedDimensions.value.includes(id)
    ? collapsedDimensions.value.filter(item => item !== id)
    : [...collapsedDimensions.value, id];
}
function editScore(id, event) {
  if (props.busy || !editedReview.value || props.submission?.published) return;
  const value = String(event.detail.value).trim();
  editedReview.value[category.value].scores[id] = value === "" ? null : Number(value);
}
function completeReview() {
  if (!props.busy && props.teacher && !props.submission?.published && editedReview.value) {
    emit("apply", JSON.parse(JSON.stringify(editedReview.value)));
  }
}
function preview() {
  uni.previewImage({ urls: props.submission.photos.map(photo => displayPhoto(photo.url)), current: photoIndex.value });
}
</script>

<template>
  <view v-if="submission" class="ai-review-panel">
    <view class="ai-work-context">
      <view class="avatar pale">{{ student?.initial || '学' }}</view>
      <view class="grow"><view class="strong">{{ student?.name }} · 第 {{ submission.version }} 版</view><view class="tiny subtle">{{ assignment?.title }}</view></view>
      <text class="ai-type-tag">双写 AI</text>
    </view>

    <view v-if="running" class="card ai-progress-card" role="status" aria-live="polite">
      <view class="card-top"><view class="strong">{{ phase === 'queued' ? '等待开始批阅' : '正在双写批阅' }}</view><text class="small subtle">{{ Math.max(0, step) }} / 3 步</text></view>
      <view class="ai-progress-track"><view class="ai-progress-fill" :style="{ width: progress + '%' }" /></view>
      <view v-for="(label, index) in steps" :key="label" :class="['ai-progress-step', { done: step > index + 1, current: step === index + 1 }]"><view class="ai-step-mark">{{ step > index + 1 ? '✓' : index + 1 }}</view><view class="grow">{{ label }}</view><text class="tiny">{{ step > index + 1 ? '已完成' : step === index + 1 ? '进行中' : '等待中' }}</text></view>
      <button class="text-button full-width spaced" :disabled="busy" @click="emit('refresh')">刷新批阅进度</button>
    </view>

    <template v-else-if="result">
      <view v-if="attention.length" class="notice">{{ attention.join('、') }}{{ teacher ? '，请逐份审核' : '，请核对本次作品' }}</view>
      <view class="ai-result-source"><view class="section-title">AI批阅结果</view><text v-if="task.resultSource === 'sample'" class="ai-example-tag">示例结果</text></view>
      <view class="ai-score-grid">
        <view class="ai-score-card"><view class="small">书写评价</view><view class="ai-score-value">{{ total(result.handwriting) ?? '—' }}<text> / 100</text></view><view class="tiny subtle">笔画 · 结构 · 章法</view></view>
        <view class="ai-score-card ai-score-writing"><view class="small">写作评价</view><view class="ai-score-value">{{ total(result.composition) ?? '—' }}<text> / 100</text></view><view class="tiny subtle">内容 · 情感 · 表达</view></view>
      </view>
      <button v-if="teacher && !submission.published" class="secondary full-width ai-edit-toggle" :disabled="busy" :aria-expanded="editing" @click="editing = !editing">{{ editing ? '收起修改' : '修改评价' }}</button>
      <ReviewEditor
        v-if="teacher && !submission.published && editing"
        :review="editedReview"
        :category="category"
        :readonly="busy"
        @category="(value) => { if (!busy) category = value; }"
        @score="editScore"
      />
      <template v-else>
        <view class="card ai-next-steps"><view class="section-title">批阅建议</view><view class="paragraph small ai-preserve-lines">{{ result.nextSteps }}</view></view>
        <view class="section-heading"><view class="section-title">五大思维</view></view>
        <view class="category-switch ai-category-switch"><button :class="{ active: category === 'handwriting' }" @click="category = 'handwriting'">书写评价</button><button :class="{ active: category === 'composition' }" @click="category = 'composition'">写作评价</button></view>
        <view class="card ai-dimensions"><view class="section-title ai-summary-title">总体评价</view><view class="paragraph small ai-preserve-lines">{{ result[category].summary }}</view>
          <view v-for="item in rubric[category]" :key="item.id" class="ai-dimension">
            <button class="ai-dimension-toggle" :aria-expanded="!collapsedDimensions.includes(item.id)" @click="toggleDimension(item.id)"><text>{{ item.name }}</text><view class="grow" /><text class="strong">{{ result[category].scores[item.id] ?? '—' }} / {{ item.max }}</text><view class="review-collapse-label"><text>{{ collapsedDimensions.includes(item.id) ? '展开' : '收起' }}</text><view :class="['review-chevron', { expanded: !collapsedDimensions.includes(item.id) }]" /></view></button>
            <view v-if="!collapsedDimensions.includes(item.id)" class="ai-dimension-comment small subtle ai-preserve-lines">{{ result[category].comments[item.id] || '本项暂无具体建议。' }}</view>
          </view>
        </view>
      </template>
      <view class="ai-learning-note small">AI可能出错，请核查重要信息。</view>
    </template>

    <view v-else class="card ai-empty-result">
      <view class="section-title">{{ teacher ? (wrongPhoto ? '作品需要核对' : '批阅结果待就绪') : wrongPhoto ? '请重新上传清晰、正确的作品' : '作品已保存，AI结果正在准备' }}</view>
      <view v-if="teacher && wrongPhoto" class="paragraph small">{{ attention.join('、') }}</view>
      <template v-if="!teacher && !submission.published">
        <view v-if="AI_RETRYABLE.includes(phase)" class="paragraph small subtle">系统已自动重试，仍未取得结果。原作品和提交记录保留，可直接用原图再次分析。</view>
        <button v-if="AI_RETRYABLE.includes(phase) && !wrongPhoto" class="primary full-width spaced" :disabled="busy" @click="emit('start')">使用原图重新分析</button>
        <button v-if="AI_RETRYABLE.includes(phase) && !task.reportedAt" class="text-button full-width spaced-small" :disabled="busy" @click="emit('report')">报告学校管理员</button>
        <view v-if="task?.reportedAt" class="tiny subtle spaced-small">问题已报告学校管理员</view>
      </template>
    </view>
    <button v-if="!teacher && wrongPhoto && !submission.published" class="primary full-width spaced" :disabled="busy" @click="emit('resubmit')">重新上传作品</button>

    <view class="card ai-original-work">
      <button class="ai-original-toggle" :aria-expanded="showWork" @click="showWork = !showWork"><view><view class="strong">作业详情</view><view class="tiny subtle">第 {{ submission.version }} 版 · {{ submission.photos.length }} 页 · 原作品保留</view></view><text>{{ showWork ? '收起 ⌃' : '展开 ⌄' }}</text></button>
      <template v-if="showWork">
        <image v-if="submission.photos[photoIndex]" class="ai-work-photo" :src="displayPhoto(submission.photos[photoIndex].url)" mode="aspectFit" @click="preview" />
        <view class="ai-photo-pages"><button v-for="(photo, index) in submission.photos" :key="photo.id" :class="{ active: photoIndex === index }" @click="photoIndex = index">第 {{ index + 1 }} 页</button></view>
        <view v-if="submission.note" class="paragraph small subtle">{{ submission.note }}</view>
      </template>
    </view>
    <view v-if="teacher && !submission.published && result" class="ai-teacher-actions"><button class="primary full-width" :disabled="busy" @click="completeReview">完成批阅</button></view>
    <button v-if="submission.published" class="primary full-width spaced" :disabled="busy" @click="emit('feedback')">查看老师正式反馈</button>
  </view>
</template>
