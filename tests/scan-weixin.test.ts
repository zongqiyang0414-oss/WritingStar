import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

async function nativeModule() {
  let source = fs.readFileSync(new URL('../src/platform/scanner.js', import.meta.url), 'utf8');
  source = source.replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, '');
  source = source.replace(/from "(\.\/[^\"]+)"/g, (_, name) => `from "${new URL('../src/platform/' + name, import.meta.url).href}"`);
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
test('微信拒绝授权不创建相机，隐私授权失败不继续请求摄像头权限', async () => {
  const originalUni = globalThis.uni, originalWx = globalThis.wx;
  let authorizations = 0;
  try {
    const native = await nativeModule();
    globalThis.wx = { requirePrivacyAuthorize(options) { options.success(); } };
    globalThis.uni = {
      getSetting(options) { options.success({ authSetting: { 'scope.camera': false } }); },
      authorize() { authorizations++; },
    };
    await assert.rejects(native.authorizeScanCamera(), /相机权限已关闭/);
    assert.equal(authorizations, 0);
    globalThis.wx.requirePrivacyAuthorize = options => options.fail();
    await assert.rejects(native.authorizeScanCamera(), /隐私保护指引/);
    assert.equal(authorizations, 0);
    globalThis.wx.requirePrivacyAuthorize = options => options.success();
    globalThis.uni.getSetting = options => options.success({ authSetting: {} });
    globalThis.uni.authorize = options => { assert.equal(options.scope, 'scope.camera'); authorizations++; options.success(); };
    await native.authorizeScanCamera(); assert.equal(authorizations, 1);
  } finally { globalThis.uni = originalUni; globalThis.wx = originalWx; }
});
test('微信扫描件保存失败回滚本次副本，原临时扫描件仍可重试，迟到保存也回滚', async () => {
  const originalUni = globalThis.uni, originalWx = globalThis.wx;
  const originals = new Set(['/tmp/scan-a.jpg', '/tmp/scan-b.jpg']);
  const saved = new Set(); let copies = 0, failSecond = true;
  try {
    const native = await nativeModule();
    globalThis.wx = { env: { USER_DATA_PATH: '/saved' } };
    globalThis.uni = {
      createSelectorQuery() {
        const query = { in() { return query; }, select() { return query; }, fields() { return query; }, exec(resolve) { resolve([{ node: {} }, { node: {} }]); } }; return query;
      },
      getFileSystemManager() { return {
        copyFile(options) {
          assert.ok(originals.has(options.srcPath), 'processed temp page still exists'); copies++;
          if (failSecond && copies === 2) { options.fail(); return; }
          saved.add(options.destPath); options.success();
        },
        unlink(options) { saved.delete(options.filePath); options.success?.(); },
      }; },
    };
    const renderer = await native.createScanRenderer({});
    const photos = [...originals].map((url, index) => ({ id: String(index), url, sample: false }));
    await assert.rejects(native.persistScanPages(renderer, photos), /保存失败/);
    assert.equal(saved.size, 0); assert.equal(originals.size, 2);
    failSecond = false;
    const complete = await native.persistScanPages(renderer, photos);
    assert.equal(saved.size, 2); assert.ok(complete.every(photo => photo.url.startsWith('/saved/scan-') && photo.sample === false));
    const existing = [...saved];
    let checks = 0;
    await assert.rejects(native.persistScanPages(renderer, photos, () => ++checks > 1), /中断/);
    assert.deepEqual([...saved], existing, 'rollback does not remove earlier saved pages');
  } finally { globalThis.uni = originalUni; globalThis.wx = originalWx; }
});
