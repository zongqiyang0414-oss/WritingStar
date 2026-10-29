import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nativeScanError } from '../src/platform/scanAccess.js';

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

test('隐私预检故障不阻止原生相机，真实的系统拒绝仍然阻止', async () => {
  const originalUni = globalThis.uni, originalWx = globalThis.wx;
  try {
    const native = await nativeModule();
    globalThis.uni = { getSetting(options) { options.success({ authSetting: {} }); } };
    globalThis.wx = { getAppAuthorizeSetting() { return { cameraAuthorized: 'denied' }; } };
    await assert.rejects(native.authorizeScanCamera(), error => error.code === 'wx-system-camera' && error.action === 'app-settings');
    globalThis.wx = { getPrivacySetting() { assert.fail('an unrelated privacy probe must not gate camera'); },
      requirePrivacyAuthorize() { assert.fail('native camera owns consent on first use'); } };
    await native.authorizeScanCamera();
  } finally { globalThis.uni = originalUni; globalThis.wx = originalWx; }
});

test('真实接口的未声明、未同意与网络故障分别处理并保留原文', () => {
  const config = nativeScanError({ errMsg: 'camera:fail api scope is not declared in privacy agreement' });
  assert.equal(config.code, 'wx-privacy-config'); assert.equal(config.action, 'privacy-config');
  assert.match(config.message, /管理员.*电脑/); assert.match(config.detail, /not declared/);
  const denied = nativeScanError({ errMsg: 'camera:fail privacy permission is not authorized' });
  assert.equal(denied.action, 'privacy'); assert.doesNotMatch(denied.message, /缺少隐私声明/);
  const network = nativeScanError({ errMsg: 'camera:fail network timeout' });
  assert.equal(network.code, 'wx-media-failed'); assert.equal(network.detail, 'camera:fail network timeout');
});

test('查看隐私指引调用微信真实入口，不把阅读当作用户已同意', async () => {
  const originalWx = globalThis.wx;
  try {
    const native = await nativeModule(); let opens = 0;
    globalThis.wx = { openPrivacyContract(options) { opens++; options.success(); },
      requirePrivacyAuthorize() { assert.fail('viewing the contract does not grant consent'); } };
    await native.openScanPrivacyContract(); assert.equal(opens, 1);
    globalThis.wx.openPrivacyContract = options => options.fail({ errMsg: 'openPrivacyContract:fail privacy not configured' });
    await assert.rejects(native.openScanPrivacyContract(), error => error.action === 'privacy-config' && /not configured/.test(error.detail));
  } finally { globalThis.wx = originalWx; }
});

test('相册在相机被拒后仍可用，走chooseMedia且不请求相机或写相册权限', async () => {
  const originalUni = globalThis.uni, originalWx = globalThis.wx;
  try {
    const native = await nativeModule();
    globalThis.uni = { getSetting() { assert.fail('album must not depend on camera settings'); }, authorize() { assert.fail('album requires neither camera nor writePhotosAlbum scope'); } };
    globalThis.wx = {
      getPrivacySetting() { assert.fail('album must reach the native picker without privacy preflight'); }, requirePrivacyAuthorize() { assert.fail('native picker owns consent'); },
      getAppAuthorizeSetting() { return { cameraAuthorized: 'denied' }; },
      chooseMedia(options) { assert.deepEqual(options.sourceType, ['album']); assert.deepEqual(options.mediaType, ['image']); options.success({ tempFiles: [{ tempFilePath: '/tmp/album.jpg' }] }); },
    };
    assert.equal(await native.chooseScanSource(), '/tmp/album.jpg');
    globalThis.wx.chooseMedia = options => options.fail({ errMsg: 'chooseMedia:fail cancel' });
    assert.equal(await native.chooseScanSource(), null);
    globalThis.wx.chooseMedia = options => options.fail({ errMsg: 'chooseMedia:fail api scope is not declared in privacy agreement' });
    globalThis.uni.chooseImage = () => assert.fail('do not retry another API to bypass an actual privacy rejection');
    await assert.rejects(native.chooseScanSource(), error => error.code === 'wx-privacy-config' && /scope/.test(error.detail));
    globalThis.uni.chooseImage = options => { assert.deepEqual(options.sourceType, ['camera']); options.success({ tempFilePaths: ['/tmp/system-camera.jpg'] }); };
    assert.equal(await native.chooseScanSource('camera'), '/tmp/system-camera.jpg', 'system camera uses the previously working chooseImage even when chooseMedia exists');
    delete globalThis.wx.chooseMedia;
    globalThis.uni.chooseImage = options => { assert.deepEqual(options.sourceType, ['album']); options.success({ tempFilePaths: ['/tmp/older-library.jpg'] }); };
    assert.equal(await native.chooseScanSource(), '/tmp/older-library.jpg');
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
