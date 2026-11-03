import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {MockService,clone} from '../src/services/mock.js';
import {createSeed,samplePhotos,sampleReview} from '../src/services/seed.js';
import {createImagePdf} from '../src/platform/imagePdf.js';
import {encodePaperCode} from '../src/services/paperWorkflow.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WRITINGSTAR_TEST_URL||'http://127.0.0.1:5173';
let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:963},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||/^(data|blob):/.test(route.request().url())?route.continue():route.abort());
 let saved:any=createSeed(new Date());saved.assignments=[];saved.submissions=[];saved.classPracticeVersion=1;
 const service=new MockService({read:()=>clone(saved),write:state=>saved=clone(state)});
 for(const[role,code]of[['teacher','JS2026'],['student','XS2026'],['admin','MA2026']]){await service.signIn(role);await service.bindInvitation(code,role);}
 const task=await service.createAssignment({title:'本轮批阅检查',classId:'class-1',dueAt:'',requirements:'测试',paperPages:2},'teacher');
 const upload=await service.createAssignment({title:'文件上传检查',classId:'class-1',dueAt:'',requirements:'测试',paperPages:2},'teacher');
 const {createCanvas}=require('@napi-rs/canvas'),qrcode=require('qrcode-generator'),chunks=[],pdf=await createImagePdf(bytes=>chunks.push(Buffer.from(bytes)));
 for(const card of upload.paperPacket.cards.slice(0,2))for(let n=1;n<=2;n++){
  const canvas=createCanvas(1600,1132),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,1132);ctx.fillStyle='#263d34';ctx.font='48px sans-serif';ctx.fillText(`Student ${card.studentId} / ${n}`,100,100);
  const qr=qrcode(0,'M');qr.addData(encodePaperCode(card,n,2));qr.make();const count=qr.getModuleCount(),unit=7;
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))ctx.fillRect(150+(x+4)*unit,200+(y+4)*unit,unit,unit);
  for(let y=600;y<1050;y+=50){ctx.fillRect(150,y,1300,2);}await pdf.addPage(canvas.toBuffer('image/jpeg'),1600,1132,{width:1190.55,height:841.89});
 }
 await pdf.finish();const pdfBytes=Buffer.concat(chunks);fs.writeFileSync('/tmp/writingstar-v025-upload-fixture.pdf',pdfBytes);
 const work=await service.submitForStudent(task.id,'student-1',samplePhotos,'','teacher');await service.finishAnalysis(work.id);
 const draft=sampleReview();draft.handwriting.scores.imaginal=null;draft.handwriting.summary='';draft.composition.scores.logical=null;draft.composition.summary='';draft.nextSteps='';await service.saveDraft(work.id,draft,'teacher');
 const published=await service.submitForStudent(task.id,'student-2',samplePhotos,'','teacher');await service.finishAnalysis(published.id);await service.publish(published.id,sampleReview(),'teacher');
 await context.addInitScript(state=>{if(!localStorage.getItem('jiaxiu-prototype-v1'))localStorage.setItem('jiaxiu-prototype-v1',JSON.stringify(state));},service.read());
 await page.goto(base,{waitUntil:'networkidle'});
 const button=(text:any,scope:any=page)=>scope.locator('uni-button').filter({hasText:text});
 await button('查看详情',page.locator('.assignment-card').filter({hasText:'本轮批阅检查'})).click();
 const row=page.locator('.student-row').filter({hasText:service.read().students.find(s=>s.id==='student-2').name});
 await button('打回作业',row).click();const modal=page.locator('.slide-down-panel.is-dialog');await button('取消',modal).click();
 await button('打回作业',row).click();await button('确认打回',modal).click();await button('待学生重交',row).waitFor();
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('jiaxiu-prototype-v1')!));assert.equal(state.submissions.find(s=>s.id===published.id).status,'published');assert.ok(state.submissions.find(s=>s.id===published.id).resubmission?.allowedAt);
 await button('查看详情',page.locator('.student-row').filter({hasText:'小禾'})).click();await page.locator('.review-editor').waitFor();assert.equal(await page.locator('.ai-review-shortcut').count(),0);
 await page.evaluate(()=>{(window as any).__pulses=0;document.addEventListener('animationstart',e=>{if((e as AnimationEvent).animationName.startsWith('review-required-pulse'))(window as any).__pulses++;});});
 const complete=()=>button(/^\s*完成审核\s*$/).click();
 const field=(key:string)=>page.locator(`.review-field-${key}`);
 await button('形象思维',field('handwriting-score-imaginal')).click();
 await complete();await field('handwriting-score-imaginal').locator('.review-required-note').waitFor();assert.equal(await field('handwriting-score-imaginal').locator('textarea').count(),1);
 await page.waitForFunction(()=>(window as any).__pulses>=1);const before=await page.evaluate(()=>(window as any).__pulses);
 await complete();await page.waitForFunction(n=>(window as any).__pulses>n,before);assert.match(await field('handwriting-score-imaginal').getAttribute('class'),/review-needs-input-again/);
 await page.waitForTimeout(500);let rect=await field('handwriting-score-imaginal').boundingBox();assert.ok(rect.y>50&&rect.y<300,`missing field is below the return bar: ${JSON.stringify({rect,heading:await page.locator('.pinned-heading').boundingBox(),scroll:await page.evaluate(()=>scrollY)})}`);
 await page.screenshot({path:'outputs/v025-review-required.png'});
 await field('handwriting-score-imaginal').locator('input').fill('48');await complete();await field('handwriting-summary').locator('.review-required-note').waitFor();await field('handwriting-summary').locator('textarea').fill('书写具体评价');
 await complete();await field('composition-score-logical').locator('.review-required-note').waitFor();assert.match(await page.locator('.category-switch.review-category-start .active').innerText(),/写作评价/);
 await field('composition-score-logical').locator('input').fill('24');await complete();await field('composition-summary').locator('.review-required-note').waitFor();assert.match(await field('composition-summary').innerText(),/教师寄语（作文总体评价）/);await field('composition-summary').locator('textarea').fill('作文具体评价');
 await complete();await field('nextSteps').locator('.review-required-note').waitFor();await field('nextSteps').locator('textarea').fill('下次练习具体建议');await complete();await page.locator('.feedback-original-work').waitFor();assert.doesNotMatch(await page.locator('.dual-scores').innerText(),/把每一个字写清楚|把自己的感受写具体/);
 await button('工作台',page.locator('.bottom-nav')).click();await button('查看详情',page.locator('.assignment-card').filter({hasText:'文件上传检查'})).click();await button(/^批量上传$/).click();await button(/^文件上传$/).waitFor();
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),button(/^文件上传$/).click()]);await chooser.setFiles('/tmp/writingstar-v025-upload-fixture.pdf');
 await page.waitForFunction(()=>document.querySelectorAll('.scan-page-card').length===4,{},{timeout:120000});await button(/^文件上传$/).waitFor();
 assert.equal(await page.locator('.scan-page-card').count(),4);assert.equal(await page.locator('.scan-student-group').count(),2);assert.match(await page.locator('.scan-submit-card').innerText(),/2 位学生 · 4 页可提交/);await page.screenshot({path:'outputs/v025-pdf-inbox.png'});
 const pdfRows=await page.evaluate(async()=>new Promise<any>(resolve=>{const r=indexedDB.open('writingstar-scan-inbox',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts'),q=tx.objectStore('drafts').getAll();q.onsuccess=()=>{db.close();resolve(q.result.flat());};};}));
 assert.deepEqual(pdfRows.filter(r=>r.photo.pdfRendered).map(r=>r.photo.pdf.page),[1,2,3,4]);assert.ok(pdfRows.every(r=>r.photo.width>3300));
 const rejected=await page.evaluate(async(encoded)=>{const m=await import('/src/platform/pdfImport.js');let pages=0;try{const f=new File([Uint8Array.from(atob(encoded),char=>char.charCodeAt(0))],'too-many.pdf',{type:'application/pdf'});for await(const p of m.browserPdfPages(f,3))pages++;return {pages,error:''};}catch(e){return {pages,error:e.message};}},pdfBytes.toString('base64'));
 assert.equal(rejected.pages,0);assert.match(rejected.error,/本批只剩3页/);
 for(const width of[320,390,977]){await page.setViewportSize({width,height:963});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);
 console.log('v0.25 browser: repeated animated missing-field guidance, category/expand/scroll, published-work return, removed copy/shortcut, teacher-message label, image/PDF picker, four-page PDF persistence and responsive layouts passed.');
}finally{await browser?.close();}
