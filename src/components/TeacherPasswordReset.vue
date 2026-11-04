<script setup>
import { ref } from "vue";
const props = defineProps({ busy: Boolean });
const emit = defineEmits(["reset", "logout"]);
const currentPassword = ref(""), newPassword = ref(""), confirmPassword = ref("");
function submit() {
  if (!props.busy) emit("reset", { currentPassword: currentPassword.value, newPassword: newPassword.value, confirmPassword: confirmPassword.value });
}
</script>

<template>
  <view class="teacher-password-reset">
    <view class="detail-title">首次登录，请修改密码</view>
    <view class="small subtle spaced-small">设置自己的新密码后，即可进入教师工作台。</view>
    <view class="card form-card spaced">
      <view class="field-label">初始密码</view>
      <input v-model="currentPassword" class="form-input" password maxlength="32" :disabled="busy" placeholder="请输入初始密码" :cursor-spacing="100" />
      <view class="field-label">新密码</view>
      <input v-model="newPassword" class="form-input" password maxlength="32" :disabled="busy" placeholder="8—32位，包含字母和数字" :cursor-spacing="100" />
      <view class="field-label">确认新密码</view>
      <input v-model="confirmPassword" class="form-input" password maxlength="32" :disabled="busy" placeholder="请再次输入新密码" :cursor-spacing="100" confirm-type="done" @confirm="submit" />
    </view>
    <button class="primary full-width spaced" :disabled="busy || !currentPassword || !newPassword || !confirmPassword" @click="submit">{{ busy ? '正在保存…' : '保存新密码并继续' }}</button>
    <button class="text-button full-width spaced" :disabled="busy" @click="emit('logout')">退出登录</button>
  </view>
</template>
<style scoped>.teacher-password-reset { padding-top: 24px; }</style>
