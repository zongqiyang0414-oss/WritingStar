// WeChat limits each Storage entry to 1 MiB. Keep the database in private files;
// Storage contains only a tiny commit pointer. Alternate slots so a failed write
// or pointer update never overwrites the last committed database.
export function createWeixinStateStorage(key) {
  const fs = wx.getFileSystemManager();
  const file = slot => `${wx.env.USER_DATA_PATH}/writingstar-state-${slot}.json`;
  const marker = "writingstar-file-state-v1";
  function pointer() {
    const raw = uni.getStorageSync(key);
    if (!raw) return null;
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (value?.storage === marker && ![0, 1].includes(value.slot)) throw new Error("存储索引损坏。");
    return value;
  }
  return {
    read() {
      try {
        const value = pointer();
        return value?.storage === marker ? JSON.parse(fs.readFileSync(file(value.slot), "utf8")) : value;
      } catch { throw new Error("本机作业记录读取失败，请保留现有数据，不要重置或清除缓存。"); }
    },
    write(state) {
      try {
        const current = pointer();
        const slot = current?.storage === marker ? 1 - current.slot : 0;
        fs.writeFileSync(file(slot), JSON.stringify(state), "utf8");
        uni.setStorageSync(key, JSON.stringify({ storage: marker, slot }));
      } catch { throw new Error("本机作业记录保存失败，请检查设备剩余空间后重试；原有记录和本次未提交内容已保留。"); }
    },
  };
}
