<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { activeStudents } from "../services/school.js";

const props = defineProps({ state: {}, organization: {}, administrator: {}, section: {}, aiIssues: { default: () => [] }, busy: Boolean });
const emit = defineEmits(["navigate", "action", "confirm", "dirty"]);
const mode = ref("list"), classId = ref(""), query = ref(""), status = ref("active");
const form = ref({}), baseline = ref(""), selectedTeachers = ref([]);
const sourceId = ref(""), targetId = ref(""), selectedIds = ref([]), transferQuery = ref("");
const classes = computed(() => props.state.classes.filter((item) => item.organizationId === props.organization?.id));
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
const events = computed(() => props.state.administrationEvents.filter((item) => item.organizationId === props.organization?.id).slice(0, 6));
const dirty = computed(() => {
  if (["classForm", "studentForm", "teacherForm"].includes(mode.value)) return JSON.stringify(form.value) !== baseline.value;
  if (mode.value === "teachers") return JSON.stringify([...selectedTeachers.value].sort()) !== baseline.value;
  return mode.value === "transfer" && (!!selectedIds.value.length || !!targetId.value);
});
watch(dirty, (value) => emit("dirty", value), { immediate: true, flush: "sync" });
onUnmounted(() => emit("dirty", false));
watch(() => props.section, () => { mode.value = "list"; classId.value = ""; query.value = ""; status.value = "active"; });

