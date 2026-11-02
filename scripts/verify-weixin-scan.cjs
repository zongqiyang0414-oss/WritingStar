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
const shutter = template.match(/<button\b[^>]*class="scan-shutter"[^>]+>/)[0];
const thumbnail = [...template.matchAll(/<button\b[^>]*class="scan-side-action"[^>]+>/g)][1][0];
const countKey = template.match(/class="scan-count"[^>]*>{{([^}]+)}}/)[1];

function createPage({ denied = false, canvasUnavailable = false, mediaFailure = '', paper = false, stalledPhoto = false, stalledCopy = false, fastTimeouts = false, uncertainStill = false, qrData = '' } = {}) {
  let definition, viewerDefinition, canvasQueries = 0, requests = 0, pickerReturn, contractOpens = 0, systemPhotos = 0, previews = [];
  const lifecycle = {}, cache = {};
  let frameCallback, photoCallback, exportCallback, clock = 1000, frameStarts = 0, frameStops = 0;
  const removed = [];
  let pageVariant = 0, captures = 0;
  const files = new Map([['/tmp/album.png',{width:4032,height:3024,bytes:'album-original'}],['/tmp/system-camera.png',{width:3024,height:4032,bytes:'system-original'}]]), copies = [], delivered = [], trace = [];
  class ScanDate extends Date { static now() { return clock; } }
  const pixels = (width, height) => {
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    if (paper) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const inside = x > width * .125 && x < width * .875 && y > height * .08 && y < height * .92;
      const value = inside ? ((y + pageVariant * 7) % 29 < 2 && x > width * .25 && x < width * .75 ? 65 : 225) : 75;
      const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = value;
    }
    return { width, height, data };
  };
  const hooks = name => callback => (lifecycle[name] ||= []).push(callback);
  const canvasNode = {
    width: 2, height: 2,
    requestAnimationFrame(fn) { queueMicrotask(fn); },
    createImage() {
      return { width: paper ? 3024 : 24, height: paper ? 4032 : 32, set src(value) { this.path = value; queueMicrotask(() => this.onload()); } };
    },
    getContext() {
      const target = this;
      return { drawImage(image,...args) { target.source = image.path; target.drawArgs = args; }, getImageData(_x, _y, width, height) {
        return uncertainStill && target.source?.includes('capture') ? {width,height,data:new Uint8ClampedArray(width*height*4).fill(255)} : pixels(width, height);
      },
        createImageData(width, height) { return pixels(width, height); }, putImageData() {},
        clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
      };
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
        exec(callback) { callback?.(canvasUnavailable ? [] : [{ node: canvasNode }, { node: { ...canvasNode } }, { node: { ...canvasNode } }]); return query; },
      }; return query;
    },
    createCameraContext() { return {
      onCameraFrame(fn) { frameCallback = fn; return { start() { frameStarts++; }, stop() { frameStops++; } }; },
      takePhoto(options) { photoCallback = options; if (!stalledPhoto) {files.set('/tmp/capture.png',{width:3024,height:4032,bytes:'camera-original-'+(++captures)});options.success({tempImagePath:'/tmp/capture.png'});} },
    }; },
    canvasToTempFilePath(options) {
      assert.notEqual(options.fileType,'jpg','photo pipeline must never export a replacement JPEG');
      const file = '/tmp/reused-export.png';
      const image=files.get(options.canvas.source);
      files.set(file,{width:options.destWidth,height:options.destHeight,bytes:image?.bytes,sourcePath:options.canvas.source,drawArgs:options.canvas.drawArgs});
      options.success({ tempFilePath: file });
    },
    getFileInfo(options) { options.success({ size: 10000 }); },
    chooseImage(options) {
      assert.deepEqual(Array.from(options.sourceType), ['camera']); systemPhotos++;
      options.success({ tempFilePaths: ['/tmp/system-camera.png'] });
    },
    setClipboardData(options) { options.fail({ errMsg: 'setClipboardData:fail api scope is not declared in privacy agreement' }); },
    showModal(options) { assert.ok(options.content); },
    previewImage(options) { previews.push(options); },
    getFileSystemManager() { return {
      copyFile(options) { if(stalledCopy){exportCallback=options;return;} const dimensions=files.get(options.srcPath); files.set(options.destPath,dimensions); copies.push({...dimensions,...options}); options.success(); },
      unlink(options) { removed.push(options.filePath); files.delete(options.filePath); options.success?.(); },
    }; },
    navigateBack() {},
  };
  const wx = {
    env: { USER_DATA_PATH: '/sandbox' },
    createPage(page) { definition = page; },
    createComponent(component) { viewerDefinition = component; },
    getPrivacySetting() { assert.fail('privacy-setting failure must not block native media'); },
    requirePrivacyAuthorize() { assert.fail('native media owns consent'); },
    openPrivacyContract(options) { contractOpens++; options.success(); },
    chooseMedia(options) {
      assert.deepEqual(Array.from(options.sourceType), ['album']);
      if (mediaFailure) { options.fail({ errMsg: mediaFailure }); return; }
      lifecycle.onHide.forEach(callback => callback());
      options.success({ tempFiles: [{ tempFilePath: '/tmp/album.png' }] });
      // Real picker success can precede the page's onShow notification.
      pickerReturn = setTimeout(() => lifecycle.onShow.forEach(callback => callback()), 20);
    },
  };
  const vendor = { ...vue, index: uni, wx$1: wx, jsQR: qrData ? () => ({data:qrData}) : require('jsqr'),
    getCurrentInstance: () => ({ proxy: { $scope: {}, getOpenerEventChannel() { return { emit(name, rows) { delivered.push({name,rows}); } }; } } }),
    e: (...args) => Object.assign({}, ...args), t: String, o: handler => handler,
    n: value => value, s: value => value, p: value => value, f: (items, callback) => items.map(callback),
    _export_sfc: (component, props) => Object.assign(component, Object.fromEntries(props)),
  };
  for (const name of ['onLoad', 'onReady', 'onShow', 'onHide', 'onUnload', 'onResize', 'onMounted', 'onUnmounted']) vendor[name] = hooks(name);
  function load(file) {
    if (file === path.join(root, 'common/vendor.js')) return vendor;
    if (cache[file]) return cache[file].exports;
    const source = fs.readFileSync(file, 'utf8');
    for (const alias of source.matchAll(/\.((?:nextTick|reactive|ref|computed|shallowRef|watch)\$\d+)\b/g))
      vendor[alias[1]] = vue[alias[1].split('$')[0]];
    const module = { exports: {} }; cache[file] = module;
    vm.runInNewContext(source, { module, exports: module.exports, require: name => load(path.resolve(path.dirname(file), name)),
      wx, uni, console, setTimeout: fastTimeouts ? (fn,ms) => setTimeout(fn,ms >= 45000 ? 500 : ms >= 5000 ? 100 : ms) : setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
      Uint8ClampedArray, Uint8Array, Uint16Array, Uint32Array, Float32Array, Int32Array, Promise, Date: paper ? ScanDate : Date,
    }, { filename: file });
    if (paper && file.endsWith('/autoScan.js')) {
      const proto=module.exports.AutoScanGate.prototype, update=proto.update;
      proto.update=function(detection,time){const before=this.lastContent, after=detection?.contentFingerprint;
        const delta=before&&after?Math.max(...after.map((value,i)=>Math.abs(value-before[i]))):null;
        const result=update.call(this,detection,time);trace.push({time,delta,before:before?.length,after:after?.length,changed:this.changedSince,held:this.held,reason:result.reason});return result;};
    }
    return module.exports;
  }
  load(path.join(root, 'pages/scan/index.js'));
  const render = definition.setup({}, {});
  lifecycle.onLoad.forEach(callback => callback({ batch: 'paper', remaining: '60' }));
  lifecycle.onShow.forEach(callback => callback());
  lifecycle.onReady.forEach(callback => callback());
  return { render, lifecycle, get canvasQueries() { return canvasQueries; }, get requests() { return requests; },
    get contractOpens() { return contractOpens; }, get systemPhotos() { return systemPhotos; },
    get previews() { return previews; },
    get count() { return Number(render()[countKey]); },
    get frameStarts() { return frameStarts; }, get frameStops() { return frameStops; },
    emitFrame() { clock += 350; const image = pixels(384,512); frameCallback({ ...image, data: image.data.buffer }); },
    latePhoto() { photoCallback.success({tempImagePath:'/tmp/late-capture.jpg'}); },
    lateCopy() { exportCallback.success({}); },
    get lateCopyPath() {return exportCallback?.destPath;},
    get removed() { return removed; },
    get trace() { return trace; }, get copies() { return copies; }, get delivered() { return delivered; },
    setPage(value) { pageVariant = value; },
    mountViewer() {
      load(path.join(root, 'components/ScanImageViewer.js'));
      const render = viewerDefinition.setup({src:'/tmp/scan-test.jpg',urls:['/tmp/scan-test.jpg','/tmp/scan-next.jpg']}, {});
      lifecycle.onMounted.forEach(callback => callback());
      return render;
    },
    close() { clearTimeout(pickerReturn); lifecycle.onUnload.forEach(callback => callback()); lifecycle.onUnmounted?.forEach(callback => callback()); },
  };
}

