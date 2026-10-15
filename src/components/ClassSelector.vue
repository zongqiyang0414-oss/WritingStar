<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  classes: {},
  modelValue: {},
  disabled: {
    type: Boolean,
  },
});
const emit = defineEmits(["update:modelValue"]);
const expanded = ref(false),
  selectedClass = computed(() =>
    props.classes.find((e) => e.id === props.modelValue),
  );
</script>

<template>
  <view class="class-selector">
    <button
      class="class-selector-trigger"
      :disabled="disabled"
      :aria-expanded="expanded"
      @click="(e) => (expanded = !expanded)"
    >
      <view>
        <view class="tiny subtle"> 当前班级 </view>
        <view class="strong">
          {{ selectedClass?.name || "选择班级" }}
        </view>
      </view>
      <view class="class-selector-action">
        切换班级
        <text>
          {{ expanded ? "⌃" : "⌄" }}
        </text>
      </view>
    </button>
    <template v-if="expanded">
      <view :key="0" class="class-selector-options">
        <template v-for="item1 in classes" :key="item1.id">
          <button
            :class="['class-option', { active: item1.id === modelValue }]"
            @click="
              (e) => {
                return (
                  (t = item1.id),
                  (expanded = false),
                  void emit('update:modelValue', t)
                );
                var t;
              }
            "
          >
            <text>
              {{ item1.name }}
            </text>
            <text>
              {{ item1.id === modelValue ? "✓" : "选择" }}
            </text>
          </button>
        </template>
      </view>
    </template>
  </view>
</template>
