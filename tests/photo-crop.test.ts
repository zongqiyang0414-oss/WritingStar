import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {photoCropBounds,photoCropQuad} from '../src/platform/photoCrop.js';
import {applyCameraTorch} from '../src/platform/cameraFlash.js';

const quad=[{x:.1,y:.2},{x:.8,y:.15},{x:.9,y:.85},{x:.15,y:.9}];
test('裁剪覆盖四角且使用原照片整数像素，不改变纸张比例或缩小到旧上限',()=>{
 const before=structuredClone(quad);
 assert.deepEqual(photoCropBounds(quad,4000,3000),{left:400,top:450,width:3200,height:2250});
 assert.deepEqual(photoCropQuad(quad),[{x:.1,y:.15},{x:.9,y:.15},{x:.9,y:.9},{x:.1,y:.9}]);
 assert.deepEqual(quad,before);
 assert.throws(()=>photoCropBounds([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}],4000,3000),/框住/);
 assert.throws(()=>photoCropBounds(quad,0,3000),/框住/);
});
test('网页补光查询能力后切换硬件，失败不伪报成功，不支持时不发送无效约束',async()=>{
 const calls=[];let torch=false;
 const track={readyState:'live',getCapabilities:()=>({torch:true}),getSettings:()=>({torch}),async applyConstraints(value){calls.push(value);torch=value.advanced[0].torch;}};
 await applyCameraTorch(track,true);await applyCameraTorch(track,false);
 assert.deepEqual(calls,[{advanced:[{torch:true}]},{advanced:[{torch:false}]}]);
 await assert.rejects(applyCameraTorch({...track,getCapabilities:()=>({}),applyConstraints:()=>assert.fail('unsupported')},true),error=>error.code==='TORCH_UNSUPPORTED');
 await assert.rejects(applyCameraTorch({...track,applyConstraints:async()=>{throw Error('hardware failure');}},true),/hardware failure/);
 await assert.rejects(applyCameraTorch({...track,applyConstraints:async()=>{}},true),/未能切换/);
 await assert.rejects(applyCameraTorch({...track,readyState:'ended'},true),/相机已关闭/);
});

async function nativeModule(){
 let source=fs.readFileSync(new URL('../src/platform/scanner.js',import.meta.url),'utf8');
 source=source.replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g,'').replace(/from "(\.\/[^\"]+)"/g,(_,name)=>`from "${new URL('../src/platform/'+name,import.meta.url).href}"`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('微信裁剪直接读取完整照片，只做同尺寸区域拷贝并导出PNG，重复导出路径不覆盖旧成片',async()=>{
 const previousUni=globalThis.uni,previousWx=globalThis.wx,draws=[],encodes=[],removed=[],transforms=[];
 const canvas={width:1,height:1,createImage(){const img={width:4000,height:3000};Object.defineProperty(img,'src',{set(){queueMicrotask(()=>img.onload());}});return img;},requestAnimationFrame(fn){queueMicrotask(fn);},
  getContext(){return {translate(...args){transforms.push(["translate",...args]);},rotate(...args){transforms.push(["rotate",...args]);},drawImage(...args){draws.push(args.slice(1));},getImageData(){assert.fail('native crop does not read full RGBA through JS');},putImageData(){assert.fail('no enhanced replacement pixels');}};}};
 globalThis.wx={env:{USER_DATA_PATH:'/saved'}};
 globalThis.uni={createSelectorQuery(){const q={in(){return q;},select(){return q;},fields(){return q;},exec(resolve){resolve([{node:canvas},{node:{...canvas}}]);}};return q;},
  canvasToTempFilePath(options){encodes.push(options);options.success({tempFilePath:'/tmp/reused.png'});},getFileSystemManager(){return {copyFile(options){options.success({});},unlink(options){removed.push(options.filePath);options.success?.();}};}};
 try{
  const native=await nativeModule(),renderer=await native.createScanRenderer({});renderer.track('/tmp/original.png');
  const first=await renderer.cropOriginal('/tmp/original.png',quad);
  assert.deepEqual(draws[0],[400,450,3200,2250,0,0,3200,2250]);
  assert.equal(encodes[0].fileType,'png');assert.equal(encodes[0].destWidth,3200);assert.equal(encodes[0].destHeight,2250);
  const second=await renderer.cropOriginal('/tmp/original.png',[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}]);
  assert.notEqual(first.url,second.url);assert.ok(first.url.endsWith('.png'));
  assert.ok(!removed.includes('/tmp/original.png')&&!removed.includes(first.url));
  const rotated=await renderer.cropOriginal('/tmp/original.png',quad,1);
  assert.equal(rotated.width,2250);assert.equal(rotated.height,3200);
  assert.deepEqual(rotated.bounds,{left:400,top:450,width:3200,height:2250});
  assert.deepEqual(transforms,[["translate",2250,0],["rotate",Math.PI/2]]);
  assert.equal(encodes[2].fileType,'png');assert.equal(encodes[2].destWidth,2250);assert.equal(encodes[2].destHeight,3200);
  const saved=await native.persistScanPages(renderer,[{id:'one',url:second.url,cropped:true}]);assert.equal(saved[0].url,second.url);
  renderer.dispose();assert.ok(removed.includes(first.url)&&!removed.includes(second.url));
 }finally{globalThis.uni=previousUni;globalThis.wx=previousWx;}
});

test('网页原生静态照片不复用视频框，只有同视野视频帧快照允许复用坐标',async()=>{
 const previous={document:globalThis.document,window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),ImageCapture:globalThis.ImageCapture,FileReader:globalThis.FileReader};
 const track={stop(){}},stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 globalThis.window={isSecureContext:true};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>stream}}});
 globalThis.document={createElement(tag){return tag==='video'?{videoWidth:960,videoHeight:720,readyState:4,setAttribute(){},style:{},async play(){},remove(){}}:{getContext:()=>({drawImage(){},getImageData(){return {width:1,height:1,data:new Uint8ClampedArray(4)};}}),toDataURL:()=> 'data:image/png;base64,FRAME'};}};
 globalThis.ImageCapture=class{async takePhoto(){return {};}};
 globalThis.FileReader=class{result='data:image/jpeg;base64,STILL';readAsDataURL(){queueMicrotask(()=>this.onload());}};
 let camera;
 try{
  let source=fs.readFileSync(new URL('../src/platform/scanner.js',import.meta.url),'utf8');
  source=source.replace(/\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/g,'').replace(/from "(\.\/[^\"]+)"/g,(_,name)=>`from "${new URL('../src/platform/'+name,import.meta.url).href}"`);
  const {openBrowserCamera}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  camera=await openBrowserCamera({appendChild(){}},()=>{});
  assert.match(await camera.capture(),/STILL/);assert.equal(camera.matchesFrame(480,360),false,'same aspect alone does not prove still-photo field of view');
  globalThis.ImageCapture=undefined;assert.match(await camera.capture(),/FRAME/);assert.equal(camera.matchesFrame(480,360),true);
 }finally{
  camera?.close();globalThis.document=previous.document;globalThis.window=previous.window;globalThis.ImageCapture=previous.ImageCapture;globalThis.FileReader=previous.FileReader;
  if(previous.navigator)Object.defineProperty(globalThis,'navigator',previous.navigator);else delete globalThis.navigator;
 }
});
