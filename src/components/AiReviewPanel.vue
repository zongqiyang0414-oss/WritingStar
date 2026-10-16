<script setup>
import { computed, ref, watch } from "vue";
import { AI_LABELS, AI_RUNNING, AI_RETRYABLE } from "../services/aiReview.js";
import { displayPhoto, presentReview } from "../services/presentation.js";
import { rubric, total } from "../services/rubric.js";

const props = defineProps({ submission: {}, assignment: {}, student: {}, task: {}, teacher: Boolean, busy: Boolean });
const emit = defineEmits(["start", "refresh", "review", "apply", "feedback", "back"]);
const category = ref("handwriting"), dimension = ref("imaginal"), photoIndex = ref(0), showWork = ref(false);
const phase = computed(() => props.task?.state || "notStarted");
const running = computed(() => AI_RUNNING.includes(phase.value));
const result = computed(() => props.task?.result ? presentReview(props.task.result) : null);
const progress = computed(() => ({ queued: 8, reading: 33, reviewing: 72, completed: 100 })[phase.value] || 0);
const step = computed(() => ({ queued: 0, reading: 1, reviewing: 2, completed: 3 })[phase.value] || 0);
const steps = ["识别作品与页序", "分析书写与写作", "整理评分和建议"];
const headline = computed(() => ({
  queued: "作品已收到，正在排队", reading: "正在读你的作品", reviewing: "从书写到表达，逐项看看",
  completed: props.teacher ? "这份作品的AI建议已就绪" : "你的双写建议已就绪",
  failed: "这次批阅还没有完成", unavailable: "作品已收到，结果还在等待中",
  cancelled: "这份作品已转为老师批阅", notStarted: "让每一份作品都有改进方向",
})[phase.value]);
watch(() => props.submission?.id, () => { category.value = "handwriting"; dimension.value = "imaginal"; photoIndex.value = 0; showWork.value = false; });
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

    <view :class="['ai-result-hero', { 'ai-result-ready': result }]">
      <view class="ai-orb">✧</view>
      <view class="eyebrow">{{ result ? 'AI学习建议 / 双写评价' : 'AI批阅 / 每一步都看得见' }}</view>
      <view class="ai-result-headline">{{ headline }}</view>
      <view class="small">{{ result ? '书写和写作分别评价，看看这一次的亮点与下一步。' : '作品已保存。可以留在这里查看进度，也可以稍后从作业或记录继续查看。' }}</view>
      <view class="ai-result-status"><text class="ai-status-dot" :class="{ pulsing: running }" />{{ AI_LABELS[phase] }}<text v-if="task?.attempt > 1"> · 第 {{ task.attempt }} 次尝试</text></view>
    </view>

    <view v-if="running" class="card ai-progress-card" role="status" aria-live="polite">
      <view class="card-top"><view class="strong">{{ phase === 'queued' ? '等待开始批阅' : '正在双写批阅' }}</view><text class="small subtle">{{ Math.max(0, step) }} / 3 步</text></view>
      <view class="ai-progress-track"><view class="ai-progress-fill" :style="{ width: progress + '%' }" /></view>
      <view v-for="(label, index) in steps" :key="label" :class="['ai-progress-step', { done: step > index + 1, current: step === index + 1 }]"><view class="ai-step-mark">{{ step > index + 1 ? '✓' : index + 1 }}</view><view class="grow">{{ label }}</view><text class="tiny">{{ step > index + 1 ? '已完成' : step === index + 1 ? '进行中' : '等待中' }}</text></view>
      <button class="text-button full-width spaced" :disabled="busy" @click="emit('refresh')">刷新批阅进度</button>
    </view>

    <template v-else-if="result">
      <view class="ai-result-source"><text v-if="task.resultSource === 'sample'" class="ai-example-tag">练习作品 · 示例结果</text><text class="tiny subtle">{{ submission.published ? '老师已发布正式反馈' : '老师正式反馈待发布' }}</text></view>
      <view class="ai-score-grid">
        <view class="ai-score-card"><view class="small">书写评价</view><view class="ai-score-value">{{ total(result.handwriting) ?? '—' }}<text> / 100</text></view><view class="tiny subtle">笔画 · 结构 · 章法</view></view>
        <view class="ai-score-card ai-score-writing"><view class="small">写作评价</view><view class="ai-score-value">{{ total(result.composition) ?? '—' }}<text> / 100</text></view><view class="tiny subtle">内容 · 情感 · 表达</view></view>
      </view>
      <view class="card ai-next-steps"><view class="eyebrow">下一步 / 把建议变成进步</view><view class="section-title">先做好这两件事</view><view class="paragraph small ai-preserve-lines">{{ result.nextSteps }}</view></view>
      <view class="section-heading"><view class="section-title">五大思维，逐项看看</view><text class="tiny subtle">两套百分制</text></view>
      <view class="category-switch ai-category-switch"><button :class="{ active: category === 'handwriting' }" @click="category = 'handwriting'">书写评价</button><button :class="{ active: category === 'composition' }" @click="category = 'composition'">写作评价</button></view>
      <view class="card ai-dimensions"><view class="paragraph small">{{ result[category].summary }}</view>
        <view v-for="item in rubric[category]" :key="item.id" class="ai-dimension">
          <button class="ai-dimension-toggle" :aria-expanded="dimension === item.id" @click="dimension = dimension === item.id ? '' : item.id"><text>{{ item.name }}</text><view class="grow" /><text class="strong">{{ result[category].scores[item.id] ?? '—' }} / {{ item.max }}</text><text class="ai-dimension-arrow">{{ dimension === item.id ? '−' : '＋' }}</text></button>
          <view v-if="dimension === item.id" class="ai-dimension-comment small subtle">{{ result[category].comments[item.id] || '本项暂无具体建议。' }}</view>
        </view>
      </view>
      <view class="ai-learning-note small">AI建议供学习参考，老师的正式反馈单独发布。你可以先阅读建议，再结合老师的反馈订正。</view>
    </template>

    <view v-else class="card ai-empty-result">
      <view class="section-title">{{ phase === 'notStarted' ? '开始这份作品的AI批阅' : phase === 'cancelled' ? '等待老师的建议' : '作品和提交记录都已保留' }}</view>
      <view class="paragraph small subtle">{{ task?.error || (phase === 'notStarted' ? '已提交的作品可以直接开始批阅，无需重新上传。' : '老师会继续查看这份作品。正式反馈发布后，可以从作业和记录中阅读。') }}</view>
      <button v-if="!submission.published && (phase === 'notStarted' || AI_RETRYABLE.includes(phase))" class="primary full-width spaced" :disabled="busy" @click="emit('start')">{{ busy ? '提交中…' : phase === 'notStarted' ? '开始AI批阅' : '重试AI批阅' }}</button>
    </view>

    <view class="card ai-original-work">
      <button class="ai-original-toggle" :aria-expanded="showWork" @click="showWork = !showWork"><view><view class="strong">回看本次作品</view><view class="tiny subtle">第 {{ submission.version }} 版 · {{ submission.photos.length }} 页 · 原作品保留</view></view><text>{{ showWork ? '收起 ⌃' : '展开 ⌄' }}</text></button>
      <template v-if="showWork">
        <image v-if="submission.photos[photoIndex]" class="ai-work-photo" :src="displayPhoto(submission.photos[photoIndex].url)" mode="aspectFit" @click="preview" />
        <view class="ai-photo-pages"><button v-for="(photo, index) in submission.photos" :key="photo.id" :class="{ active: photoIndex === index }" @click="photoIndex = index">第 {{ index + 1 }} 页</button></view>
        <view v-if="submission.note" class="paragraph small subtle">{{ submission.note }}</view>
      </template>
    </view>
    <view v-if="teacher && !submission.published" class="ai-teacher-actions"><button v-if="result" class="primary full-width" :disabled="busy" @click="emit('apply')">应用AI建议并复核</button><button class="secondary full-width spaced-small" :disabled="busy" @click="emit('review')">{{ result ? '保留当前草稿，进入复核' : '由老师人工批阅' }}</button></view>
    <button v-if="submission.published" class="primary full-width spaced" :disabled="busy" @click="emit('feedback')">查看老师正式反馈 ↗</button>
    <button class="text-button full-width spaced" :disabled="busy" @click="emit('back')">{{ teacher ? '返回作业批阅' : '返回我的作业' }}</button>
  </view>
</template>
