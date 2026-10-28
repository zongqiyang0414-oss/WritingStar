const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/client');
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}); fs.createReadStream(file).pipe(res);
});
function stored() { const raw=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1')); return raw.schemaVersion ? raw : typeof raw==='string'?JSON.parse(raw):typeof raw.data==='string'?JSON.parse(raw.data):raw.data; }
(async()=>{
 let browser,page;const errors=[];
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||/^(data|blob):/.test(route.request().url())?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  const button=(text,scope=page)=>scope.locator('uni-button').filter({hasText:text});
  const back=()=>page.locator('.back-button').click();
  const openTask=async title=>{for(const period of ['进行中的作业','已完成的作业']){await button(period).click();await page.waitForTimeout(80);const card=page.locator('.assignment-card').filter({hasText:title});if(await card.count()){await button('查看详情',card).click();return;}}throw new Error(`Missing assignment ${title}`);};
  const center=async()=>{const r=await page.locator('.slide-down-panel.is-dialog').boundingBox();assert.ok(r&&Math.abs(r.y+r.height/2-(await page.evaluate(()=>innerHeight))/2)<3,`dialog vertical center ${JSON.stringify(r)}`);assert.ok(Math.abs(r.x+r.width/2-(await page.evaluate(()=>innerWidth))/2)<3);};
  const widths=async()=>{for(const [width,height]of [[320,760],[390,900],[844,390],[1151,963],[1280,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(80);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}await page.setViewportSize({width:390,height:900});};
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await page.locator('.binding-login').click();await page.locator('.binding-code input').fill('JS2026');await button('查看绑定信息').click();await button(/^\s*确认\s*$/,page.locator('.binding-view')).click();await page.locator('.greeting').waitFor();
  // Isolated browser fixture: replace only a fictional, already-reviewed page.
  // This tests display; it does not upload a student's image or create AI scores.
  const selected=await page.evaluate(()=>{
    const raw=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));const state=raw.schemaVersion?raw:typeof raw==='string'?JSON.parse(raw):typeof raw.data==='string'?JSON.parse(raw.data):raw.data;
    const work=state.submissions.find(s=>s.status==='published'&&s.photos.length===2&&state.assignments.find(a=>a.id===s.assignmentId)?.classId==='class-1');
    const canvas=document.createElement('canvas');canvas.width=1592;canvas.height=1131;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1592,1131);ctx.strokeStyle='#26765a';ctx.lineWidth=2;
    for(let col=0;col<3;col++){const x=20+col*530;ctx.strokeRect(x,20,510,1090);ctx.fillStyle='#234b3a';ctx.font='30px sans-serif';ctx.fillText(`横向模板 · 第${col+1}栏`,x+24,78);for(let y=110;y<1080;y+=38){ctx.beginPath();ctx.moveTo(x+20,y);ctx.lineTo(x+490,y);ctx.stroke();}for(let xx=x+20;xx<x+500;xx+=36){ctx.beginPath();ctx.moveTo(xx,110);ctx.lineTo(xx,1070);ctx.stroke();}}
    ctx.fillStyle='#111';for(const [x,y]of [[35,35],[1525,35],[1525,1065],[35,1065]])ctx.fillRect(x,y,22,22);ctx.font='22px sans-serif';ctx.fillText('浏览器展示测试图，不是学生作品',40,1100);
    work.photos[0]={...work.photos[0],url:canvas.toDataURL('image/png')};
    let value;if(raw.schemaVersion)value=JSON.stringify(state);else if(typeof raw==='string')value=JSON.stringify(JSON.stringify(state));else value=JSON.stringify({...raw,data:typeof raw.data==='string'?JSON.stringify(state):state});localStorage.setItem('jiaxiu-prototype-v1',value);
    return {url:work.photos[0].url,storageValue:value,id:work.id,assignmentTitle:state.assignments.find(a=>a.id===work.assignmentId).title,studentName:state.students.find(s=>s.id===work.studentId).name};
  });
  const fixturePath='/tmp/writingstar-landscape-display.png';fs.writeFileSync(fixturePath,Buffer.from(selected.url.split(',')[1],'base64'));
  await page.addInitScript(value=>{if(!sessionStorage.getItem('work-viewer-fixture')){localStorage.setItem('jiaxiu-prototype-v1',value);sessionStorage.setItem('work-viewer-fixture','1');}},selected.storageValue);
  await page.reload({waitUntil:'networkidle'});
  const assignmentCard=page.locator('.assignment-card').filter({hasText:selected.assignmentTitle});if(!await assignmentCard.count())await button('已完成的作业').click();await button('查看详情',assignmentCard).click();await page.locator('.student-search input').fill(selected.studentName);await page.locator('.student-row .text-button').first().click();await page.locator('.feedback-original-work .work-viewer').waitFor();
  const viewer=page.locator('.feedback-original-work');await page.waitForFunction(()=>{const image=document.querySelector('.feedback-original-work img');return image?.complete&&image.naturalWidth>image.naturalHeight;});assert.equal(await viewer.locator('uni-image').count(),1);assert.equal(await viewer.locator('.work-viewer-page').count(),2);
  await widths();
  await page.waitForFunction(()=>{const rect=document.querySelector('.feedback-original-work .work-viewer-canvas').getBoundingClientRect();return Math.abs(rect.height-Math.max(180,Math.min(460,rect.width*1131/1592)))<3;});
  const rect=await viewer.locator('.work-viewer-canvas').boundingBox();assert.ok(Math.abs(rect.height-Math.max(180,Math.min(460,rect.width*1131/1592)))<3);

  assert.equal(await viewer.locator('.work-viewer-toolbar').count(),0);
  assert.equal(await viewer.locator('.work-viewer-zoom').count(),0);
  assert.equal(await viewer.locator('.work-viewer-hint').count(),0);
  await button('下一页',viewer).click();await page.waitForTimeout(150);assert.match(await viewer.locator('.work-viewer-heading').innerText(),/第 2 \/ 2 页/);
  await viewer.locator('.work-viewer-image').click();await page.locator('#u-a-p > div').waitFor();assert.equal(await page.locator('#u-a-p uni-swiper-item').count(),2);await page.locator('#u-a-p svg').last().click();await page.locator('#u-a-p > div').waitFor({state:'hidden'});
  await viewer.locator('.work-viewer-page').first().click();await viewer.locator('.work-viewer-hint').filter({hasText:'横向作品'}).count().then(count=>assert.equal(count,0));
  await viewer.locator('.work-viewer-image').click();await page.locator('#u-a-p > div').waitFor();await page.locator('#u-a-p svg').last().click();await page.locator('#u-a-p > div').waitFor({state:'hidden'});
  await page.screenshot({path:path.resolve(__dirname,'../outputs/simple-work-viewer-2026-10-28.jpg'),type:'jpeg',quality:80,fullPage:true});
  assert.deepEqual(errors,[]);console.log('Simple viewer passed: no inline zoom/toolbar/hint, portrait and landscape page switching, image click opens full multi-page preview, five responsive viewports.');
 }catch(error){if(page){await page.screenshot({path:'/tmp/simple-viewer-failure.png',fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText().catch(()=>'')).slice(-2000));}console.error(error);process.exitCode=1;}
 finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
