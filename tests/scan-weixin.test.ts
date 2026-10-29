import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

async function nativeModule() {
  let source = fs.readFileSync(new URL('../src/platform/scanner.js', import.meta.url), 'utf8');
  source = source.replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, '');
  source = source.replace(/from "(\.\/[^\"]+)"/g, (_, name) => `from "${new URL('../src/platform/' + name, import.meta.url).href}"`);
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
test('微信首次相机请求交给camera组件，不用缺失的授权条目阻止初始化', async () => {
  const originalUni = globalThis.uni, originalWx = globalThis.wx;
  let prompts = 0;
  try {
    const native = await nativeModule();
    globalThis.wx = { getPrivacySetting(options) { options.success({ needAuthorization: false }); }, requirePrivacyAuthorize() { prompts++; } };
    globalThis.uni = { getSetting(options) { options.success({ authSetting: {} }); }, authorize() { assert.fail('first use must mount camera, not gate it behind authorize'); } };
    await native.authorizeScanCamera(); assert.equal(prompts, 0);
    globalThis.uni.getSetting = options => options.success({ authSetting: { 'scope.camera': false } });
    await assert.rejects(native.authorizeScanCamera(), error => error.code === 'wx-camera-denied' && error.action === 'mini-settings');
  } finally { globalThis.uni = originalUni; globalThis.wx = originalWx; }
});

test('手机系统权限与微信隐私配置分别提示，不把所有失败归成没有权限', async () => {
  const originalUni = globalThis.uni, originalWx = globalThis.wx;
  try {
    const native = await nativeModule();
    globalThis.uni = { getSetting(options) { options.success({ authSetting: {} }); } };
    globalThis.wx = { getAppAuthorizeSetting() { return { cameraAuthorized: 'denied' }; } };
    await assert.rejects(native.authorizeScanCamera(), error => error.code === 'wx-system-camera' && error.action === 'app-settings');
    globalThis.wx = { getPrivacySetting(options) { options.fail({ errMsg: 'getPrivacySetting:fail privacy not declared' }); }, requirePrivacyAuthorize() {} };
    await assert.rejects(native.authorizeScanCamera(), error => error.code === 'wx-privacy' && /not declared/.test(error.detail));
    globalThis.wx.getPrivacySetting = options => options.success({ needAuthorization: true });
    globalThis.wx.requirePrivacyAuthorize = options => options.fail({ errMsg: 'requirePrivacyAuthorize:fail user deny' });
    await assert.rejects(native.authorizeScanCamera(), error => error.code === 'wx-privacy-consent' && /user deny/.test(error.detail));
    globalThis.wx.requirePrivacyAuthorize = options => options.success();
    await native.authorizeScanCamera();
  } finally { globalThis.uni = originalUni; globalThis.wx = originalWx; }
});

test('相册在相机被拒后仍可用，走chooseMedia且不请求相机或写相册权限', async () => {
  const originalUni = globalThis.uni, originalWx = globalThis.wx;
  try {
    const native = await nativeModule();
    globalThis.uni = { getSetting() { assert.fail('album must not depend on camera settings'); }, authorize() { assert.fail('album requires neither camera nor writePhotosAlbum scope'); } };
    globalThis.wx = {
      getPrivacySetting(options) { options.success({ needAuthorization: false }); }, requirePrivacyAuthorize() { assert.fail('already agreed'); },
      getAppAuthorizeSetting() { return { cameraAuthorized: 'denied' }; },
      chooseMedia(options) { assert.deepEqual(options.sourceType, ['album']); assert.deepEqual(options.mediaType, ['image']); options.success({ tempFiles: [{ tempFilePath: '/tmp/album.jpg' }] }); },
    };
    assert.equal(await native.chooseScanSource(), '/tmp/album.jpg');
    globalThis.wx.chooseMedia = options => options.fail({ errMsg: 'chooseMedia:fail cancel' });
    assert.equal(await native.chooseScanSource(), null);
    globalThis.wx.chooseMedia = options => options.fail({ errMsg: 'chooseMedia:fail api scope is not declared in privacy agreement' });
    await assert.rejects(native.chooseScanSource(), error => error.code === 'wx-privacy' && /scope/.test(error.detail));
    delete globalThis.wx.chooseMedia;
    globalThis.uni.chooseImage = options => { assert.deepEqual(options.sourceType, ['album']); options.success({ tempFilePaths: ['/tmp/older-library.jpg'] }); };
    assert.equal(await native.chooseScanSource(), '/tmp/older-library.jpg');
    globalThis.uni.chooseImage = options => { assert.deepEqual(options.sourceType, ['camera']); options.success({ tempFilePaths: ['/tmp/system-camera.jpg'] }); };
    assert.equal(await native.chooseScanSource('camera'), '/tmp/system-camera.jpg');
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
