import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectifyDocument} from '../src/platform/documentScan.js';
import {projectiveMap} from '../src/platform/scanGeometry.js';
import {qrMatrix} from '../src/platform/answerCards.js';
import {readPaperScanCode} from '../src/platform/scanCode.js';
import {processScanPixels} from '../src/platform/scanProcessing.js';
import {downsampleScanImage} from '../src/platform/scanPixels.js';
function blank(width=900,height=1250){return {width,height,data:new Uint8ClampedArray(width*height*4).fill(255)};}
function drawCode(image,code,left,top,unit=4,inverted=false){
 const matrix=qrMatrix(code),size=(matrix.length+8)*unit;
 if(inverted)for(let y=top;y<top+size;y++)for(let x=left;x<left+size;x++){const i=(y*image.width+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=0;}
 for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x])for(let yy=0;yy<unit;yy++)for(let xx=0;xx<unit;xx++){
  const i=(((y+4)*unit+yy+top)*image.width+(x+4)*unit+xx+left)*4;
  image.data[i]=image.data[i+1]=image.data[i+2]=inverted?255:0;
 }
}
test('优化透视采样保持双线性像素值、四角与输出方向',async()=>{
 const image=blank(90,120);
 for(let y=0;y<120;y++)for(let x=0;x<90;x++){const i=(y*90+x)*4;image.data[i]=x*2;image.data[i+1]=y*2;image.data[i+2]=x+y;}
 const q=[{x:.12,y:.09},{x:.85,y:.15},{x:.92,y:.9},{x:.08,y:.85}];
 const out=await rectifyDocument(image,q),project=projectiveMap(q.map(p=>({x:p.x*89,y:p.y*119})));
 for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){
  const p=project(x/(out.width-1),y/(out.height-1)),i=(y*out.width+x)*4;
  assert.ok(Math.abs(out.data[i]-p.x*2)<=.501);assert.ok(Math.abs(out.data[i+1]-p.y*2)<=.501);
  assert.ok(Math.abs(out.data[i+2]-p.x-p.y)<=.501);assert.equal(out.data[i+3],255);
 }
 assert.ok(out.height>out.width);
});
test('专属码位置快速识别，任意位置与反色二维码仍可全图回退',()=>{
 for(const [left,top,inverted] of [[690,80,false],[50,820,false],[50,820,true]] as const){
  const image=blank(),code='WS1|position-check|1|2|TEST';drawCode(image,code,left,top,4,inverted);
  assert.equal(readPaperScanCode(image),code);
 }
});
test('裁剪后只读取所选纸张的码，不读取背景另一张纸的码',async()=>{
 const image=blank(900,1100),inside='WS1|selected-page|1|2|TEST';
 drawCode(image,inside,340,110,4);drawCode(image,'WS1|background-page|1|2|OTHER',650,600,4);
 const q=[{x:50/899,y:50/1099},{x:550/899,y:50/1099},{x:550/899,y:950/1099},{x:50/899,y:950/1099}];
 const result=await processScanPixels(image,q);assert.equal(result.code,inside);
});
test('普通文档可跳过学生码处理，取消后不返回迟到结果',async()=>{
 const image=blank(400,600);drawCode(image,'WS1|skip-code|1|2|TEST',100,100);
 const stages=[];const result=await processScanPixels(image,null,{readCode:false,onStage:text=>stages.push(text)});
 assert.equal(result.code,'');assert.ok(!stages.some(text=>text.includes('学生码')));
 let cancelled=false;await assert.rejects(processScanPixels(blank(),null,{readCode:false,cancelled:()=>cancelled,onStage:text=>{if(text.includes('提亮'))cancelled=true;}}),/暂停/);
});
test('打包像素缩图保留通道及透明度，不改变原图',()=>{
 const data=Uint8ClampedArray.from({length:8*8*4},(_,i)=>i%256),original=data.slice();
 const out=downsampleScanImage({data,width:8,height:8},4);
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)for(let c=0;c<4;c++)assert.equal(out.data[(y*4+x)*4+c],data[((y*2)*8+x*2)*4+c]);
 assert.deepEqual(data,original);
});
