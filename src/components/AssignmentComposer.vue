<script setup>
import { computed, ref, watch } from "vue";
import { pickPhotos } from "../platform/photos.js";
import { displayPhoto } from "../services/presentation.js";

const props = defineProps({
  title: { type: String, default: "" },
  requirements: { type: String, default: "" },
  illustration: { type: String, default: "" },
  due: { type: String, default: "" },
  classIds: { type: Array, default: () => [] },
  classes: { type: Array, default: () => [] },
  templates: { type: Array, default: () => [] },
  studentCounts: { type: Object, default: () => ({}) },
  busy: Boolean,
  paperPages: {type: Number, default: 2},
});
const emit = defineEmits([
  "update:title", "update:requirements", "update:due", "update:classIds",
  "publish", "save-template", "delete-template",
  "update:paperPages", "update:illustration",
]);
const mode = ref("manual");
const selectedTemplateId = ref("");
const selectingIllustration = ref(false), illustrationError = ref("");
function defaultDate() {
  const value = new Date(Date.now() + 7 * 86400000);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
const lastDue = ref(props.due || defaultDate());
watch(() => props.due, (value) => { if (value) lastDue.value = value; });
watch(() => props.templates, (items) => {
  if (!items.some((item) => item.id === selectedTemplateId.value)) selectedTemplateId.value = "";
});
const selectedTemplate = computed(() => props.templates.find((item) => item.id === selectedTemplateId.value));
const selectedClasses = computed(() => props.classes.filter((item) => props.classIds.includes(item.id)));
const selectedStudentCount = computed(() => selectedClasses.value.reduce((sum, item) => sum + Number(props.studentCounts[item.id] ?? item.studentCount ?? 0), 0));
function useTemplate(item) {
  selectedTemplateId.value = item.id;
  emit("update:title", item.title);
  emit("update:requirements", item.requirements || "");
  emit("update:illustration", item.illustration || "");
}
function saveTemplate(update = false) {
  emit("save-template", {
    ...(update && selectedTemplate.value ? { id: selectedTemplate.value.id } : {}),
    title: props.title,
    requirements: props.requirements,
    illustration: props.illustration,
  });
}
function toggleClass(id) {
  const ids = props.classIds.includes(id) ? props.classIds.filter((value) => value !== id) : [...props.classIds, id];
  emit("update:classIds", ids);
}
async function chooseIllustration() {
  if (props.busy || selectingIllustration.value) return;
  illustrationError.value = "";
  selectingIllustration.value = true;
  try {
    const pictures = await pickPhotos(5);
    if (pictures[0]) emit("update:illustration", pictures[0].url);
  } catch (failure) { illustrationError.value = failure.message || "插图选择失败，请重试。"; }
  finally { selectingIllustration.value = false; }
}
</script>

<template>
  <view class="assignment-composer">
    <view class="card form-card">
      <view class="composer-mode" role="group" aria-label="填写方式">
        <button :class="['composer-mode-button', { active: mode === 'manual' }]" :disabled="busy" @click="mode = 'manual'">手动填写</button>
        <button :class="['composer-mode-button', { active: mode === 'template' }]" :disabled="busy" @click="mode = 'template'">模板填写</button>
      </view>
      <view v-if="mode === 'template'" class="composer-template-library">
        <view class="field-label">题库模板</view>
        <view v-if="!templates.length" class="small subtle composer-template-empty">暂无模板，填写作业后可保存到题库。</view>
        <view v-for="item in templates" :key="item.id" :class="['composer-template-row', { selected: selectedTemplateId === item.id }]">
          <button class="composer-template-select" :disabled="busy" @click="useTemplate(item)">
            <text class="strong">{{ item.title }}</text>
            <text class="tiny subtle">{{ selectedTemplateId === item.id ? '已填充' : '选择填充' }}</text>
          </button>
          <button v-if="!item.builtin" class="text-button composer-template-delete" :disabled="busy" :aria-label="'删除模板' + item.title" @click="emit('delete-template', item.id)">删除</button>
        </view>
      </view>
      <view class="field-label">作业标题</view>
      <textarea class="composer-title-input" :value="title" :disabled="busy" placeholder="请输入题目" maxlength="50" auto-height :cursor-spacing="100" aria-label="作业标题" @input="emit('update:title', $event.detail.value)" />
      <view class="field-label">题目要求</view>
      <textarea class="composer-requirements-input" :value="requirements" :disabled="busy" placeholder="选填" maxlength="1500" auto-height :cursor-spacing="100" aria-label="题目要求" @input="emit('update:requirements', $event.detail.value)" />
      <view class="field-label">题目插图（选填）</view>
      <view v-if="illustration" class="composer-illustration-preview"><image :src="displayPhoto(illustration)" mode="aspectFit" class="composer-illustration-image" /></view>
      <view class="composer-illustration-actions">
        <button class="text-button" :disabled="busy || selectingIllustration" @click="chooseIllustration">{{ selectingIllustration ? '正在读取…' : illustration ? '更换插图' : '添加插图' }}</button>
        <button v-if="illustration" class="text-button" :disabled="busy || selectingIllustration" @click="emit('update:illustration', '')">移除插图</button>
      </view>
      <view class="tiny subtle">标题、要求和插图分区排版。插图放在题目要求下方，保留原有思维导图与写作提纲。</view>
      <view v-if="illustrationError" class="paper-error" role="alert">{{ illustrationError }}</view>
      <view class="composer-template-actions">
        <button v-if="selectedTemplate && !selectedTemplate.builtin" class="text-button" :disabled="busy || !title.trim()" @click="saveTemplate(true)">更新当前模板</button>
        <button class="text-button" :disabled="busy || !title.trim()" @click="saveTemplate(false)">{{ selectedTemplate ? '另存为新模板' : '保存到题库' }}</button>
      </view>
      <view class="field-label">截止日期</view>
      <view class="composer-deadline-mode" role="group" aria-label="截止方式">
        <button :class="['composer-choice', { active: !!due }]" :disabled="busy" @click="emit('update:due', lastDue)">指定日期</button>
        <button :class="['composer-choice', { active: !due }]" :disabled="busy" @click="emit('update:due', '')">不限</button>
      </view>
      <picker v-if="due" mode="date" :value="due" :disabled="busy" @change="emit('update:due', $event.detail.value)">
        <view class="date-picker">{{ due }}<text>20:00 截止 ›</text></view>
      </picker>
      <view class="field-label">发布班级（可多选）</view>
      <view class="composer-class-options">
        <button v-for="item in classes" :key="item.id" :class="['composer-class-option', { selected: classIds.includes(item.id) }]" :disabled="busy" :aria-pressed="classIds.includes(item.id)" @click="toggleClass(item.id)">
          <view class="composer-class-name"><text class="strong">{{ item.name }}</text><text v-if="item.organizationName" class="tiny subtle">{{ item.organizationName }}</text></view>
          <text class="composer-class-selection">{{ classIds.includes(item.id) ? '已选' : '选择' }}</text>
        </button>
      </view>
      <view v-if="!classes.length" class="small subtle">暂无可发布的任教班级。</view>
      <view class="small subtle composer-selection-summary">已选 {{ selectedClasses.length }} 个班级<text v-if="selectedStudentCount"> · {{ selectedStudentCount }} 位学生</text></view>
      <view class="field-label">作业用纸</view>
      <view class="small subtle spaced-small">方圆格作文模板 · A3 横向 · 前后两页。三栏顶部各放置一个同页专属二维码，题目栏展示标题、学生信息和要求。学生可下载打印。</view>
    </view>
    <button class="primary full-width spaced" :disabled="busy" @click="emit('publish')">{{ busy ? '发布中…' : '发布作业' }}</button>
  </view>
</template>

<style scoped>
.composer-title-input,
.composer-requirements-input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  border: 1px solid #dce6df;
  border-radius: 12px;
  background: #fbfcfb;
  color: #203b2f;
  line-height: 1.7;
}
.composer-title-input { min-height: 78px; font-size: 20px; font-weight: 600; }
.composer-requirements-input { min-height: 176px; font-size: 16px; }
.composer-illustration-preview { height: 180px; border: 1px solid #e1e9e2; border-radius: 12px; background: #f6f8f6; }
.composer-illustration-image { width: 100%; height: 100%; }
.composer-illustration-actions { display: flex; gap: 20px; margin: 12px 0; }
.composer-mode,
.composer-deadline-mode {
  display: flex;
  gap: 8px;
}
.composer-mode {
  padding: 4px;
  background: #eef3ef;
  border-radius: 12px;
  margin-bottom: 20px;
}
.composer-mode-button {
  flex: 1;
  padding: 9px 8px;
  border-radius: 9px;
  font-weight: 600;
  color: #74837b;
}
.composer-mode-button.active {
  color: #26765a;
  background: #fff;
}
.composer-template-library {
  margin-bottom: 20px;
}
.composer-template-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #e8eee8;
  border-radius: 12px;
  margin-top: 8px;
  padding: 10px 12px;
}
.composer-template-row.selected {
  background: #eef6f0;
  border-color: #9cb8a6;
}
.composer-template-select {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}
.composer-template-delete {
  flex-shrink: 0;
}
.composer-template-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
}
.composer-template-empty {
  padding: 12px 0;
}
.composer-deadline-mode {
  margin-bottom: 12px;
}
.composer-choice {
  padding: 7px 18px;
  border: 1px solid #dce6df;
  border-radius: 9px;
  color: #74837b;
}
.composer-choice.active {
  background: #e8f2ec;
  border-color: #9cb8a6;
  color: #26765a;
}
.composer-class-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.composer-class-option {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid #e1e9e2;
  border-radius: 12px;
  text-align: left;
}
.composer-class-option.selected {
  background: #edf5ef;
  border-color: #91b49d;
}
.composer-class-name {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.composer-class-selection {
  flex-shrink: 0;
  color: #26765a;
  font-size: 12px;
}
.composer-selection-summary {
  margin-top: 12px;
}
</style>
