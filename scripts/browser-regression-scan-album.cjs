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
    const digest=value=>createHash('sha256').update(Buffer.from(value.split(',')[1]||'','base64')).digest('hex');
    for(let index=2;index>=0;index--){
      const src=await page.locator('.scan-result img').getAttribute('src');
      await page.waitForFunction(()=>document.querySelector('.scan-zoom-image img')?.complete&&document.querySelector('.scan-zoom-image img')?.naturalWidth>0);
      const dimensions=await page.locator('.scan-zoom-image img').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
      await button('调整裁剪').click();await page.locator('.scan-crop-source img').waitFor();await page.waitForFunction(()=>document.querySelector('.scan-crop-source img')?.complete&&document.querySelector('.scan-crop-source img')?.naturalWidth>0);
      const original=await page.locator('.scan-crop-source img').getAttribute('src');
      assert.equal(digest(original),digest(images[index]),'recrop always uses the unchanged complete input');
      if(index!==1){
        assert.ok(dimensions.width<(index===0?3000:720)&&dimensions.height<(index===0?4000:960),'desk is cropped away');
        const check=await page.evaluate(async ({cropped,original})=>{
          const load=async src=>{const img=new Image();await new Promise(r=>{img.onload=r;img.src=src;});const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);return c;};
          const full=await load(original),out=await load(cropped),area=document.querySelector('#scan-stage').getBoundingClientRect();
          const handle=document.querySelector('.scan-crop-corner').getBoundingClientRect(),scale=Math.min(area.width/full.width,area.height/full.height);
          const left=Math.round((handle.x+handle.width/2-area.x-(area.width-full.width*scale)/2)/scale);
          const top=Math.round((handle.y+handle.height/2-area.y-(area.height-full.height*scale)/2)/scale);
          const expected=full.getContext('2d').getImageData(left,top,out.width,out.height).data,actual=out.getContext('2d').getImageData(0,0,out.width,out.height).data;
          let mismatch=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i]){mismatch++;if(mismatch>10)break;}
          return {mismatch,left,top,width:out.width,height:out.height};
        },{cropped:src,original});
        assert.equal(check.mismatch,0,'PNG crop preserves every decoded channel at its source pixel location');
      }else assert.equal(digest(src),digest(original),'uncertain borders keep the original until crop review');
      retained.unshift({...dimensions,bytes:Buffer.from(src.split(',')[1],'base64').length});
      await button('取消裁剪').click();
      if(index){await button('上一页').click();await page.waitForFunction(previous=>document.querySelector('.scan-zoom-image img')?.src!==previous,src);}
    }
    assert.ok(retained[0].height>3000,'full-resolution crop exceeds the retired output cap');
    await button('下一页').click();await button('调整裁剪').click();
    await page.waitForFunction(()=>document.querySelector('.scan-crop-source img')?.complete&&document.querySelector('.scan-crop-source img')?.naturalWidth>0);
    const whole=await page.locator('.scan-crop-source img').getAttribute('src');
    const sourceSize=await page.locator('.scan-crop-source img').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
    const area=await page.locator('#scan-stage').boundingBox(),scale=Math.min(area.width/sourceSize.width,area.height/sourceSize.height);
    const fitted={left:area.x+(area.width-sourceSize.width*scale)/2,top:area.y+(area.height-sourceSize.height*scale)/2,width:sourceSize.width*scale,height:sourceSize.height*scale};
    for(const [corner,x,y] of [[0,.2,.14],[2,.8,.86]]){
      const point=await page.locator('.scan-crop-corner').nth(corner).boundingBox();
      await page.mouse.move(point.x+point.width/2,point.y+point.height/2);await page.mouse.down();await page.mouse.move(fitted.left+x*fitted.width,fitted.top+y*fitted.height,{steps:4});await page.mouse.up();
    }
    await page.screenshot({path:path.resolve(__dirname,`../outputs/scan-crop-${artifactVersion}-${artifactDate}.png`)});
    await button('保存裁剪').click();await button('调整裁剪').waitFor();
    const manual=await page.locator('.scan-zoom-image img').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
    assert.ok(manual.width>420&&manual.width<440&&manual.height>680&&manual.height<705,'manual rectangle affects the real output');
    await button('调整裁剪').click();assert.equal(digest(await page.locator('.scan-crop-source img').getAttribute('src')),digest(whole));await button('取消裁剪').click();
    assert.match(await page.locator('.scan-count').innerText(),/^3/,'recrop replaces rather than appends');
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
    console.log('Photo crop: complete original retained for edits, full-resolution exact crop pixels, manual bounds, no aspect forcing, cancel/resume and capacity checks passed.',retained);
  } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
