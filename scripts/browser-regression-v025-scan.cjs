const assert=require('node:assert/strict');
const {chromium}=require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE||'playwright');
(async()=>{let browser;try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.addInitScript(()=>{
  window.__lamps=[];window.__captures=0;
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async options=>{
   window.__request=options;const c=document.createElement('canvas');c.width=720;c.height=960;const x=c.getContext('2d');x.fillStyle='#444';x.fillRect(0,0,720,960);x.fillStyle='#eee';x.fillRect(80,70,560,820);x.fillStyle='#243b31';x.font='30px sans-serif';x.fillText('PAGE '+(++window.__captures),150,170);for(let y=230;y<800;y+=35)x.fillRect(150,y,400,2);
   const stream=c.captureStream(10),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);let torch=false;
   track.getCapabilities=()=>({torch:true,focusMode:['continuous'],exposureMode:['continuous']});track.getSettings=()=>({torch});track.applyConstraints=async options=>{if('torch' in options.advanced[0]){torch=options.advanced[0].torch;window.__lamps.push(torch);}};track.stop=()=>{torch=false;stop();};window.__lastLamp=()=>torch;
   return stream;
  }});
 });
 await page.goto((process.env.WRITINGSTAR_TEST_URL||'http://127.0.0.1:5173')+'/#/pages/scan/index?batch=paper&remaining=6',{waitUntil:'networkidle'});
 const button=text=>page.locator('uni-button').filter({hasText:text});
 await button(/^开启相机$/).click();await page.locator('#scan-browser-camera video').waitFor();await page.locator('.scan-mode-toggle').click();await page.locator('.scan-flash-toggle').click();
 assert.equal(await page.evaluate(()=>window.__lastLamp()),true);assert.equal(await page.evaluate(()=>window.__request.video.width.ideal),3840);
 await page.locator('.scan-shutter').click();await button('继续扫描').waitFor();assert.equal(await page.evaluate(()=>window.__lastLamp()),false);
 await button('继续扫描').click();await page.waitForFunction(()=>window.__lastLamp());assert.match(await page.locator('.scan-flash-toggle').innerText(),/闪光灯 开/);
 await page.locator('.scan-shutter').click();await button('继续扫描').waitFor();await page.waitForFunction(()=>document.querySelector('.scan-zoom-image img')?.naturalWidth>0);
 const viewer=page.locator('.scan-image-viewer'),pager=page.locator('.scan-pagination'),cdp=await context.newCDPSession(page);
 const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id,radiusX:3,radiusY:3}))});
 let r=await viewer.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
 async function swipe(direction){await touch('touchStart',[[x-direction*75,y,1]]);for(let i=1;i<=5;i++)await touch('touchMove',[[x-direction*75+direction*i*30,y+2,1]]);await touch('touchEnd',[]);}
 assert.match(await pager.innerText(),/2 \/ 2/);await swipe(1);await page.waitForFunction(()=>document.querySelector('.scan-pagination').innerText.includes('1 / 2'));await swipe(-1);await page.waitForFunction(()=>document.querySelector('.scan-pagination').innerText.includes('2 / 2'));
 await swipe(-1);assert.match(await pager.innerText(),/2 \/ 2/,'end boundary does not wrap');
 await touch('touchStart',[[x-30,y,1],[x+30,y,2]]);await touch('touchMove',[[x-100,y,1],[x+100,y,2]]);await touch('touchEnd',[]);
 assert.match(await pager.innerText(),/2 \/ 2/,'pinch does not turn a page');await swipe(1);assert.match(await pager.innerText(),/2 \/ 2/,'zoomed panning does not turn a page');
 assert.ok(await page.locator('.scan-zoom-image').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a>2));
 await page.screenshot({path:'outputs/v025-scan-swipe.png'});assert.deepEqual(errors,[]);console.log('Actual touch: left/right swipe, boundaries, pinch/pan isolation; high-resolution camera request, torch off in review and restored on continue passed.');
}finally{await browser?.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
