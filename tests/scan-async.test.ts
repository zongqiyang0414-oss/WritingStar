import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scanCallback, createScanJobs } from '../src/platform/scanAsync.js';
import { startNativeFrames } from '../src/platform/scanner.js';

test('原生接口不回调时超时退出，迟到临时文件被回收，重复成功回调不删有效文件', async () => {
  let success, cleaned=[];
  const pending=scanCallback(resolve=>{success=resolve;},{timeout:8,onLateValue:value=>cleaned.push(value)});
  await assert.rejects(pending,error=>error.code==='SCAN_TIMEOUT');success('/tmp/late.jpg');assert.deepEqual(cleaned,['/tmp/late.jpg']);
  const normal=scanCallback(resolve=>{success=resolve;},{onLateValue:value=>cleaned.push(value)});
  success('/tmp/valid.jpg');assert.equal(await normal,'/tmp/valid.jpg');success('/tmp/valid.jpg');assert.equal(cleaned.length,1);
});
test('停止处理立即结束界面等待，旧任务迟到不能释放新任务，超时能再次重试', async () => {
  const jobs=createScanJobs();let finishOld,finishNew,interrupts=0;
  const old=jobs.run(()=>new Promise(resolve=>{finishOld=resolve;}),{onInterrupt:()=>interrupts++});
  await Promise.resolve();assert.equal(jobs.cancel(),true);await assert.rejects(old,/已停止/);
  const next=jobs.run(()=>new Promise(resolve=>{finishNew=resolve;}));await Promise.resolve();finishOld('late');await Promise.resolve();
  await assert.rejects(jobs.run(async()=>''),/等待当前/);finishNew('new');assert.equal(await next,'new');assert.equal(interrupts,1);
  await assert.rejects(jobs.run(()=>new Promise(()=>{}),{timeout:8,onInterrupt:()=>interrupts++}),/超时.*恢复操作/);
  assert.equal(await jobs.run(async()=>42),42);assert.equal(interrupts,2);
});
test('相机高频帧不会堆积在检测后，停止监听后不再派发帧', async () => {
  let emit,finish,seen=0;
  const stop=startNativeFrames({onCameraFrame(fn){emit=fn;return {start(){},stop(){}};}},()=>{seen++;return new Promise(resolve=>{finish=resolve;});},()=>assert.fail('unexpected frame error'));
  for(let i=0;i<100;i++)emit({});assert.equal(seen,1);
  finish();await new Promise(resolve=>setTimeout(resolve,0));emit({});assert.equal(seen,1,'input window after detector completion');
  await new Promise(resolve=>setTimeout(resolve,185));emit({});assert.equal(seen,2);
  stop();finish();emit({});assert.equal(seen,2);
});

async function nativeModule() {
  let source=fs.readFileSync(new URL('../src/platform/scanner.js',import.meta.url),'utf8');
  source=source.replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g,'');
  source=source.replace(/from "(\.\/[^\"]+)"/g,(_,name)=>`from "${new URL('../src/platform/'+name,import.meta.url).href}"`);
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('取消读图不再写回共用画布；取消JPEG导出会移除迟到文件并保留已扫描文件', async () => {
  const beforeUni=globalThis.uni;let image,exportOptions,writes=0;const removed=[];
  const canvas={width:80,height:120,createImage(){image={width:80,height:120};return image;},getContext(){return {
    drawImage(){writes++;},getImageData(){return {width:80,height:120,data:new Uint8ClampedArray(80*120*4)};},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){writes++;},
  };}};
  globalThis.uni={createSelectorQuery(){const query={in(){return query;},select(){return query;},fields(){return query;},exec(resolve){resolve([{node:canvas},{node:canvas}]);}};return query;},
    canvasToTempFilePath(options){exportOptions=options;},getFileSystemManager(){return {unlink(options){removed.push(options.filePath);}};}};
  try {
    const {createScanRenderer}=await nativeModule(),renderer=await createScanRenderer({});renderer.track('/tmp/already-scanned.jpg');
    const read=renderer.read('/tmp/new.jpg');renderer.cancelPending();image.onload();await assert.rejects(read,/暂停/);assert.equal(writes,0);
    const pending=renderer.exportImage({width:80,height:120,data:new Uint8ClampedArray(80*120*4)});
    renderer.cancelPending();exportOptions.success({tempFilePath:'/tmp/late.jpg'});await assert.rejects(pending,/暂停/);
    assert.deepEqual(removed,['/tmp/late.jpg']);renderer.dispose();assert.ok(removed.includes('/tmp/already-scanned.jpg'));
  } finally {globalThis.uni=beforeUni;}
});
