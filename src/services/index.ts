import { MockService } from './mock';
import type { PersistedState } from './model';
export const STORAGE_KEY = 'jiaxiu-prototype-v1';
export function createPrototypeService() {
  const service = new MockService({
    read: () => {
      const raw = uni.getStorageSync(STORAGE_KEY);
      if (!raw) return null;
      try { return JSON.parse(raw) as PersistedState; } catch { throw new Error('数据无法读取，请从展示设置恢复初始数据。'); }
    },
    write: state => {
      try { uni.setStorageSync(STORAGE_KEY, JSON.stringify(state)); }
      catch { throw new Error('保存失败，可能是图片过大或存储暂不可用。请减少图片后重试。'); }
    }
  });
  service.prepareClassPractice();
  return service;
}
