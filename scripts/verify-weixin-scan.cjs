// Exercise the compiled scan page, including lifecycle ordering of the iOS picker.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const vue = require('vue');
const root = path.resolve(__dirname, '../dist/build/mp-weixin');
const template = fs.readFileSync(path.join(root, 'pages/scan/index.wxml'), 'utf8');
const event = (tag, attribute) => {
  const match = tag.match(new RegExp(attribute + '="{{([^}]+)}}"'));
  assert.ok(match, `missing ${attribute}`); return match[1];
};
const camera = template.match(/<camera\b[^>]+>/)[0];
const start = template.match(/<button\b[^>]*class="scan-primary"[^>]+>/)[0];
const album = template.match(/<button\b[^>]*class="scan-side-action"[^>]+>/)[0];

function createPage({ denied = false, canvasUnavailable = false, mediaFailure = '' } = {}) {
  let definition, canvasQueries = 0, requests = 0, pickerReturn, contractOpens = 0, systemPhotos = 0;
  const lifecycle = {}, cache = {};
  const hooks = name => callback => (lifecycle[name] ||= []).push(callback);
  const canvasNode = {
    width: 2, height: 2,
    createImage() {
      return { width: 24, height: 32, set src(_value) { queueMicrotask(() => this.onload()); } };
    },
    getContext() {
      return { drawImage() {}, getImageData(_x, _y, width, height) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
      } };
    },
  };
  const uni = {
    getSetting(options) { requests++; options.success({ authSetting: denied ? { 'scope.camera': false } : {} }); },
    authorize() { assert.fail('scan page must allow camera to mount and request permission itself'); },
    createSelectorQuery() {
      const query = {
        in() { return query; }, select() { return query; },
        fields() { canvasQueries++; return query; },
        boundingClientRect(callback) { callback({ width: 300, height: 400, left: 0, top: 100 }); return query; },
        exec(callback) { callback?.(canvasUnavailable ? [] : [{ node: canvasNode }, { node: canvasNode }]); return query; },
      }; return query;
    },
    createCameraContext() { return { onCameraFrame() { return { start() {}, stop() {} }; } }; },
    chooseImage(options) {
      assert.deepEqual(Array.from(options.sourceType), ['camera']); systemPhotos++;
      options.success({ tempFilePaths: ['/tmp/system-camera.jpg'] });
    },
    setClipboardData(options) { options.fail({ errMsg: 'setClipboardData:fail api scope is not declared in privacy agreement' }); },
    showModal(options) { assert.ok(options.content); },
    getFileSystemManager() { return { unlink(options) { options.success?.(); } }; },
  };
  const wx = {
    createPage(page) { definition = page; },
    getPrivacySetting() { assert.fail('privacy-setting failure must not block native media'); },
    requirePrivacyAuthorize() { assert.fail('native media owns consent'); },
    openPrivacyContract(options) { contractOpens++; options.success(); },
    chooseMedia(options) {
      assert.deepEqual(Array.from(options.sourceType), ['album']);
      if (mediaFailure) { options.fail({ errMsg: mediaFailure }); return; }
      lifecycle.onHide.forEach(callback => callback());
      options.success({ tempFiles: [{ tempFilePath: '/tmp/album.jpg' }] });
      // Real picker success can precede the page's onShow notification.
      pickerReturn = setTimeout(() => lifecycle.onShow.forEach(callback => callback()), 20);
    },
  };
  const vendor = { ...vue, index: uni, wx$1: wx,
    getCurrentInstance: () => ({ proxy: { $scope: {}, getOpenerEventChannel() { return { emit() {} }; } } }),
    e: (...args) => Object.assign({}, ...args), t: String, o: handler => handler,
    n: value => value, s: value => value, f: (items, callback) => items.map(callback),
  };
  for (const name of ['onLoad', 'onReady', 'onShow', 'onHide', 'onUnload', 'onResize']) vendor[name] = hooks(name);
  function load(file) {
    if (file === path.join(root, 'common/vendor.js')) return vendor;
    if (cache[file]) return cache[file].exports;
    const source = fs.readFileSync(file, 'utf8');
    for (const alias of source.matchAll(/\.((?:nextTick|reactive|ref|computed|shallowRef|watch)\$\d+)\b/g))
      vendor[alias[1]] = vue[alias[1].split('$')[0]];
    const module = { exports: {} }; cache[file] = module;
    vm.runInNewContext(source, { module, exports: module.exports, require: name => load(path.resolve(path.dirname(file), name)),
      wx, uni, console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
      Uint8ClampedArray, Uint8Array, Uint16Array, Uint32Array, Float32Array, Int32Array, Promise, Date,
    }, { filename: file });
    return module.exports;
  }
  load(path.join(root, 'pages/scan/index.js'));
  const render = definition.setup({}, {});
  lifecycle.onLoad.forEach(callback => callback({ batch: 'paper', remaining: '60' }));
  lifecycle.onShow.forEach(callback => callback());
  lifecycle.onReady.forEach(callback => callback());
  return { render, lifecycle, get canvasQueries() { return canvasQueries; }, get requests() { return requests; },
    get contractOpens() { return contractOpens; }, get systemPhotos() { return systemPhotos; },
    close() { clearTimeout(pickerReturn); lifecycle.onUnload.forEach(callback => callback()); },
  };
}

