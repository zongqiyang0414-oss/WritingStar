<script setup>
import { canResubmit as resubmissionOpen } from "../services/submissionPolicy.js";
import { computed, ref, watch } from "vue";
import { AI_RUNNING, aiQualityAttention } from "../services/aiReview.js";
import { displayPhoto, presentReview } from "../services/presentation.js";
import { rubric, total } from "../services/rubric.js";

const props = defineProps({ submission: {}, assignment: {}, student: {}, task: {}, teacher: Boolean, busy: Boolean, canResubmit: Boolean, canAllowResubmission: Boolean });
const category = ref("handwriting"), collapsedDimensions = ref([]), photoIndex = ref(0), showWork = ref(false);
const phase = computed(() => props.task?.state || "notStarted");
const running = computed(() => AI_RUNNING.includes(phase.value));
const result = computed(() => props.task?.result ? presentReview(props.task.result) : null);
const attention = computed(() => aiQualityAttention(props.submission));
const wrongPhoto = computed(() => props.task?.qualityFlags?.some(flag => ["wrongImage", "unreadable"].includes(flag)));
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
function preview() {
  uni.previewImage({ urls: props.submission.photos.map(photo => displayPhoto(photo.url)), current: photoIndex.value });
}
</script>

<template>
  <view v-if="submission" class="ai-review-panel">
    <view class="ai-work-context">
      <view class="avatar pale">{{ student?.initial || '学' }}</view>
      <view class="grow"><view class="strong">{{ student?.name }}</view><view class="tiny subtle">{{ assignment?.title }}</view></view>
      <text class="ai-type-tag">双写 AI</text>
    </view>

    <view v-if="resubmissionOpen(submission)" class="notice">{{ teacher ? '已同意学生重新提交一次，等待新的作品。' : '老师已同意你重新提交一次。' }}</view>
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

    <view v-else class="card ai-empty-result">
      <view class="section-title">{{ teacher ? (wrongPhoto ? '作品需要核对' : '批阅结果待就绪') : wrongPhoto ? '请核对本次作品，等待老师处理' : '作品已保存，AI结果正在准备' }}</view>
      <view v-if="teacher && wrongPhoto" class="paragraph small">{{ attention.join('、') }}</view>
    </view>

    <view class="card ai-original-work">
      <button class="ai-original-toggle" :aria-expanded="showWork" @click="showWork = !showWork"><view><view class="strong">作业详情</view><view class="tiny subtle">{{ submission.photos.length }} 页 · {{ submission.submittedBy?.name ? submission.submittedBy.name + '代交' : '学生提交' }}</view></view><text>{{ showWork ? '收起 ⌃' : '展开 ⌄' }}</text></button>
      <template v-if="showWork">
        <image v-if="submission.photos[photoIndex]" class="ai-work-photo" :src="displayPhoto(submission.photos[photoIndex].url)" mode="aspectFit" @click="preview" />
        <view class="ai-photo-pages"><button v-for="(photo, index) in submission.photos" :key="photo.id" :class="{ active: photoIndex === index }" @click="photoIndex = index">第 {{ index + 1 }} 页</button></view>
        <view v-if="submission.note" class="paragraph small subtle">{{ submission.note }}</view>
      </template>
    </view>
  </view>
</template>
