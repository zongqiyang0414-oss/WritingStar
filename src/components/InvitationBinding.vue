<script setup>
import { computed, ref, watch } from "vue";
import { chooseTeacherProof, previewTeacherProof } from "../platform/teacherProof.js";

const props = defineProps({ role: {}, busy: Boolean, application: {}, demoAccount: {} });
const emit = defineEmits(["login", "apply"]);
const pane = ref("login"), username = ref(""), password = ref("");
const name = ref(""), school = ref(""), phone = ref(""), proof = ref(null);
const localError = ref(""), choosing = ref(false), applyingAgain = ref(false);
const isTeacher = computed(() => props.role === "teacher");
const applicationLabel = computed(() => ({ pending: "申请已提交，等待审核", approved: "申请审核已通过", rejected: "申请需重新提交" })[props.application?.status] || "申请已提交");
watch(() => props.role, () => { pane.value = "login"; password.value = ""; localError.value = ""; });
watch(() => props.application, value => { if (value) { pane.value = "apply"; applyingAgain.value = false; } });
watch(() => props.demoAccount, value => { if (value) { username.value = value.username || ""; password.value = value.password || ""; pane.value = "login"; } }, { immediate: true });
function login() {
  localError.value = "";
  if (!username.value.trim() || !password.value) { localError.value = "请输入账号和密码。"; return; }
  emit("login", { username: username.value.trim(), password: password.value });
}
function apply() {
  localError.value = "";
  if (!name.value.trim() || !school.value.trim() || !phone.value.trim()) { localError.value = "请填写姓名、学校和联系电话。"; return; }
  emit("apply", { name: name.value.trim(), school: school.value.trim(), phone: phone.value.trim(), ...(proof.value ? { proof: { ...proof.value } } : {}) });
}
async function chooseProof() {
  choosing.value = true; localError.value = "";
  try { const file = await chooseTeacherProof(); if (file) proof.value = file; }
  catch (error) { localError.value = error.message || "证明材料选择失败，请重试。"; }
  finally { choosing.value = false; }
}
async function viewProof() {
  try { await previewTeacherProof(proof.value); }
  catch (error) { localError.value = error.message || "无法预览证明材料。"; }
}
</script>

<template>
  <view class="binding-view account-entry">
    <view class="account-heading"><view class="detail-title">{{ isTeacher ? '教师' : '学生' }}{{ pane === 'apply' ? '申请开户' : '账号登录' }}</view><view class="small subtle spaced-small">{{ isTeacher ? '审核通过后领取账号，开启教学与班级管理。' : '使用老师发放的账号和密码登录。' }}</view></view>
    <view v-if="isTeacher" class="account-tabs"><button :class="{ active: pane === 'login' }" :disabled="busy" @click="pane = 'login'; localError = ''">账号登录</button><button :class="{ active: pane === 'apply' }" :disabled="busy" @click="pane = 'apply'; localError = ''">申请教师账号</button></view>
    <template v-if="pane === 'login' || !isTeacher">
      <view class="card form-card">
        <view class="field-label">账号</view><input v-model="username" class="form-input" :disabled="busy" maxlength="64" placeholder="请输入账号" :cursor-spacing="100" confirm-type="next" />
        <view class="field-label">密码</view><input v-model="password" class="form-input" :disabled="busy" maxlength="128" password placeholder="请输入密码" :cursor-spacing="100" confirm-type="done" @confirm="login" />
      </view>
      <button class="primary full-width spaced" :disabled="busy || !username.trim() || !password" @click="login">{{ busy ? '登录中…' : '登录' }}</button>
      <view class="account-help small subtle">{{ isTeacher ? '尚未领取账号？请先提交教师申请。账号或密码有误时，请联系平台工作人员。' : '没有账号或忘记密码，请联系任课老师。' }}</view>
    </template>
    <template v-else-if="application && !applyingAgain">
      <view class="card form-card account-application"><text :class="['badge', application.status === 'approved' ? 'green' : 'amber']">{{ applicationLabel }}</text><view class="section-title spaced">{{ application.name }} · {{ application.school }}</view><view class="small subtle spaced-small">联系电话：{{ application.phone }}</view><view v-if="application.proof" class="small subtle spaced-small">已提交证明：{{ application.proof.name }}</view><view class="paragraph small spaced">{{ application.status === 'approved' ? '平台工作人员将通过您留下的联系电话发放账号，请妥善保管账号和密码。' : application.status === 'rejected' ? (application.reviewReason || application.reason || '请核对个人资料，按要求补充证明材料后重新申请。') : '工作人员将核对您的资料；如需补充教师证明，会通过联系电话与您联系。审核通过后颁发账号。' }}</view></view>
      <button v-if="application.status === 'rejected'" class="primary full-width spaced" :disabled="busy" @click="applyingAgain = true">修改资料并重新申请</button><button v-else class="secondary full-width spaced" :disabled="busy" @click="pane = 'login'">返回账号登录</button>
    </template>
    <template v-else>
      <view class="card form-card">
        <view class="field-label">姓名</view><input v-model="name" class="form-input" :disabled="busy" maxlength="30" placeholder="请输入真实姓名" :cursor-spacing="100" />
        <view class="field-label">学校</view><input v-model="school" class="form-input" :disabled="busy" maxlength="80" placeholder="请输入学校全称" :cursor-spacing="100" />
        <view class="field-label">联系电话</view><input v-model="phone" class="form-input" :disabled="busy" maxlength="24" placeholder="请输入可联系到您的电话" :cursor-spacing="100" />
        <view class="field-label">教师证明（选填）</view><view class="small subtle spaced-small">可提供教师资格证或学校出具的在职证明，支持图片、PDF，单份不超过2 MB。</view>
        <view v-if="proof" class="account-proof"><button class="text-button account-proof-name" :disabled="busy" @click="viewProof">{{ proof.name }} ›</button><button class="text-button" :disabled="busy" @click="proof = null">移除</button></view>
        <button class="secondary full-width spaced-small" :disabled="busy || choosing" @click="chooseProof">{{ choosing ? '正在读取…' : proof ? '更换证明材料' : '选择证明材料' }}</button>
      </view>
      <button class="primary full-width spaced" :disabled="busy || choosing || !name.trim() || !school.trim() || !phone.trim()" @click="apply">{{ busy ? '提交中…' : '提交申请' }}</button><view class="account-help small subtle">提交后由平台审核；审核通过后工作人员颁发教师账号。</view>
    </template>
    <view v-if="localError" class="notice account-error" role="alert">{{ localError }}</view>
  </view>
</template>

<style scoped>
.account-entry { padding-top: 12px; }
.account-heading { margin: 12px 0 24px; }
.account-tabs { display: flex; gap: 8px; padding: 5px; background: #edf2ee; border-radius: 14px; margin-bottom: 20px; }
.account-tabs button { flex: 1; margin: 0; padding: 10px 4px; color: #617568; font-size: 14px; background: transparent; border-radius: 10px; }
.account-tabs button.active { background: white; color: #226b50; font-weight: 600; }
.account-help { margin: 20px 4px; line-height: 1.8; }
.account-proof { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.account-proof-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.account-error { margin-top: 16px; }
.account-application { line-height: 1.8; }
</style>
