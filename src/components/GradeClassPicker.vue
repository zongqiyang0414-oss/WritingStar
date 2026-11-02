<script setup>
import { computed, ref, watch } from "vue";
import { classGrade, groupClasses } from "../services/classGroups.js";

const props = defineProps({ classes: { default: () => [] }, modelValue: String, disabled: Boolean, allowAll: Boolean, placeholder: { default: "请选择班级" } });
const emit = defineEmits(["update:modelValue"]);
const expanded = ref(false), grade = ref("");
const groups = computed(() => groupClasses(props.classes));
const selected = computed(() => props.classes.find(item => item.id === props.modelValue));
const visibleClasses = computed(() => groups.value.find(item => item.name === grade.value)?.classes || []);
watch([groups, () => props.modelValue], () => {
  grade.value = selected.value ? classGrade(selected.value.name) : groups.value[0]?.name || "";
}, { immediate: true });
watch(() => props.disabled, value => { if (value) expanded.value = false; });
function open() {
  if (props.disabled) return;
  grade.value = selected.value ? classGrade(selected.value.name) : groups.value[0]?.name || "";
  expanded.value = !expanded.value;
}
function choose(id) { expanded.value = false; emit("update:modelValue", id); }
</script>

<template>
  <view class="grade-class-picker">
    <button class="date-picker grade-picker-trigger" :disabled="disabled || (!classes.length && !allowAll)" :aria-expanded="expanded" @click="open">
      <text>{{ selected?.name || (allowAll ? '全部班级' : placeholder) }}</text><text>{{ expanded ? '收起 ⌃' : '选择 ›' }}</text>
    </button>
    <view v-if="expanded" class="grade-picker-panel">
      <button v-if="allowAll" class="grade-picker-all" :disabled="disabled" @click="choose('')">全部班级</button>
      <view class="grade-picker-head"><text>年级</text><text>班级</text></view>
      <view class="grade-picker-columns">
        <scroll-view scroll-y class="grade-picker-grades">
          <button v-for="item in groups" :key="item.name" :class="['grade-picker-option', { active: grade === item.name }]" :disabled="disabled" :aria-pressed="grade === item.name" @click="grade = item.name">{{ item.name }}</button>
        </scroll-view>
        <scroll-view scroll-y class="grade-picker-classes">
          <button v-for="item in visibleClasses" :key="item.id" :class="['grade-picker-option', { active: modelValue === item.id }]" :disabled="disabled" :aria-pressed="modelValue === item.id" @click="choose(item.id)"><text>{{ item.name }}</text><text v-if="modelValue === item.id">✓</text></button>
          <view v-if="!visibleClasses.length" class="small subtle grade-picker-empty">该年级暂无可选班级</view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.grade-class-picker { width: 100%; }
.grade-picker-trigger { width: 100%; text-align: left; gap: 12px; }
.grade-picker-panel { margin: 8px 0 14px; border: 1px solid #dce6dc; border-radius: 12px; overflow: hidden; background: #fff; }
.grade-picker-head { display: flex; padding: 10px 0; background: #edf3ed; color: #617760; font-size: 12px; }
.grade-picker-head > text:first-child { width: 34%; padding-left: 14px; box-sizing: border-box; }
.grade-picker-head > text:last-child { padding-left: 14px; }
.grade-picker-columns { display: flex; }
.grade-picker-grades { width: 34%; height: 240px; background: #f5f7f1; }
.grade-picker-classes { width: 66%; height: 240px; }
.grade-picker-option { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 14px 12px; min-height: 48px; text-align: left; border-radius: 0; background: transparent; color: #355345; font-size: 14px; line-height: 1.5; }
.grade-picker-option.active { background: #e3eee5; color: #23634c; font-weight: 700; }
.grade-picker-empty { padding: 14px; }
.grade-picker-all { padding: 12px; width: 100%; color: #23634c; background: #f7faf6; border-bottom: 1px solid #dce6dc; font-size: 14px; }
</style>
