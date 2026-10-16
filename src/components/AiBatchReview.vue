<script setup>
import { computed, ref } from "vue";
import { AI_RUNNING } from "../services/aiReview.js";

const props = defineProps({ assignment: {}, rows: {}, summary: {}, busy: Boolean });
const emit = defineEmits(["start", "retry", "view", "feedback"]);
const filter = ref("all"), query = ref("");
const filters = [{ id: "all", label: "全部" }, { id: "running", label: "进行中" }, { id: "completed", label: "已完成" }, { id: "attention", label: "需关注" }, { id: "missing", label: "未提交" }];
const visibleRows = computed(() => props.rows.filter((row) => {
  const key = query.value.trim().toLowerCase();
  const matches = !key || `${row.student.name} ${row.student.studentNumber || ""}`.toLowerCase().includes(key);
  const phases = { running: AI_RUNNING, completed: ["completed", "published"], attention: ["failed", "unavailable", "cancelled"], missing: ["missing"] };
  return matches && (filter.value === "all" || phases[filter.value].includes(row.phase));
}));
const done = computed(() => props.summary.completed + props.summary.published);
const percent = computed(() => props.summary.submitted ? Math.round(done.value / props.summary.submitted * 100) : 0);
const tone = (phase) => phase === "failed" ? "failed" : ["completed", "published"].includes(phase) ? "completed" : AI_RUNNING.includes(phase) ? "working" : "neutral";
</script>

<template>
  <view class="ai-batch-panel">
    <view class="eyebrow">{{ assignment.className }} / 全班双写批阅</view>
    <view class="ai-batch-title">{{ assignment.title }}</view>
    <view class="small subtle ai-batch-subtitle">已提交的作品统一进入AI批阅，逐份生成建议，再由老师复核。</view>
    <view class="ai-batch-overview">
      <view class="card-top"><view><view class="tiny subtle">本次作业</view><view class="section-title">{{ summary.running ? '全班批阅进行中' : summary.eligible ? '准备好，开始全班批阅' : summary.submitted ? '查看全班批阅结果' : '等待学生提交作品' }}</view></view><view class="ai-batch-percent">{{ percent }}<text>%</text></view></view>
      <view class="ai-progress-track"><view class="ai-progress-fill" :style="{ width: percent + '%' }" /></view>
      <view class="tiny subtle">已完成AI批阅或老师已发布 {{ done }} / {{ summary.submitted }} 份</view>
      <view class="ai-batch-counts"><view><text>{{ summary.running }}</text><view>处理中</view></view><view><text>{{ summary.completed }}</text><view>AI已完成</view></view><view><text>{{ summary.failed + summary.unavailable }}</text><view>待重试／等待</view></view></view>
      <button class="primary full-width ai-batch-start" :disabled="busy || !summary.eligible" @click="emit('start')">{{ busy ? '加入队列中…' : summary.eligible ? '一键AI批阅 · ' + summary.eligible + ' 份' : summary.running ? '批阅正在进行' : '暂无待AI批阅作品' }}</button>
      <button v-if="summary.failed + summary.unavailable" class="text-button full-width spaced-small" :disabled="busy" @click="emit('retry')">仅重试失败与等待结果的作品</button>
    </view>
    <view class="ai-batch-scope tiny subtle">仅批阅已提交作品。{{ summary.missing }} 位未提交，{{ summary.published }} 份老师反馈已发布；已完成的结果和教师草稿会保留。</view>
    <view class="section-heading"><view class="section-title">学生批阅进度</view><text class="small subtle">已提交 {{ summary.submitted }} / {{ summary.total }}</text></view>
    <view class="student-search"><text class="search-symbol">⌕</text><input v-model="query" maxlength="40" :disabled="busy" placeholder="搜索学生姓名或学号" /><button v-if="query" class="search-clear" @click="query = ''">清除</button></view>
    <view class="ai-batch-filters"><button v-for="option in filters" :key="option.id" :class="{ active: filter === option.id }" :disabled="busy" @click="filter = option.id">{{ option.label }}</button></view>
    <view v-for="row in visibleRows" :key="row.student.id" class="card ai-batch-row">
      <view class="ai-batch-row-top"><view class="avatar pale">{{ row.student.initial }}</view><view class="grow"><view class="strong">{{ row.student.name }}<text v-if="row.former" class="tiny subtle"> · 已离班</text></view><view class="tiny subtle">{{ row.submission ? '第 ' + row.submission.version + ' 版 · ' + row.submission.photos.length + ' 页' : row.student.studentNumber ? '学号 ' + row.student.studentNumber : '还没有提交作品' }}</view></view><text :class="['ai-row-status', tone(row.phase)]">{{ row.label }}</text></view>
      <view v-if="row.submission" class="ai-batch-row-bottom"><text class="tiny subtle">{{ row.phase === 'completed' ? '双写建议已就绪，等待老师复核' : row.phase === 'published' ? '老师正式反馈已发布' : row.phase === 'unavailable' ? '作品保留，暂未取得分析结果' : row.phase === 'failed' ? '作品保留，可单独重试' : AI_RUNNING.includes(row.phase) ? '离开页面后可继续查看进度' : '可先看AI建议，再完成教师复核' }}</text><button class="text-button" :disabled="busy" @click="row.phase === 'published' ? emit('feedback', row.submission) : emit('view', row.submission)">{{ row.phase === 'published' ? '老师反馈' : row.phase === 'completed' ? '查看结果' : AI_RUNNING.includes(row.phase) ? '查看进度' : '查看批阅' }} ›</button></view>
    </view>
    <view v-if="!visibleRows.length" class="card empty-state">{{ query ? '没有找到对应学生。' : '当前筛选下暂无学生。' }}</view>
    <view class="small subtle ai-learning-note">AI结果不会自动发布为老师反馈。复核、保存和发布后，正式成绩才会计入学情。</view>
  </view>
</template>
