<script setup>
import { ref } from "vue";
import ScoreTrend from "./ScoreTrend.vue";
defineProps({ groups: { default: () => [] }, studentName: String, busy: Boolean });
defineEmits(["feedback", "ai"]);
const expanded = ref([]);
function toggle(id) { expanded.value = expanded.value.includes(id) ? expanded.value.filter(value => value !== id) : [...expanded.value, id]; }
</script>

<template>
  <view class="submission-history">
    <view class="small subtle history-heading">{{ studentName }} · {{ groups.length }} 份作业</view>
    <view v-for="group in groups" :key="group.id" class="card history-assignment">
      <view class="card-top"><view class="strong">{{ group.title }}</view><text class="badge" :class="group.latest.published ? 'green' : 'amber'">{{ group.latest.published ? '已完成' : '待反馈' }}</text></view>
      <view class="small subtle">最近提交 {{ group.latest.date }} · 共 {{ group.versions.length }} 次提交</view>
      <view v-if="group.latestScore" class="history-score">书写 {{ group.latestScore.handwriting }} / 100 · 写作 {{ group.latestScore.composition }} / 100</view>
      <button class="text-button history-record-toggle" :aria-expanded="expanded.includes(group.id)" @click="toggle(group.id)">{{ expanded.includes(group.id) ? '收起提交记录' : '查看提交记录' }}<text :class="['review-chevron', { expanded: expanded.includes(group.id) }]" /></button>
      <template v-if="expanded.includes(group.id)">
        <ScoreTrend v-if="group.points.length" :points="group.points" title="本次作业订正趋势" subtitle="按提交版次查看已发布的书写和写作分数" />
        <view v-for="version in group.versions" :key="version.id" class="history-version">
          <view class="card-top"><view class="strong">第 {{ version.version }} 版</view><text class="tiny subtle">{{ version.published ? '已发布反馈' : '反馈待发布' }}</text></view>
          <view class="tiny subtle">{{ version.date }} · {{ version.pageCount }} 页{{ version.example ? ' · 示例记录' : '' }}{{ version.submittedBy ? ' · ' + version.submittedBy + '代交' : '' }}</view>
          <view v-if="version.published" class="small history-score">书写 {{ version.handwriting }} / 100 · 写作 {{ version.composition }} / 100</view>
          <button v-if="version.published" class="text-button" :disabled="busy" @click="$emit('feedback', version)">查看这一版作品与反馈 ›</button>
          <button v-else class="text-button" :disabled="busy" @click="$emit('ai', version)">查看这一版作品与批阅进度 ›</button>
        </view>
      </template>
    </view>
    <view v-if="!groups.length" class="card empty-state">还没有提交记录。</view>
  </view>
</template>

<style scoped>
.history-heading { margin-bottom: 18px; }
.history-assignment { padding: 20px; }
.history-record-toggle { display: flex; align-items: center; gap: 10px; margin-top: 16px !important; }
.history-score { margin: 12px 0; color: #63855a; font-size: 14px; }
.history-version { padding: 18px 0; border-top: 1px solid #e5ece5; }
.history-assignment .trend-card { box-shadow: none; }
</style>
