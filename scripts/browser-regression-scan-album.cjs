// Verify original-file bytes through multiple imports, review, cancellation and resume.
// Generated fixtures validate file preservation, not real-world scan quality.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const artifactVersion = process.env.WRITINGSTAR_SCAN_ARTIFACT_VERSION || 'v014';
const artifactDate = process.env.WRITINGSTAR_SCAN_ARTIFACT_DATE || '20261030';
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.' + (new URL(req.url,'http://localhost').pathname === '/' ? '/index.html' : decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
(async()=>{
  let browser; const errors=[];
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({executablePath:process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage({viewport:{width:390,height:900}});
    page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
    const base=`http://127.0.0.1:${server.address().port}/#/pages/scan/index?batch=paper&remaining=`;
    const button=text=>page.locator('uni-button').filter({hasText:text});
    await page.goto(base+'6',{waitUntil:'networkidle'});
    const images=await page.evaluate(()=>[0,1,2].map(index=>{
      const canvas=document.createElement('canvas');canvas.width=index===0?3000:720;canvas.height=index===0?4000:960;const ctx=canvas.getContext('2d');ctx.scale(canvas.width/720,canvas.height/960);
      ctx.fillStyle=index===1?'#eee':'#70645b';ctx.fillRect(0,0,720,960);
      if(index!==1){const gradient=ctx.createLinearGradient(90,0,630,0);gradient.addColorStop(0,'#b6b6b6');gradient.addColorStop(1,'#e8e8e8');ctx.fillStyle=gradient;ctx.fillRect(90,80,540,800);}
      ctx.strokeStyle='#292929';ctx.lineWidth=2;ctx.strokeRect(145,150,430,640);
      ctx.fillStyle='#252525';ctx.font='25px sans-serif';ctx.fillText('Document '+(index+1),170,190);ctx.fillText(String(index+1),340,850);
      // Real colored pixels must survive the complete import/rectify/enhance/
      // JPEG path. A grayscale filter would pass the white-paper assertions.
      ctx.strokeStyle='#214ca6';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(215,430);ctx.lineTo(265,447);ctx.lineTo(320,425);ctx.stroke();
      ctx.strokeStyle='#b62e38';ctx.lineWidth=6;ctx.beginPath();ctx.arc(440,610,25,0,Math.PI*2);ctx.stroke();
      if(index===0){const noise=ctx.createImageData(640,480);let seed=7;for(let i=0;i<noise.data.length;i+=4){for(let c=0;c<3;c++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise.data[i+c]=seed>>>24;}noise.data[i+3]=255;}ctx.putImageData(noise,1400,2700);}
      return canvas.toDataURL('image/png');
    }));
    const files=images.map((image,index)=>({name:`test-page-${index+1}.png`,mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')}));
    const choose=async payload=>{const selected=page.waitForEvent('filechooser');await button('从相册添加').click();const input=await selected;assert.equal(input.isMultiple(),true);await input.setFiles(payload);};
    assert.ok(files[0].buffer.length>800*1024,'large original exceeds the retired compression budget');
    await choose(files);
    await page.waitForFunction(()=>document.querySelector('.scan-count')?.textContent.startsWith('3'));
    await button('删除此页').waitFor();
    assert.equal(await page.locator('.scan-ratio-picker').count(),0,'no shape/resampling controls');
    const retained=[];
    for(let index=2;index>=0;index--){
      const src=await page.locator('.scan-result img').getAttribute('src');
      const digest=value=>createHash('sha256').update(Buffer.from(value.split(',')[1]||'','base64')).digest('hex');
      assert.equal(digest(src),digest(images[index]),'selected file bytes survive import and review unchanged');
      const dimensions=await page.locator('.scan-result img').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
      retained.unshift({bytes:files[index].buffer.length,...dimensions});
      if(index){await button('上一页').click();await page.waitForFunction(previous=>document.querySelector('.scan-result img')?.src!==previous,src);}
    }
    assert.deepEqual(retained[0],{bytes:files[0].buffer.length,width:3000,height:4000});
    await page.screenshot({path:path.resolve(__dirname,`../outputs/scan-album-original-${artifactVersion}-${artifactDate}.png`)});
    // Hold an actual scanner image decode, then click Stop. Existing pages
    // stay usable, the late image cannot append, and the same queue can resume.
    await page.evaluate(()=>{
      const Original=window.Image,src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
      window.__scanDecode={Original,src,hold:true,pending:[]};
      window.Image=function(){const img=new Original();Object.defineProperty(img,'src',{get(){return src.get.call(img);},set(value){
        if(window.__scanDecode.hold)window.__scanDecode.pending.push({img,value});else src.set.call(img,value);
      }});return img;};
    });
    await button('继续拍照').click();
    await choose([files[0]]);
    await page.waitForFunction(()=>window.__scanDecode.pending.length>0);
    await button('停止处理').click();
    await button('继续处理所选图片').waitFor();
    assert.match(await page.locator('.scan-count').innerText(),/^3/);
    const previewButton=page.locator('.scan-side-action').filter({hasText:'已拍摄'});
    assert.equal(await previewButton.getAttribute('disabled'),null,'completed pages remain clickable after stop');
    await previewButton.click();await button('删除此页').waitFor();
    await page.evaluate(()=>{const state=window.__scanDecode;window.Image=state.Original;state.hold=false;state.pending.forEach(({img,value})=>state.src.set.call(img,value));});
    await page.waitForTimeout(50);assert.match(await page.locator('.scan-count').innerText(),/^3/,'late decode does not add a page');
    await button('继续处理所选图片').click();
    await page.waitForFunction(()=>document.querySelector('.scan-count')?.textContent.startsWith('4'));
    await button('删除此页').waitFor();
    // A query-only hash change reuses the uni-app page instance; reload for a
    // new independent scan session with a different remaining capacity.
    await page.goto('about:blank');await page.goto(base+'2',{waitUntil:'networkidle'});await choose(files);
    await page.locator('.scan-error').waitFor();assert.match(await page.locator('.scan-error').innerText(),/还可添加 2 页/);
    assert.match(await page.locator('.scan-count').innerText(),/^0/,'over-limit choice does not partially import');
    assert.deepEqual(errors,[]);
    console.log('Original album: exact file bytes/order/3000x4000 dimensions, no shape controls, cancel/late decode/resume and capacity checks passed.',retained);
  } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
