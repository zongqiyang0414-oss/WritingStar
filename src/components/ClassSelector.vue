<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SchoolClass } from '../services/model';
const props = defineProps<{classes: SchoolClass[]; modelValue: string; disabled?: boolean}>();
const emit = defineEmits<{(e: 'update:modelValue', value: string): void}>();
const expanded = ref(false);
const selected = computed(() => props.classes.find(c => c.id === props.modelValue));
function choose(id: string) {expanded.value = false; emit('update:modelValue', id);}
</script>

<template>
  <view class="class-selector">
    <button class="class-selector-trigger" :disabled="disabled" :aria-expanded="expanded" @click="expanded = !expanded">
      <view><view class="tiny subtle">当前班级</view><view class="strong">{{ selected?.name || '选择班级' }}</view></view>
      <view class="class-selector-action">切换班级 <text>{{ expanded ? '⌃' : '⌄' }}</text></view>
    </button>
    <view v-if="expanded" class="class-selector-options">
      <button v-for="c in classes" :key="c.id" :class="['class-option', {active: c.id === modelValue}]" @click="choose(c.id)">
        <text>{{ c.name }}</text><text>{{ c.id === modelValue ? '✓' : '选择' }}</text>
      </button>
    </view>
  </view>
</template>
