// Exercise the actual compiled PDF page with real PDF.js and Canvas2D pixels.
// Hardware APIs are simulated; no user documents or external requests are used.
import fs from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as vue from 'vue';
import {writePdfScanFixture} from './pdf-verification-fixture.mts';
import {ReadableStream} from 'web-streams-polyfill';
import {processScanPixels} from '../src/platform/scanProcessing.js';
import {decodePaperCode,paperId} from '../src/services/paperWorkflow.js';
const require=createRequire(import.meta.url),{createCanvas,ImageData}=require('@napi-rs/canvas'),root=path.resolve(process.env.WRITINGSTAR_WEIXIN_ROOT || 'dist/build/mp-weixin');
const pdfFixture='/tmp/writingstar-verify-native-pdf.pdf';
await writePdfScanFixture(pdfFixture);
async function check({remaining=60,cancelAt='',invalid=false}={}){
 let definition,render,serial=0;const hooks:any={},events:any={},messages:any=[],files=new Map(),removed=[],packages=[];
 const data=invalid?Buffer.from('invalid-pdf'):fs.readFileSync(pdfFixture);files.set('/input.pdf',data);
 const channel={on:(name,callback)=>events[name]=callback,emit:(name,value)=>messages.push({name,value})};
 const unload=()=>hooks.onUnload?.forEach(callback=>callback());
 const uni:any={
  navigateBack:unload,
  createSelectorQuery(){const query={in(){return query;},select(){return query;},fields(){return query;},exec(callback){callback([{node:createCanvas(1,1)}]);}};return query;},
  getFileSystemManager(){return {readCompressedFile(options){assert.equal(options.compressionAlgorithm,'br');try{const data=brotliDecompressSync(fs.readFileSync(path.join(root,options.filePath)));options.success({data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});}catch(error){options.fail(error);}},readFile(options){try{const buffer=files.get(options.filePath)||fs.readFileSync(path.join(root,options.filePath));options.success({data:buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)});}catch(error){options.fail(error);}},unlink(options){removed.push(options.filePath);files.delete(options.filePath);options.success?.();}};},
  canvasToTempFilePath(options){assert.equal(options.fileType,'png');const name=`/temp/pdf-${++serial}.png`;files.set(name,options.canvas.toBuffer('image/png'));if(cancelAt==='export')unload();options.success({tempFilePath:name});},
  saveFile(options){const target=`/saved/pdf-${++serial}.png`;files.set(target,files.get(options.tempFilePath));files.delete(options.tempFilePath);if(cancelAt==='save')unload();options.success({savedFilePath:target});},
 };
 const wx:any={loadSubpackage(options){packages.push(options.name);options.success({});},createOffscreenCanvas:({width,height})=>createCanvas(width,height),createPage:component=>definition=component};
 const vendor:any={...vue,index:uni,wx$1:wx,ReadableStream,getCurrentInstance:()=>({proxy:{getOpenerEventChannel:()=>channel}}),_export_sfc:component=>component,t:v=>v,o:callback=>callback};
 for(const name of['onLoad','onReady','onUnload'])vendor[name]=callback=>(hooks[name]||=[]).push(callback);
 const sandbox:any={console,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,performance,wx,uni,ImageData,Map,Set,WeakMap,WeakSet,ArrayBuffer,Uint8Array,Uint8ClampedArray,Int8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array};
 const context=vm.createContext(sandbox),cache=new Map();
 function load(file){
  if(!fs.existsSync(file)&&fs.existsSync(file+'.js'))file+='.js';
  if(file===path.join(root,'common/vendor.js'))return vendor;
  if(file===path.join(root,'platform/scanProcessor.js'))return {createScanProcessor:()=>({process:processScanPixels,dispose(){}})};
  if(file===path.join(root,'services/paperWorkflow.js'))return {decodePaperCode,paperId};
  if(cache.has(file))return cache.get(file).exports;
  const source=fs.readFileSync(file,'utf8');for(const alias of source.matchAll(/\.((?:nextTick|ref|computed|watch)\$\d+)\b/g))vendor[alias[1]]=vue[alias[1].split('$')[0]];
  const module={exports:{}};cache.set(file,module);const wrapper=vm.runInContext(`(function(module,exports,require){${source}\n})`,context,{filename:file});wrapper(module,module.exports,name=>load(path.resolve(path.dirname(file),name)));return module.exports;
 }
 load(path.join(root,'pdf-import/index.js'));render=definition.setup({});hooks.onLoad.forEach(callback=>callback());hooks.onReady.forEach(callback=>callback());
 await events.document({file:{path:'/input.pdf',name:'两名学生的作文.pdf',size:data.length},remaining});
 const result=messages.find(message=>message.name==='rendered');
 if(cancelAt){assert.equal(result,undefined);assert.equal([...files.keys()].filter(k=>/^\/(temp|saved)\//.test(k)).length,0,'cancelled late native export/save must not leak files');}
 else if(invalid){assert.match(render().a,/PDF文件损坏|无法识别/);assert.equal(result,undefined);unload();}
 else if(remaining<4){assert.match(render().a,/本批只剩3页/);assert.equal(result,undefined);unload();}
 else {
  assert.equal(result.value.length,4);assert.deepEqual(Array.from(result.value,row=>row.photo.pdf.page),[1,2,3,4]);
  assert.equal(new Set(result.value.map(row=>decodePaperCode(row.code).cardId)).size,2,'native PDF pages must identify both students');
  assert.ok(result.value.every(row=>row.photo.width>3300&&files.has(row.photo.url)),'delivered PNGs survive page unload');
 }
 assert.deepEqual(packages,['pdf-fonts','pdf-cmaps']);return {remaining,cancelAt,invalid,pages:result?.value.length||0};
}
const results=[];for(const options of[{}, {remaining:3}, {invalid:true}, {cancelAt:'export'}, {cancelAt:'save'}])results.push(await check(options));
console.log('Compiled WeChat PDF page passed:',JSON.stringify(results));
