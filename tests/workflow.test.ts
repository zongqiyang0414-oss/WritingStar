import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockService, clone } from '../src/services/mock';
import { sampleReview, demoPhotos } from '../src/services/seed';
import { rubric, total, validateReview } from '../src/services/rubric';
import type { PrototypeState } from '../src/services/model';
import { presentReview } from '../src/services/presentation';
function setup() {let saved: PrototypeState|null=null;const storage={read:() => clone(saved),write:(s:PrototypeState) => {saved=clone(s);}};const clock=() => new Date('2026-10-12T10:00:00+08:00');return {service:new MockService(storage,clock),storage,clock};}
test('量表保留两套五维和百分制',() => {assert.deepEqual(rubric.handwriting.map(d=>d.max),[10,60,10,10,10]);assert.deepEqual(rubric.composition.map(d=>d.max),[10,20,30,20,20]);assert.equal(total(sampleReview().handwriting),81);assert.equal(total(sampleReview().composition),81);});
test('教师草稿刷新后保留，发布前对学生不可见',async () => {const {service,storage,clock}=setup();const r=sampleReview();r.handwriting.scores.intuitive=9;await service.saveDraft('submission-1',r,'teacher');assert.equal(service.feedback('submission-1','student'),null);const reloaded=new MockService(storage,clock);assert.equal(reloaded.read().submissions[0].draft.handwriting.scores.intuitive,9);await reloaded.publish('submission-1',r,'teacher');assert.equal(total(reloaded.feedback('submission-1','parent')!.handwriting),82);r.handwriting.scores.intuitive=0;assert.equal(total(reloaded.feedback('submission-1','student')!.handwriting),82);});
test('越界、缺维、非数值和版本冲突禁止发布',async () => {const {service}=setup();for(const value of [11,-1,null,Number.NaN,Number.POSITIVE_INFINITY]){const r=sampleReview();r.handwriting.scores.intuitive=value;assert.ok(validateReview(r));await assert.rejects(service.publish('submission-1',r,'teacher'));}const r=sampleReview();delete (r.handwriting.scores as Partial<typeof r.handwriting.scores>).logical;assert.ok(validateReview(r));r.rubricVersion='wrong';assert.ok(validateReview(r));assert.equal(service.read().submissions[0].status,'pending');});
test('演示服务拒绝家长改分和发布',async () => {const {service}=setup();await assert.rejects(service.saveDraft('submission-1',sampleReview(),'parent'));await assert.rejects(service.publish('submission-1',sampleReview(),'student'));});
test('订正按用户页序保存，不覆盖旧作品，禁止重复提交',async () => {const {service}=setup();await service.publish('submission-1',sampleReview(),'teacher');const s=await service.submit('assignment-1',[demoPhotos[1],demoPhotos[0]],'已订正','parent');assert.equal(s.version,2);assert.deepEqual(s.photos.map(p=>p.id),['sample-2','sample-1']);assert.equal(service.read().submissions.length,2);assert.ok(service.read().submissions[0].published);await assert.rejects(service.submit('assignment-1',demoPhotos,'','student'));await service.finishAnalysis(s.id);assert.equal(service.latest('assignment-1','student-1')!.status,'pending');assert.equal(service.feedback(s.id,'student'),null);});
test('真实选择图片不会得到伪造的 AI 分数',async () => {const {service}=setup();await service.publish('submission-1',sampleReview(),'teacher');const s=await service.submit('assignment-1',[{id:'local',url:'data:image/png;base64,example',name:'我的图片',sample:false}],'','student');await service.finishAnalysis(s.id);assert.equal(total(service.latest('assignment-1','student-1')!.draft.handwriting),null);await assert.rejects(service.publish(s.id,service.latest('assignment-1','student-1')!.draft,'teacher'));});
test('模拟提交失败不写入假记录，分析失败可人工恢复',async () => {const {service}=setup();await service.publish('submission-1',sampleReview(),'teacher');await assert.rejects(service.submit('assignment-1',demoPhotos,'','parent',true));assert.equal(service.read().submissions.length,1);const s=await service.submit('assignment-1',demoPhotos,'','parent');await service.finishAnalysis(s.id,true);assert.equal(service.latest('assignment-1','student-1')!.status,'failed');await service.manualReview(s.id,'teacher');assert.equal(service.latest('assignment-1','student-1')!.status,'pending');assert.equal(total(service.latest('assignment-1','student-1')!.draft.composition),null);});
test('保存失败不改变内存状态',async () => {let fail=false;let saved:PrototypeState|null=null;const service=new MockService({read:()=>saved,write:s=>{if(fail)throw new Error('存储满');saved=clone(s);}});fail=true;await assert.rejects(service.publish('submission-1',sampleReview(),'teacher'),/存储满/);assert.equal(service.read().submissions[0].status,'pending');assert.equal(service.feedback('submission-1','parent'),null);});
test('新作业可以提交，截止、空图片和重复图片均阻止提交',async () => {const {service}=setup();const a=await service.createAssignment({title:'新的作业',requirements:'写一件小事',dueAt:'2026-10-13T20:00:00+08:00',classId:'class-1'},'teacher');await assert.rejects(service.submit(a.id,[],'','student'));await assert.rejects(service.submit(a.id,[demoPhotos[0],demoPhotos[0]],'','student'));const s=await service.submit(a.id,demoPhotos,'','student');assert.equal(s.version,1);await assert.rejects(service.createAssignment({title:'过期',requirements:'要求',dueAt:'2026-10-11T20:00:00+08:00',classId:'class-1'},'teacher'));});
test('旧预置评语仅调整展示，保留已保存的分数、教师评语和反馈快照', () => {
  const saved = sampleReview();
  saved.handwriting.scores.intuitive = 9;
  saved.handwriting.comments.logical = '示例提醒：左右结构注意左窄右宽，避免两部分互相挤压。';
  saved.handwriting.comments.imaginal = '请把第三行的横画再写平一点。';
  const before = clone(saved);
  const displayed = presentReview(saved);
  assert.equal(displayed.handwriting.comments.logical, '左右结构注意左窄右宽，避免两部分互相挤压。');
  assert.equal(displayed.handwriting.comments.imaginal, before.handwriting.comments.imaginal);
  assert.deepEqual(displayed.handwriting.scores, before.handwriting.scores);
  assert.deepEqual(saved, before);
});
