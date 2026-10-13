<script setup lang="ts">
import type { Category, DimensionId, Review } from '../services/model';
import { rubric, total } from '../services/rubric';
defineProps<{review: Review; category: Category; openDimension: DimensionId | null; readonly: boolean}>();
const emit=defineEmits<{(e:'category',value:Category):void;(e:'dimension',value:DimensionId|null):void;(e:'score',id:DimensionId,event:{detail:{value:string}}):void}>();
function onScore(id: DimensionId,event: Event) {emit('score',id,event as unknown as {detail:{value:string}});}
</script>
<template>
  <view class="category-switch"><button :class="{active:category==='handwriting'}" @click="emit('category','handwriting')">书写评价</button><button :class="{active:category==='composition'}" @click="emit('category','composition')">写作评价</button></view>
  <view class="score-overview"><view><view class="eyebrow">{{ category==='handwriting' ? '书写' : '写作' }} · 五维合计</view><view class="score-value">{{ total(review[category]) ?? '—' }}<text>/ 100</text></view></view><view class="score-note">{{ total(review[category])===null ? '分数待填写' : '由五个分项计算' }}<view class="small subtle">教师可调整分项评分</view></view></view>
  <view class="card evaluation-card"><view class="section-title">五大思维</view><view v-for="d in rubric[category]" :key="d.id" class="dimension-editor"><view class="dimension-heading"><button class="dimension-label" @click="emit('dimension',openDimension===d.id ? null : d.id)">{{ d.name }}<text class="subtle">{{ openDimension===d.id ? '−' : '＋' }}</text></button><view class="score-input-wrap"><input :aria-label="`${category==='handwriting' ? '书写' : '写作'}${d.name}分数`" :value="review[category].scores[d.id] ?? ''" type="digit" :disabled="readonly" placeholder="待填" @input="onScore(d.id,$event)" /><text>/ {{ d.max }}</text></view></view><view class="score-track"><view :style="{width:`${Math.max(0,Math.min(100,((review[category].scores[d.id] || 0)/d.max)*100))}%`}" /></view><view v-if="openDimension===d.id" class="dimension-expanded"><view class="small subtle">{{ d.description }}</view><textarea v-model="review[category].comments[d.id]" :disabled="readonly" :aria-label="`${d.name}评语`" placeholder="先写优点，再写不足和改进建议" auto-height maxlength="1500" /></view></view></view>
  <view class="card form-card"><view class="section-title">{{ category==='handwriting' ? '书写' : '写作' }}总评</view><textarea v-model="review[category].summary" :disabled="readonly" :aria-label="`${category==='handwriting' ? '书写' : '写作'}总评`" placeholder="给孩子具体、可执行的反馈" auto-height maxlength="1500" /></view>
  <view class="card form-card"><view class="section-title">下一步，先做好这两件事</view><view class="small subtle spaced-small">这段建议会出现在学生反馈页。</view><textarea v-model="review.nextSteps" :disabled="readonly" aria-label="订正建议" placeholder="写下优先订正的内容" auto-height maxlength="1500" /></view>
</template>

