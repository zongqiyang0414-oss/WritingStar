// Uses the approved PDF backgrounds to check registration, not to claim real
// handwriting quality. Run against the development server for source imports.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  const base=process.env.WRITINGSTAR_TEST_URL||'http://127.0.0.1:5173';
  await page.goto(base,{waitUntil:'networkidle'});
  const fixtures=await page.evaluate(async()=>{
   const {answerCardImage}=await import('/src/platform/answerCards.js');
   const {detectTemplateDocument}=await import('/src/platform/templateScan.js');
   const {downsampleScanImage}=await import('/src/platform/scanPixels.js');
   const {processScanSource}=await import('/src/platform/documentScanner.js');
   const assignment={title:'定位扫描功能验证',requirements:'程序样本仅验证定位与像素保留',paperPacket:{pages:2}},card={id:'template-scan-fixture',className:'四年级（1）班',studentName:'功能样例',studentNumber:'2026001'};
   const photos=[],measurements=[];
   for(const p of [1,2]){
    const source=await answerCardImage(assignment,card,p,2),img=new Image();img.src=source;await img.decode();
    const scene=document.createElement('canvas');scene.width=2800;scene.height=2200;
    const c=scene.getContext('2d');c.fillStyle='#eeeeee';c.fillRect(0,0,2800,2200);c.drawImage(img,180,140,2382,1684);
    c.strokeStyle='#193e9b';c.lineWidth=5;c.beginPath();c.moveTo(p===1?1100:400,600);c.lineTo(p===1?1120:420,630);c.stroke();
    const pixels=c.getImageData(0,0,2800,2200),small=downsampleScanImage(pixels,480),start=performance.now();
    const found=detectTemplateDocument(small);
    const detectionMs=performance.now()-start,imported=await processScanSource(img,'template.png');
    measurements.push({templateId:found?.templateId,count:found?.markerCount,turns:found?.quarterTurns,ms:detectionMs,importCode:imported.code,originalRetained:imported.photo.url===source});
    if(p===2){const turned=document.createElement('canvas');turned.width=2200;turned.height=2800;const t=turned.getContext('2d');t.translate(2200,0);t.rotate(Math.PI/2);t.drawImage(scene,0,0);photos.push(turned.toDataURL('image/png'));}
    else photos.push(scene.toDataURL('image/png'));
   }
   return {photos,measurements};
  });
  if(process.env.WRITINGSTAR_SCAN_DEBUG)fixtures.photos.forEach((src,i)=>require('node:fs').writeFileSync(`/tmp/template-scan-${i}.png`,Buffer.from(src.split(',')[1],'base64')));
  assert.deepEqual(fixtures.measurements.map(m=>m.templateId),['fangyuan-front-v1','fangyuan-back-v1']);
  fixtures.measurements.forEach((m,i)=>{assert.match(m.importCode,new RegExp(`\\|${i+1}\\|`));assert.equal(m.originalRetained,true);});
  const button=text=>page.locator('uni-button').filter({hasText:text});
  await page.goto(base+'/#/pages/scan/index?batch=paper&remaining=6',{waitUntil:'networkidle'});
  const choosing=page.waitForEvent('filechooser');await button('从相册添加').click();
  await (await choosing).setFiles(fixtures.photos.map((src,i)=>({name:`template-${i+1}.png`,mimeType:'image/png',buffer:Buffer.from(src.split(',')[1],'base64')})));
  await page.waitForFunction(()=>/^2\s*\//.test(document.querySelector('.scan-count')?.textContent||'')&&document.querySelector('.scan-result img')?.complete);
  const checks=[];
  for(const index of [1,0]){
   await page.waitForFunction(()=>document.querySelector('.scan-result img')?.naturalWidth>1000);
   const cropped=await page.locator('.scan-result img').getAttribute('src');
   const result=await page.evaluate(async src=>{
    const {readPaperScanMark}=await import('/src/platform/scanCode.js');
    const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);
    const mark=readPaperScanMark(c.getImageData(0,0,canvas.width,canvas.height));return {width:image.width,height:image.height,code:mark.code,turns:mark.quarterTurns};
   },cropped);
   assert.ok(result.width>2300&&result.width>result.height,'source-size crop is upright');assert.equal(result.turns,0);assert.match(result.code,new RegExp(`\\|${index+1}\\|`));
   await button('调整裁剪').click();await page.locator('.scan-crop-source img').waitFor();
   await page.waitForFunction(()=>document.querySelector('.scan-crop-source img')?.complete&&document.querySelector('.scan-crop-source img')?.naturalWidth>1000);
   const exact=await page.evaluate(async ({cropped,turns})=>{
    const original=document.querySelector('.scan-crop-source img'),source=document.createElement('canvas');source.width=original.naturalWidth;source.height=original.naturalHeight;source.getContext('2d').drawImage(original,0,0);
    const area=document.querySelector('#scan-stage').getBoundingClientRect(),handle=document.querySelector('.scan-crop-corner').getBoundingClientRect(),scale=Math.min(area.width/source.width,area.height/source.height);
    const left=Math.round((handle.x+handle.width/2-area.x-(area.width-source.width*scale)/2)/scale),top=Math.round((handle.y+handle.height/2-area.y-(area.height-source.height*scale)/2)/scale);
    const image=new Image();image.src=cropped;await image.decode();const out=document.createElement('canvas');out.width=image.width;out.height=image.height;out.getContext('2d').drawImage(image,0,0);
    const expected=document.createElement('canvas');expected.width=image.width;expected.height=image.height;const c=expected.getContext('2d');if(turns){c.translate(0,image.height);c.rotate(3*Math.PI/2);}c.drawImage(source,left,top,turns?image.height:image.width,turns?image.width:image.height,0,0,turns?image.height:image.width,turns?image.width:image.height);
    const a=out.getContext('2d').getImageData(0,0,out.width,out.height).data,b=expected.getContext('2d').getImageData(0,0,out.width,out.height).data;let mismatch=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])mismatch++;
    return {mismatch,left,top};
   },{cropped,turns:index===1?3:0});
   assert.equal(exact.mismatch,0,'crop and quarter-turn preserve exact source pixels');checks.push({...result,...exact});
   await button('取消裁剪').click();if(index)await button('上一页').click();
  }
  await page.screenshot({path:path.resolve('outputs/v023-template-crop.png')});
  // Actual page camera events: direct sheet replacement, no per-page confirm.
  const cameraPage=await context.newPage();cameraPage.on('pageerror',e=>errors.push(e.message));
  await cameraPage.addInitScript(photos=>{
   window.ImageCapture=undefined;
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
    const canvas=document.createElement('canvas');canvas.width=2800;canvas.height=2200;const ctx=canvas.getContext('2d');
    window.__showTemplate=async index=>{const image=new Image();image.src=photos[index];await image.decode();ctx.fillStyle='#eee';ctx.fillRect(0,0,2800,2200);const scale=Math.min(2800/image.width,2200/image.height);ctx.drawImage(image,(2800-image.width*scale)/2,(2200-image.height*scale)/2,image.width*scale,image.height*scale);};
    await window.__showTemplate(0);return canvas.captureStream(8);
   }});
  },fixtures.photos);
  await cameraPage.goto(base+'/#/pages/scan/index?batch=paper&remaining=6',{waitUntil:'networkidle'});
  const cameraButton=text=>cameraPage.locator('uni-button').filter({hasText:text});await cameraButton(/^开启相机$/).click();
  await cameraPage.waitForFunction(()=>/^1\s*\//.test(document.querySelector('.scan-count')?.textContent||''));
  await cameraPage.waitForTimeout(1800);assert.match(await cameraPage.locator('.scan-count').innerText(),/^1/);
  await cameraPage.evaluate(()=>window.__showTemplate(1));
  await cameraPage.waitForFunction(()=>/^2\s*\//.test(document.querySelector('.scan-count')?.textContent||''));
  await cameraPage.screenshot({path:path.resolve('outputs/v023-template-auto.png')});
  await cameraButton('已拍摄').click();await cameraPage.waitForFunction(()=>document.querySelector('.scan-result img')?.naturalWidth>document.querySelector('.scan-result img')?.naturalHeight);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({measurements:fixtures.measurements,checks,continuousPages:2}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
