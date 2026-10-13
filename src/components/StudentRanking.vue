<script setup lang="ts">
import { computed } from 'vue';
import type { Category, PrototypeState, Student } from '../services/model';
import { studentRanking } from '../services/analytics';
const props = defineProps<{state: PrototypeState; classId: string; category: Category; query: string}>();
const emit = defineEmits<{(e: 'student', value: Student): void; (e: 'update:category', value: Category): void; (e: 'update:query', value: string): void}>();
const ranking = computed(() => studentRanking(props.state, props.classId, props.category, props.query));
const studentCount = computed(() => props.state.students.filter(s => s.classId === props.classId).length);
const className = computed(() => props.state.classes.find(c => c.id === props.classId)?.name);
const label = computed(() => props.category === 'handwriting' ? '书写' : '写作');
function input(event: Event) {emit('update:query', (event as unknown as {detail: {value: string}}).detail.value);}
</script>

<template>
  <view class="analytics-page-intro"><view class="eyebrow">{{ className }} · {{ studentCount }} 位学生</view><view class="detail-title">每个孩子，都在成长</view></view>
  <view class="student-search"><text class="search-symbol">⌕</text><input :value="query" placeholder="搜索学生姓名" maxlength="40" @input="input" /><button v-if="query" class="search-clear" @click="emit('update:query','')">清除</button></view>
  <view class="category-switch ranking-switch"><button :class="{active:category==='handwriting'}" @click="emit('update:category','handwriting')">书写均分排名</button><button :class="{active:category==='composition'}" @click="emit('update:category','composition')">写作均分排名</button></view>
  <view class="ranking-caption"><text class="small subtle">{{ query.trim() ? '找到 ' + ranking.length + ' 位学生 · 保留全班名次' : '全班学生 · 按平均分从高到低' }}</text><text class="tiny subtle">{{ label }} / 100</text></view>
  <button v-for="student in ranking" :key="student.id" class="ranking-row card" @click="emit('student',student)">
    <text :class="['rank-number',{'rank-leading':student.rank!==null && student.rank<=3}]">{{ student.rank ?? '—' }}</text><view class="avatar pale">{{ student.initial }}</view>
    <view class="grow ranking-student"><view class="strong">{{ student.name }}</view><view class="tiny subtle">{{ student.feedbackCount ? student.feedbackCount+' 份作业已发布成绩' : '暂无已发布成绩' }}</view></view>
    <view class="ranking-score"><view class="strong">{{ student[category] ?? '—' }}</view><view class="tiny subtle">{{ label }}均分</view></view><text class="entry-arrow">›</text>
  </button>
  <view v-if="!ranking.length" class="empty-state card">{{ query.trim() ? '没有找到这个名字，试试其他关键词。' : '本班暂时没有学生。' }}</view>
  <view class="small subtle statistics-note">均分覆盖学生全部作业，每份作业只取最近一次已发布成绩。相同均分并列；暂无成绩的学生不参与排名。点击姓名查看个人成长。</view>
</template>
