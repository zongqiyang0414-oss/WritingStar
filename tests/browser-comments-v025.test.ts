import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {reviewIssue,validateReview,emptyReview} from '../src/services/rubric.js';
import {sampleReview} from '../src/services/seed.js';
import {scanPageSwipe} from '../src/platform/scanImageViewport.js';
import {pdfPageSize,validateScanFiles,scanFileKind} from '../src/platform/pdfImport.js';
import {PdfMatrix,clonePdfMessage,PdfPath} from '../src/pdf-import/pdfCanvas.js';
test('未完成评价定位遵循服务端同一必填顺序，并指明分类、维度或寄语',()=>{
 const review=emptyReview();assert.deepEqual(reviewIssue(review),{message:'书写「直觉思维」请填写 0–10 的有效分数。',category:'handwriting',field:'score-intuitive',dimensionId:'intuitive'});
 Object.assign(review.handwriting.scores,sampleReview().handwriting.scores);assert.equal(reviewIssue(review)?.field,'summary');
 review.handwriting.summary='书写总评';assert.equal(reviewIssue(review)?.category,'composition');
 review.composition=sampleReview().composition;assert.equal(reviewIssue(review)?.field,'nextSteps');
 review.nextSteps='下一步练习';assert.equal(validateReview(review),null);
 review.composition.scores.logical=31;assert.equal(reviewIssue(review)?.field,'score-logical');
 assert.equal(validateReview(review),reviewIssue(review)?.message);
});
test('扫描左右翻页只接受原倍率单指横滑，放大拖动、双指和短触摸不误翻页',()=>{
 const start={x:250,y:180};assert.equal(scanPageSwipe(start,{x:80,y:195}),1);assert.equal(scanPageSwipe({x:50,y:100},{x:210,y:105}),-1);
 for(const options of [{scale:2},{multiTouch:true},{duration:1000}])assert.equal(scanPageSwipe(start,{x:80,y:195},options),0);
 assert.equal(scanPageSwipe(start,{x:230,y:181}),0);assert.equal(scanPageSwipe(start,{x:180,y:290}),0);
});
test('文件上传校验图片／PDF类型、大小、批容量，PDF渲染保持页比例并限制单页内存',()=>{
 assert.equal(scanFileKind({name:'作业.PDF'}),'pdf');assert.equal(scanFileKind({type:'image/png'}),'image');
 assert.throws(()=>validateScanFiles([{name:'x.pdf',size:51*1024*1024}],60),/50 MB/);
 assert.throws(()=>validateScanFiles([{name:'x.png',size:21*1024*1024}],60),/20 MB/);
 assert.throws(()=>validateScanFiles([{name:'x.exe',size:1}],60),/PDF/);
 assert.throws(()=>validateScanFiles([{name:'x.pdf',size:1}],0),/本批/);
 const size=pdfPageSize(1190.55,841.89);assert.ok(size.width>3300&&size.height>2300);assert.ok(Math.abs(size.width/size.height-Math.SQRT2)<.002);
 const huge=pdfPageSize(20000,10000);assert.ok(huge.width<=4200&&huge.width*huge.height<=10_000_000);
});
test('原生PDF矩阵和消息克隆保留变换、二进制与映射，路径添加不丢失坐标',()=>{
 const matrix=new PdfMatrix().translateSelf(10,20).scaleSelf(2,3);assert.deepEqual(matrix.transformPoint({x:5,y:4}),{x:20,y:32});
 const p=matrix.inverse().transformPoint(matrix.transformPoint({x:7,y:9}));assert.ok(Math.abs(p.x-7)<1e-8&&Math.abs(p.y-9)<1e-8);
 const original={data:new Uint8Array([1,2,3]),map:new Map([['page',2]])};const copied=clonePdfMessage(original);copied.data[0]=9;assert.equal(original.data[0],1);assert.equal(copied.map.get('page'),2);
 const realmBuffer=vm.runInNewContext('new Uint8Array([3,4,5]).buffer');assert.deepEqual([...new Uint8Array(clonePdfMessage(realmBuffer))],[3,4,5],'font-path buffers must survive different constructor realms');
 const path=new PdfPath();path.moveTo(1,2);path.lineTo(3,4);const ops=[];path.replay({moveTo:(...p)=>ops.push(p),lineTo:(...p)=>ops.push(p)});assert.deepEqual(ops,[[1,2],[3,4]]);
});
