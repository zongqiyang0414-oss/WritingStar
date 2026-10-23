<script setup>
import { computed } from "vue";

const props = defineProps({
  model: {},
  category: {},
  query: {},
});
const emit = defineEmits(["student", "update:category", "update:query"]);
const categoryLabel = computed(() =>
  "handwriting" === props.category ? "书写" : "写作",
);
function updateQuery(e) {
  emit("update:query", e.detail.value);
}
</script>

<template>
  <view class="analytics-page-intro">
    <view class="eyebrow">
      {{ model.organizationName }} · {{ model.className }} ·
      {{ model.studentCount }} 位学生
    </view>
    <view class="detail-title"> 每个孩子，都在成长 </view>
  </view>
  <view class="student-search">
    <text class="search-symbol"> ⌕ </text>
    <input
      :value="query"
      placeholder="搜索学生姓名"
      maxlength="40"
      @input="updateQuery"
    />
    <template v-if="query">
      <button
        :key="0"
        class="search-clear"
        @click="(e) => emit('update:query', '')"
      >
        清除
      </button>
    </template>
  </view>
  <view class="category-switch ranking-switch">
    <button
      :class="{ active: 'handwriting' === category }"
      @click="(e) => emit('update:category', 'handwriting')"
    >
      书写均分排名
    </button>
    <button
      :class="{ active: 'composition' === category }"
      @click="(e) => emit('update:category', 'composition')"
    >
      写作均分排名
    </button>
  </view>
  <view class="ranking-caption">
    <text class="small subtle">
      {{
        query.trim()
          ? "找到 " + model.ranks.length + " 位学生 · 保留全班名次"
          : "全班学生 · 按平均分从高到低"
      }}
    </text>
    <text class="tiny subtle"> {{ categoryLabel }} / 100 </text>
  </view>
  <template v-for="item1 in model.ranks" :key="item1.id">
    <button class="ranking-row card" @click="(e) => emit('student', item1)">
      <text
        :class="[
          'rank-number',
          { 'rank-leading': null !== item1.rank && item1.rank <= 3 },
        ]"
      >
        {{ item1.rank ?? "—" }}
      </text>
      <view class="avatar pale">
        {{ item1.initial }}
      </view>
      <view class="grow ranking-student">
        <view class="strong">
          {{ item1.name }}
        </view>
        <view class="tiny subtle">
          {{
            item1.feedbackCount
              ? item1.feedbackCount + " 份作业已审核成绩"
              : "暂无已审核成绩"
          }}
        </view>
      </view>
      <view class="ranking-score">
        <view class="strong">
          {{ item1[category] ?? "—" }}
        </view>
        <view class="tiny subtle"> {{ categoryLabel }}均分 </view>
      </view>
      <text class="entry-arrow"> › </text>
    </button>
  </template>
  <template v-if="model.ranks.length" />
  <template v-else>
    <view :key="0" class="empty-state card">
      {{
        query.trim()
          ? "没有找到这个名字，试试其他关键词。"
          : "本班暂时没有学生。"
      }}
    </view>
  </template>
  <view class="small subtle statistics-note">
    均分覆盖学生全部作业，每份作业只取最新提交的已审核成绩，最新作品待审核时不沿用旧成绩。相同均分并列；暂无成绩的学生不参与排名。点击姓名查看个人成长。
  </view>
</template>
