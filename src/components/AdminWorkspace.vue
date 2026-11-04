<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import StudentImport from "./StudentImport.vue";
import GradeClassPicker from "./GradeClassPicker.vue";
import { activeStudents } from "../services/school.js";

const props = defineProps({ state: {}, organization: {}, administrator: {}, section: {}, busy: Boolean });
const emit = defineEmits(["navigate", "action", "confirm", "dirty"]);
const mode = ref("list"), classId = ref(""), query = ref(""), status = ref("active");
const importDirty = ref(false);
const form = ref({}), baseline = ref(""), selectedTeachers = ref([]);
const sourceId = ref(""), targetId = ref(""), selectedIds = ref([]), transferQuery = ref("");
const classes = computed(() => props.state.classes.filter((item) => item.organizationId === props.organization?.id && props.administrator?.classIds?.includes(item.id)));
const classIds = computed(() => classes.value.map((item) => item.id));
const students = computed(() => props.state.students.filter((item) => classIds.value.includes(item.classId)));
const teachers = computed(() => props.state.teachers.filter((item) => item.organizationIds.includes(props.organization?.id)));
const listedTeachers = computed(() => teachers.value.filter((item) => !query.value.trim() || `${item.name} ${item.subject} ${item.phone || ""}`.toLowerCase().includes(query.value.trim().toLowerCase())));
const teachingClasses = (teacher) => classes.value.filter((item) => teacher.classIds.includes(item.id));
const currentClass = computed(() => classes.value.find((item) => item.id === classId.value));
const classTeachers = (id) => teachers.value.filter((item) => item.classIds.includes(id));
const waitingClasses = computed(() => classes.value.filter((item) => !classTeachers(item.id).length));
const matches = (student, value) => !value.trim() || `${student.name} ${student.studentNumber || ""}`.toLowerCase().includes(value.trim().toLowerCase());
const listedStudents = computed(() => students.value.filter((item) =>
  (!classId.value || item.classId === classId.value) && !!item.archived === (status.value === "archived") && matches(item, query.value)));
const transferMembers = computed(() => students.value.filter((item) => item.classId === sourceId.value && !item.archived));
const transferResults = computed(() => transferMembers.value.filter((item) => matches(item, transferQuery.value)));
const targetClasses = computed(() => classes.value.filter((item) => item.id !== sourceId.value));
const sourceClass = computed(() => classes.value.find((item) => item.id === sourceId.value));
const targetClass = computed(() => targetClasses.value.find((item) => item.id === targetId.value));
const events = computed(() => props.state.administrationEvents.filter((item) => item.organizationId === props.organization?.id && item.administratorId === props.administrator?.id).slice(0, 6));
const dirty = computed(() => {
  if (["classForm", "studentForm", "teacherForm"].includes(mode.value)) return JSON.stringify(form.value) !== baseline.value;
  if (mode.value === "teachers") return JSON.stringify([...selectedTeachers.value].sort()) !== baseline.value;
  return (mode.value === "import" && importDirty.value) || (mode.value === "transfer" && (!!selectedIds.value.length || !!targetId.value));
});
watch(dirty, (value) => emit("dirty", value), { immediate: true, flush: "sync" });
onUnmounted(() => emit("dirty", false));
watch(() => props.section, () => { mode.value = "list"; classId.value = ""; query.value = ""; status.value = "active"; importDirty.value = false; });

