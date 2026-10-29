import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/platform/documentScan.js';
import {LivePaperDetector, selectCaptureDetection} from '../src/platform/paperScanCapture.js';
import {AutoScanGate} from '../src/platform/autoScan.js';
const quad=[{x:.2,y:.12},{x:.8,y:.12},{x:.8,y:.88},{x:.2,y:.88}];
function frame(corners=quad) {
 const width=300,height=400,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const px=x/(width-1),py=y/(height-1);
  const inside=corners.every((a,i)=>{const b=corners[(i+1)%4];return (b.x-a.x)*(py-a.y)-(b.y-a.y)*(px-a.x)>=0;});
  const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=inside?235:60;data[i+3]=255;
 }
 return {width,height,data};
}
test('已找到纸张后跟踪四条真实边缘，移开纸张立即失效而不沿用旧框',()=>{
 const detector=new LivePaperDetector(),image=frame();
 const first=detector.update(image,0);assert.ok(first);
 const next=detector.update(image,200);assert.ok(next);
 next.corners.forEach((p,i)=>assert.ok(Math.hypot(p.x-quad[i].x,p.y-quad[i].y)<.012));
 const empty={...image,data:new Uint8ClampedArray(image.data.length).fill(100)};
 assert.equal(detector.update(empty,400),null);
 assert.equal(analyzeDocument(empty,{previousCorners:first.corners,trackingOnly:true}),null);
 detector.reset();assert.ok(detector.update(image,600));
});
test('跟踪失败后全图重找移动纸张，不将旧框漂移到新位置',()=>{
 const detector=new LivePaperDetector();assert.ok(detector.update(frame(),0));
 const moved=quad.map(p=>({x:p.x+.1,y:p.y}));const detection=detector.update(frame(moved),600);
 assert.ok(detection);detection.corners.forEach((p,i)=>assert.ok(Math.hypot(p.x-moved[i].x,p.y-moved[i].y)<.015));
});
test('同一视频视野直接使用已确认边角，相册与原生不同视野仍独立检测',()=>{
 const preview={corners:quad,confidence:.95,fingerprint:[]};let calls=0;
 const detect=()=>{calls++;return {...preview,corners:quad.map(p=>({x:p.x*.7,y:p.y*.7}))};};
 assert.equal(selectCaptureDetection(frame(),preview,true,detect),preview);assert.equal(calls,0);
 assert.equal(selectCaptureDetection(frame(),null,false,detect).confidence,.95);assert.equal(calls,1);
 assert.equal(selectCaptureDetection(frame(),preview,false,detect).autoEligible,false);assert.equal(calls,2);
 selectCaptureDetection(frame(),{...preview,confidence:.3},true,detect);assert.equal(calls,3);
});
test('稳定拍摄返回多帧中位数边角，单帧角点偏移不改变最终裁剪',()=>{
 const gate=new AutoScanGate();let state;
 for(let time=0;time<=1200;time+=200){
  const jitter=quad.map(p=>({...p}));if(time===1200)jitter[0].x+=.025;
  state=gate.update({corners:jitter,confidence:.95,fingerprint:[]},time);
 }
 assert.equal(state.capture,true);assert.deepEqual(state.corners,quad);
});
