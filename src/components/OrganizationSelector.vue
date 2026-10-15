<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  organizations: {},
  modelValue: {},
  allowSwitch: {
    type: Boolean,
  },
  disabled: {
    type: Boolean,
  },
});
const emit = defineEmits(["update:modelValue"]);
const expanded = ref(false),
  selectedOrganization = computed(() =>
    props.organizations.find((e) => e.id === props.modelValue),
  );
</script>

<template>
  <view class="organization-context">
    <view class="organization-current">
      <view class="grow">
        <view class="tiny subtle"> 所属学校／机构 </view>
        <view class="strong organization-name">
          {{ selectedOrganization?.name || "尚未分配学校／机构" }}
        </view>
      </view>
      <template v-if="allowSwitch && organizations.length > 1">
        <button
          :key="0"
          class="text-button"
          :disabled="disabled"
          :aria-expanded="expanded"
          @click="(e) => (expanded = !expanded)"
        >
          切换 {{ expanded ? "⌃" : "⌄" }}
        </button>
      </template>
      <template v-else>
        <template v-if="selectedOrganization">
          <text :key="1" class="tiny subtle">
            {{ "school" === selectedOrganization.kind ? "学校" : "机构" }}
          </text>
        </template>
      </template>
    </view>
    <template v-if="expanded && allowSwitch">
      <view :key="0" class="organization-options">
        <template v-for="item1 in organizations" :key="item1.id">
          <button
            :disabled="disabled"
            :class="[
              'organization-option',
              { active: item1.id === modelValue },
            ]"
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
            <view class="grow">
              <view class="strong">
                {{ item1.name }}
              </view>
              <view class="tiny subtle">
                {{ "school" === item1.kind ? "学校" : "教育机构" }}
              </view>
            </view>
            <text>
              {{ item1.id === modelValue ? "✓" : "选择" }}
            </text>
          </button>
        </template>
      </view>
    </template>
  </view>
</template>
