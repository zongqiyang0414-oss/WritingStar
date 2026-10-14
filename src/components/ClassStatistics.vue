<script setup lang="ts">
import { computed } from 'vue';
import type { Assignment, PrototypeState } from '../services/model';
import { assignmentCounts, classAssignments, studentReports } from '../services/school';
import { classTrend } from '../services/analytics';
import ScoreTrend from './ScoreTrend.vue';
const props = defineProps<{state: PrototypeState; classId: string; now: number; panel: 'students' | 'assignments'}>();
const emit = defineEmits<{(e: 'assignment', value: Assignment): void; (e: 'students'): void; (e: 'update:panel', value: 'students' | 'assignments'): void}>();
const assignments = computed(() => classAssignments(props.state, props.classId));
const reports = computed(() => studentReports(props.state, props.classId));
const trend = computed(() => classTrend(props.state, props.classId));
const ongoing = computed(() => assignments.value.filter(a => Date.parse(a.dueAt) > props.now).length);
const counts = (a: Assignment) => assignmentCounts(props.state, a);
</script>

<template>
  <view class="statistics-overview card"><view><view class="stat-number">{{ reports.length }}<text class="stat-unit">人</text></view><view class="small subtle">班级学生</view></view><view><view class="stat-number">{{ ongoing }}<text class="stat-unit">项</text></view><view class="small subtle">进行中作业</view></view><view><view class="stat-number">{{ assignments.length - ongoing }}<text class="stat-unit">项</text></view><view class="small subtle">已截止作业</view></view></view>
  <view class="segmented"><button :class="{active:panel==='students'}" @click="emit('update:panel','students')">学生学情</button><button :class="{active:panel==='assignments'}" @click="emit('update:panel','assignments')">作业统计</button></view>
  <template v-if="panel==='students'">
    <ScoreTrend :points="trend" title="班级平均分趋势" subtitle="按作业顺序，查看全班书写与写作的变化" />
    <button class="students-entry card" @click="emit('students')"><view><view class="strong">查看全班学生学情</view><view class="small subtle">{{ reports.length }} 位学生 · 均分排名与个人成长</view></view><text class="entry-arrow">›</text></button>
    <view class="small subtle statistics-note">每份作业按每名学生最近一次已发布成绩计算班级均分。未提交和未发布的成绩不参与，点击图下作业可查看参与人数。</view>
  </template>
  <template v-else>
    <view class="small subtle statistics-note">每项作业按学生最新一次提交统计；重新提交的作品计入待批阅。</view>
    <view v-for="a in assignments" :key="a.id" class="assignment-report card">
      <view class="card-top"><view class="strong grow">{{ a.title }}</view><text :class="['badge', Date.parse(a.dueAt)>now ? 'green' : 'neutral']">{{ Date.parse(a.dueAt)>now ? '进行中' : '已截止' }}</text></view>
      <view class="assignment-progress"><view :style="{width:(counts(a).total ? counts(a).completed / counts(a).total * 100 : 0) + '%'}" /></view>
      <view class="task-counts"><text>未提交 {{ counts(a).missing }}</text><text>待批阅 {{ counts(a).pending }}</text><text>已完成 {{ counts(a).completed }}</text></view>
      <view class="card-bottom"><text class="small subtle">{{ counts(a).completed }} / {{ counts(a).total }} 人已完成</text><button class="text-button" @click="emit('assignment', a)">查看作业 ›</button></view>
    </view>
  </template>
  <view v-if="!assignments.length" class="empty-state card">本班还没有作业，布置后即可查看统计。</view>
</template>
