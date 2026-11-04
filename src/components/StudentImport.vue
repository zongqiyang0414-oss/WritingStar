<script setup>
import { computed, ref, watch, onUnmounted } from "vue";
import GradeClassPicker from "./GradeClassPicker.vue";
import { previewStudentImport } from "../services/studentImport.js";
import { chooseRosterFile, credentialsText, downloadCredentials } from "../platform/studentRosterImport.js";

const props = defineProps({ state: { type: Object, required: true }, classes: { type: Array, default: () => [] }, initialClassId: { type: String, default: "" }, busy: Boolean });
const emit = defineEmits(["action", "dirty"]);
const classId = ref(props.initialClassId || props.classes[0]?.id || "");
const rows = ref([]), fileName = ref(""), localBusy = ref(false), error = ref(""), message = ref(""), result = ref([]), expanded = ref(false);
const disabled = computed(() => props.busy || localBusy.value);
const preview = computed(() => {
  if (!rows.value.length || !classId.value) return null;
  try { return previewStudentImport(props.state, { classId: classId.value, rows: rows.value }, "teacher"); }
  catch (failure) { return { rows: [], errors: [{ row: 0, message: failure.message }], canImport: false, validCount: 0, totalCount: rows.value.length }; }
});
const visibleRows = computed(() => expanded.value ? preview.value?.rows : preview.value?.rows.slice(0, 30));
const classCredentials = computed(() => {
  const teacher = props.state.teacherAccount?.signedIn && props.state.teachers.find((item) => item.id === props.state.teacherAccount.teacherId);
  const schoolClass = props.classes.find((item) => item.id === classId.value);
  if (!schoolClass || !teacher || !teacher.classIds.includes(schoolClass.id) || !teacher.organizationIds.includes(schoolClass.organizationId)) return [];
  const students = props.state.students.filter((student) => student.classId === classId.value && !student.archived);
  return (props.state.loginCredentials || []).filter((credential) => credential.role === "student" && credential.password && students.some((student) => student.id === credential.personId)).map((credential) => {
    const student = students.find((item) => item.id === credential.personId);
    return { studentId: student.id, name: student.name, className: student.className, studentNumber: student.studentNumber || "", username: credential.username, password: credential.password };
  });
});
watch(rows, (value) => emit("dirty", !!value.length), { flush: "sync" });
watch(classId, () => { result.value = []; error.value = ""; message.value = ""; });
onUnmounted(() => emit("dirty", false));

async function choose() {
  if (disabled.value) return;
  localBusy.value = true; error.value = ""; message.value = "";
  try {
    const selected = await chooseRosterFile();
    if (!selected) return;
    rows.value = selected.rows; fileName.value = selected.file.name; result.value = []; expanded.value = false;
  } catch (failure) { error.value = failure.message || "名单读取失败，请重试。"; }
  finally { localBusy.value = false; }
}
function showResult(credentials) {
  result.value = credentials; rows.value = []; fileName.value = "";
  message.value = `已导入${credentials.length}位学生，账号和初始密码已生成。`;
}
function importRoster() {
  if (disabled.value || !preview.value?.canImport) return;
  error.value = "";
  emit("action", { kind: "importStudents", data: { classId: classId.value, rows: rows.value.map(({ name, studentNumber, row, sheet }) => ({ name, studentNumber, row, ...(sheet ? { sheet } : {}) })) }, message: "学生和账号已生成", success: showResult });
}
function copyAccounts(accounts) {
  error.value = "";
  uni.setClipboardData({ data: credentialsText(accounts), success: () => { message.value = "账号名单已复制，可分别发给对应学生。"; }, fail: () => { error.value = "复制失败，请使用导出账号名单。"; } });
}
async function exportAccounts(accounts) {
  error.value = "";
  try { await downloadCredentials(accounts); }
  catch (failure) { error.value = failure.message || "导出失败，请使用复制账号名单。"; }
}
</script>

