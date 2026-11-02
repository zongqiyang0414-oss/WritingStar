import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDocument} from '../src/platform/documentScan.js';
import {AutoScanGate,contentDifference,fingerprintDifference} from '../src/platform/autoScan.js';
import {LivePaperDetector} from '../src/platform/paperScanCapture.js';

function sheet(variant=0, dx=0, exposure=1) {
 const width=300,height=400,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const xx=x-dx,inside=xx>40&&xx<260&&y>30&&y<370;
  const printed=inside&&xx>60&&xx<240&&y>70&&y<350&&y%40<1;
  const line=Math.floor((y-75)/40),stroke=xx>75&&xx<225&&y>75&&y<340
   &&Math.abs((y-75)%40-10-Math.sin(xx*.15+variant*1.5+line)*4)<1.3;
  const v=(inside?(printed||stroke?65:225):65)*exposure,i=(y*width+x)*4;
  data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
 }
 return {width,height,data};
}
test('同版作业少量字迹变化能自动换页，原粗采样未达到变化阈值',()=>{
 const first=analyzeDocument(sheet(0)),next=analyzeDocument(sheet(1));assert.ok(first&&next);
 assert.ok(fingerprintDifference(first.fingerprint,next.fingerprint)<.085);
 const difference=contentDifference(first.contentFingerprint,next.contentFingerprint);
 assert.ok(difference>.035,`fine content difference ${difference}`);
 const gate=new AutoScanGate();gate.captured(first);let captures=0;
 for(let t=0;t<=4000;t+=200){const state=gate.update(next,t);if(state.capture){captures++;gate.captured(next);}}
 assert.equal(captures,1,'replacement captured without a next-page button');
});
test('同页曝光、相机小幅平移和短暂遮挡不解除收片锁',()=>{
 const first=analyzeDocument(sheet(0));assert.ok(first);
 const moved=analyzeDocument(sheet(0,2,.82));assert.ok(moved);
 const difference=contentDifference(first.contentFingerprint,moved.contentFingerprint);
 assert.ok(difference<.018,`same sheet difference ${difference}`);
 const gate=new AutoScanGate();gate.captured(first);
 gate.update(null,0);gate.update(null,200);
 for(let t=400;t<=3000;t+=200)assert.equal(gate.update(moved,t).capture,false);
 assert.equal(gate.locked,true);
});
test('真实连续跟踪的亚像素收敛不重复收页，也不反复清零换页等待',()=>{
 const detector=new LivePaperDetector(),gate=new AutoScanGate();let time=0;
 const pass=(variant)=>{const d=detector.update(sheet(variant),time+=250);const state=gate.update(d,time);if(state.capture)gate.captured(d);return state.capture;};
 let captured=0;for(let i=0;i<30;i++)if(pass(0))captured++;assert.equal(captured,1);
 for(let i=0;i<30;i++)if(pass(1))captured++;assert.equal(captured,2);
});
test('已识别学生码的纸卡允许识别较小的版面变化，重复码由收片阶段拦截',()=>{
 const first={...analyzeDocument(sheet(0))},next={...first,
  fingerprint:first.fingerprint.map((v,i)=>v+(i%2?.01:-.01)),
  contentFingerprint:first.contentFingerprint.map((v,i)=>v+(i<96?.006:0))};
 const gate=new AutoScanGate();gate.captured(first);gate.setIdentity('WS1|student-page');let captured=false;
 for(let t=0;t<=2400;t+=200)captured ||= gate.update(next,t).capture;
 assert.equal(captured,true);
});