(async () => {
  const until = async (condition, label) => {
    for (let i = 0; i < 1000; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve,10)); }
    assert.fail(label);
  };
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
  assert.match(JSON.stringify(denied.render()), /原照片|review/);
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
  assert.match(JSON.stringify(system.render()), /原照片|review/);
  system.close();

  const lighting=createPage();
  const lightTag=template.match(/<button\b[^>]*scan-flash-toggle[^>]+>/)[0];
  await lighting.render()[event(start,'bindtap')]();lighting.render()[event(camera,'bindinitdone')]();
  assert.equal(lighting.render()[event(camera,'flash')],'off');
  await lighting.render()[event(lightTag,'bindtap')]();assert.equal(lighting.render()[event(camera,'flash')],'torch');
  await lighting.render()[event(lightTag,'bindtap')]();assert.equal(lighting.render()[event(camera,'flash')],'off');
  await lighting.render()[event(lightTag,'bindtap')]();
  lighting.render()[event(camera,'binderror')]({detail:{errMsg:'camera:fail torch unavailable'}});
  assert.equal(lighting.render()[event(camera,'flash')],'off');assert.equal(lighting.render()[event(camera,'wx:if')],true,'unsupported flash does not terminate camera');
  lighting.close();

  // Actual compiled capture -> process -> result -> tap workflow. The iOS
  // camera keeps running after automatic capture, but controls must unlock.
  const successful = createPage({paper:true,qrData:'https://school.example/instructions'});
  await successful.render()[event(start,'bindtap')](); successful.render()[event(camera,'bindinitdone')]();
  for (let i=0;i<5;i++) { successful.emitFrame(); await new Promise(resolve=>setTimeout(resolve,5)); }
  await until(()=>successful.count===1&&!successful.render()[event(shutter,'disabled')],'automatic capture must restore enabled shutter').catch(error=>{console.error({count:successful.count,starts:successful.frameStarts,stops:successful.frameStops,state:successful.render()});throw error;});
  assert.equal(successful.render()[event(camera,'wx:if')],true,'successful automatic capture keeps native camera mounted');
  assert.equal(successful.render()[event(thumbnail,'disabled')],false,'completed photograph can be opened');
  assert.ok(successful.frameStops>=1&&successful.frameStarts>=2,'pause image callbacks while processing and resume afterwards');
  for(let i=0;i<8;i++){successful.emitFrame();await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal(successful.count,1,'native tracking drift must not duplicate the same paper');
  assert.doesNotMatch(template,/已换好下一页/,'automatic scanning cannot require a next-page confirmation');
  for (let variant=1;variant<=2;variant++) {
    successful.setPage(variant);
    for(let i=0;i<14;i++){successful.emitFrame();await new Promise(resolve=>setTimeout(resolve,5));}
    await until(()=>successful.count===variant+1&&!successful.render()[event(shutter,'disabled')],'changing sheets must capture the next page without touching controls').catch(error=>{console.error({variant,count:successful.count,trace:successful.trace.slice(-12),state:successful.render()});throw error;});
  }
  await successful.render()[event(thumbnail,'bindtap')]();
  assert.notEqual(successful.render()[event(camera,'wx:if')],true,'thumbnail tap enters review and releases camera');
  const continueTag=template.match(/<button\b[^>]+>继续拍照/)[0];
  assert.equal(successful.render()[event(continueTag,'disabled')],false);
  await successful.render()[event(continueTag,'bindtap')](); successful.render()[event(camera,'bindinitdone')]();
  await successful.render()[event(shutter,'bindtap')]();assert.equal(successful.count,4,'manual shutter still works after opening and returning from continuous scan');
  assert.doesNotMatch(template,/成片形状|确认并处理|<picker/,'crop does not restore arbitrary paper aspect ratios');
  const editTag=template.match(/<button\b[^>]+>调整裁剪/)[0],saveCropTag=template.match(/<button\b[^>]+>保存裁剪/)[0];
  await successful.render()[event(editTag,'bindtap')]();
  await successful.render()[event(saveCropTag,'bindtap')]();
  assert.equal(successful.count,4,'recropping replaces the current page');
  const completeTag=template.match(/<button\b[^>]+>完成 /)[0];
  await successful.render()[event(completeTag,'bindtap')]();
  const originals=successful.delivered[0].rows;
  assert.equal(originals.length,4);
  assert.equal(new Set(originals.map(row=>row.photo.url)).size,4,'reused native temp URI still produces independent originals');
  for(const [index,row] of originals.entries()){
    assert.equal(row.corrected,false);assert.equal(row.photo.original,false);assert.equal(row.photo.cropped,true);
    assert.ok(row.photo.width>2000&&row.photo.width<3024);assert.ok(row.photo.height>3000&&row.photo.height<4032,'crop retains source-resolution pixels beyond retired 2400px limit');
    assert.ok(row.photo.url.endsWith('.png'),'cropped file is lossless PNG');
    const crop=successful.copies.find(copy=>copy.destPath===row.photo.url);
    assert.equal(crop.bytes,'camera-original-'+(index+1),'crop always reads its original camera file');
    assert.deepEqual(Array.from(crop.drawArgs.slice(2,4)),Array.from(crop.drawArgs.slice(6,8)),'copy source/destination size is identical');
    assert.equal(row.code,'','shared generic QR is not treated as a student identity');
  }
  assert.equal(successful.copies.filter(copy=>copy.destPath.includes('/photo-original-')).length,4);
  assert.equal(successful.copies.filter(copy=>copy.destPath.includes('/photo-crop-')).length,5,'finish hands off existing crops without another copy');
  successful.close();

  const uncertain=createPage({paper:true,uncertainStill:true});
  await uncertain.render()[event(start,'bindtap')]();uncertain.render()[event(camera,'bindinitdone')]();
  for(let i=0;i<5;i++){uncertain.emitFrame();await new Promise(resolve=>setTimeout(resolve,5));}
  await until(()=>uncertain.count===1&&!uncertain.render()[event(shutter,'disabled')],'uncertain auto crop must preserve a page and continue');
  assert.equal(uncertain.render()[event(camera,'wx:if')],true);
  const finishTag=template.match(/<button\b[^>]*scan-finish[^>]+>/)[0];await uncertain.render()[event(finishTag,'bindtap')]();
  assert.equal(uncertain.delivered.length,0,'uncertain crop is reviewed at batch end, never guessed');
  const wholeTag=template.match(/<button\b[^>]+>此页保留整张/)[0];
  await uncertain.render()[event(wholeTag,'bindtap')]();await uncertain.render()[event(completeTag,'bindtap')]();
  assert.equal(uncertain.delivered[0].rows[0].corrected,false,'uncertain page is not mislabeled as automatically corrected');
  assert.equal(uncertain.delivered[0].rows[0].photo.original,true);
  assert.equal(uncertain.delivered[0].rows[0].code,'','uncertain full-frame photo must not assign a background student code');
  uncertain.close();

  const stopped = createPage({stalledPhoto:true});
  await stopped.render()[event(start,'bindtap')](); stopped.render()[event(camera,'bindinitdone')]();
  const waitingPhoto=stopped.render()[event(shutter,'bindtap')]();await vue.nextTick();
  const stopTag=template.match(/<button\b[^>]*scan-stop[^>]+>/)[0];
  await stopped.render()[event(stopTag,'bindtap')]();await waitingPhoto;
  assert.equal(stopped.render()[event(album,'disabled')],false,'stop must restore other controls without native callback');
  stopped.latePhoto();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(stopped.count,0,'stale native capture must not append a page');
  stopped.close();

  const timedOut=createPage({paper:true,stalledCopy:true,fastTimeouts:true});
  await timedOut.render()[event(start,'bindtap')](); timedOut.render()[event(camera,'bindinitdone')]();
  await timedOut.render()[event(shutter,'bindtap')]();
  assert.match(JSON.stringify(timedOut.render()),/超时/);
  assert.equal(timedOut.render()[event(album,'disabled')],false,'missing export callback must not lock the page forever');
  timedOut.lateCopy();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(timedOut.count,0);
  assert.ok(timedOut.removed.includes(timedOut.lateCopyPath));timedOut.close();

  // Run real compiled mini-program event bindings with native client coordinates.
  // Browser touch input does not establish that WXML catches the same gestures.
  assert.doesNotMatch(template, /<cover-view\b/, 'no floating native cover-view may block iOS controls after capture');
  assert.doesNotMatch(template, /scan-capture-flight|scan-capture-photo/);
  assert.match(template, />停止处理<\//, 'busy processing must retain an enabled stop action');
  const viewerTemplate = fs.readFileSync(path.join(root, 'components/ScanImageViewer.wxml'), 'utf8');
  const viewerTag = viewerTemplate.match(/<view\b[^>]+>/)[0], imageTag = viewerTemplate.match(/<image\b[^>]+>/)[0];
  const touchHost = createPage(), viewer = touchHost.mountViewer();
  await vue.nextTick();
  viewer()[event(imageTag,'bindload')]({detail:{width:600,height:900}});
  await vue.nextTick();
  viewer()[event(viewerTag,'catchtouchstart')]({touches:[{clientX:100,clientY:300},{clientX:200,clientY:300}]});
  viewer()[event(viewerTag,'catchtouchmove')]({touches:[{clientX:50,clientY:300},{clientX:250,clientY:300}]});
  assert.match(JSON.stringify(viewer()), /scale\(2\)/, 'two native touches enlarge the processed photo');
  viewer()[event(viewerTag,'catchtouchend')]({touches:[]});
  viewer()[event(viewerTag,'catchtap')]();
  assert.equal(touchHost.previews.length,0,'ending a pinch does not open another preview');
  await new Promise(resolve => setTimeout(resolve,420));
  viewer()[event(viewerTag,'catchtap')]();
  assert.equal(touchHost.previews.length,1);
  assert.equal(touchHost.previews[0].current,'/tmp/scan-test.jpg');
  assert.equal(touchHost.previews[0].urls.length,2);
  touchHost.close();
  console.log('WeChat compiled original-photo checks passed: native consent, picker lifecycle, continuous three-page auto capture without confirmation, uncertain full-frame retention, source-resolution lossless crops/recrop, no photo JPEG export, unique file handoff, torch toggle/unavailable recovery, thumbnail/review/continue/manual capture, frame pause/resume, stopped photo, export timeout/late cleanup, no blocking capture layer, native pinch and full-image preview.');
})().catch(error => { console.error(error); process.exitCode = 1; });
