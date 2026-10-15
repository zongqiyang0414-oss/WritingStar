<script setup>
import ScoreTrend from "./ScoreTrend.vue";
import {
  activeStudents,
  assignmentCounts,
  classAssignments,
  studentReports,
} from "../services/school.js";
import { computed } from "vue";
import { formatDate, mean } from "../services/analytics.js";
import { total } from "../services/rubric.js";

const props = defineProps({
  state: {},
  classId: {},
  now: {},
  panel: {},
});
const emit = defineEmits(["assignment", "students", "update:panel"]);
const assignments = computed(() =>
    classAssignments(props.state, props.classId),
  ),
  reports = computed(() => studentReports(props.state, props.classId)),
  trend = computed(() =>
    (function (e, a) {
      const t = activeStudents(e, a);
      return classAssignments(e, a).map((a) => {
        const s = t
          .map((t) => {
            var s;
            return e.submissions
              .filter(
                (e) =>
                  e.assignmentId === a.id &&
                  e.studentId === t.id &&
                  e.published,
              )
              .sort((e, a) => a.version - e.version)[0]?.published;
          })
          .filter((e) => !!e);
        return {
          id: a.id,
          label: a.title,
          note: `已发布 ${s.length} / ${t.length} 人`,
          detail: `布置：${formatDate(a.createdAt)} · 截止：${formatDate(a.dueAt)}`,
          handwriting: mean(s.map((e) => total(e.handwriting))),
          composition: mean(s.map((e) => total(e.composition))),
        };
      });
    })(props.state, props.classId),
  ),
  ongoing = computed(
    () =>
      assignments.value.filter((e) => Date.parse(e.dueAt) > props.now).length,
  ),
  counts = (e) => assignmentCounts(props.state, e);
</script>

<template>
  <view class="statistics-overview card">
    <view>
      <view class="stat-number">
        {{ reports.length }}
        <text class="stat-unit"> 人 </text>
      </view>
      <view class="small subtle"> 班级学生 </view>
    </view>
    <view>
      <view class="stat-number">
        {{ ongoing }}
        <text class="stat-unit"> 项 </text>
      </view>
      <view class="small subtle"> 进行中作业 </view>
    </view>
    <view>
      <view class="stat-number">
        {{ assignments.length - ongoing }}
        <text class="stat-unit"> 项 </text>
      </view>
      <view class="small subtle"> 已截止作业 </view>
    </view>
  </view>
  <view class="segmented">
    <button
      :class="{ active: 'students' === panel }"
      @click="(e) => emit('update:panel', 'students')"
    >
      学生学情
    </button>
    <button
      :class="{ active: 'assignments' === panel }"
      @click="(e) => emit('update:panel', 'assignments')"
    >
      作业统计
    </button>
  </view>
  <template v-if="'students' === panel">
    <ScoreTrend
      :points="trend"
      title="班级平均分趋势"
      subtitle="按作业顺序，查看全班书写与写作的变化"
    />
    <button class="students-entry card" @click="(e) => emit('students')">
      <view>
        <view class="strong"> 查看全班学生学情 </view>
        <view class="small subtle">
          {{ reports.length }} 位学生 · 均分排名与个人成长
        </view>
      </view>
      <text class="entry-arrow"> › </text>
    </button>
    <view class="small subtle statistics-note">
      每份作业按每名学生最近一次已发布成绩计算班级均分。未提交和未发布的成绩不参与，点击图下作业可查看参与人数。
    </view>
  </template>
  <template v-else>
    <view class="small subtle statistics-note">
      每项作业按学生最新一次提交统计；重新提交的作品计入待批阅。
    </view>
    <template v-for="item1 in assignments" :key="item1.id">
      <view class="assignment-report card">
        <view class="card-top">
          <view class="strong grow">
            {{ item1.title }}
          </view>
          <text
            :class="[
              'badge',
              Date.parse(item1.dueAt) > now ? 'green' : 'neutral',
            ]"
          >
            {{ Date.parse(item1.dueAt) > now ? "进行中" : "已截止" }}
          </text>
        </view>
        <view class="assignment-progress">
          <view
            :style="{
              width:
                (counts(item1).total
                  ? (counts(item1).completed / counts(item1).total) * 100
                  : 0) + '%',
            }"
          />
        </view>
        <view class="task-counts">
          <text> 未提交 {{ counts(item1).missing }} </text>
          <text> 待批阅 {{ counts(item1).pending }} </text>
          <text> 已完成 {{ counts(item1).completed }} </text>
        </view>
        <view class="card-bottom">
          <text class="small subtle">
            {{ counts(item1).completed }} / {{ counts(item1).total }} 人已完成
          </text>
          <button class="text-button" @click="(e) => emit('assignment', item1)">
            查看作业 ›
          </button>
        </view>
      </view>
    </template>
  </template>
  <template v-if="assignments.length" />
  <template v-else>
    <view :key="2" class="empty-state card">
      本班还没有作业，布置后即可查看统计。
    </view>
  </template>
</template>
