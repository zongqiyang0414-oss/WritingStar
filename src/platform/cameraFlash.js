export async function applyCameraTorch(track, enabled) {
  let supported = false;
  try { supported = !!track?.getCapabilities?.().torch; } catch { /* Unsupported browser capability query. */ }
  if (!supported || !track?.applyConstraints) {
    const error = new Error("当前浏览器或摄像头不支持补光灯，可在微信小程序中尝试。");
    error.code = "TORCH_UNSUPPORTED"; throw error;
  }
  if (track.readyState === "ended") throw new Error("相机已关闭，请重新开启。");
  await track.applyConstraints({advanced:[{torch:!!enabled}]});
  if (track.getSettings?.().torch === !enabled) throw new Error("补光灯未能切换，请重试。");
}