<template>
  <view class="student-import">
    <view class="card form-card">
      <view class="section-title">批量导入学生</view>
      <view class="small subtle spaced-small">选择班级，上传Word或Excel名单，核对后一次生成学生账号和初始密码。</view>
      <view class="field-label">导入班级</view>
      <GradeClassPicker v-model="classId" :classes="classes" :disabled="disabled" placeholder="请先新建班级" />
      <view class="roster-format-example">
        <view class="field-label">名单格式示例</view>
        <image src="/static/help/student-roster-example.png" mode="widthFix" class="roster-format-image" aria-label="Excel名单示例：A列姓名、B列学号；贺新春001、秋虹002" />
        <view class="tiny subtle spaced-small">第一行为表头。姓名必填，学号选填；要保留001这类学号，请将学号列设为文本格式。</view>
      </view>
      <view class="roster-instructions small">
        <view>表头：姓名（必填）、学号（选填）</view>
        <view class="subtle">支持.xlsx、.xls及.docx普通表格，单份5 MB以内、每批最多500人；多个可见工作表会合并核对。</view>
        <view class="subtle">未填学号时自动分配；同名学生请填写不同学号。已有学生无需重复导入。</view>
      </view>
      <button class="secondary full-width" :disabled="disabled || !classId" @click="choose">{{ localBusy ? '正在读取名单…' : rows.length ? '重新选择名单文件' : '选择Word / Excel名单' }}</button>
      <view v-if="fileName" class="tiny subtle spaced-small roster-file-name">{{ fileName }}</view>
    </view>

    <view v-if="error" class="notice roster-error" role="alert">{{ error }}</view>
    <view v-if="message" class="notice" role="status">{{ message }}</view>

    <template v-if="preview">
      <view class="section-heading"><view class="section-title">导入预览</view><text class="small subtle">共{{ preview.totalCount }}人 · 可导入{{ preview.validCount }}人</text></view>
      <view v-if="preview.errors.length" class="notice roster-error">
        <view class="strong">请修正文件后重新选择，整批核对通过后才会生成账号。</view>
        <view v-for="(item, index) in preview.errors.slice(0, 20)" :key="index" class="small spaced-small">{{ item.sheet ? item.sheet + ' · ' : '' }}{{ item.row ? '第' + item.row + '行：' : '' }}{{ item.message }}</view>
        <view v-if="preview.errors.length > 20" class="small spaced-small">其余{{ preview.errors.length - 20 }}处问题可在下方名单中查看。</view>
      </view>
      <view class="card roster-preview">
        <view v-for="(row, index) in visibleRows" :key="index" class="roster-preview-row">
          <view class="strong">{{ row.name || '姓名未填写' }}</view>
          <view class="tiny subtle">{{ row.sheet ? row.sheet + ' · ' : '' }}第{{ row.row }}行 · {{ row.studentNumber ? '学号 ' + row.studentNumber : '自动分配学号' }}</view>
          <view v-for="(issue, issueIndex) in row.errors" :key="issueIndex" class="small roster-issue">{{ issue }}</view>
        </view>
        <button v-if="preview.rows.length > 30" class="text-button full-width" :disabled="disabled" @click="expanded = !expanded">{{ expanded ? '收起名单' : '展开全部' + preview.rows.length + '人' }}</button>
      </view>
      <button class="primary full-width spaced" :disabled="disabled || !preview.canImport" @click="importRoster">{{ busy ? '正在生成账号…' : '确认导入' + preview.totalCount + '人并生成账号' }}</button>
    </template>

    <view v-if="result.length" class="card form-card">
      <view class="section-title">账号已生成</view>
      <view class="small subtle spaced-small">请将每位学生的账号和初始密码发给本人，用于学生端登录。</view>
      <view class="roster-actions spaced"><button class="secondary" :disabled="disabled" @click="exportAccounts(result)">导出账号名单</button><button class="secondary" :disabled="disabled" @click="copyAccounts(result)">复制账号名单</button></view>
      <scroll-view scroll-x class="roster-credentials spaced">
        <view class="roster-account-grid roster-account-head"><text>学生 / 学号</text><text>账号</text><text>初始密码</text></view>
        <view v-for="row in result" :key="row.studentId" class="roster-account-grid"><view>{{ row.name }}<view class="tiny subtle">{{ row.studentNumber }}</view></view><text selectable>{{ row.username }}</text><text selectable>{{ row.password }}</text></view>
      </scroll-view>
    </view>
    <view v-else-if="classCredentials.length" class="card form-card">
      <view class="section-title">本班已生成的学生账号</view>
      <view class="small subtle spaced-small">{{ classCredentials.length }}位在班学生，可随时重新导出账号名单。</view>
      <view class="roster-actions spaced"><button class="secondary" :disabled="disabled" @click="exportAccounts(classCredentials)">导出本班账号</button><button class="secondary" :disabled="disabled" @click="copyAccounts(classCredentials)">复制本班账号</button></view>
    </view>
  </view>
</template>

<style scoped>
.roster-format-example { margin-top: 20px; }
.roster-format-image { display: block; width: 100%; max-width: 360px; height: 180px; border-radius: 6px; }
.roster-instructions { margin: 16px 0; line-height: 1.8; }
.roster-file-name, .roster-preview-row { overflow-wrap: anywhere; }
.roster-error, .roster-issue { color: #a13927; }
.roster-preview { padding: 0 16px; }
.roster-preview-row { padding: 12px 0; border-bottom: 1px solid #e8e5dd; }
.roster-preview-row:last-child { border-bottom: none; }
.roster-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.roster-actions button { flex: 1; min-width: 120px; margin: 0; }
.roster-credentials { width: 100%; }
.roster-account-grid { display: grid; grid-template-columns: 120px 200px 140px; gap: 12px; width: 484px; padding: 12px 0; border-bottom: 1px solid #e8e5dd; }
.roster-account-head { font-size: 12px; color: #6a746c; }
</style>
