<script setup>
import { rubric, total } from "../services/rubric.js";

const props = defineProps({
  review: {},
  category: {},
  openDimension: {},
  readonly: {
    type: Boolean,
  },
});
const emit = defineEmits(["category", "dimension", "score"]);
</script>

<template>
  <view class="category-switch">
    <button
      :class="{ active: 'handwriting' === category }"
      @click="(e) => emit('category', 'handwriting')"
    >
      书写评价
    </button>
    <button
      :class="{ active: 'composition' === category }"
      @click="(e) => emit('category', 'composition')"
    >
      写作评价
    </button>
  </view>
  <view class="score-overview">
    <view>
      <view class="eyebrow">
        {{ "handwriting" === category ? "书写" : "写作" }} · 五维合计
      </view>
      <view class="score-value">
        {{ total(review[category]) ?? "—" }}
        <text> / 100 </text>
      </view>
    </view>
    <view class="score-note">
      {{ null === total(review[category]) ? "分数待填写" : "由五个分项计算" }}
      <view class="small subtle"> 教师可调整分项评分 </view>
    </view>
  </view>
  <view class="card evaluation-card">
    <view class="section-title"> 五大思维 </view>
    <template v-for="item1 in rubric[category]" :key="item1.id">
      <view class="dimension-editor">
        <view class="dimension-heading">
          <button
            class="dimension-label"
            @click="
              (s) =>
                emit('dimension', openDimension === item1.id ? null : item1.id)
            "
          >
            {{ item1.name }}
            <text class="subtle">
              {{ openDimension === item1.id ? "−" : "＋" }}
            </text>
          </button>
          <view class="score-input-wrap">
            <input
              :aria-label="`${'handwriting' === category ? '书写' : '写作'}${item1.name}分数`"
              :value="review[category].scores[item1.id] ?? ''"
              type="digit"
              :disabled="readonly"
              placeholder="待填"
              @input="(event) => emit('score', item1.id, event)"
            />
            <text> / {{ item1.max }} </text>
          </view>
        </view>
        <view class="score-track">
          <view
            :style="{
              width: `${Math.max(0, Math.min(100, ((review[category].scores[item1.id] || 0) / item1.max) * 100))}%`,
            }"
          />
        </view>
        <template v-if="openDimension === item1.id">
          <view :key="0" class="dimension-expanded">
            <view class="small subtle">
              {{ item1.description }}
            </view>
            <textarea
              :disabled="readonly"
              :aria-label="`${item1.name}评语`"
              placeholder="先写优点，再写不足和改进建议"
              auto-height=""
              :cursor-spacing="100"
              maxlength="1500"
              v-model="review[category].comments[item1.id]"
            />
          </view>
        </template>
      </view>
    </template>
  </view>
  <view class="card form-card">
    <view class="section-title">
      {{ "handwriting" === category ? "书写" : "写作" }}总评
    </view>
    <textarea
      :disabled="readonly"
      :aria-label="('handwriting' === category ? '书写' : '写作') + '总评'"
      placeholder="给孩子具体、可执行的反馈"
      auto-height=""
      :cursor-spacing="100"
      maxlength="1500"
      v-model="review[category].summary"
    />
  </view>
  <view class="card form-card">
    <view class="section-title"> 下一步，先做好这两件事 </view>
    <view class="small subtle spaced-small">
      这段建议会出现在学生反馈页。
    </view>
    <textarea
      :disabled="readonly"
      aria-label="订正建议"
      placeholder="写下优先订正的内容"
      auto-height=""
      :cursor-spacing="100"
      maxlength="1500"
      v-model="review.nextSteps"
    />
  </view>
</template>
