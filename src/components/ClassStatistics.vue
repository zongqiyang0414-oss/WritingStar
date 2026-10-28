<script setup>
import ScoreTrend from "./ScoreTrend.vue";

const props = defineProps({
  model: {},
  panel: {},
});
const emit = defineEmits(["assignment", "students", "update:panel"]);
</script>

<template>
  <view class="statistics-overview card">
    <view>
      <view class="stat-number">
        {{ model.studentCount }}
        <text class="stat-unit"> 人 </text>
      </view>
      <view class="small subtle"> 班级学生 </view>
    </view>
    <view>
      <view class="stat-number">
        {{ model.ongoing }}
        <text class="stat-unit"> 项 </text>
      </view>
      <view class="small subtle"> 进行中作业 </view>
    </view>
    <view>
      <view class="stat-number">
        {{ model.closed }}
        <text class="stat-unit"> 项 </text>
      </view>
      <view class="small subtle"> 已完成作业 </view>
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
      :points="model.trend"
      title="班级平均分趋势"
    />
    <button class="students-entry card" @click="(e) => emit('students')">
      <view>
        <view class="strong"> 查看全班学生学情 </view>
        <view class="small subtle">
          {{ model.studentCount }} 位学生 · 均分排名与个人成长
        </view>
      </view>
      <text class="entry-arrow"> › </text>
    </button>
    <view class="small subtle statistics-note">
      每份作业仅采用每名学生最新提交的已审核成绩计算班级均分。未提交或待审核的成绩不参与，点击图下作业可查看参与人数。
    </view>
  </template>
  <template v-else>
    <view class="small subtle statistics-note">
      每项作业按学生最新一次提交统计；重新提交的作品计入待审核。
    </view>
    <template v-for="item1 in model.assignments" :key="item1.id">
      <view class="assignment-report card">
        <view class="card-top">
          <view class="strong grow">
            {{ item1.title }}
          </view>
          <text
            :class="[
              'badge',
              item1.ongoing ? 'green' : 'neutral',
            ]"
          >
            {{ item1.ongoing ? "进行中" : "已完成" }}
          </text>
        </view>
        <view class="assignment-report-counts">
          <view><text class="metric-number">{{ item1.counts.missing }}</text><view class="small subtle">未提交</view></view>
          <view><text class="metric-number">{{ item1.counts.pending }}</text><view class="small subtle">待审核</view></view>
          <view><text class="metric-number">{{ item1.counts.completed }}</text><view class="small subtle">已完成</view></view>
        </view>
        <view class="card-bottom">
          <text class="small subtle">
            {{ item1.counts.completed }} / {{ item1.counts.total }} 人已完成
          </text>
          <button class="text-button" @click="(e) => emit('assignment', item1)">
            查看作业 ›
          </button>
        </view>
      </view>
    </template>
  </template>
  <template v-if="model.assignments.length" />
  <template v-else>
    <view :key="2" class="empty-state card">
      本班还没有作业，布置后即可查看统计。
    </view>
  </template>
</template>