const subTitle = computed(() => ({ classForm: form.value.id ? "修改班级" : "新建班级", studentForm: form.value.id ? "编辑学生档案" : "新增学生", teacherForm: "添加教师", teachers: "分配任教老师", members: "班级详情", transfer: "学生调班" })[mode.value]);
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
function changeSource(event) {
  const id = classes.value[Number(event.detail.value)]?.id;
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
      <button class="back-button" :disabled="busy" aria-label="返回管理列表" @click="back">‹</button>
      <view><view class="tiny subtle">{{ organization.name }}</view><view class="section-title">{{ subTitle }}</view></view>
    </view>

    <template v-if="mode === 'classForm'">
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
        <picker v-else :range="classes" range-key="name" :value="Math.max(0, classes.findIndex(item => item.id === form.classId))" :disabled="busy" @change="form.classId = classes[Number($event.detail.value)]?.id || ''">
          <view class="date-picker">{{ classes.find(item => item.id === form.classId)?.name || '请先新建班级' }}<text>选择 ›</text></view>
        </picker>
        <view class="small subtle spaced">学号用于区分同名学生；调整已有学生的班级，请使用调班功能。</view>
      </view>
      <button class="primary full-width spaced" :disabled="busy || !form.name.trim() || !form.studentNumber.trim() || !form.classId" @click="save('saveStudent', { ...form }, '学生档案已保存')">{{ busy ? '保存中…' : '保存学生档案' }}</button>
    </template>

    <template v-else-if="mode === 'teacherForm'">
      <view class="card form-card">
        <view class="field-label">教师姓名</view>
        <input v-model="form.name" class="form-input" maxlength="30" :disabled="busy" placeholder="请输入教师姓名" />
        <view class="field-label">任教学科</view>
        <input v-model="form.subject" class="form-input" maxlength="30" :disabled="busy" placeholder="例如：语文" />
        <view class="field-label">手机号（选填）</view>
        <input v-model="form.phone" class="form-input" type="number" maxlength="11" :disabled="busy" placeholder="请输入11位手机号" />
        <view class="small subtle spaced">所属学校／机构：{{ organization.name }}</view>
      </view>
      <view class="card form-card">
        <view class="section-title">任教班级（选填）</view>
        <view class="small subtle spaced-small">可选择多个班级，也可添加后再到班级管理中分配。</view>
        <button v-for="schoolClass in classes" :key="schoolClass.id" class="admin-choice admin-teacher-form-choice" :class="{ selected: form.classIds.includes(schoolClass.id) }" :disabled="busy" :aria-pressed="form.classIds.includes(schoolClass.id)" @click="toggleTeachingClass(schoolClass.id)">
          <view class="grow strong">{{ schoolClass.name }}</view><view class="admin-check">{{ form.classIds.includes(schoolClass.id) ? '✓' : '' }}</view>
        </button>
        <view v-if="!classes.length" class="small subtle spaced">本校暂无班级，可先添加教师，再新建班级并分配任教。</view>
      </view>
      <button class="primary full-width spaced" :disabled="busy || !form.name.trim() || !form.subject.trim()" @click="saveTeacher">{{ busy ? '保存中…' : '保存教师' }}</button>
    </template>

    <template v-else-if="mode === 'teachers'">
      <view class="admin-context-card"><view class="section-heading"><view class="section-title">{{ currentClass?.name }}</view><button class="text-button" :disabled="busy" @click="emit('navigate', 'adminTeachers')">教师管理 ›</button></view><view class="small subtle">可选择多位本校老师共同任教；需要添加教师时，请进入教师管理。</view></view>
      <button v-for="teacher in teachers" :key="teacher.id" class="card admin-choice" :class="{ selected: selectedTeachers.includes(teacher.id) }" :disabled="busy" :aria-pressed="selectedTeachers.includes(teacher.id)" @click="toggleTeacher(teacher.id)">
        <view class="avatar pale">{{ teacher.initial }}</view>
        <view class="grow"><view class="strong">{{ teacher.name }}</view><view class="small subtle">{{ teacher.subject }} · 本校任教 {{ teacher.classIds.filter(id => classIds.includes(id)).length }} 个班级</view><view v-if="teacher.phone" class="tiny subtle">{{ teacher.phone }}</view></view>
        <view class="admin-check">{{ selectedTeachers.includes(teacher.id) ? '✓' : '' }}</view>
      </button>
      <view v-if="!teachers.length" class="card empty-state">本校暂无教师，请先到教师管理中添加。</view>
      <button class="primary full-width spaced" :disabled="busy || !dirty" @click="saveTeachers">{{ busy ? '保存中…' : '保存任教分配' }}</button>
    </template>

    <template v-else-if="mode === 'transfer'">
      <view class="card form-card">
        <view class="field-label">原班级</view>
        <picker :range="classes" range-key="name" :value="Math.max(0, classes.findIndex(item => item.id === sourceId))" :disabled="busy" @change="changeSource">
          <view class="date-picker">{{ sourceClass?.name || '请选择原班级' }}<text>选择 ›</text></view>
        </picker>
        <view class="field-label">目标班级</view>
        <picker :range="targetClasses" range-key="name" :value="Math.max(0, targetClasses.findIndex(item => item.id === targetId))" :disabled="busy || !targetClasses.length" @change="targetId = targetClasses[Number($event.detail.value)]?.id || ''">
          <view class="date-picker">{{ targetClass?.name || '请选择目标班级' }}<text>选择 ›</text></view>
        </picker>
      </view>
      <view class="notice">调班后按目标班级显示任务，原班作品与反馈保留在学生记录中。仅支持本校内调班。</view>
      <view class="section-heading"><view class="section-title">选择学生</view><text class="small subtle">已选 {{ selectedIds.length }} 人</text></view>
      <view class="student-search"><text class="search-symbol">⌕</text><input v-model="transferQuery" maxlength="40" :disabled="busy" placeholder="搜索姓名或学号" /></view>
      <view class="admin-selection-bar"><text class="small subtle">当前结果 {{ transferResults.length }} 人</text><button class="text-button" :disabled="busy || !transferResults.length" @click="toggleAll">{{ allResultsSelected ? '取消全选当前结果' : '全选当前结果' }}</button></view>
      <button v-for="student in transferResults" :key="student.id" class="card admin-choice" :class="{ selected: selectedIds.includes(student.id) }" :disabled="busy" :aria-pressed="selectedIds.includes(student.id)" @click="toggleStudent(student.id)">
        <view class="avatar pale">{{ student.initial }}</view><view class="grow"><view class="strong">{{ student.name }}</view><view class="tiny subtle">{{ student.studentNumber ? '学号 ' + student.studentNumber : '未填写学号' }}</view></view><view class="admin-check">{{ selectedIds.includes(student.id) ? '✓' : '' }}</view>
      </button>
      <view v-if="!transferResults.length" class="card empty-state">{{ transferQuery ? '没有找到对应学生。' : '原班级暂无在班学生。' }}</view>
      <view class="admin-transfer-footer"><view class="small subtle">已选 {{ selectedIds.length }} 人 · {{ targetClass?.name || '请选择目标班级' }}</view><button class="primary full-width spaced-small" :disabled="busy || !selectedIds.length || !targetClass" @click="transfer">{{ busy ? '处理中…' : '核对并确认调班' }}</button></view>
    </template>

    <template v-else-if="mode === 'list' && section === 'home'">
      <button class="card full-width" :disabled="busy" @click="emit('navigate', 'adminAiIssues')"><view class="card-top"><view class="strong">AI服务问题</view><text>{{ aiIssues.length }} 项待处理 ›</text></view></button>
      <view class="greeting-row"><view><view class="eyebrow">学校管理 / ADMINISTRATION</view><view class="greeting">{{ administrator.name }}，你好<text class="greeting-dot">。</text></view></view><view class="admin-seal">管</view></view>
      <view class="admin-hero"><view class="tiny">{{ organization.name }}</view><view class="admin-hero-title">让每个孩子<br />找到自己的班级</view><view class="small">维护班级与师生档案，让日常教学有序开展。</view><view class="admin-hero-orbit">✧</view></view>
      <view class="admin-stats"><view><view class="admin-stat-number">{{ classes.length }}</view><view class="tiny subtle">班级</view></view><view><view class="admin-stat-number">{{ students.filter(item => !item.archived).length }}</view><view class="tiny subtle">在班学生</view></view><view><view class="admin-stat-number">{{ teachers.length }}</view><view class="tiny subtle">本校教师</view></view></view>
      <view class="section-heading"><view class="section-title">日常管理</view><text class="tiny subtle">{{ organization.kind === 'school' ? '本校管理范围' : '本机构管理范围' }}</text></view>
      <view class="admin-shortcuts">
        <button class="card admin-shortcut" :disabled="busy" @click="emit('navigate', 'adminClasses')"><view class="admin-shortcut-icon">▦</view><view class="strong">班级管理</view><view class="tiny subtle">建班 · 名单 · 任教分配</view><text class="entry-arrow">›</text></button>
        <button class="card admin-shortcut" :disabled="busy" @click="emit('navigate', 'adminStudents')"><view class="admin-shortcut-icon warm">♙</view><view class="strong">学生管理</view><view class="tiny subtle">档案 · 搜索 · 归档恢复</view><text class="entry-arrow">›</text></button>
      </view>
      <button class="admin-transfer-entry" :disabled="busy" @click="addTeacher"><view><view class="strong">添加教师</view><view class="tiny subtle">完善教师资料，安排任教班级</view></view><text>＋</text></button>
      <button class="admin-transfer-entry" :disabled="busy || classes.length < 2" @click="startTransfer()"><view><view class="strong">学生调班</view><view class="tiny subtle">单人或批量调整，保留学习记录</view></view><text>⇄</text></button>
      <view v-if="waitingClasses.length" class="notice">{{ waitingClasses.length }} 个班级尚未分配任教老师，请在班级管理中完善。</view>
      <view class="section-heading"><view class="section-title">最近管理记录</view><text class="tiny subtle">本校动态</text></view>
      <view class="card admin-events"><view v-for="event in events" :key="event.id" class="admin-event"><view class="tiny-dot" /><view class="grow"><view class="small">{{ event.description }}</view><view class="tiny subtle">{{ event.administratorName }} · {{ time(event.createdAt) }}</view></view></view><view v-if="!events.length" class="small subtle">还没有管理记录。添加教师、建班、分配和调班操作会记录在这里。</view></view>
    </template>

    <template v-else-if="mode === 'list' && section === 'adminAiIssues'">
      <view class="section-heading"><view class="section-title">AI服务问题</view><button class="text-button" @click="emit('navigate', 'home')">返回管理台 ›</button></view>
      <view v-for="issue in aiIssues" :key="issue.id" class="card">
        <view class="strong">{{ issue.studentName }} · {{ issue.assignmentTitle }}</view><view class="paragraph small subtle">{{ issue.reason }} · {{ time(issue.reportedAt) }}</view>
        <button class="secondary" :disabled="busy" @click="save('retryAiIssue', { submissionId: issue.id }, '已安排重新分析', () => {})">安排重新分析</button>
      </view>
      <view v-if="!aiIssues.length" class="card empty-state">暂无待处理的AI服务问题</view>
    </template>

    <template v-else-if="mode === 'list' && section === 'profile'">
      <view class="card profile-card"><view class="avatar">{{ administrator.initial }}</view><view class="detail-title">{{ administrator.name }}</view><view class="small subtle">学校／机构管理员</view></view>
      <view class="card"><view class="section-title">管理范围</view><view class="profile-information-row"><text class="subtle">学校／机构</text><text>{{ organization.name }}</text></view><view class="small subtle spaced">负责本校班级、教师和学生档案及任教分配。需要变更授权范围时，请联系学校负责人。</view></view>
      <view class="card"><view class="section-title">日常工作</view><view class="paragraph small">添加教师并分配任教班级，将学生加入对应班级。学生离班时可归档档案，重新入班时可恢复。</view><button class="secondary full-width spaced" :disabled="busy" @click="emit('navigate', 'home')">返回管理工作台 ›</button></view>
    </template>

    <template v-else-if="mode === 'list' && section === 'adminTeachers'">
      <view class="section-heading"><view><view class="eyebrow">{{ organization.name }}</view><view class="detail-title">教师管理</view><view class="small subtle">{{ teachers.length }} 位教师 · {{ teachers.filter(item => !teachingClasses(item).length).length }} 位待分配班级</view></view><button class="text-button" :disabled="busy" @click="addTeacher">＋ 添加教师</button></view>
      <view class="student-search"><text class="search-symbol">⌕</text><input v-model="query" maxlength="40" :disabled="busy" placeholder="搜索姓名、学科或手机号" /><button v-if="query" class="search-clear" :disabled="busy" @click="query = ''">清除</button></view>
      <view v-for="teacher in listedTeachers" :key="teacher.id" class="card admin-teacher-card">
        <view class="admin-student-heading"><view class="avatar pale">{{ teacher.initial }}</view><view class="grow"><view class="strong">{{ teacher.name }}</view><view class="tiny subtle">{{ teacher.subject }}<text v-if="teacher.phone"> · {{ teacher.phone }}</text></view></view><text :class="['badge', teachingClasses(teacher).length ? 'green' : 'amber']">{{ teachingClasses(teacher).length ? '任教 ' + teachingClasses(teacher).length + ' 班' : '待分配' }}</text></view>
        <view class="admin-teacher-classes small subtle">任教班级：{{ teachingClasses(teacher).map(item => item.name).join('、') || '暂未分配，可在班级管理中安排任教。' }}</view>
      </view>
      <view v-if="!listedTeachers.length" class="card empty-state">{{ query ? '没有找到对应教师，试试其他关键词。' : '本校暂无教师，点击“添加教师”开始。' }}</view>
    </template>

    <template v-else-if="mode === 'list' && section === 'adminClasses'">
      <view class="section-heading"><view><view class="eyebrow">{{ organization.name }}</view><view class="detail-title">班级管理</view><view class="small subtle">{{ classes.length }} 个班级 · {{ waitingClasses.length }} 个待分配老师</view></view><button class="text-button" :disabled="busy" @click="editClass()">＋ 新建班级</button></view>
      <button v-for="schoolClass in classes" :key="schoolClass.id" class="card admin-class-card" :disabled="busy" @click="openClass(schoolClass)"><view class="card-top"><view class="section-title">{{ schoolClass.name }}</view><text class="entry-arrow">›</text></view><view class="small subtle">任教：{{ classTeachers(schoolClass.id).map(item => item.name).join('、') || '待分配老师' }}</view><view class="admin-class-count"><text class="admin-stat-number">{{ activeStudents(state, schoolClass.id).length }}</text><text class="small subtle">位在班学生</text><text v-if="!classTeachers(schoolClass.id).length" class="badge amber">待分配</text></view></button>
      <view v-if="!classes.length" class="card empty-state">还没有班级，点击“新建班级”开始。</view>
    </template>

    <template v-else>
      <template v-if="mode === 'members'">
        <view class="card admin-class-summary"><view class="eyebrow">{{ organization.name }}</view><view class="detail-title">{{ currentClass?.name }}</view><view class="small subtle">{{ activeStudents(state, classId).length }} 位在班学生</view><view class="admin-summary-actions"><button class="text-button" :disabled="busy" @click="editClass(currentClass)">修改班级</button><button class="text-button" :disabled="busy" @click="editTeachers">分配老师 ›</button></view><view class="admin-teacher-line small">任教：{{ classTeachers(classId).map(item => item.name).join('、') || '待分配老师' }}</view></view>
      </template>
      <view class="section-heading"><view class="section-title">{{ mode === 'members' ? '班级学生' : '学生管理' }}</view><view class="admin-inline-actions"><button class="text-button" :disabled="busy || classes.length < 2" @click="startTransfer()">调班</button><button class="text-button" :disabled="busy || !classes.length" @click="editStudent()">＋ 新增学生</button></view></view>
      <picker v-if="mode !== 'members'" :range="[{ id: '', name: '全部班级' }, ...classes]" range-key="name" :value="classId ? classes.findIndex(item => item.id === classId) + 1 : 0" :disabled="busy" @change="classId = Number($event.detail.value) ? classes[Number($event.detail.value) - 1].id : ''"><view class="date-picker admin-class-filter">{{ currentClass?.name || '全部班级' }}<text>筛选 ⌄</text></view></picker>
      <view class="student-search"><text class="search-symbol">⌕</text><input v-model="query" maxlength="40" :disabled="busy" placeholder="搜索姓名或学号" /><button v-if="query" class="search-clear" :disabled="busy" @click="query = ''">清除</button></view>
      <view class="admin-selection-bar"><view class="admin-status-filters"><button :class="{ active: status === 'active' }" :disabled="busy" @click="status = 'active'">在班</button><button :class="{ active: status === 'archived' }" :disabled="busy" @click="status = 'archived'">已归档</button></view><text class="small subtle">{{ listedStudents.length }} 人</text></view>
      <view v-for="student in listedStudents" :key="student.id" class="card admin-student-card"><view class="admin-student-heading"><view class="avatar pale">{{ student.initial }}</view><view class="grow"><view class="strong">{{ student.name }}</view><view class="tiny subtle">{{ student.className }} · {{ student.studentNumber ? '学号 ' + student.studentNumber : '未填写学号' }}</view></view><text :class="['badge', student.archived ? 'neutral' : 'green']">{{ student.archived ? '已归档' : '在班' }}</text></view><view class="admin-student-actions"><button class="text-button" :disabled="busy" @click="editStudent(student)">编辑档案</button><button v-if="!student.archived" class="text-button" :disabled="busy || classes.length < 2" @click="startTransfer(student)">调班</button><button class="text-button" :disabled="busy" @click="archive(student)">{{ student.archived ? '恢复在班' : '归档' }}</button></view></view>
      <view v-if="!listedStudents.length" class="card empty-state">{{ query ? '没有找到对应学生，试试其他关键词。' : status === 'archived' ? '暂无已归档学生。' : '暂无在班学生，可以新增学生档案。' }}</view>
    </template>
  </view>
</template>