(async () => {
  const first = createPage({ canvasUnavailable: true });
  assert.equal(first.canvasQueries, 0, 'canvas initialization must not block first camera access');
  assert.equal(first.requests, 0, 'page opening must not request camera permission');
  await first.render()[event(start, 'bindtap')]();
  assert.equal(first.render()[event(camera, 'wx:if')], true, 'undefined camera scope must allow the native camera to mount');
  first.render()[event(camera, 'bindinitdone')]();
  first.close();

  const denied = createPage({ denied: true });
  await denied.render()[event(start, 'bindtap')]();
  assert.equal(denied.render()[event(camera, 'wx:if')], false);
  assert.match(JSON.stringify(denied.render()), /小程序.*摄像头|摄像头.*授权/);
  const requests = denied.requests;
  await denied.render()[event(album, 'bindtap')]();
  assert.equal(denied.requests, requests, 'album must not ask for camera permission');
  assert.match(JSON.stringify(denied.render()), /确认并处理|corners|拖动四角/);
  assert.doesNotMatch(JSON.stringify(denied.render()), /扫描已暂停|相册未能打开/);
  denied.close();

  const blocked = createPage({ mediaFailure: 'chooseMedia:fail api scope is not declared in privacy agreement' });
  await blocked.render()[event(album, 'bindtap')]();
  assert.equal(blocked.render()[event(camera, 'wx:if')], false);
  assert.match(JSON.stringify(blocked.render()), /缺少隐私声明/);
  assert.match(JSON.stringify(blocked.render()), /chooseMedia:fail api scope is not declared/);
  assert.match(template, /<text[^>]*selectable[^>]*>/, 'raw errors remain selectable if clipboard permission fails');
  const contract = template.match(/<button\b[^>]+>查看隐私指引/)[0];
  await blocked.render()[event(contract, 'bindtap')]();
  assert.equal(blocked.contractOpens, 1, 'privacy link must open the actual WeChat contract');
  const copy = template.match(/<button\b[^>]+>复制错误详情/)[0];
  blocked.render()[event(copy, 'bindtap')]();
  assert.match(JSON.stringify(blocked.render()), /chooseMedia:fail api scope is not declared/, 'failed clipboard does not hide the media failure');
  blocked.close();

  const system = createPage();
  const capture = template.match(/<button\b[^>]+>使用系统相机拍摄/)[0];
  await system.render()[event(capture, 'bindtap')]();
  assert.equal(system.systemPhotos, 1);
  assert.match(JSON.stringify(system.render()), /确认并处理|corners|拖动四角/);
  system.close();
  console.log('WeChat compiled scan checks passed: native consent without privacy preflight, real privacy rejection, contract link, clipboard failure, system photo, camera mount and picker lifecycle.');
})().catch(error => { console.error(error); process.exitCode = 1; });
