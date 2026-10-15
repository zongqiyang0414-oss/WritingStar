<script setup>
import { DEMO_INVITATIONS } from "../services/identity.js";
import { ref } from "vue";

const props = defineProps({
  screen: {},
  role: {},
  needsBinding: {
    type: Boolean,
  },
  signedIn: {
    type: Boolean,
  },
  busy: {
    type: Boolean,
  },
  failSubmit: {
    type: Boolean,
  },
  failAnalysis: {
    type: Boolean,
  },
});
const emit = defineEmits([
  "samples",
  "reset",
  "restartBinding",
  "invite",
  "update:failSubmit",
  "update:failAnalysis",
]);
const expanded = ref(false);
function switchValue(e) {
  return e.detail.value;
}
</script>

<template>
  <view class="prototype-tools">
    <view class="prototype-tools-heading">
      <text> 原型展示 · v0.9.1 </text>
      <button
        class="text-button"
        :aria-expanded="expanded"
        @click="(e) => (expanded = !expanded)"
      >
        {{ expanded ? "收起设置" : "展示设置" }} {{ expanded ? "−" : "＋" }}
      </button>
    </view>
    <template v-if="expanded">
      <view :key="0" class="prototype-tools-body">
        <view class="small subtle">
          样例数据保存在当前浏览器，尚未连接微信、后台及 AI 服务。
        </view>
        <view class="prototype-binding-tools">
          <view class="small subtle spaced-small">
            微信登录按钮仅模拟登录；教师和学生各自保留独立绑定。以下为虚构邀请码：
          </view>
          <template v-for="item1 in DEMO_INVITATIONS" :key="item1.code">
            <template v-if="item1.role === role">
              <button
                :key="0"
                class="prototype-invite"
                :disabled="busy || !needsBinding || !signedIn"
                @click="(e) => emit('invite', item1.code)"
              >
                <text>
                  {{ item1.code }}
                </text>
                <text>
                  {{ item1.label }}
                </text>
              </button>
            </template>
          </template>
          <button
            class="secondary spaced"
            :disabled="busy"
            @click="(e) => emit('restartBinding')"
          >
            重新体验当前身份的绑定
          </button>
        </view>
        <template v-if="'submit' === screen">
          <button
            class="secondary spaced"
            :disabled="busy"
            @click="(e) => emit('samples')"
          >
            装载两页练习作品
          </button>
          <view class="switch-line">
            <text class="small subtle"> 测试提交失败 </text>
            <switch
              :checked="failSubmit"
              color="#257b61"
              :disabled="busy"
              @change="(e) => emit('update:failSubmit', switchValue(e))"
            />
          </view>
          <view class="switch-line">
            <text class="small subtle"> 测试处理失败 </text>
            <switch
              :checked="failAnalysis"
              color="#257b61"
              :disabled="busy"
              @change="(e) => emit('update:failAnalysis', switchValue(e))"
            />
          </view>
        </template>
        <button
          class="text-button spaced"
          :disabled="busy"
          @click="(e) => emit('reset')"
        >
          重置原型数据
        </button>
      </view>
    </template>
  </view>
</template>