const subTitle = computed(() => ({ import: "批量导入学生", classForm: form.value.id ? "修改班级" : "新建班级", studentForm: form.value.id ? "编辑学生档案" : "新增学生", teacherForm: "添加教师", teachers: "分配任教老师", members: "班级详情", transfer: "学生调班" })[mode.value]);
function confirmLeave(action) {
  if (props.busy) return;
  if (dirty.value) emit("confirm", { title: "放弃未保存的修改？", body: "已填写的信息和调班选择尚未保存。", confirm: "放弃修改", action });
  else action();
}
function back() {
  confirmLeave(() => {
    if (mode.value === "members") { classId.value = ""; mode.value = "list"; }
    else mode.value = props.section === "adminClasses" && classId.value ? "members" : "list";
  });
}
function openClass(item) { classId.value = item.id; query.value = ""; status.value = "active"; mode.value = "members"; }
function editClass(item) {
  form.value = { id: item?.id || "", name: item?.name || "", organizationId: props.organization.id };
  baseline.value = JSON.stringify(form.value); mode.value = "classForm";
}
function editStudent(item) {
  form.value = { id: item?.id || "", name: item?.name || "", studentNumber: item?.studentNumber || "", classId: item?.classId || currentClass.value?.id || classes.value[0]?.id || "" };
  baseline.value = JSON.stringify(form.value); mode.value = "studentForm";
}
function editTeachers() {
  selectedTeachers.value = classTeachers(classId.value).map((item) => item.id);
  baseline.value = JSON.stringify([...selectedTeachers.value].sort()); mode.value = "teachers";
}
function addTeacher() {
  form.value = { name: "", subject: "语文", phone: "", organizationId: props.organization.id, classIds: [] };
  baseline.value = JSON.stringify(form.value); mode.value = "teacherForm";
}
function toggleTeachingClass(id) {
  form.value.classIds = form.value.classIds.includes(id) ? form.value.classIds.filter((value) => value !== id) : [...form.value.classIds, id];
}
function saveTeacher() {
  save("createTeacher", { ...form.value, classIds: [...form.value.classIds] }, "教师已添加", () => {
    mode.value = "list"; query.value = "";
  });
}
function save(kind, data, message, success = () => { mode.value = props.section === "adminClasses" && classId.value ? "members" : "list"; }) {
  emit("action", { kind, data, message, success });
}
function saveClass() {
  save("saveClass", { ...form.value }, "班级信息已保存", (item) => {
    classId.value = item.id; mode.value = "members";
  });
}
function toggleTeacher(id) {
  selectedTeachers.value = selectedTeachers.value.includes(id) ? selectedTeachers.value.filter((value) => value !== id) : [...selectedTeachers.value, id];
}
function saveTeachers() {
  const names = teachers.value.filter((item) => selectedTeachers.value.includes(item.id)).map((item) => item.name).join("、");
  emit("confirm", {
    title: "确认调整任教老师？", body: `${currentClass.value.name}将${names ? "由" + names + "任教" : "暂不分配任教老师"}。保存后，老师的班级访问范围会随之更新，已有作业和反馈保留。`, confirm: "确认分配",
    action: () => save("setClassTeachers", { classId: classId.value, teacherIds: [...selectedTeachers.value] }, "任教分配已更新"),
  });
}
function startTransfer(student) {
  sourceId.value = student?.classId || currentClass.value?.id || classes.value[0]?.id || "";
  targetId.value = ""; selectedIds.value = student ? [student.id] : []; transferQuery.value = ""; mode.value = "transfer";
}
function changeSource(id) {
  if (!id || id === sourceId.value) return;
  confirmLeave(() => { sourceId.value = id; targetId.value = ""; selectedIds.value = []; transferQuery.value = ""; });
}
function toggleStudent(id) {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((value) => value !== id) : [...selectedIds.value, id];
}
const allResultsSelected = computed(() => transferResults.value.length > 0 && transferResults.value.every((item) => selectedIds.value.includes(item.id)));
function toggleAll() {
  const ids = transferResults.value.map((item) => item.id);
  selectedIds.value = allResultsSelected.value ? selectedIds.value.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds.value, ...ids])];
}
function transfer() {
  if (!selectedIds.value.length || !targetClass.value) return;
  const names = transferMembers.value.filter((item) => selectedIds.value.includes(item.id)).slice(0, 3).map((item) => item.name).join("、");
  const data = { sourceClassId: sourceId.value, targetClassId: targetId.value, studentIds: [...selectedIds.value] };
  emit("confirm", {
    title: `确认调班 ${selectedIds.value.length} 位学生？`,
    body: `${names}${selectedIds.value.length > 3 ? "等" : ""}将从${sourceClass.value.name}转入${targetClass.value.name}。调班后按目标班级显示任务，原班作品与反馈保留在学生记录中。`,
    confirm: "确认调班", action: () => save("transferStudents", data, `已完成 ${data.studentIds.length} 位学生的调班`, () => {
      classId.value = targetId.value; mode.value = props.section === "adminClasses" ? "members" : "list"; status.value = "active"; query.value = "";
    }),
  });
}
function archive(student) {
  const archived = !student.archived;
  emit("confirm", {
    title: archived ? `归档${student.name}的档案？` : `恢复${student.name}为在班学生？`,
    body: archived ? "归档后不再计入在班名单，学生将无法新提交作品。已有作品和反馈保留，可随时恢复。" : `恢复后重新加入${student.className}的在班名单，可以继续学习和提交作品。`,
    confirm: archived ? "确认归档" : "恢复在班",
    action: () => save("setStudentArchived", { studentId: student.id, archived }, archived ? "学生档案已归档" : "已恢复在班", () => {}),
  });
}
function time(value) { const date = new Date(value); return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
</script>

<template>
  <view class="admin-workspace">
    <view v-if="mode !== 'list'" class="admin-subheading">
      <button class="back-button" :disabled="busy" aria-label="返回管理列表" @click="back">‹ 返回</button>
      <view><view class="tiny subtle">{{ organization.name }}</view><view class="section-title">{{ subTitle }}</view></view>
    </view>

    <template v-if="mode === 'import'">
      <StudentImport :state="state" :classes="classes" :initial-class-id="classId || classes[0]?.id || ''" :busy="busy" @action="emit('action', $event)" @dirty="importDirty = $event" />
    </template>
    <template v-else-if="mode === 'classForm'">
      <view class="card form-card">
        <view class="field-label">班级名称</view>
        <input v-model="form.name" class="form-input" maxlength="30" :disabled="busy" placeholder="例如：五年级（1）班" />
        <view class="small subtle spaced">所属学校／机构：{{ organization.name }}</view>
      </view>
      <button class="primary full-width spaced" :disabled="busy || !form.name.trim()" @click="saveClass">{{ busy ? '保存中…' : '保存班级' }}</button>
    </template>

    <template v-else-if="mode === 'studentForm'">
      <view class="card form-card">
        <view class="field-label">学生姓名</view>
        <input v-model="form.name" class="form-input" maxlength="30" :disabled="busy" placeholder="请输入学生姓名" />
        <view class="field-label">学号</view>
        <input v-model="form.studentNumber" class="form-input" maxlength="32" :disabled="busy" placeholder="请输入校内唯一学号" />
        <view class="field-label">所在班级</view>
        <view v-if="form.id" class="date-picker">{{ classes.find(item => item.id === form.classId)?.name }}</view>
        <GradeClassPicker v-else v-model="form.classId" :classes="classes" :disabled="busy" placeholder="请先新建班级" />
        <view class="small subtle spaced">学号用于区分同名学生；调整已有学生的班级，请使用调班功能。</view>
      </view>
      <button class="primary full-width spaced" :disabled="busy || !form.name.trim() || !form.studentNumber.trim() || !form.classId" @click="save('saveStudent', { ...form }, '学生档案已保存')">{{ busy ? '保存中…' : '保存学生档案' }}</button>
    </template>

    <template v-else-if="mode === 'transfer'">
      <view class="card form-card">
        <view class="field-label">原班级</view>
        <GradeClassPicker :model-value="sourceId" :classes="classes" :disabled="busy" placeholder="请选择原班级" @update:modelValue="changeSource" />
        <view class="field-label">目标班级</view>
        <GradeClassPicker v-model="targetId" :classes="targetClasses" :disabled="busy || !targetClasses.length" placeholder="请选择目标班级" />
      </view>
      <view class="notice">调班后按目标班级显示任务，原班作品与反馈保留在学生记录中。仅支持自己管理的班级之间调班。</view>
      <view class="section-heading"><view class="section-title">选择学生</view><text class="small subtle">已选 {{ selectedIds.length }} 人</text></view>
      <view class="student-search"><text class="search-symbol">⌕</text><input v-model="transferQuery" maxlength="40" :disabled="busy" placeholder="搜索姓名或学号" /></view>
      <view class="admin-selection-bar"><text class="small subtle">当前结果 {{ transferResults.length }} 人</text><button class="text-button" :disabled="busy || !transferResults.length" @click="toggleAll">{{ allResultsSelected ? '取消全选当前结果' : '全选当前结果' }}</button></view>
      <button v-for="student in transferResults" :key="student.id" class="card admin-choice" :class="{ selected: selectedIds.includes(student.id) }" :disabled="busy" :aria-pressed="selectedIds.includes(student.id)" @click="toggleStudent(student.id)">
        <view class="avatar pale">{{ student.initial }}</view><view class="grow"><view class="strong">{{ student.name }}</view><view class="tiny subtle">{{ student.studentNumber ? '学号 ' + student.studentNumber : '未填写学号' }}</view></view><view class="admin-check">{{ selectedIds.includes(student.id) ? '✓' : '' }}</view>
      </button>
      <view v-if="!transferResults.length" class="card empty-state">{{ transferQuery ? '没有找到对应学生。' : '原班级暂无在班学生。' }}</view>
      <view class="admin-transfer-footer"><view class="small subtle">已选 {{ selectedIds.length }} 人 · {{ targetClass?.name || '请选择目标班级' }}</view><button class="primary full-width spaced-small" :disabled="busy || !selectedIds.length || !targetClass" @click="transfer">{{ busy ? '处理中…' : '核对并确认调班' }}</button></view>
    </template>

    <template v-else-if="mode === 'list' && section === 'adminClasses'">
      <view class="section-heading"><view><view class="eyebrow">{{ organization.name }}</view><view class="detail-title">班级管理</view><view class="small subtle">{{ classes.length }} 个我的班级</view></view><button class="text-button" :disabled="busy" @click="editClass()">＋ 新建班级</button></view>
      <button v-for="schoolClass in classes" :key="schoolClass.id" class="card admin-class-card" :disabled="busy" @click="openClass(schoolClass)"><view class="card-top"><view class="section-title">{{ schoolClass.name }}</view><text class="entry-arrow">›</text></view><view class="small subtle">任教：{{ classTeachers(schoolClass.id).map(item => item.name).join('、') || '待分配老师' }}</view><view class="admin-class-count"><text class="admin-stat-number">{{ activeStudents(state, schoolClass.id).length }}</text><text class="small subtle">位在班学生</text><text v-if="!classTeachers(schoolClass.id).length" class="badge amber">待分配</text></view></button>
      <view v-if="!classes.length" class="card empty-state">还没有班级，点击“新建班级”开始。</view>
    </template>

    <template v-else>
      <template v-if="mode === 'members'">
        <view class="card admin-class-summary"><view class="eyebrow">{{ organization.name }}</view><view class="detail-title">{{ currentClass?.name }}</view><view class="small subtle">{{ activeStudents(state, classId).length }} 位在班学生</view><view class="admin-summary-actions"><button class="text-button" :disabled="busy" @click="editClass(currentClass)">修改班级</button></view><view class="admin-teacher-line small">任教：{{ classTeachers(classId).map(item => item.name).join('、') || '待分配老师' }}</view></view>
      </template>
      <view class="section-heading"><view class="section-title">{{ mode === 'members' ? '班级学生' : '学生管理' }}</view><view class="admin-inline-actions"><button class="text-button" :disabled="busy || !classes.length" @click="mode = 'import'">批量导入</button><button class="text-button" :disabled="busy || classes.length < 2" @click="startTransfer()">调班</button><button class="text-button" :disabled="busy || !classes.length" @click="editStudent()">＋ 新增学生</button></view></view>
      <GradeClassPicker v-if="mode !== 'members'" v-model="classId" :classes="classes" :disabled="busy" allow-all class="admin-class-filter" />
      <view class="student-search"><text class="search-symbol">⌕</text><input v-model="query" maxlength="40" :disabled="busy" placeholder="搜索姓名或学号" /><button v-if="query" class="search-clear" :disabled="busy" @click="query = ''">清除</button></view>
      <view class="admin-selection-bar"><view class="admin-status-filters"><button :class="{ active: status === 'active' }" :disabled="busy" @click="status = 'active'">在班</button><button :class="{ active: status === 'archived' }" :disabled="busy" @click="status = 'archived'">已归档</button></view><text class="small subtle">{{ listedStudents.length }} 人</text></view>
      <view v-for="student in listedStudents" :key="student.id" class="card admin-student-card"><view class="admin-student-heading"><view class="avatar pale">{{ student.initial }}</view><view class="grow"><view class="strong">{{ student.name }}</view><view class="tiny subtle">{{ student.className }} · {{ student.studentNumber ? '学号 ' + student.studentNumber : '未填写学号' }}</view></view><text :class="['badge', student.archived ? 'neutral' : 'green']">{{ student.archived ? '已归档' : '在班' }}</text></view><view class="admin-student-actions"><button class="text-button" :disabled="busy" @click="editStudent(student)">编辑档案</button><button v-if="!student.archived" class="text-button" :disabled="busy || classes.length < 2" @click="startTransfer(student)">调班</button><button class="text-button" :disabled="busy" @click="archive(student)">{{ student.archived ? '恢复在班' : '归档' }}</button></view></view>
      <view v-if="!listedStudents.length" class="card empty-state">{{ query ? '没有找到对应学生，试试其他关键词。' : status === 'archived' ? '暂无已归档学生。' : '暂无在班学生，可以批量导入或新增学生档案。' }}</view>
    </template>
  </view>
</template>
