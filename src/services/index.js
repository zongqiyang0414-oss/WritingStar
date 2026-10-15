import { MockService } from "./mock.js";

export const STORAGE_KEY = "jiaxiu-prototype-v1";
export function createPrototypeService() {
  const e = new MockService({
    read: () => {
      const e = uni.getStorageSync(STORAGE_KEY);
      if (!e) return null;
      try {
        return JSON.parse(e);
      } catch {
        throw new Error("数据无法读取，请从展示设置恢复初始数据。");
      }
    },
    write: (e) => {
      try {
        uni.setStorageSync(STORAGE_KEY, JSON.stringify(e));
      } catch {
        throw new Error(
          "保存失败，可能是图片过大或存储暂不可用。请减少图片后重试。",
        );
      }
    },
  });
  e.prepareClassPractice();
  return e;
}
