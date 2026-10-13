<script setup lang="ts">
import { ref } from 'vue';
import type { Screen } from '../services/model';
defineProps<{screen: Screen; busy: boolean; failSubmit: boolean; failAnalysis: boolean}>();
const expanded = ref(false);
const emit = defineEmits<{
  (e: 'samples'): void;
  (e: 'reset'): void;
  (e: 'update:failSubmit', value: boolean): void;
  (e: 'update:failAnalysis', value: boolean): void;
}>();
function checked(event: Event) {
  return (event as unknown as {detail: {value: boolean}}).detail.value;
}
</script>

<template>
  <view class="prototype-tools">
    <view class="prototype-tools-heading">
      <text>原型展示 · v0.4</text>
      <button class="text-button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起设置' : '展示设置' }} {{ expanded ? '−' : '＋' }}</button>
    </view>
    <view v-if="expanded" class="prototype-tools-body">
      <view class="small subtle">样例数据保存在当前浏览器，尚未连接微信、后台及 AI 服务。</view>
      <template v-if="screen === 'submit'">
        <button class="secondary spaced" :disabled="busy" @click="emit('samples')">装载两页练习作品</button>
        <view class="switch-line"><text class="small subtle">测试提交失败</text><switch :checked="failSubmit" color="#257b61" :disabled="busy" @change="emit('update:failSubmit', checked($event))" /></view>
        <view class="switch-line"><text class="small subtle">测试处理失败</text><switch :checked="failAnalysis" color="#257b61" :disabled="busy" @change="emit('update:failAnalysis', checked($event))" /></view>
      </template>
      <button class="text-button spaced" :disabled="busy" @click="emit('reset')">重置原型数据</button>
    </view>
  </view>
</template>
