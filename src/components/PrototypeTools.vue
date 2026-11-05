<script setup>
import { computed, ref } from "vue";
import { previewTeacherProof } from "../platform/teacherProof.js";

const props = defineProps({
  screen: {},
  role: {},
  credentials: { type: Array, default: () => [] },
  applications: { type: Array, default: () => [] },
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
  "use-account",
  "review-application",
  "update:failSubmit",
  "update:failAnalysis",
]);
const expanded = ref(false);
const reviewExpanded = ref(false), reasons = ref({}), proofError = ref("");
const roleCredentials = computed(() => props.credentials.filter(item => item.role === props.role));
function applicationCredential(application) {
  return props.credentials.find(item => item.id === application.credentialId);
}
function statusLabel(status) { return ({ pending: "待审核", approved: "已颁发账号", rejected: "已退回" })[status] || status; }
function reviewApplication(application, decision) {
  emit("review-application", { id: application.id, decision, reason: (reasons.value[application.id] || "").trim() });
}
async function viewProof(proof) {
  proofError.value = "";
  try { await previewTeacherProof(proof); }
  catch (error) { proofError.value = error.message || "证明材料暂时无法预览。"; }
}
function switchValue(e) {
  return e.detail.value;
}
</script>

<template>
  <view class="prototype-tools">
    <view class="prototype-tools-heading">
      <text> 原型展示 · v0.28.0 </text>
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
          演示数据保存在当前设备，账号、审核与 AI 服务尚未连接真实后台。
        </view>
        <view class="small subtle spaced-small">AI界面可用内置练习作品体验示例评分；自选照片只演示任务进度与等待结果，不会生成虚构分数。教师草稿与学生可见的AI结果分别保存。</view>
        <view class="small subtle spaced-small">纸质作业：学生码识别、四角校正与草稿保存在设备本机完成；H5支持连续自动拍摄。微信端使用系统拍照／相册与画布处理，仍待真机确认。跨设备收件、云端存储及真实AI批阅待后端接入。</view>
        <view class="prototype-binding-tools">
          <view class="small subtle spaced-small">
            本机模拟账号：点击可填入当前身份的登录表单。教师账号审核后颁发，学生账号由教师导入生成。
          </view>
          <template v-for="item1 in roleCredentials" :key="item1.id">
              <button
                class="prototype-invite"
                :disabled="busy || !needsBinding || !!item1.passwordChangedAt || !!item1.disabled"
                @click="emit('use-account', item1)"
              >
                <text>
                  {{ item1.username }}
                </text>
                <text>
                  {{ item1.passwordChangedAt ? '密码已修改' : '密码：' + item1.password }}
                </text>
              </button>
          </template>
          <view v-if="!roleCredentials.length" class="small subtle spaced-small">{{ role === 'teacher' ? '暂无教师账号，请先申请并在模拟平台审核区颁发。' : '暂无学生账号，请先由教师导入学生。' }}</view>
          <button
            class="secondary spaced"
            :disabled="busy"
            @click="(e) => emit('restartBinding')"
          >
            退出当前身份，重新体验账号登录
          </button>
        </view>
        <view class="prototype-review-tools">
          <button class="secondary full-width spaced" :disabled="busy" :aria-expanded="reviewExpanded" @click="reviewExpanded = !reviewExpanded">模拟平台后台 · 教师申请审核 {{ reviewExpanded ? '−' : '＋' }}</button>
          <template v-if="reviewExpanded">
            <view class="small subtle spaced-small">此处演示平台工作人员核验资料、审核与颁发账号。正式后台、电话通知及账号安全存储待后端接入。</view>
            <view v-for="application in applications" :key="application.id" class="prototype-application-card">
              <view class="section-heading"><view class="strong">{{ application.name }}</view><text :class="['badge', application.status === 'approved' ? 'green' : 'amber']">{{ statusLabel(application.status) }}</text></view>
              <view class="small subtle">{{ application.school }}</view><view class="small subtle spaced-small">联系电话：{{ application.phone }}</view>
              <button v-if="application.proof" class="text-button spaced-small" :disabled="busy" @click="viewProof(application.proof)">查看证明：{{ application.proof.name }} ›</button><view v-else class="small subtle spaced-small">未附教师证明，可通过联系电话要求补充材料。</view>
              <template v-if="application.status === 'pending'">
                <textarea v-model="reasons[application.id]" class="form-textarea prototype-review-reason" :disabled="busy" maxlength="200" placeholder="审核备注或需补充的资料（退回时必填）" auto-height />
                <view class="prototype-review-actions"><button class="secondary" :disabled="busy || !reasons[application.id]?.trim()" @click="reviewApplication(application, 'rejected')">退回补充</button><button class="primary" :disabled="busy" @click="reviewApplication(application, 'approved')">通过并颁发账号</button></view>
              </template>
              <view v-if="application.reviewReason || application.reason" class="small subtle spaced-small">审核备注：{{ application.reviewReason || application.reason }}</view>
              <view v-if="applicationCredential(application)" class="prototype-issued-account small"><view class="strong">待平台发放的教师账号</view><view>账号：{{ applicationCredential(application).username }}</view><view v-if="!applicationCredential(application).passwordChangedAt">初始密码：{{ applicationCredential(application).password }}</view><view v-else>已完成首次密码修改</view></view>
            </view>
            <view v-if="!applications.length" class="small subtle spaced">暂无教师申请，请在教师登录页提交申请。</view><view v-if="proofError" class="notice small">{{ proofError }}</view>
          </template>
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

<style scoped>
.prototype-application-card { margin-top: 14px; padding: 16px; border: 1px solid #dae4dc; border-radius: 14px; background: #fff; }
.prototype-review-reason { width: 100%; min-height: 60px; margin-top: 14px; font-size: 13px; }
.prototype-review-actions { display: flex; gap: 10px; margin-top: 14px; }
.prototype-review-actions button { flex: 1; margin: 0; font-size: 13px; padding-left: 8px; padding-right: 8px; }
.prototype-issued-account { padding: 12px; border-radius: 10px; background: #eff7f0; line-height: 1.9; margin-top: 14px; word-break: break-all; }
</style>
