// Scans use IndexedDB on H5 so image drafts do not compete with application
// localStorage. Formal prototype submissions still use the existing service.
// #ifdef H5
let connection;
function database() {
  connection ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("writingstar-scan-inbox", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("扫描草稿保存不可用，请检查浏览器存储权限。"));
  });
  return connection;
}
async function requestDraft(key, rows) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", rows === undefined ? "readonly" : "readwrite");
    const store = tx.objectStore("drafts"), request = rows === undefined ? store.get(key) : rows.length ? store.put(rows, key) : store.delete(key);
    let value;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => resolve(value || []);
    tx.onabort = tx.onerror = () => reject(new Error("扫描草稿保存失败，当前页面已保留，请勿刷新。"));
  });
}
// #endif
export async function loadScanDraft(key) {
  // #ifdef H5
  return requestDraft(key);
  // #endif
  // #ifndef H5
  return uni.getStorageSync(key) || [];
  // #endif
}
export async function saveScanDraft(key, rows) {
  // Vue proxies are not structured-cloneable.
  const data = JSON.parse(JSON.stringify(rows));
  // #ifdef H5
  return requestDraft(key, data);
  // #endif
  // #ifndef H5
  try { if (data.length) uni.setStorageSync(key, data); else uni.removeStorageSync(key); }
  catch { throw new Error("扫描草稿保存失败，当前页面已保留，请勿退出。"); }
  // #endif
}
