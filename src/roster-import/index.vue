<script setup>
import { getCurrentInstance, ref } from "vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import { validateRosterFile } from "../services/studentRosterPolicy.js";
const progress = ref("正在读取学生名单…"), scope = getCurrentInstance().proxy;
let channel, alive = true, delivered = false;
function cancel() { uni.navigateBack(); }
// #ifdef MP-WEIXIN
async function parseFile(file) {
  try {
    validateRosterFile(file);
    const data = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: file.path, success: (result) => resolve(result.data), fail: () => reject(new Error("名单文件无法读取，请重新选择。")) }));
    if (!alive) return;
    // Kept inside this package; XLSX and ZIP parsing never enter the main vendor.
    const loadEngine = require;
    const engine = loadEngine("./engine.js");
    const rows = engine.parseRosterBytes(data, file.name);
    if (!alive) return;
    delivered = true; channel.emit("parsed", rows); uni.navigateBack();
  } catch (error) {
    if (!alive) return;
    delivered = true; channel.emit("failed", error.message || "名单读取失败，请重新选择。"); uni.navigateBack();
  }
}
onLoad(() => { channel = scope.getOpenerEventChannel(); channel.on("roster", parseFile); });
// #endif
onUnload(() => { alive = false; if (!delivered) channel?.emit("cancelled"); });
</script>

<template><view class="roster-import-page"><view class="roster-import-title">读取学生名单</view><view class="small subtle spaced" role="status">{{ progress }}</view><button class="secondary full-width spaced" @click="cancel">取消导入</button></view></template>
<style scoped>.roster-import-page{padding:80px 24px 24px;padding-top:calc(80px + env(safe-area-inset-top));}.roster-import-title{font-size:22px;font-weight:700;}</style>
