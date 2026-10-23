<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref } from "vue";
import { onHide } from "@dcloudio/uni-app";
import { scanGroups, MAX_SCAN_PAGES, paperId } from "../services/paperWorkflow.js";
import { loadScanDraft, saveScanDraft } from "../platform/scanDrafts.js";
// #ifndef H5
import { chooseDeviceScanImages, processDeviceScan, preserveDeviceScan } from "../platform/devicePaperScanner.js";
// #endif
// #ifdef H5
import { chooseScanFiles, inspectScanFrame, loadScanImage, processScanSource } from "../platform/documentScanner.js";
// #endif
const props = defineProps({ state: Object, assignment: Object, cards: Array, teacher: Boolean, studentId: String, identityId: String, busy: Boolean });
const emit = defineEmits(["submit", "cards", "ai", "confirm"]);
const rows = ref([]), error = ref(""), saving = ref(false), processing = ref(false), progress = ref(""), initialized = ref(false);
const cameraOpen = ref(false), cameraStarting = ref(false), cameraStatus = ref("将整张答题卡放入画面"), automatic = ref(true);
const editId = ref(""), editStudent = ref(0), editPage = ref(0), editCode = ref("");
const summary = computed(() => scanGroups(props.state, props.assignment.id, rows.value, props.teacher ? "" : props.studentId));
const ready = computed(() => summary.value.groups.filter(g => g.ready));
const matching = computed(() => new Map(summary.value.groups.flatMap(g => g.rows.map(r => [r.id, { ...r, student: g.student }]))));
const issues = computed(() => new Map(summary.value.unresolved.map(r => [r.id, r.issue])));
const students = computed(() => props.cards.map(c => ({ id: c.studentId, name: c.studentName })));
const pageLabels = computed(() => Array.from({length: props.assignment.paperPacket?.pages || 2}, (_, i) => `第 ${i + 1} 页`));
const key = `writingstar-scan-v1:${props.teacher ? 'teacher' : 'student'}:${props.identityId}:${props.assignment.id}`;
const cameraId = `paper-camera-${paperId()}`;
const instance = getCurrentInstance(), canvasWidth = ref(1000), canvasHeight = ref(1414);
let persistQueue = Promise.resolve(), alive = true, stream, video, timer, lastCorners, stable = 0, emptyFrames = 0, lastSavedCode = "", frameBusy = false;
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
      const url = URL.createObjectURL(files[i]);
      try {
        const source = await loadScanImage(url), row = await processScanSource(source, files[i].name);
        await append(row);
      } catch (failure) { failures++; error.value = `${files[i].name}：${failure.message}`; }
      finally { URL.revokeObjectURL(url); }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    // #endif
    // #ifndef H5
    const photos = await chooseDeviceScanImages(MAX_SCAN_PAGES - rows.value.length);
    for (const photo of photos) {
      progress.value = "识别学生码并校正页面…";
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
function stopCamera() {
  clearTimeout(timer); timer = undefined;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  if (video) { video.srcObject = null; video.remove(); video = null; }
  cameraOpen.value = false; cameraStarting.value = false; stable = 0; lastCorners = null;
}
async function startCamera() {
  error.value = ""; cameraStarting.value = true;
  // #ifdef H5
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器无法开启相机，请使用系统相机拍摄后批量导入。");
    const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: {ideal: "environment"}, width: {ideal: 1920}, height: {ideal: 2560} }, audio: false });
    if (!alive || !cameraStarting.value) { opened.getTracks().forEach(t => t.stop()); return; }
    stream = opened; cameraOpen.value = true; await nextTick();
    video = document.createElement("video"); video.autoplay = true; video.muted = true; video.setAttribute("playsinline", ""); video.srcObject = stream;
    document.getElementById(cameraId)?.prepend(video); await video.play();
    cameraStarting.value = false; timer = setTimeout(tick, 350);
  } catch (failure) {
    stopCamera(); error.value = failure.name === "NotAllowedError" ? "相机权限未开启，请允许相机访问或使用批量导入。" : failure.message || "相机不可用，请使用批量导入。";
  }
  // #endif
  // #ifndef H5
  cameraStarting.value = false;
  await importImages();
  // #endif
}
// #ifdef H5
async function tick() {
  if (!cameraOpen.value || !video || !alive) return;
  try {
    if (!frameBusy && video.readyState >= 2) {
      const frame = inspectScanFrame(video), corners = frame.corners;
      if (!corners) {
        stable = 0; emptyFrames++;
        if (emptyFrames >= 3) lastSavedCode = "";
        cameraStatus.value = "请放入完整答题卡，保持四角清晰";
      } else {
        emptyFrames = 0;
        stable = lastCorners && corners.every((p, i) => Math.hypot(p.x - lastCorners[i].x, p.y - lastCorners[i].y) < 8) ? stable + 1 : 0;
        lastCorners = corners;
        cameraStatus.value = stable >= 2 ? "已对齐，保持稳定" : "已找到纸张，正在对齐";
        if (automatic.value && stable >= 3) await capture(true);
      }
    }
  } catch (failure) { error.value = failure.message; }
  finally { if (cameraOpen.value && alive) timer = setTimeout(tick, 350); }
}
// #endif
async function capture(auto = false) {
  if (frameBusy || !cameraOpen.value) return;
  frameBusy = true;
  // #ifdef H5
  try {
    const row = await processScanSource(video, "相机扫描答题卡");
    if (auto && !row.code) { cameraStatus.value = "未读到学生码，可靠近拍摄或点击拍摄"; return; }
    if (row.code && row.code === lastSavedCode) { cameraStatus.value = "本页已保存，请换下一页"; return; }
    await append(row); lastSavedCode = row.code; stable = 0;
    cameraStatus.value = `已自动保存 ${rows.value.length} 页，请换下一页`;
    if (rows.value.length >= MAX_SCAN_PAGES) stopCamera();
  } catch (failure) { error.value = failure.message; cameraStatus.value = "请检查收件箱提示"; }
  finally { frameBusy = false; }
  // #endif
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
    body: `共 ${selected.length} 页，已按学生码和页码归档。提交后进入AI批阅；待确认和缺页页面继续保留。`,
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
    <view class="paper-heading"><view class="paper-overline">SCAN · MATCH · REVIEW</view><view class="paper-title">{{ teacher ? '把一叠作业，变成有序的反馈' : '纸上完成，拍照交作业' }}</view><view class="small subtle">{{ assignment.title }}</view></view>
    <view v-if="!assignment.paperPacket || !cards.length" class="card paper-empty"><view class="strong">请先生成专属答题卡</view><button class="primary full-width spaced" @click="emit('cards')">前往答题卡</button></view>
    <template v-else>
      <view class="scan-summary"><view><text>{{ rows.length }}</text>已收页面</view><view><text>{{ ready.length }}</text>可提交学生</view><view><text>{{ summary.unresolved.length }}</text>待确认页面</view></view>
      <view class="card scan-capture-card">
        <view class="paper-inline"><view class="section-title">{{ teacher ? '连续扫描 / 批量导入' : '添加已完成的答题卡' }}</view><text class="scan-local-badge">{{ saving ? '保存中…' : initialized ? '草稿自动保存' : '恢复草稿…' }}</text></view>
        <view class="small subtle spaced-small">识别四角与学生码 → 自动校正 → 按学生和页码归档</view>
        <view class="scan-import-actions"><button class="primary" :disabled="busy || processing || cameraStarting || !initialized" @click="startCamera">{{ cameraStarting ? '开启相机…' : '开启相机扫描' }}</button><button class="secondary" :disabled="busy || processing || !initialized || rows.length >= 60" @click="importImages">{{ processing ? '正在处理…' : '批量导入照片' }}</button></view>
        <view v-if="processing" class="small subtle spaced-small">{{ progress || '正在读取图片…' }}</view>
        <view class="tiny subtle spaced-small">支持 JPG / PNG / WebP；可导入扫描软件导出的图片，每批最多 60 页。</view>
      </view>
      <!-- #ifdef H5 -->
      <view v-if="cameraOpen" class="scan-camera-card">
        <view :id="cameraId" class="scan-camera-viewport"><view class="scan-camera-guides"><view class="scan-camera-guide-text">请保留四角标记与学生码</view></view></view>
        <view class="scan-camera-status">{{ cameraStatus }}</view>
        <view class="scan-camera-toolbar"><view class="small"><switch :checked="automatic" color="#257b61" @change="automatic = $event.detail.value" /> 连续自动拍摄</view><button class="secondary" @click="capture(false)">拍摄本页</button><button class="text-button" @click="stopCamera">关闭相机</button></view>
      </view>
      <!-- #endif -->
      <view v-if="error" class="paper-error" role="alert">{{ error }}</view>
      <view v-if="!rows.length" class="card scan-empty"><view class="scan-empty-symbol">▤</view><view class="strong">把完成的答题卡放到这里</view><view class="small subtle spaced-small">连续扫描时保持纸张稳定，保存后移走当前页再放下一页。学生码模糊时可人工确认。</view><button class="text-button spaced" @click="emit('cards')">查看 / 打印答题卡 ›</button></view>
      <view v-if="summary.groups.length" class="section-heading"><view class="section-title">按学生归档</view><text class="tiny subtle">自动按页码排序</text></view>
      <view v-for="group in summary.groups" :key="group.student.id" class="card scan-student-group">
        <view class="paper-inline"><view><view class="strong">{{ group.student.name }}</view><view class="tiny subtle">{{ group.rows.length }} / {{ group.total }} 页 · {{ group.rows.some(r => r.manual) ? '含人工确认' : '学生码已对应' }}</view></view><text :class="['badge', group.ready ? 'complete' : 'pending']">{{ group.ready ? '可提交' : '需处理' }}</text></view>
        <view v-for="issue in group.issues" :key="issue" class="scan-group-issue">{{ issue }}</view>
      </view>
      <view v-if="rows.length" class="section-heading"><view class="section-title">扫描收件箱</view><button class="text-button" :disabled="busy || processing" @click="clear">清空草稿</button></view>
      <view v-for="(row, index) in rows" :key="row.id" class="card scan-page-card">
        <view class="scan-page-main"><image :src="row.photo.url" class="scan-page-thumb" mode="aspectFit" @click="preview(row)" /><view class="grow"><view class="strong">{{ matching.get(row.id) ? matching.get(row.id).student.name + ' · 第 ' + matching.get(row.id).page + ' 页' : '第 ' + (index + 1) + ' 张 · 待确认' }}</view><view class="tiny subtle">{{ row.corrected ? '已自动校正' : '原图保留，请检查边缘' }} · {{ matching.get(row.id) ? row.code ? '学生码识别' : '人工确认' : '待核对学生码' }}</view><view v-if="issues.get(row.id)" class="scan-group-issue">{{ issues.get(row.id) }}</view><view class="scan-row-actions"><button class="text-button" :disabled="busy || processing" @click="edit(row)">{{ matching.get(row.id) ? '核对信息' : '人工确认' }}</button><button class="text-button" :disabled="busy || processing" @click="remove(row.id)">移除</button></view></view></view>
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
