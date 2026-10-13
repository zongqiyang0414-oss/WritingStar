<script setup lang="ts">
import { computed } from 'vue';
import type { Category, PrototypeState } from '../services/model';
import { studentAttempts, studentRanking, studentTrend } from '../services/analytics';
import { taskStatus } from '../services/school';
import ScoreTrend from './ScoreTrend.vue';
const props = defineProps<{state: PrototypeState; classId: string; studentId: string; category: Category}>();
const student = computed(() => props.state.students.find(s => s.id === props.studentId && s.classId === props.classId));
const report = computed(() => studentRanking(props.state, props.classId, props.category).find(s => s.id === props.studentId));
const attempts = computed(() => studentAttempts(props.state, props.classId, props.studentId));
const trend = computed(() => studentTrend(props.state, props.classId, props.studentId));
const recentFirst = computed(() => [...attempts.value].reverse());
function date(value: string) {const d = new Date(value); return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
</script>

<template>
  <template v-if="student && report">
    <view class="student-growth-heading"><view class="avatar">{{ student.initial }}</view><view class="grow"><view class="detail-title">{{ student.name }}</view><view class="small subtle">{{ student.className }} · {{ attempts.length }} 次提交</view></view><view class="growth-rank"><view class="strong">{{ report.rank===null ? '—' : '第 '+report.rank+' 名' }}</view><view class="tiny subtle">{{ category==='handwriting' ? '书写' : '写作' }}均分排名</view></view></view>
    <ScoreTrend :points="trend" title="个人成长趋势" subtitle="按提交时间，查看每一轮作品的成绩变化" />
    <view class="student-score-pair growth-averages card"><view><text class="small subtle">书写平均分</text><view class="strong">{{ report.handwriting ?? '—' }}<text class="small subtle"> / 100</text></view></view><view><text class="small subtle">写作平均分</text><view class="strong">{{ report.composition ?? '—' }}<text class="small subtle"> / 100</text></view></view></view>
    <view class="section-heading"><view class="section-title">历次提交成绩</view><text class="small subtle">{{ attempts.length }} 次提交</text></view>
    <view v-for="attempt in recentFirst" :key="attempt.id" class="attempt-score card"><view class="card-top"><view class="strong grow">{{ attempt.assignment.title }}</view><text :class="['badge',attempt.published ? 'green' : 'amber']">{{ taskStatus(attempt) }}</text></view><view class="small subtle attempt-date">{{ date(attempt.submittedAt) }} · 第 {{ attempt.version }} 版{{ attempt.version>1 ? ' · 订正' : '' }}</view><view class="attempt-score-pair"><view><text class="small subtle">书写</text><text class="strong">{{ attempt.handwriting ?? '—' }}<text class="tiny subtle"> / 100</text></text></view><view><text class="small subtle">写作</text><text class="strong">{{ attempt.composition ?? '—' }}<text class="tiny subtle"> / 100</text></text></view></view></view>
    <view v-if="!attempts.length" class="empty-state card">这位学生还没有提交作品。</view>
    <view class="small subtle statistics-note">成长图保留每一轮已发布成绩，包括订正；未发布成绩留空。平均分与排名仍按每份作业最近一次已发布成绩计算。</view>
  </template>
  <view v-else class="empty-state card">未找到这位学生，请返回班级列表。</view>
</template>
