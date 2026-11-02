import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanProcessor } from '../src/platform/scanProcessor.js';

const image=()=>({width:2,height:2,data:new Uint8ClampedArray(16).fill(255)});
function fixture({binary=true, fail=false, delayed=false}={}) {
  let callback, error, stopped=0, tasks=0, latest;
  const worker={
    onMessage(fn){callback=fn;},onError(fn){error=fn;},terminate(){stopped++;},
    postMessage(message){
      latest=message;
      if(message.type==='probe') queueMicrotask(()=>callback({id:message.id,buffer:binary?message.buffer:{}}));
      else {tasks++;if(fail)queueMicrotask(()=>error({}));else if(!delayed)queueMicrotask(()=>callback({...message,code:'WS1|test'}));}
    },
  };
  return {worker,get stopped(){return stopped;},get tasks(){return tasks;},finish(){callback({...latest,code:'late'});}};
}
test('后台线程通过二进制探测后复用，传回真实像素及学生码',async()=>{
  const f=fixture();let created=0;
  const processor=createScanProcessor({workerFactory:()=>{created++;return f.worker;},fallback:()=>assert.fail('worker must handle pixels')});
  for(let i=0;i<2;i++) {const result=await processor.process(image(),null);assert.equal(result.code,'WS1|test');assert.deepEqual(result.image.data,image().data);}
  assert.equal(created,1);assert.equal(f.tasks,2);processor.dispose();assert.equal(f.stopped,1);
});
test('旧版JSON消息、创建失败、启动无响应和运行崩溃自动回退原图',async()=>{
  for(const mode of ['json','create','timeout','crash']) {
    const f=fixture({binary:mode!=='json',fail:mode==='crash'});let fallbacks=0;
    const processor=createScanProcessor({startupTimeout:10,workerFactory:()=>{if(mode==='create')throw Error('unsupported');if(mode==='timeout')return {onMessage(){},postMessage(){},terminate(){}};return f.worker;},
      fallback:async source=>{fallbacks++;return {image:source,code:''};}});
    const source=image(),result=await processor.process(source,null);assert.equal(result.image,source);assert.equal(fallbacks,1);processor.dispose();
  }
});
test('离页取消会终止计算，忽略迟到结果且不误启主线程回退',async()=>{
  const f=fixture({delayed:true});const processor=createScanProcessor({workerFactory:()=>f.worker,fallback:()=>assert.fail('cancel must not retry')});
  const pending=processor.process(image(),null);await new Promise(resolve=>setTimeout(resolve,0));
  processor.cancel();await assert.rejects(pending,/暂停/);f.finish();assert.equal(f.stopped,1);processor.dispose();
});
