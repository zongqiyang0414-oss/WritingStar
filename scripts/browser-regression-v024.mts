import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { MockService, clone } from '../src/services/mock.js';
import { createSeed, samplePhotos, sampleReview } from '../src/services/seed.js';
import { assignmentStudents } from '../src/services/school.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('dist/client'),server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url!,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 const types:any={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
let browser;
try{
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:963}});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||/^(data|blob):/.test(route.request().url())?route.continue():route.abort());
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1400;c.height=990;const x=c.getContext('2d')!;x.fillStyle='#fff';x.fillRect(0,0,1400,990);x.strokeStyle='#23755a';x.lineWidth=12;x.strokeRect(10,10,1380,970);x.fillStyle='#345645';x.font='48px sans-serif';x.fillText('A3 LANDSCAPE - FULL PAGE',70,100);for(let y=180;y<900;y+=90){x.fillStyle='#708bb7';x.fillRect(70,y,1250,2);}return c.toDataURL('image/png');});
 let time=Date.now()-120000,saved:any=createSeed(new Date(time));saved.assignments=[];saved.submissions=[];saved.classPracticeVersion=1;
 const service=new MockService({read:()=>clone(saved),write:state=>{saved=clone(state);}},()=>new Date(time));
 for(const [role,code]of[['teacher','JS2026'],['student','XS2026'],['admin','MA2026']]){await service.signIn(role);await service.bindInvitation(code,role);}
 const task=(title,dueAt='')=>service.createAssignment({title,classId:'class-1',requirements:'浏览器验收',dueAt,paperPages:2},'teacher');
 const complete=async work=>{await service.finishAnalysis(work.id);await service.publish(work.id,sampleReview(),'teacher');};
 const historic=await task('历史已完成'),expired=await task('历史已截止',new Date(time+60000).toISOString()),closing=await task('不限时收尾'),paper=await task('仅写一页');
 for(const student of assignmentStudents(service.read(),historic))await complete(await service.submitForStudent(historic.id,student.id,samplePhotos,'','teacher'));
 let pending;
 for(const student of assignmentStudents(service.read(),closing)){
  const photos=student.id==='student-1'?[{id:'landscape',url:image,name:'A3.png',sample:false,original:true,orientationChecked:true,width:1400,height:990}]:samplePhotos;
  const work=await service.submitForStudent(closing.id,student.id,photos,'','teacher');
  if(student.id==='student-1'){pending=work;await service.finishAnalysis(work.id);const draft=sampleReview();draft.nextSteps='保留已有教师评语';await service.saveDraft(work.id,draft,'teacher');}else await complete(work);
 }
 time=Date.now();const joined=await service.saveStudent({classId:'class-1',name:'新加入同学',studentNumber:'JOIN-BROWSER'},'admin');
 await complete(await service.submitForStudent(closing.id,joined.id,samplePhotos,'','teacher'));
 const originalPhotos=service.read().submissions.find(s=>s.id===pending.id).photos;
 await context.addInitScript(state=>{if(!localStorage.getItem('jiaxiu-prototype-v1'))localStorage.setItem('jiaxiu-prototype-v1',JSON.stringify(state));},service.read());
 await page.goto(base,{waitUntil:'networkidle'});
 const button=(text:any,scope:any=page)=>scope.locator('uni-button').filter({hasText:text});
 const role=(name:string)=>button(name,page.locator('.role-picker')).click();const nav=(name:string)=>button(name,page.locator('.bottom-nav')).click();
 await button('已完成的作业').click();
 const history=page.locator('.assignment-card').filter({hasText:'历史已完成'});assert.match(await history.innerText(),/3 位学生/);assert.equal((await history.locator('.badge').innerText()).trim(),'已完成');
 const deadline=page.locator('.assignment-card').filter({hasText:'历史已截止'});assert.match(await deadline.innerText(),/3 位学生/);
 await button('进行中的作业').click();const closingCard=page.locator('.assignment-card').filter({hasText:'不限时收尾'});assert.match(await closingCard.innerText(),/4 位学生/);
 await button('查看详情',closingCard).click();await button('查看详情',page.locator('.student-row').filter({hasText:'小禾'})).click();await button('查看AI批阅').click();
 await page.locator('.ai-empty-result').waitFor();assert.match(await page.locator('.ai-empty-result').innerText(),/可以直接进行教师批阅/);
 await button(/^教师批阅$/).click();await page.locator('.review-editor').waitFor();
 assert.ok((await page.locator('textarea').evaluateAll(elements=>elements.map((element:HTMLTextAreaElement)=>element.value))).some(value=>value.includes('保留已有教师评语')));
 await page.locator('.photo-reader .work-viewer').scrollIntoViewIfNeeded();
 const viewer=page.locator('.photo-reader .work-viewer');
 const frame=await viewer.locator('.work-viewer-canvas').boundingBox();assert.ok(Math.abs(frame.width/frame.height-Math.SQRT2)<.02,'A3 landscape viewport');
 await page.screenshot({path:'outputs/v024-landscape-review.png'});
 // Emulate the native fixed-navigation classes with a 54px status area.
 await page.evaluate(()=>{const stage=document.querySelector('.stage') as HTMLElement;stage.classList.add('native-layout','native-detail');stage.style.setProperty('--native-top-inset','54px');stage.style.setProperty('--native-nav-height','98px');stage.style.setProperty('--native-menu-space','110px');document.querySelector('.page-heading')!.classList.add('native-page-heading');});
 for(const scroll of[0,350,900]){await page.evaluate(y=>window.scrollTo(0,y),scroll);const bar=await page.locator('.native-page-heading').boundingBox();assert.equal(bar.y,0);assert.equal(Math.round(bar.height),98);assert.ok(await page.evaluate(()=>!!document.elementFromPoint(innerWidth/2,10)?.closest('.native-page-heading')),'opaque status region');}
 await page.screenshot({path:'outputs/v024-native-header-layout.png'});
 await page.evaluate(()=>{document.querySelector('.stage')!.classList.remove('native-layout','native-detail');document.querySelector('.page-heading')!.classList.remove('native-page-heading');});
 await button(/^\s*完成审核\s*$/).click();await page.locator('.feedback-original-work').waitFor();
 await nav('工作台');await button('已完成的作业').click();const completed=page.locator('.assignment-card').filter({hasText:'不限时收尾'});assert.match(await completed.innerText(),/已完成/);assert.match(await completed.innerText(),/4 位学生/);
 await role('学生');const card=page.locator('.assignment-card').filter({hasText:'仅写一页'});await button('查看任务',card).click();
 // Seed an unrecognized page into the real IndexedDB draft store.
 const row={id:'single-row',photo:{id:'single-photo',url:image,name:'only-page.png',sample:false,original:true,orientationChecked:true,width:1400,height:990},code:'',manual:false};
 await page.evaluate(async({key,rows})=>{await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('writingstar-scan-inbox',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(rows,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{key:`writingstar-scan-v1:student:student-1:${paper.id}`,rows:[row]});
 await button('上传答题卡').click();await page.locator('.scan-page-card').waitFor();
 assert.equal(await button(/^拍照上传$/).count(),1);assert.equal(await button(/^相册上传$/).count(),1);
 await button('人工确认',page.locator('.scan-page-card')).click();assert.equal(await page.locator('.scan-code-input').count(),0);assert.equal(await page.locator('.scan-identity-editor uni-picker').count(),2);
 await button('确认归档信息').click();assert.match(await page.locator('.scan-student-group').innerText(),/缺页提醒/);assert.match(await page.locator('.scan-student-group').innerText(),/缺少第 2 页/);
 await page.locator('.scan-student-group').scrollIntoViewIfNeeded();await page.screenshot({path:'outputs/v024-missing-page-warning.png'});
 await button('提交答题卡并开始AI批阅').click();const modal=page.locator('.slide-down-panel.is-dialog');await modal.waitFor();assert.match(await modal.innerText(),/缺页提醒/);assert.match(await modal.innerText(),/仅提交现有页面/);
 await button('取消',modal).click();assert.equal(await page.locator('.scan-page-card').count(),1);
 await button('提交答题卡并开始AI批阅').click();await button('确认提交',page.locator('.slide-down-panel.is-dialog')).click();await page.locator('.ai-review-panel').waitFor();
 assert.equal(await button(/^教师批阅$/).count(),0,'student cannot open teacher review');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('jiaxiu-prototype-v1')!));const submitted=data.submissions.find(s=>s.assignmentId===paper.id&&s.studentId==='student-1');
 assert.equal(submitted.photos.length,1);assert.deepEqual(submitted.paper.missingPages,[2]);assert.equal(submitted.paper.expectedPages,2);
 assert.deepEqual(data.submissions.find(s=>s.id===pending.id).photos,originalPhotos,'teacher manual review preserves original photo');
 await nav('任务');for(const width of[320,390,977]){await page.setViewportSize({width,height:963});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 // A newly joined student's tasks and notifications omit already finished history.
 await page.evaluate(id=>{const state=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1')!);state.accounts.student.studentId=id;localStorage.setItem('jiaxiu-prototype-v1',JSON.stringify(state));},joined.id);
 await page.reload({waitUntil:'networkidle'});await role('学生');
 for(const category of['未提交','已提交','已批阅','需重交','已截止']){await button(category,page.locator('.student-task-tabs')).click();assert.doesNotMatch(await page.locator('.home-view').innerText(),/历史已完成|历史已截止/);}
 assert.deepEqual(errors,[]);
 console.log('v0.24 browser checks passed: completed/expired rosters stay frozen, unlimited work closes after last teacher review, AI-unavailable manual entry preserves drafts and originals, A3 whole-page view, simulated native safe-area/fixed header, upload labels and manual pickers, optional missing-page confirmation/cancel/submit, new-student task visibility and responsive layouts.');
}finally{await browser?.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
