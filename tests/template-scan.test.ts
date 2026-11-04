import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAPER_TEMPLATES, PAPER_TEMPLATE_SIZE } from '../src/platform/paperTemplates.js';
import { detectTemplateDocument } from '../src/platform/templateScan.js';
import { analyzePaperCapture, LivePaperDetector } from '../src/platform/paperScanCapture.js';
import { projectiveMap } from '../src/platform/scanGeometry.js';
import { rotateImagePixels } from '../src/platform/imageOrientation.js';
import { AutoScanGate } from '../src/platform/autoScan.js';
import { qrMatrix, cardQrRegions } from '../src/platform/answerCards.js';
import { encodePaperCode } from '../src/services/paperWorkflow.js';

const pageQuad=[{x:.09,y:.10},{x:.91,y:.15},{x:.88,y:.91},{x:.08,y:.87}];
function fixture(page=0, omitted: number[]=[], quad=pageQuad, withCode: boolean | 'top'=false) {
  const width=640,height=480,data=new Uint8ClampedArray(width*height*4).fill(255);
  const map=projectiveMap(quad), {width:w,height:h}=PAPER_TEMPLATE_SIZE;
  const paint=(points: {x:number;y:number}[],value: number)=>{
    const xs=points.map(p=>p.x*width),ys=points.map(p=>p.y*height);
    for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<=Math.min(height-1,Math.ceil(Math.max(...ys)));y++)
      for(let x=Math.max(0,Math.floor(Math.min(...xs)));x<=Math.min(width-1,Math.ceil(Math.max(...xs)));x++) {
        const p={x:x/width,y:y/height};
        if(points.every((a,i)=>{const b=points[(i+1)%4];return(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)>=0;})){
          const n=(y*width+x)*4;data[n]=data[n+1]=data[n+2]=value;
        }
      }
  };
  // A pale desktop deliberately offers little physical paper-edge contrast.
  for(let p=0;p<width*height;p++){data[p*4]=data[p*4+1]=data[p*4+2]=232;}
  paint(quad,245);
  PAPER_TEMPLATES[page].marks.forEach((m,i)=>{
    if(omitted.includes(i))return;
    paint([map(m.x/w,m.y/h),map((m.x+m.width)/w,m.y/h),map((m.x+m.width)/w,(m.y+m.height)/h),map(m.x/w,(m.y+m.height)/h)],25);
  });
  if(withCode){
    const matrix=qrMatrix(encodePaperCode({id:'marker-qr-fixture'},page+1,2));
    const boxes = withCode === 'top' ? cardQrRegions(page + 1) : [{x:page===0?168:924,y:190,width:122,height:122}];
    for(const box of boxes) {
      const unit=box.width/(matrix.length+8);
      for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x]){
        const a=box.x+(x+4)*unit,b=box.y+(y+4)*unit;
        paint([map(a/w,b/h),map((a+unit)/w,b/h),map((a+unit)/w,(b+unit)/h),map(a/w,(b+unit)/h)],25);
      }
    }
  }
  return {width,height,data};
}

test('方圆格正反面用完整九／六点布局定位，按已知内缩坐标还原整页边界',()=>{
  for(const page of [0,1]){
    const image=fixture(page),found=detectTemplateDocument(image)!;
    assert.equal(found?.templateId,PAPER_TEMPLATES[page].id);
    assert.equal(found.markerCount,PAPER_TEMPLATES[page].marks.length);
    found.corners.forEach((p,i)=>assert.ok(Math.hypot(p.x-pageQuad[i].x,p.y-pageQuad[i].y)<.015));
    assert.equal(found.quarterTurns,0);
    assert.equal(found.fingerprint.length,192);assert.equal(found.contentFingerprint.length,768);
    assert.equal(analyzePaperCapture(image)?.method,'template');
    const live=new LivePaperDetector();assert.equal(live.update(image,0)?.method,'template');assert.equal(live.update(image,200)?.method,'template');
  }
});

test('旧中央码和新顶部三码不能挤掉反面仅有两点的定位行，四种方向均可匹配',async()=>{
  for(const layout of [true,'top'] as const)for(const page of [0,1])for(const turns of [0,1,2,3]){
    const found=detectTemplateDocument(await rotateImagePixels(fixture(page,[],pageQuad,layout),turns));
    assert.equal(found?.templateId,PAPER_TEMPLATES[page].id);assert.equal(found?.quarterTurns,(4-turns)%4);
  }
});

test('横竖与倒置均识别同一模板，方向正确，缺点／单栏／画面截断不能当成完整模板',async()=>{
  for(const page of [0,1])for(const turns of [0,1,2,3]){
    const found=detectTemplateDocument(await rotateImagePixels(fixture(page),turns));
    assert.equal(found?.templateId,PAPER_TEMPLATES[page].id,`page ${page} rotation ${turns}`);
    assert.equal(found.quarterTurns,(4-turns)%4);
  }
  assert.equal(detectTemplateDocument(fixture(0,[4])),null);
  assert.equal(detectTemplateDocument(fixture(1,[2,3,5])),null);
  assert.equal(detectTemplateDocument(fixture(1,[],[{x:.09,y:.1},{x:1.28,y:.1},{x:1.28,y:.9},{x:.09,y:.9}])),null);
  const unrelated=fixture(0,[0,1,2,3,4,5,6,7,8]);assert.equal(detectTemplateDocument(unrelated),null);
  const original=fixture(), mirrored={...original,data:original.data.slice()};
  for(let y=0;y<original.height;y++)for(let x=0;x<original.width;x++)mirrored.data.set(original.data.subarray((y*original.width+x)*4,(y*original.width+x+1)*4),(y*original.width+original.width-1-x)*4);
  assert.equal(detectTemplateDocument(mirrored),null,'mirror does not establish writing direction');
});

test('完整模板八百毫秒稳定后触发，同页保留锁定，普通文档仍需原有等待',()=>{
  const page=detectTemplateDocument(fixture())!,gate=new AutoScanGate();
  for(const t of [0,200,400,600])assert.equal(gate.update(page,t).capture,false);
  assert.equal(gate.update(page,800).capture,true);
  gate.captured(page);
  for(let t=1000;t<4000;t+=200)assert.equal(gate.update(page,t).capture,false);
  const generic=new AutoScanGate(),ordinary={...page,method:undefined,markerCount:undefined};
  for(const t of [0,200,400,600,800,1000])assert.equal(generic.update(ordinary,t).capture,false);
  assert.equal(generic.update(ordinary,1200).capture,true);
});
