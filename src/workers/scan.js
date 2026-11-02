import { processScanPixels } from "../platform/scanProcessing.js";

worker.onMessage(async message => {
  const { id } = message;
  if (message.type === "probe") { worker.postMessage({ id, buffer: message.buffer }); return; }
  if (message.type !== "process") return;
  try {
    const image = { width: message.width, height: message.height, data: new Uint8ClampedArray(message.buffer) };
    if (image.data.length !== image.width * image.height * 4) throw new Error("照片像素不完整，请重试。");
    const result = await processScanPixels(image, message.corners, { ...message.options, cooperative: false,
      onStage: stage => worker.postMessage({ id, stage }) });
    worker.postMessage({ id, width: result.image.width, height: result.image.height, buffer: result.image.data.buffer, code: result.code, quarterTurns: result.quarterTurns ?? null });
  } catch (error) { worker.postMessage({ id, error: error.message || "照片处理失败，请重试。" }); }
});
