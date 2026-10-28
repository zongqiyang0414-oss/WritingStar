<script setup>
import { ref, watch, nextTick, getCurrentInstance } from "vue";
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
const instance = getCurrentInstance();
const collapsedDimensions = ref([]);
watch(() => [props.category, props.review], () => { collapsedDimensions.value = []; });
function toggleDimension(id) {
  collapsedDimensions.value = collapsedDimensions.value.includes(id)
    ? collapsedDimensions.value.filter(item => item !== id)
    : [...collapsedDimensions.value, id];
}
async function goComposition() {
  emit('category', 'composition');
  await nextTick();
  uni.createSelectorQuery().in(instance.proxy)
    .select('.review-category-start').boundingClientRect()
    .selectViewport().scrollOffset()
    .exec(([rect, viewport]) => {
      if (rect && viewport) uni.pageScrollTo({ scrollTop: Math.max(0, rect.top + viewport.scrollTop - 16), duration: 200 });
    });
}
</script>

<template>
  <view class="review-editor">
  <view class="category-switch review-category-start">
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
    </view>
  </view>
  <view class="card form-card">
    <view class="section-title"> 批阅建议 </view>
    <textarea
      :disabled="readonly"
      aria-label="批阅建议"
      placeholder="写下下一步练习的内容"
      auto-height=""
      :cursor-spacing="100"
      maxlength="1500"
      v-model="review.nextSteps"
    />
  </view>
  <view class="card evaluation-card">
    <view class="section-title"> 五大思维 </view>
    <view v-if="!readonly" class="small subtle review-edit-hint">点击分数或评价可直接修改</view>
    <template v-for="item1 in rubric[category]" :key="item1.id">
      <view class="dimension-editor">
        <view class="dimension-heading">
          <button
            class="dimension-label"
            :aria-expanded="!collapsedDimensions.includes(item1.id)"
            @click="toggleDimension(item1.id)"
          >
            {{ item1.name }}
            <view class="review-collapse-label"><text>{{ collapsedDimensions.includes(item1.id) ? '展开' : '收起' }}</text><view :class="['review-chevron', { expanded: !collapsedDimensions.includes(item1.id) }]" /></view>
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
        <template v-if="!collapsedDimensions.includes(item1.id)">
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
      总体评价
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

  <button v-if="category === 'handwriting'" class="secondary full-width spaced" @click="goComposition">转到写作评价 ›</button>
  </view>
</template>
