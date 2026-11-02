import { processScanPixels } from "./scanProcessing.js";
import { SCAN_OUTPUT_MAX_EDGE } from "./scanQuality.js";

const paused = () => new Error("扫描已暂停，请重试。");
const unavailable = () => new Error("后台图片处理不可用。");

// One owned worker per scanner; never send pixel arrays through Vue/setData.
// Probe binary messaging first: older WeChat engines serialize messages as JSON.
export function createScanProcessor({ workerFactory, fallback = processScanPixels, startupTimeout = 800, taskTimeout = 30000 } = {}) {
  let worker, ready, active, disabled = false, disposed = false, sequence = 0, generation = 0;
  if (!workerFactory) {
    // #ifdef MP-WEIXIN
    workerFactory = () => typeof wx !== "undefined" && wx.createWorker ? wx.createWorker("workers/scan.js") : null;
    // #endif
  }
  function stop(reason = paused()) {
    sequence++;
    const pending = active; active = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(reason); }
    const previous = worker; worker = null; ready = null;
    try { previous?.terminate(); } catch { /* Runtime may already have killed it. */ }
  }
  function request(message, timeout, onStage) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => stop(unavailable()), timeout);
      active = { id, timer, resolve, reject, onStage };
      try { worker.postMessage({ ...message, id }); }
      catch { stop(unavailable()); }
    });
  }
  async function start() {
    if (disabled || !workerFactory || disposed) return false;
    if (ready) return ready;
    const startedAt = generation;
    ready = (async () => {
      try {
        worker = workerFactory();
        if (!worker) return false;
        worker.onMessage(message => {
          const pending = active;
          if (!pending || message.id !== pending.id) return;
          if (message.stage) { pending.onStage?.(message.stage); return; }
          clearTimeout(pending.timer); active = null;
          if (message.error) pending.reject(new Error(message.error));
          else pending.resolve(message);
        });
        const owned = worker;
        worker.onError?.(() => { if (worker === owned) stop(unavailable()); });
        worker.onProcessKilled?.(() => { if (worker === owned) stop(unavailable()); });
        const probe = await request({ type: "probe", buffer: new Uint8Array([17, 93, 201, 255]).buffer }, startupTimeout);
        const bytes = probe.buffer instanceof ArrayBuffer ? new Uint8Array(probe.buffer) : [];
        if (bytes.length !== 4 || bytes[0] !== 17 || bytes[2] !== 201) throw unavailable();
        return true;
      } catch {
        if (generation === startedAt) { disabled = true; stop(unavailable()); }
        return false;
      }
    })();
    return ready;
  }
  return {
    async process(image, corners, options = {}) {
      if (disposed || options.cancelled?.()) throw paused();
      const token = generation;
      const cancelled = () => disposed || token !== generation || options.cancelled?.();
      const available = await start();
      if (cancelled()) throw paused();
      const runFallback = async () => {
        const result = await fallback(image, corners, { ...options, cancelled });
        if (cancelled()) throw paused();
        return result;
      };
      if (!available) return runFallback();
      try {
        const { readCode = true, sourceCodeFallback = false, maxEdge = SCAN_OUTPUT_MAX_EDGE, aspectRatio = 0 } = options;
        const data = image.data;
        const buffer = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
          ? data.buffer : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        const result = await request({ type: "process", width: image.width, height: image.height, buffer, corners,
          options: { readCode, sourceCodeFallback, maxEdge, aspectRatio } }, taskTimeout, options.onStage);
        if (cancelled()) throw paused();
        if (!(result.buffer instanceof ArrayBuffer) || result.buffer.byteLength !== result.width * result.height * 4) throw unavailable();
        return { image: { width: result.width, height: result.height, data: new Uint8ClampedArray(result.buffer) }, code: result.code || "" };
      } catch (error) {
        if (cancelled() || error.message === paused().message) throw paused();
        // Messaging/runtime failure leaves the source intact (WeChat copies
        // buffers), allowing the same photo to complete on the main thread.
        disabled = true; stop(unavailable());
        return runFallback();
      }
    },
    cancel() { generation++; stop(); },
    dispose() { disposed = true; generation++; stop(); },
  };
}
