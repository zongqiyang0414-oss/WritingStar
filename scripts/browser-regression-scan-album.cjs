// Exercise real multiple-file inputs and sequential processing, including a
// manual-corner interruption between two successfully detected pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
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
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=960;const ctx=canvas.getContext('2d');
      ctx.fillStyle=index===1?'#eee':'#70645b';ctx.fillRect(0,0,720,960);
      if(index!==1){const gradient=ctx.createLinearGradient(90,0,630,0);gradient.addColorStop(0,'#b6b6b6');gradient.addColorStop(1,'#e8e8e8');ctx.fillStyle=gradient;ctx.fillRect(90,80,540,800);}
      ctx.strokeStyle='#292929';ctx.lineWidth=2;ctx.strokeRect(145,150,430,640);
      ctx.fillStyle='#252525';ctx.font='25px sans-serif';ctx.fillText('Document '+(index+1),170,190);ctx.fillText(String(index+1),340,850);
      // Real colored pixels must survive the complete import/rectify/enhance/
      // JPEG path. A grayscale filter would pass the white-paper assertions.
      ctx.strokeStyle='#214ca6';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(215,430);ctx.lineTo(265,447);ctx.lineTo(320,425);ctx.stroke();
      ctx.strokeStyle='#b62e38';ctx.lineWidth=6;ctx.beginPath();ctx.arc(440,610,25,0,Math.PI*2);ctx.stroke();
      return canvas.toDataURL('image/png');
    }));
    const files=images.map((image,index)=>({name:`test-page-${index+1}.png`,mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')}));
    const choose=async payload=>{const selected=page.waitForEvent('filechooser');await button('从相册扫描').click();const input=await selected;assert.equal(input.isMultiple(),true);await input.setFiles(payload);};
    await choose(files);
    await button('确认并处理').waitFor();
    assert.match(await page.locator('.scan-count').innerText(),/^1/,'first image was processed before ambiguous second image');
    assert.match(await page.locator('.scan-status').innerText(),/后续还有 1 张/);
    await button('确认并处理').click();
    await page.waitForFunction(()=>document.querySelector('.scan-count')?.textContent.startsWith('3'));
    await button('调整边角').waitFor();
    const third=await page.locator('.scan-result img').getAttribute('src');
    await button('上一页').click();await page.waitForFunction(previous=>document.querySelector('.scan-result img')?.src!==previous,third);const second=await page.locator('.scan-result img').getAttribute('src');
    await button('上一页').click();await page.waitForFunction(previous=>document.querySelector('.scan-result img')?.src!==previous,second);const first=await page.locator('.scan-result img').getAttribute('src');
    assert.ok(first!==second && second!==third,'each selected page has its own result');
    const quality=await page.evaluate(async source=>{
      const image=new Image();await new Promise(resolve=>{image.onload=resolve;image.src=source;});
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
      const data=ctx.getImageData(0,0,c.width,c.height).data;
      const gray=(x,y)=>data[(Math.round(y*c.height)*c.width+Math.round(x*c.width))*4];
      let blue=0,red=0;
      for(let y=Math.floor(c.height*.2);y<c.height*.85;y+=2)for(let x=Math.floor(c.width*.15);x<c.width*.85;x+=2){
        const i=(y*c.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
        if(b-r>45&&b-g>15)blue++;
        if(r-g>45&&r-b>45)red++;
      }
      return {width:c.width,height:c.height,white:gray(.5,.45),margin:gray(.03,.5),dark:Array.from({length:40},(_,i)=>gray(.102+i*.001,.5)).some(v=>v<100),blue,red};
    },first);
    assert.ok(quality.width<600&&quality.height<850,'desk cropped away');
    assert.ok(quality.white>240&&quality.margin>235,'shadowed sheet becomes white including page margins');
    assert.ok(quality.dark,'printed outline remains dark');
    assert.ok(quality.blue>100,`blue pen survives enhancement (${quality.blue} sampled pixels)`);
    assert.ok(quality.red>100,`red stamp survives enhancement (${quality.red} sampled pixels)`);
    await page.screenshot({path:path.resolve(__dirname,`../outputs/scan-album-multiple-${artifactVersion}-${artifactDate}.png`)});
    await button('调整边角').click();
    await page.locator('.scan-ratio-picker').click();
    await page.locator('.uni-picker-view-group').hover();
    await page.mouse.wheel(0,40);
    await page.locator('.uni-picker-action-confirm').click();
    await button('确认并处理').click();
    await button('调整边角').waitFor();
    const dimensions=await page.locator('.scan-result img').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
    assert.ok(Math.abs(dimensions.width/dimensions.height-210/297)<.003,'explicit A4 dimensions survive enhance/JPEG');
    assert.match(await page.locator('.scan-count').innerText(),/^3/,'ratio adjustment replaces one page');
    await button('调整边角').click();assert.match(await page.locator('.scan-ratio-picker').innerText(),/竖版/);
    await page.screenshot({path:path.resolve(__dirname,`../outputs/scan-ratio-${artifactVersion}-${artifactDate}.png`)});
    await button('取消调整').click();
    // Hold an actual scanner image decode, then click Stop. Existing pages
    // stay usable, the late image cannot append, and the same queue can resume.
    await page.evaluate(()=>{
      const Original=window.Image,src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
      window.__scanDecode={Original,src,hold:true,pending:[]};
      window.Image=function(){const img=new Original();Object.defineProperty(img,'src',{get(){return src.get.call(img);},set(value){
        if(window.__scanDecode.hold)window.__scanDecode.pending.push({img,value});else src.set.call(img,value);
      }});return img;};
    });
    await button('继续扫描').click();
    await choose([files[0]]);
    await page.waitForFunction(()=>window.__scanDecode.pending.length>0);
    await button('停止处理').click();
    await button('继续处理所选图片').waitFor();
    assert.match(await page.locator('.scan-count').innerText(),/^3/);
    const previewButton=page.locator('.scan-side-action').filter({hasText:'已扫描'});
    assert.equal(await previewButton.getAttribute('disabled'),null,'completed pages remain clickable after stop');
    await previewButton.click();await button('调整边角').waitFor();
    await page.evaluate(()=>{const state=window.__scanDecode;window.Image=state.Original;state.hold=false;state.pending.forEach(({img,value})=>state.src.set.call(img,value));});
    await page.waitForTimeout(50);assert.match(await page.locator('.scan-count').innerText(),/^3/,'late decode does not add a page');
    await button('继续处理所选图片').click();
    await page.waitForFunction(()=>document.querySelector('.scan-count')?.textContent.startsWith('4'));
    await button('调整边角').waitFor();
    // A query-only hash change reuses the uni-app page instance; reload for a
    // new independent scan session with a different remaining capacity.
    await page.goto('about:blank');await page.goto(base+'2',{waitUntil:'networkidle'});await choose(files);
    await page.locator('.scan-error').waitFor();assert.match(await page.locator('.scan-error').innerText(),/还可添加 2 页/);
    assert.match(await page.locator('.scan-count').innerText(),/^0/,'over-limit choice does not partially import');
    assert.deepEqual(errors,[]);
    console.log('Album multiple input, order, retained colors, A4 picker, stop during decode, existing-page access, stale-result rejection, queue resume and capacity limit passed.',quality,dimensions);
  } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
