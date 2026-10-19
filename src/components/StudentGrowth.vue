<script setup>
import ScoreTrend from "./ScoreTrend.vue";
import { computed } from "vue";
import { taskStatus } from "../services/school.js";

const props = defineProps({
  model: {},
  category: { default: "handwriting" },
  audience: { default: "teacher" },
});
const emit = defineEmits(["feedback"]);
const recentHistory = computed(() => [...props.model.history].reverse());
function formatSubmittedAt(e) {
  const date = new Date(e);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
</script>

<template>
  <template v-if="model.student && model.summary">
    <view class="student-growth-heading">
      <view class="avatar">
        {{ model.student.initial }}
      </view>
      <view class="grow">
        <view class="detail-title">
          {{ model.student.name }}
        </view>
        <view class="small subtle">
          {{ model.organizationName }} ·
          {{ model.student.className }} · {{ model.history.length }} 次提交
        </view>
      </view>
      <template v-if="'teacher' === audience && model.rankEntry">
        <view :key="0" class="growth-rank">
          <view class="strong">
            {{ null === model.rankEntry.rank ? "—" : "第 " + model.rankEntry.rank + " 名" }}
          </view>
          <view class="tiny subtle">
            {{ "handwriting" === category ? "书写" : "写作" }}均分排名
          </view>
        </view>
      </template>
    </view>
    <template v-if="'learner' === audience">
      <view :key="0" class="personal-growth-summary card">
        <view>
          <view class="strong">
            {{ model.summary.feedbackCount }}
            <text class="small subtle"> 份 </text>
          </view>
          <view class="tiny subtle"> 已收到反馈的作业 </view>
        </view>
        <view>
          <view class="strong">
            {{ model.summary.revisionCount }}
            <text class="small subtle"> 次 </text>
          </view>
          <view class="tiny subtle"> 认真完成的订正 </view>
        </view>
      </view>
    </template>
    <ScoreTrend
      :points="model.trend"
      title="个人成长趋势"
      subtitle="按提交时间，查看每一轮作品的成绩变化"
    />
    <view class="student-score-pair growth-averages card">
      <view>
        <text class="small subtle"> 书写平均分 </text>
        <view class="strong">
          {{ model.summary.handwriting ?? "—" }}
          <text class="small subtle"> / 100 </text>
        </view>
      </view>
      <view>
        <text class="small subtle"> 写作平均分 </text>
        <view class="strong">
          {{ model.summary.composition ?? "—" }}
          <text class="small subtle"> / 100 </text>
        </view>
      </view>
    </view>
    <view class="section-heading">
      <view class="section-title"> 历次提交成绩 </view>
      <text class="small subtle"> {{ model.history.length }} 次提交 </text>
    </view>
    <template v-for="item1 in recentHistory" :key="item1.id">
      <view class="attempt-score card">
        <view class="card-top">
          <view class="strong grow">
            {{ item1.assignment.title }}
          </view>
          <text :class="['badge', item1.published ? 'green' : 'amber']">
            {{ taskStatus(item1) }}
          </text>
        </view>
        <view class="small subtle attempt-date">
          {{ formatSubmittedAt(item1.submittedAt) }} · 第
          {{ item1.version }} 版{{ item1.version > 1 ? " · 订正" : "" }}
        </view>
        <view class="attempt-score-pair">
          <view>
            <text class="small subtle"> 书写 </text>
            <text class="strong">
              {{ item1.handwriting ?? "—" }}
              <text class="tiny subtle"> / 100 </text>
            </text>
          </view>
          <view>
            <text class="small subtle"> 写作 </text>
            <text class="strong">
              {{ item1.composition ?? "—" }}
              <text class="tiny subtle"> / 100 </text>
            </text>
          </view>
        </view>
        <template v-if="'learner' === audience">
          <template v-if="item1.published">
            <button
              :key="0"
              class="text-button spaced-small growth-feedback-link"
              @click="(e) => emit('feedback', item1)"
            >
              阅读这一版反馈 ›
            </button>
          </template>
          <template v-else>
            <view :key="1" class="tiny subtle spaced-small">
              老师尚未发布反馈，本轮暂不显示成绩。
            </view>
          </template>
        </template>
      </view>
    </template>
    <template v-if="model.history.length" />
    <template v-else>
      <view :key="1" class="empty-state card"> 这位学生还没有提交作品。 </view>
    </template>
    <view class="small subtle statistics-note">
      成长图保留每一轮已发布成绩，包括订正；未发布成绩留空。平均分{{
        "teacher" === audience ? "与排名" : ""
      }}按每份作业最近一次已发布成绩计算。
    </view>
  </template>
  <template v-else>
    <view :key="1" class="empty-state card">
      未找到这位学生，请返回班级列表。
    </view>
  </template>
</template>
