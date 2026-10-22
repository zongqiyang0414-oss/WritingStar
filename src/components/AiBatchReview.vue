<script setup>
import { computed, ref } from "vue";
import { AI_RUNNING } from "../services/aiReview.js";

const props = defineProps({ assignment: {}, rows: {}, summary: {}, busy: Boolean });
const emit = defineEmits(["start", "retry", "publish", "view", "review", "feedback"]);
const filter = ref("all"), query = ref("");
const filters = [
  { id: "all", label: "全部" },
  { id: "running", label: "处理中" },
  { id: "ready", label: "待发布" },
  { id: "published", label: "已发布" },
  { id: "attention", label: "异常／待处理" },
  { id: "missing", label: "未提交" },
];
const needsReview = (row) => row.phase === "completed" && !row.publishable && !!row.publishIssue;
const visibleRows = computed(() => props.rows.filter((row) => {
  const key = query.value.trim().toLowerCase();
  const matches = !key || `${row.student.name} ${row.student.studentNumber || ""}`.toLowerCase().includes(key);
  const inFilter = filter.value === "all"
    || (filter.value === "running" && AI_RUNNING.includes(row.phase))
    || (filter.value === "ready" && row.publishable)
    || (filter.value === "published" && row.phase === "published")
    || (filter.value === "attention" && (["failed", "unavailable", "cancelled", "notStarted"].includes(row.phase) || needsReview(row)))
    || (filter.value === "missing" && row.phase === "missing");
  return matches && inFilter;
}));
function openRow(row) {
  if (row.phase === "published") emit("feedback", row.submission);
  else if (row.publishSource === "teacher" || needsReview(row)) emit("review", row.submission);
  else emit("view", row.submission);
}
const done = computed(() => props.summary.completed + props.summary.published);
const percent = computed(() => props.summary.submitted ? Math.round(done.value / props.summary.submitted * 100) : 0);
const readyCount = computed(() => props.summary.readyToPublish || 0);
const reviewCount = computed(() => props.summary.requiresReview || 0);
const retryCount = computed(() => props.summary.failed + props.summary.unavailable);
function rowStatus(row) {
  if (row.phase === "published") return "已发布";
  if (needsReview(row)) return "待补全评价";
  return row.publishable ? "待发布" : row.label;
}
function tone(row) {
  if (needsReview(row) || ["failed", "unavailable"].includes(row.phase)) return "failed";
  if (row.phase === "published") return "completed";
  if (row.publishable) return "ready";
  return AI_RUNNING.includes(row.phase) ? "working" : "neutral";
}
function rowDescription(row) {
  if (row.phase === "published") return "老师正式反馈已发布";
  if (needsReview(row)) return row.publishIssue;
  if (row.publishable) return row.publishSource === "teacher" ? "使用已修改评价" : "AI结果已就绪，核对后可发布";
  if (row.phase === "unavailable") return "等待AI返回结果，作品已保留";
  if (row.phase === "failed") return "AI批阅失败，可重试";
  if (row.phase === "cancelled") return "已转人工批阅，请查看评价";
  if (row.phase === "notStarted") return "历史作品尚未进入AI批阅";
  return AI_RUNNING.includes(row.phase) ? "正在自动AI批阅" : "查看并核对评价";
}
</script>

<template>
  <view class="ai-batch-panel">
    <view class="eyebrow">{{ assignment.className }} / 全班双写批阅</view>
    <view class="ai-batch-title">{{ assignment.title }}</view>
    <view class="small subtle ai-batch-subtitle">学生提交后自动AI批阅，老师核对后可逐份或一键发布。</view>
    <view class="ai-batch-overview">
      <view class="card-top"><view><view class="tiny subtle">本次作业</view><view class="section-title">AI智能批阅</view></view><view class="ai-batch-percent">{{ percent }}<text>%</text></view></view>
      <view class="ai-progress-track"><view class="ai-progress-fill" :style="{ width: percent + '%' }" /></view>
      <view class="tiny subtle">批阅已完成 {{ done }} / {{ summary.submitted }} 份</view>
      <view class="ai-batch-counts"><view><text>{{ summary.running }}</text><view>处理中</view></view><view><text>{{ readyCount }}</text><view>待发布</view></view><view><text>{{ summary.published }}</text><view>已发布</view></view></view>
      <view v-if="reviewCount || retryCount" class="ai-batch-attention-summary small">
        <text v-if="reviewCount">{{ reviewCount }} 份评价待补全</text>
        <text v-if="retryCount">{{ retryCount }} 份待重试／等待结果</text>
      </view>
      <button class="primary full-width ai-batch-publish" :disabled="busy || !readyCount" @click="emit('publish')">{{ busy ? '处理中…' : readyCount ? '一键发布 · ' + readyCount + ' 份' : '暂无可发布结果' }}</button>
      <view v-if="summary.running && !readyCount" class="tiny subtle ai-batch-waiting">AI批阅正在进行，结果完成后可发布。</view>
      <button v-if="summary.notStarted" class="secondary full-width spaced-small ai-batch-start" :disabled="busy" @click="emit('start')">补跑历史作品AI批阅 · {{ summary.notStarted }} 份</button>
      <button v-if="retryCount" class="text-button full-width spaced-small" :disabled="busy" @click="emit('retry')">重试失败与等待结果的作品</button>
    </view>
    <view class="section-heading"><view class="section-title">学生批阅进度</view><text class="small subtle">已提交 {{ summary.submitted }} / {{ summary.total }}</text></view>
    <view class="student-search"><text class="search-symbol">⌕</text><input v-model="query" maxlength="40" :disabled="busy" placeholder="搜索学生姓名或学号" /><button v-if="query" class="search-clear" @click="query = ''">清除</button></view>
    <view class="ai-batch-filters"><button v-for="option in filters" :key="option.id" :class="{ active: filter === option.id }" :disabled="busy" @click="filter = option.id">{{ option.label }}</button></view>
    <view v-if="filter === 'attention'" class="small subtle ai-batch-filter-note">失败、等待结果或需要补全评价的作品会显示在这里。</view>
    <view v-for="row in visibleRows" :key="row.student.id" class="card ai-batch-row">
      <view class="ai-batch-row-top"><view class="avatar pale">{{ row.student.initial }}</view><view class="grow"><view class="strong">{{ row.student.name }}<text v-if="row.former" class="tiny subtle"> · 已离班</text></view><view class="tiny subtle">{{ row.submission ? '第 ' + row.submission.version + ' 版 · ' + row.submission.photos.length + ' 页' : row.student.studentNumber ? '学号 ' + row.student.studentNumber : '还没有提交作品' }}</view></view><text :class="['ai-row-status', tone(row)]">{{ rowStatus(row) }}</text></view>
      <view v-if="row.submission" class="ai-batch-row-bottom"><text class="tiny subtle">{{ rowDescription(row) }}</text><button class="text-button" :disabled="busy" @click="openRow(row)">{{ row.phase === 'published' ? '查看反馈' : needsReview(row) ? '补全评价' : row.publishSource === 'teacher' ? '查看修改' : row.phase === 'completed' ? '查看结果' : AI_RUNNING.includes(row.phase) ? '查看进度' : '查看批阅' }} ›</button></view>
    </view>
    <view v-if="!visibleRows.length" class="card empty-state">{{ query ? '没有找到对应学生。' : '当前筛选下暂无学生。' }}</view>
    <view class="small subtle ai-learning-note">AI可能出错，请核查重要信息。</view>
  </view>
</template>
