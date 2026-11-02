// Native camera/canvas APIs occasionally omit both callbacks. Bound the wait
// and retire late results instead of leaving every scan button disabled.
export function scanCallback(start, { timeout = 12000, message = "图片处理等待超时，请重试。", onLateValue = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, timedOut = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; timedOut = true;
      const error = new Error(message); error.code = "SCAN_TIMEOUT"; reject(error);
    }, timeout);
    const success = value => {
      if (settled) { if (timedOut) onLateValue(value); return; }
      settled = true; clearTimeout(timer); resolve(value);
    };
    const fail = error => {
      if (settled) return;
      settled = true; clearTimeout(timer); reject(error);
    };
    try { start(success, fail); } catch (error) { fail(error); }
  });
}

export function createScanJobs() {
  let active;
  return {
    async run(work, { timeout = 45000, onInterrupt = () => {} } = {}) {
      if (active) throw new Error("请等待当前图片处理完成。");
      const job = { interrupted: false };
      active = job;
      let timer;
      const interrupted = new Promise((_, reject) => {
        job.stop = error => {
          if (job.interrupted || active !== job) return;
          job.interrupted = true; clearTimeout(timer);
          try { onInterrupt(error); } finally { reject(error); }
        };
        timer = setTimeout(() => {
          const error = new Error("本次图片处理超时，已恢复操作。已扫描的页面仍保留，请重试。");
          error.code = "SCAN_TIMEOUT"; job.stop(error);
        }, timeout);
      });
      try {
        return await Promise.race([interrupted, Promise.resolve().then(() => {
          if (job.interrupted) throw new Error("已停止处理。");
          return work();
        })]);
      } finally { clearTimeout(timer); if (active === job) active = null; }
    },
    cancel() {
      if (!active || active.interrupted) return false;
      const error = new Error("已停止处理，已扫描的页面仍保留。"); error.code = "SCAN_CANCELLED";
      active.stop(error); return true;
    },
  };
}
