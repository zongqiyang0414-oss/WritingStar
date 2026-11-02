const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../dist/build/mp-weixin');
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).workers,'workers');
let receive;const messages=[];
const worker={onMessage(fn){receive=fn;},postMessage(message){messages.push(structuredClone(message));}};
vm.runInNewContext(fs.readFileSync(path.join(root,'workers/scan.js'),'utf8'),{worker,console,setTimeout,clearTimeout,Uint8ClampedArray,Uint8Array,Uint16Array,Uint32Array,Float32Array,Int32Array,ArrayBuffer,Date,Promise});
(async()=>{
 await receive({type:'probe',id:1,buffer:new Uint8Array([17,93,201,255]).buffer});
 assert.deepEqual(Array.from(new Uint8Array(messages.pop().buffer)),[17,93,201,255]);
 const width=80,height=120,buffer=new Uint8ClampedArray(width*height*4).fill(210).buffer;
 await receive({type:'process',id:2,width,height,buffer,corners:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}],options:{readCode:false,aspectRatio:210/297}});
 const output=messages.at(-1);assert.equal(output.id,2);assert.ok(!output.error,output.error);assert.ok(Math.abs(output.width/output.height-210/297)<.01);
 assert.equal(output.buffer.byteLength,output.width*output.height*4);assert.ok(new Uint8ClampedArray(output.buffer)[0]>230);assert.ok(messages.some(m=>m.stage));
 // Also load the actual uni-app-compiled client and connect its wx.createWorker
 // to the isolated bundle. This catches compiler API aliases and wire formats.
 const module={exports:{}};let clientMessage,workerMessage,created=0,terminated=0;
 const bridge={onMessage(fn){clientMessage=fn;},postMessage(message){queueMicrotask(()=>workerMessage(structuredClone(message)));},terminate(){terminated++;}};
 const native={createWorker(file){assert.equal(file,'workers/scan.js');created++;return bridge;}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'workers/scan.js'),'utf8'),{worker:{onMessage(fn){workerMessage=fn;},postMessage(message){queueMicrotask(()=>clientMessage(structuredClone(message)));}},console,setTimeout,clearTimeout,Uint8ClampedArray,Uint8Array,Uint16Array,Uint32Array,Float32Array,Int32Array,ArrayBuffer,Date,Promise});
 vm.runInNewContext(fs.readFileSync(path.join(root,'platform/scanProcessor.js'),'utf8'),{module,exports:module.exports,require:name=>name.includes('vendor')?{wx$1:native}:{processScanPixels(){assert.fail('compiled client must use worker');}},setTimeout,clearTimeout,Uint8Array,Uint8ClampedArray,ArrayBuffer,Promise,Error});
 const processor=module.exports.createScanProcessor();
 for(let i=0;i<2;i++) {
  const source=new Uint8ClampedArray(width*height*4).fill(210);
  const result=await processor.process({width,height,data:source},null,{readCode:false});
  assert.equal(result.image.width,width);assert.ok(result.image.data[0]>230);assert.equal(source[0],210);
 }
 assert.equal(created,1);processor.dispose();assert.equal(terminated,1);
 console.log('Compiled WeChat worker: binary probe, isolated pixel pipeline, A4 ratio and stage messages passed.');
 console.log('Compiled client: native worker path, binary round trip, source preservation, reuse and disposal passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
