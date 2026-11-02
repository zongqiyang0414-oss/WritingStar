<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref } from "vue";
import { onHide } from "@dcloudio/uni-app";
import { scanGroups, MAX_SCAN_PAGES, paperId } from "../services/paperWorkflow.js";
import { loadScanDraft, saveScanDraft } from "../platform/scanDrafts.js";
// #ifndef H5
import { chooseDeviceScanImages, processDeviceScan, preserveDeviceScan } from "../platform/devicePaperScanner.js";
// #endif
// #ifdef H5
import { chooseScanFiles, loadScanImage, processScanSource } from "../platform/documentScanner.js";
import { readBrowserPhotoFile } from "../platform/photos.js";
// #endif
const props = defineProps({ state: Object, assignment: Object, cards: Array, teacher: Boolean, studentId: String, identityId: String, busy: Boolean });
const emit = defineEmits(["submit", "cards", "ai", "confirm"]);
const rows = ref([]), error = ref(""), saving = ref(false), processing = ref(false), progress = ref(""), initialized = ref(false);
const cameraStarting = ref(false);
const editId = ref(""), editStudent = ref(0), editPage = ref(0), editCode = ref("");
const summary = computed(() => scanGroups(props.state, props.assignment.id, rows.value, props.teacher ? "" : props.studentId));
const ready = computed(() => summary.value.groups.filter(g => g.ready));
const matching = computed(() => new Map(summary.value.groups.flatMap(g => g.rows.map(r => [r.id, { ...r, student: g.student }]))));
const issues = computed(() => new Map(summary.value.unresolved.map(r => [r.id, r.issue])));
const students = computed(() => props.cards.map(c => ({ id: c.studentId, name: c.studentName })));
const pageLabels = computed(() => Array.from({length: props.assignment.paperPacket?.pages || 2}, (_, i) => `第 ${i + 1} 页`));
const key = `writingstar-scan-v1:${props.teacher ? 'teacher' : 'student'}:${props.identityId}:${props.assignment.id}`;
const instance = getCurrentInstance(), canvasWidth = ref(1000), canvasHeight = ref(1414);
let persistQueue = Promise.resolve(), alive = true;
onMounted(async () => {
  try { const saved = await loadScanDraft(key); if (alive) rows.value = saved; }
  catch (failure) { error.value = failure.message; }
  finally { initialized.value = true; }
});
function persist() {
  const data = JSON.parse(JSON.stringify(rows.value)); saving.value = true;
  persistQueue = persistQueue.catch(() => {}).then(() => saveScanDraft(key, data))
    .then(() => { if (alive) error.value = ""; })
    .catch(failure => { if (alive) error.value = failure.message; throw failure; })
    .finally(() => { if (alive) saving.value = false; });
  return persistQueue;
}
async function append(row) {
  if (rows.value.length >= MAX_SCAN_PAGES) throw new Error("本批已达 60 页，请先提交或移除页面。");
  if (row.code && rows.value.some(r => r.code === row.code)) throw new Error("本页学生码与页码已在收件箱中，请勿重复扫描。");
  rows.value = [...rows.value, row]; await persist();
}
async function importImages() {
  if (processing.value || props.busy || !initialized.value) return;
  stopCamera(); error.value = ""; processing.value = true;
  let failures = 0;
  try {
    // #ifdef H5
    const files = await chooseScanFiles(MAX_SCAN_PAGES - rows.value.length);
    for (let i = 0; i < files.length && alive; i++) {
      progress.value = `识别与保存 ${i + 1} / ${files.length}`;
      try {
        const url = await readBrowserPhotoFile(files[i]);
        const source = await loadScanImage(url), row = await processScanSource(source, files[i].name);
        await append(row);
      } catch (failure) { failures++; error.value = `${files[i].name}：${failure.message}`; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    // #endif
    // #ifndef H5
    const photos = await chooseDeviceScanImages(MAX_SCAN_PAGES - rows.value.length);
    for (const photo of photos) {
      progress.value = "保留原照片并识别学生码…";
      try { await append(await processDeviceScan(photo, "scan-processing", instance.proxy, async (width,height) => {canvasWidth.value=width;canvasHeight.value=height;await nextTick();})); }
      catch (failure) {
        try { await append(await preserveDeviceScan(photo)); error.value = "部分图片未能自动处理，原图已保存，请人工确认学生和页码。"; }
        catch (saveFailure) { failures++; error.value = saveFailure.message; }
      }
    }
    // #endif
    if (failures) error.value = `${failures} 页未能添加（重复页或读取失败），其余页面已保留。`;
  } catch (failure) { error.value = failure.message; }
  finally { processing.value = false; progress.value = ""; }
}
function stopCamera() { cameraStarting.value = false; }
function startCamera() {
  if (processing.value || cameraStarting.value || props.busy || !initialized.value) return;
  const remaining = MAX_SCAN_PAGES - rows.value.length;
  if (remaining <= 0) { error.value = "本批已达 60 页，请先提交或移除页面。"; return; }
  error.value = ""; cameraStarting.value = true;
  uni.navigateTo({
    url: `/pages/scan/index?batch=paper&remaining=${remaining}`,
    events: { scanned: async added => {
      if (!alive) return;
      processing.value = true;
      let rejected = 0;
      try {
        for (const row of added) {
          if (!alive) break;
          try { await append(row); } catch (failure) { rejected++; error.value = failure.message; }
        }
        if (rejected) error.value = `${rejected} 页未能添加（重复页或保存失败），请核对收件箱。`;
      } finally { processing.value = false; }
    } },
    complete: () => { cameraStarting.value = false; },
    fail: () => { error.value = "无法打开扫描相机，请稍后重试。"; },
  });
}
function edit(row) {
  const match = matching.value.get(row.id);
  editId.value = row.id; editCode.value = row.code || "";
  editStudent.value = Math.max(0, students.value.findIndex(s => s.id === match?.student.id || s.id === row.studentId));
  editPage.value = Math.max(0, (match?.page || row.page || 1) - 1);
}
async function confirmIdentity() {
  const row = rows.value.find(r => r.id === editId.value);
  if (!row || !students.value[editStudent.value]) return;
  rows.value = rows.value.map(r => r.id === row.id ? { ...r, code: editCode.value.trim(),
    manual: !editCode.value.trim(), studentId: students.value[editStudent.value].id, page: editPage.value + 1 } : r);
  editId.value = "";
  try { await persist(); } catch {}
}
async function remove(id) {
  rows.value = rows.value.filter(r => r.id !== id);
  if (editId.value === id) editId.value = "";
  try { await persist(); } catch {}
}
function preview(row) { uni.previewImage({ urls: rows.value.map(r => r.photo.url), current: row.photo.url }); }
function submitReady() {
  stopCamera();
  const selected = ready.value.flatMap(g => g.rows), ids = new Set(selected.map(r => r.id));
  if (!selected.length) return;
  emit("confirm", { title: props.teacher ? `提交 ${ready.value.length} 位学生的答题卡？` : "确认提交本次答题卡？",
    body: `共 ${selected.length} 页，已按学生码和页码归档。提交后进入AI批阅。`,
    confirm: "确认提交", action: () => {
      emit("submit", { rows: selected, complete: async () => {
        rows.value = rows.value.filter(r => !ids.has(r.id));
        try { await persist(); } catch {}
      } });
    } });
}
function clear() {
  emit("confirm", {title: "清空本次扫描草稿？", body: "仅清空收件箱，已提交作品仍然保留。", confirm: "清空草稿", action: async () => {
    rows.value = []; editId.value = ""; try { await persist(); } catch {}
  }});
}
function visibility() {
  // #ifdef H5
  if (document.hidden) stopCamera();
  // #endif
}
// #ifdef H5
document.addEventListener("visibilitychange", visibility);
// #endif
onHide(stopCamera);
onUnmounted(() => {
  alive = false; stopCamera();
  // #ifdef H5
  document.removeEventListener("visibilitychange", visibility);
  // #endif
});
</script>
<template>
  <view class="paper-workspace paper-scanner">
    <view class="paper-heading"><view class="paper-overline">题目</view><view class="paper-title">{{ assignment.title }}</view></view>
    <view v-if="!assignment.paperPacket || !cards.length" class="card paper-empty"><view class="strong">请先生成专属答题卡</view><button class="primary full-width spaced" @click="emit('cards')">前往答题卡</button></view>
    <template v-else>
      <view class="scan-summary"><view><text>{{ rows.length }}</text>已收页面</view><view><text>{{ ready.length }}</text>可提交学生</view><view><text>{{ summary.unresolved.length }}</text>待确认页面</view></view>
      <view class="card scan-capture-card">
        <view class="paper-inline"><view class="section-title">{{ teacher ? '自动拍照 / 批量导入' : '添加已完成的答题卡' }}</view><text class="scan-local-badge">{{ saving ? '保存中…' : initialized ? '草稿自动保存' : '恢复草稿…' }}</text></view>
        <view class="small subtle spaced-small">自动框选拍照 → 裁剪文档范围 → 按学生和页码归档</view>
        <view class="scan-import-actions"><button class="primary" :disabled="busy || processing || cameraStarting || !initialized" @click="startCamera">{{ cameraStarting ? '开启相机…' : '开启自动拍照' }}</button><button class="secondary" :disabled="busy || processing || !initialized || rows.length >= 60" @click="importImages">{{ processing ? '正在处理…' : '批量导入照片' }}</button></view>
        <view v-if="processing" class="small subtle spaced-small">{{ progress || '正在读取图片…' }}</view>
        <view class="tiny subtle spaced-small">拍照后按框裁剪，保留字迹原色；批量导入保留原文件，每批最多60页。</view>
      </view>

      <view v-if="error" class="paper-error" role="alert">{{ error }}</view>
      <view v-if="!rows.length" class="card scan-empty"><view class="scan-empty-symbol">▤</view><view class="strong">暂无扫描或导入的答题卡</view><view class="small subtle spaced-small">请点击上方“开启自动拍照”或“批量导入照片”添加作业。添加成功后，扫描结果会在这里按学生和页码归档；学生码模糊时可人工确认。</view><button class="text-button spaced" @click="emit('cards')">查看 / 打印答题卡 ›</button></view>
      <view v-if="summary.groups.length" class="section-heading"><view class="section-title">按学生归档</view><text class="tiny subtle">自动按页码排序</text></view>
      <view v-for="group in summary.groups" :key="group.student.id" class="card scan-student-group">
        <view class="paper-inline"><view><view class="strong">{{ group.student.name }}</view><view class="tiny subtle">{{ group.rows.length }} / {{ group.total }} 页 · {{ group.rows.some(r => r.manual) ? '含人工确认' : '学生码已对应' }}</view></view><text :class="['badge', group.ready ? 'complete' : 'pending']">{{ group.ready ? '可提交' : '需处理' }}</text></view>
        <view v-for="issue in group.issues" :key="issue" class="scan-group-issue">{{ issue }}</view>
      </view>
      <view v-if="rows.length" class="section-heading"><view class="section-title">扫描收件箱</view><button class="text-button" :disabled="busy || processing" @click="clear">清空草稿</button></view>
      <view v-for="(row, index) in rows" :key="row.id" class="card scan-page-card">
        <view class="scan-page-main"><image :src="row.photo.url" class="scan-page-thumb" mode="aspectFit" @click="preview(row)" /><view class="grow"><view class="strong">{{ matching.get(row.id) ? matching.get(row.id).student.name + ' · 第 ' + matching.get(row.id).page + ' 页' : '第 ' + (index + 1) + ' 张 · 待确认' }}</view><view class="tiny subtle">{{ row.photo.cropped ? '已裁剪 · 保留原色' : row.photo.original ? '原照片保留' : row.corrected ? '历史扫描件' : '原图保留' }} · {{ matching.get(row.id) ? row.code ? '学生码识别' : '人工确认' : '待核对学生码' }}</view><view v-if="issues.get(row.id)" class="scan-group-issue">{{ issues.get(row.id) }}</view><view class="scan-row-actions"><button class="text-button" :disabled="busy || processing" @click="edit(row)">{{ matching.get(row.id) ? '核对信息' : '人工确认' }}</button><button class="text-button" :disabled="busy || processing" @click="remove(row.id)">移除</button></view></view></view>
        <view v-if="editId === row.id" class="scan-identity-editor">
          <view class="tiny subtle">有清晰学生码时按码归档；无法读取时，请对照原图确认学生和页码。</view>
          <input class="form-input scan-code-input" placeholder="粘贴卡片底部完整学生码（可选）" v-model="editCode" maxlength="180" />
          <template v-if="!editCode.trim()"><picker :range="students" range-key="name" :value="editStudent" @change="editStudent = Number($event.detail.value)"><view class="paper-select">学生：{{ students[editStudent]?.name }} <text>﹀</text></view></picker><picker :range="pageLabels" :value="editPage" @change="editPage = Number($event.detail.value)"><view class="paper-select">页码：{{ pageLabels[editPage] }} <text>﹀</text></view></picker></template>
          <view class="scan-row-actions"><button class="primary" @click="confirmIdentity">确认归档信息</button><button class="text-button" @click="editId = ''">取消</button></view>
        </view>
      </view>
      <view v-if="rows.length" class="card scan-submit-card"><view class="strong">{{ ready.length }} 位学生 · {{ ready.reduce((n, g) => n + g.rows.length, 0) }} 页可提交</view><view class="small subtle spaced-small">缺页、重页与待确认页面保留在收件箱，补齐后可继续提交。</view><button class="primary full-width spaced" :disabled="busy || processing || !ready.length || saving || !initialized" @click="submitReady">{{ busy ? '正在提交…' : teacher ? '统一提交并开始AI批阅' : '提交答题卡并开始AI批阅' }}</button></view>
      <button v-if="teacher" class="text-button full-width spaced" :disabled="busy || processing" @click="emit('ai')">查看全班AI批阅进度 ›</button>
    </template>
    <!-- #ifndef H5 -->
    <canvas canvas-id="scan-processing" id="scan-processing" :style="{width:canvasWidth+'px',height:canvasHeight+'px'}" class="paper-export-canvas" />
    <!-- #endif -->
  </view>
</template>
