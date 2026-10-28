import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockService, clone } from '../src/services/mock.js';
import { samplePhotos, sampleReview } from '../src/services/seed.js';
import { encodePaperCode, decodePaperCode, scanGroups } from '../src/services/paperWorkflow.js';
import { detectPaperCorners, perspectivePoint, readStudentCode, paperOutputSize } from '../src/platform/documentScanner.js';
import { qrMatrix } from '../src/platform/answerCards.js';
import { chooseDeviceScanImages, processDeviceScan, preserveDeviceScan } from '../src/platform/devicePaperScanner.js';

async function setup() {
  let saved: any = null, fail = false, now = new Date('2026-10-23T10:00:00Z');
  const storage = { read: () => saved && clone(saved), write: (state: any) => { if (fail) throw new Error('存储满'); saved = clone(state); } };
  const service = new MockService(storage, () => now);
  for (const [role, code] of [['teacher', 'JS2026'], ['student', 'XS2026']]) { await service.signIn(role); await service.bindInvitation(code, role); }
  const assignment = await service.createAssignment({ title: '纸上写作', requirements: '写一次发现。', dueAt: '2026-10-24T10:00:00Z', classId: 'class-1', paperPages: 2 }, 'teacher');
  const cards = service.paperCards(assignment.id, 'teacher');
  const rows = (studentId: string, pages = [2, 1]) => pages.map(page => {
    const card = cards.find((c: any) => c.studentId === studentId);
    return { id: `${studentId}-${page}`, photo: { ...clone(samplePhotos[0]), id: `${studentId}-photo-${page}`, sample: false }, code: encodePaperCode(card, page, 2) };
  });
  return { service, storage, assignment, cards, rows, fail: (value: boolean) => {fail = value;}, expire: () => { now = new Date('2026-10-25T10:00:00Z'); } };
}
test('新作业为在班学生生成独立学生码；学生只取得本人卡片，补充生成保持原码', async () => {
  const { service, assignment, cards } = await setup();
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map((c: any) => c.id)).size, 3);
  assert.deepEqual(service.paperCards(assignment.id, 'student').map((c: any) => c.studentId), ['student-1']);
  await service.issuePaperCards(assignment.id, 'teacher');
  assert.deepEqual(service.paperCards(assignment.id, 'teacher'), cards);
  assert.throws(() => service.paperCards(assignment.id, 'admin'), /学生|教师/);
  await assert.rejects(service.issuePaperCards(assignment.id, 'student'), /教师/);
  const state = service.read(); state.students.push({...state.students[0], id:'new-student', name:'新同学'}); service.commit(state);
  // New students receive cards in the same roster commit, without a button.
  assert.equal(service.paperCards(assignment.id, 'teacher').length, 4);
  assert.deepEqual(service.paperCards(assignment.id, 'teacher').slice(0,3), cards);
  const archived = service.read(); archived.students[0].archived = true; service.commit(archived);
  await service.issuePaperCards(assignment.id, 'teacher');
  const restored = service.read(); restored.students[0].archived = false; restored.students[0].name = '小禾新姓名'; service.commit(restored);
  await service.issuePaperCards(assignment.id, 'teacher');
  const originalCard = service.paperCards(assignment.id, 'teacher').find((c: any)=>c.studentId===cards[0].studentId);
  assert.equal(originalCard.id,cards[0].id);assert.equal(originalCard.studentName,'小禾新姓名');
});
test('二维码真实往返识别；篡改页码、错作业、他人和已归档学生码不能通过', async () => {
  const { service, assignment, cards } = await setup();
  const code = encodePaperCode(cards[0], 1, 2), matrix = qrMatrix(code), size = (matrix.length + 8) * 5;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix.length; x++) if (matrix[y][x])
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 5; xx++) { const i = (((y + 4) * 5 + yy) * size + (x + 4) * 5 + xx) * 4; data[i] = data[i+1] = data[i+2] = 0; }
  assert.equal(readStudentCode({data, width: size, height: size}), code);
  assert.equal(decodePaperCode(code).page, 1);
  assert.throws(() => decodePaperCode(code.replace('|1|2|', '|2|2|')), /无法识别/);
  const other = await service.createAssignment({title:'另一次',requirements:'写作',classId:'class-1',dueAt:'2026-10-24T10:00:00Z'}, 'teacher');
  assert.throws(() => service.paperMatch(other.id, code, 'teacher'), /不属于本次/);
  assert.throws(() => service.paperMatch(assignment.id, encodePaperCode(cards[1],1,2), 'student'), /本人/);
  const state = service.read(); state.students[0].archived = true; service.commit(state);
  assert.throws(() => service.paperMatch(assignment.id, code, 'teacher'), /归档/);
});
test('扫描乱序按学生页码归档；缺页、重页、未识别页和跨学生上传被拦截', async () => {
  const {service, assignment, rows} = await setup();
  const valid = scanGroups(service.read(), assignment.id, rows('student-1'));
  assert.equal(valid.groups[0].ready, true);
  assert.deepEqual(valid.groups[0].rows.map((r: any) => r.page), [1,2]);
  await assert.rejects(service.submitPaperBatch(assignment.id, rows('student-1',[1]), 'teacher'), /缺少第 2 页/);
  const duplicate = rows('student-1'); duplicate[1] = {...duplicate[1], code: duplicate[0].code};
  await assert.rejects(service.submitPaperBatch(assignment.id, duplicate, 'teacher'), /重复页/);
  await assert.rejects(service.submitPaperBatch(assignment.id, [{...rows('student-1')[0],code:''}], 'teacher'), /未识别/);
  await assert.rejects(service.submitPaperBatch(assignment.id, rows('student-2'), 'student'), /其他学生/);
  await assert.rejects(service.submitPaperBatch(assignment.id, rows('student-1'), 'admin'), /教师|学生/);
});
test('批量提交单次原子保存；失败无半份提交，重试不重复，真实照片不产生伪AI分数', async () => {
  const {service, storage, assignment, rows, fail} = await setup();
  const batch = [...rows('student-1'), ...rows('student-2')], before = service.read();
  fail(true); await assert.rejects(service.submitPaperBatch(assignment.id,batch,'teacher'), /存储满/);
  assert.deepEqual(service.read(), before); fail(false);
  const result = await service.submitPaperBatch(assignment.id,batch,'teacher');
  assert.equal(result.length,2); assert.equal(result[0].paper.batchId,result[1].paper.batchId);
  assert.equal(result[0].paper.source,'teacher-scan'); assert.equal(result[0].submittedBy.name,'陈老师');
  assert.deepEqual(result[0].paper.pages.map((p: any) => p.page),[1,2]);
  await assert.rejects(service.submitPaperBatch(assignment.id,batch,'teacher'), /已提交/);
  await service.finishAnalysis(result[0].id);
  assert.equal(service.aiResult(result[0].id,'student').state, 'unavailable');
  assert.equal(service.aiResult(result[0].id,'student').result, null);
  const reloaded = new MockService(storage);
  assert.deepEqual(reloaded.latest(assignment.id,'student-2'),result[1]);
});
test('人工确认留存来源；默认单交，教师同意后学生可重新提交，教师不能重复代交', async () => {
  const {service, assignment, rows, expire, fail} = await setup();
  const manual = rows('student-1').map((r: any, i: number) => ({...r,code:'',manual:true,studentId:'student-1',page:2-i}));
  const first = (await service.submitPaperBatch(assignment.id,manual,'student'))[0];
  assert.equal(first.paper.source,'student-paper'); assert.ok(first.paper.pages.every((p: any)=>p.manual));
  await service.finishAnalysis(first.id); await service.publish(first.id,sampleReview(),'teacher');
  await assert.rejects(service.submitPaperBatch(assignment.id,rows('student-1'),'student'), /需老师同意/);
  expire(); await assert.rejects(service.submitPaperBatch(assignment.id,rows('student-1'),'student'), /已截止/);
  await service.agreeResubmission(first.id,'teacher');
  await assert.rejects(service.submitPaperBatch(assignment.id,rows('student-1'),'teacher'), /已提交/);
  fail(true); await assert.rejects(service.submitPaperBatch(assignment.id,rows('student-1'),'student'), /存储满/); fail(false);
  assert.equal(service.latest(assignment.id,'student-1').resubmission.consumedAt,undefined);
  const next = (await service.submitPaperBatch(assignment.id,rows('student-1'),'student'))[0]; assert.equal(next.version,2);
  assert.ok(service.read().submissions.find((s: any)=>s.id===first.id).resubmission.consumedAt);
  await assert.rejects(service.submitPaperBatch(assignment.id,rows('student-2'),'student'), /已截止/);
  const late = (await service.submitPaperBatch(assignment.id,rows('student-2'),'teacher'))[0]; assert.equal(late.actor,'teacher');
  assert.equal(service.read().submissions.find((s: any)=>s.id===first.id).published.composition.summary, sampleReview().composition.summary);
});
test('四角检测与透视映射保留完整页面；纯背景不会被自动扫描', () => {
  const width = 200,height = 280,data = new Uint8ClampedArray(width*height*4).fill(255);
  for(const [left,top] of [[12,12],[184,12],[184,264],[12,264]]) for(let y=top;y<top+4;y++) for(let x=left;x<left+4;x++) {const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
  const corners = detectPaperCorners({data,width,height}); assert.equal(corners.length,4);
  const quad=[{x:10,y:20},{x:130,y:10},{x:110,y:200},{x:5,y:180}];
  for(const [u,v,i] of [[0,0,0],[1,0,1],[1,1,2],[0,1,3]]) {const p=perspectivePoint(quad,u,v);assert.ok(Math.abs(p.x-quad[i].x)<1e-6);assert.ok(Math.abs(p.y-quad[i].y)<1e-6);}
  data.fill(255); assert.equal(detectPaperCorners({data,width,height}),null);
});
test('微信扫描适配读取画布学生码并保存永久图片；失败可保留原图人工确认', async () => {
  const {cards}=await setup(), code=encodePaperCode(cards[0],1,2), matrix=qrMatrix(code), size=(matrix.length+8)*4;
  const data=new Uint8ClampedArray(size*size*4).fill(255);
  for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x])for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++){const i=(((y+4)*4+yy)*size+(x+4)*4+xx)*4;data[i]=data[i+1]=data[i+2]=0;}
  const previous=globalThis.uni,saved=[],sizes=[];
  globalThis.uni={
    getImageInfo:options=>options.success({width:size,height:size,path:'/tmp/original'}),
    createCanvasContext:()=>({drawImage(){},draw:(_keep,done)=>done()}),
    canvasGetImageData:options=>options.success({data}),
    canvasPutImageData:options=>options.success({}),
    canvasToTempFilePath:options=>options.success({tempFilePath:'/tmp/processed.jpg'}),
    saveFile:options=>{saved.push(options.tempFilePath);options.success({savedFilePath:'/saved/'+saved.length});},
    chooseImage:options=>{assert.equal(options.count,9);options.fail({errMsg:'chooseImage:fail cancel'});},
  };
  try {
    const photo={id:'photo-device',url:'/tmp/original',name:'作品',sample:false};
    const row=await processDeviceScan(photo,'test-canvas',{},async(w,h)=>{sizes.push([w,h]);});
    assert.equal(row.code,code);assert.equal(row.photo.url,'/saved/1');assert.equal(row.photo.sample,false);
    assert.deepEqual(sizes[0],[size,size]);assert.deepEqual(saved,['/tmp/processed.jpg']);
    const fallback=await preserveDeviceScan(photo);assert.equal(fallback.code,'');assert.equal(fallback.photo.url,'/saved/2');
    assert.deepEqual(await chooseDeviceScanImages(60),[]);
  }finally{globalThis.uni=previous;}
});


test('横向纸张四角可识别，横竖校正保留A系列方向，不将横版拉成竖版', () => {
  for (const [width,height] of [[280,200],[200,280]]) {
    const data = new Uint8ClampedArray(width*height*4).fill(255);
    for (const [left,top] of [[12,12],[width-16,12],[width-16,height-16],[12,height-16]])
      for(let y=top;y<top+4;y++)for(let x=left;x<left+4;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
    const corners=detectPaperCorners({data,width,height});assert.equal(corners?.length,4);
    const target=paperOutputSize(corners,1000);
    assert.deepEqual(target,width>height?{width:1414,height:1000}:{width:1000,height:1414});
  }
});
