<script setup>
import { canResubmit } from "../services/submissionPolicy.js";
import { computed, ref } from "vue";
import { AI_RUNNING } from "../services/aiReview.js";

const props = defineProps({ assignment: {}, rows: {}, summary: {}, busy: Boolean });
const emit = defineEmits(["publish", "view", "review", "feedback", "allow-resubmission"]);
const filter = ref("all"), query = ref("");
const filters = [
  { id: "all", label: "全部" },
  { id: "running", label: "处理中" },
  { id: "ready", label: "待审核" },
  { id: "published", label: "已审核" },
  { id: "attention", label: "需关注" },
  { id: "missing", label: "未提交" },
];
const needsReview = (row) => row.phase === "completed" && !row.publishable && !row.needsAttention && !canResubmit(row.submission) && !!row.publishIssue;
const visibleRows = computed(() => props.rows.filter((row) => {
  const key = query.value.trim().toLowerCase();
  const matches = !key || `${row.student.name} ${row.student.studentNumber || ""}`.toLowerCase().includes(key);
  const inFilter = filter.value === "all"
    || (filter.value === "running" && (AI_RUNNING.includes(row.phase) || ["failed", "unavailable", "notStarted", "cancelled"].includes(row.phase)))
    || (filter.value === "ready" && row.publishable)
    || (filter.value === "published" && row.phase === "published")
    || (filter.value === "attention" && row.needsAttention)
    || (filter.value === "missing" && row.phase === "missing");
  return matches && inFilter;
}));
function openRow(row) {
  if (row.phase === "published") emit("feedback", row.submission);
  else if (row.needsAttention || row.publishSource === "teacher" || needsReview(row)) emit("review", row.submission);
  else emit("view", row.submission);
}
const done = computed(() => props.summary.completed + props.summary.published);
const percent = computed(() => props.summary.submitted ? Math.round(done.value / props.summary.submitted * 100) : 0);
const readyCount = computed(() => props.summary.readyToPublish || 0);
const reviewCount = computed(() => props.rows.filter(needsReview).length);
function rowStatus(row) {
  if (canResubmit(row.submission)) return "等待重新提交";
  if (row.phase === "published") return "已审核";
  if (row.needsAttention) return "需逐份审核";
  if (["failed", "unavailable", "notStarted", "cancelled"].includes(row.phase)) return "结果待就绪";
  if (needsReview(row)) return "待补全评价";
  return row.publishable ? "待审核" : row.label;
}
function tone(row) {
  if (row.needsAttention || needsReview(row)) return "failed";
  if (row.phase === "published") return "completed";
  if (row.publishable) return "ready";
  return AI_RUNNING.includes(row.phase) ? "working" : "neutral";
}
function rowDescription(row) {
  if (canResubmit(row.submission)) return "已同意学生重新提交一次";
  if (row.phase === "published") return "老师已完成审核，可查看正式反馈";
  if (row.needsAttention) return row.qualityReasons.join("、") + "，请逐份审核";
  if (needsReview(row)) return row.publishIssue;
  if (row.publishable) return row.publishSource === "teacher" ? "使用已修改评价" : "AI结果已就绪，等待教师审核";
  return "结果尚未就绪，系统正在处理";
}
</script>

<template>
  <view class="ai-batch-panel">
    <view class="eyebrow">{{ assignment.className }} / 全班双写批阅</view>
    <view class="ai-batch-title">{{ assignment.title }}</view>
    <view class="small subtle ai-batch-subtitle">学生提交后自动AI批阅，教师完成审核后学生即可查看反馈。</view>
    <view class="ai-batch-overview">
      <view class="card-top"><view><view class="tiny subtle">本次作业</view><view class="section-title">AI智能批阅</view></view><view class="ai-batch-percent">{{ percent }}<text>%</text></view></view>
      <view class="ai-progress-track"><view class="ai-progress-fill" :style="{ width: percent + '%' }" /></view>
      <view class="tiny subtle">批阅已完成 {{ done }} / {{ summary.submitted }} 份</view>
      <view class="ai-batch-counts"><view><text>{{ summary.running + summary.waiting }}</text><view>处理中</view></view><view><text>{{ readyCount }}</text><view>待审核</view></view><view><text>{{ summary.published }}</text><view>已审核</view></view></view>
      <view v-if="reviewCount || summary.attention" class="ai-batch-attention-summary small">
        <text v-if="reviewCount">{{ reviewCount }} 份评价待补全</text>
        <text v-if="summary.attention">{{ summary.attention }} 份作品需逐份审核</text>
      </view>
      <button class="primary full-width ai-batch-publish" :disabled="busy || !readyCount" @click="emit('publish')">{{ busy ? '处理中…' : readyCount ? '教师一键审核 · ' + readyCount + ' 份' : '暂无可审核作业' }}</button>
      <view v-if="summary.running && !readyCount" class="tiny subtle ai-batch-waiting">AI批阅正在进行，结果完成后可审核。</view>
    </view>
    <view class="section-heading"><view class="section-title">学生批阅进度</view><text class="small subtle">已提交 {{ summary.submitted }} / {{ summary.total }}</text></view>
    <view class="student-search"><text class="search-symbol">⌕</text><input v-model="query" maxlength="40" :disabled="busy" placeholder="搜索学生姓名或学号" /><button v-if="query" class="search-clear" @click="query = ''">清除</button></view>
    <view class="ai-batch-filters"><button v-for="option in filters" :key="option.id" :class="{ active: filter === option.id }" :disabled="busy" @click="filter = option.id">{{ option.label }}</button></view>
    <view v-if="filter === 'attention'" class="small subtle ai-batch-filter-note">展示任一项低于60分、疑似传错图片或无法有效识别的作品；需逐份审核，不参与一键审核。</view>
    <view v-for="row in visibleRows" :key="row.student.id" class="card ai-batch-row">
      <view class="ai-batch-row-top"><view class="avatar pale">{{ row.student.initial }}</view><view class="grow"><view class="strong">{{ row.student.name }}<text v-if="row.former" class="tiny subtle"> · 已离班</text></view><view class="tiny subtle">{{ row.submission ? row.submission.photos.length + ' 页' : row.student.studentNumber ? '学号 ' + row.student.studentNumber : '还没有提交作品' }}</view></view><text :class="['ai-row-status', tone(row)]">{{ rowStatus(row) }}</text></view>
      <view v-if="row.submission && !row.former" class="ai-batch-row-bottom"><text class="tiny subtle">{{ canResubmit(row.submission) ? '等待学生更新作品' : '提交后锁定' }}</text><text v-if="canResubmit(row.submission)" class="tiny subtle resubmission-agreed">已同意重新提交</text><button v-else class="text-button" :disabled="busy" @click="emit('allow-resubmission', row.submission)">同意重新提交</button></view>
      <view v-if="row.submission" class="ai-batch-row-bottom"><text class="tiny subtle">{{ rowDescription(row) }}</text><button class="text-button" :disabled="busy" @click="openRow(row)">查看详情 ›</button></view>
    </view>
    <view v-if="!visibleRows.length" class="card empty-state">{{ query ? '没有找到对应学生。' : '当前筛选下暂无学生。' }}</view>
    <view class="small subtle ai-learning-note">AI可能出错，请核查重要信息。</view>
  </view>
</template>
