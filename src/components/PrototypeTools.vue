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
      <text> 原型展示 · v0.18.0 </text>
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
        <view class="small subtle spaced-small">AI界面可用内置练习作品体验示例评分；自选照片只演示任务进度与等待结果，不会生成虚构分数。教师草稿与学生可见的AI结果分别保存。</view>
        <view class="small subtle spaced-small">纸质作业：学生码识别、四角校正与草稿保存在设备本机完成；H5支持连续自动拍摄。微信端使用系统拍照／相册与画布处理，仍待真机确认。跨设备收件、云端存储及真实AI批阅待后端接入。</view>
        <view class="prototype-binding-tools">
          <view class="small subtle spaced-small">
            微信登录按钮仅模拟登录；教师、学生和管理员各自保留独立绑定。管理员权限正式接入时由服务端授权。以下为虚构邀请码：
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
        <view v-if="screen === 'aiBatch' || screen === 'aiReview'" class="switch-line"><text class="small subtle">测试下一次AI批阅失败</text><switch :checked="failAnalysis" color="#257b61" :disabled="busy" @change="emit('update:failAnalysis', switchValue($event))" /></view>
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
