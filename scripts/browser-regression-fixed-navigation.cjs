// Exercise real multiple-file inputs and sequential processing, including a
// manual-corner interruption between two successfully detected pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist/build/h5');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.' + (new URL(req.url,'http://localhost').pathname === '/' ? '/index.html' : decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
(async()=>{
  let browser;const errors=[];
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch({executablePath:process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    const button=(text,scope=page)=>scope.locator('uni-button').filter({hasText:text});
    const bind=async(code)=>{await page.locator('.binding-login').click();await page.locator('.binding-code input').fill(code);await button('查看绑定信息').click();await button(/^\s*确认\s*$/,page.locator('.binding-view')).click();};
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await bind('JS2026');await page.locator('.greeting').waitFor();
    await page.locator('.slide-down-layer').waitFor({state:'hidden'});
    await button('布置作业').click();await page.locator('.assignment-composer textarea').fill('请按题目完成这次练习。\n'.repeat(90));
    for(const width of [320,390,510,1280]){
      await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));
      const before=await page.locator('.bottom-nav').boundingBox();
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(120);
      const geometry=await page.evaluate(()=>{
        const back=document.querySelector('.pinned-heading .back-button'),nav=document.querySelector('.bottom-nav');
        const b=back.getBoundingClientRect(),n=nav.getBoundingClientRect();
        const top=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
        return {back:{x:b.x,y:b.y,width:b.width,height:b.height},nav:{x:n.x,y:n.y,width:n.width,height:n.height},backOnTop:top===back||back.contains(top),topElement:top?.outerHTML.slice(0,260),fixed:getComputedStyle(nav).position,scrollY,overflow:document.documentElement.scrollWidth>innerWidth,height:innerHeight};
      });
      assert.ok(geometry.scrollY>300,`must scroll a long form at ${width}`);
      assert.ok(geometry.back.y>=0&&geometry.back.y<40,`back stays at viewport top at ${width}: ${JSON.stringify(geometry)}`);
      if(!geometry.backOnTop)await page.screenshot({path:'/tmp/fixed-navigation-failure.png'});
      assert.ok(geometry.backOnTop,`back can be clicked above content: ${JSON.stringify(geometry)}`);assert.equal(geometry.fixed,'fixed');
      assert.ok(Math.abs(geometry.nav.y-before.y)<1,'bottom navigation stays in place');
      assert.ok(geometry.nav.y+geometry.nav.height<=geometry.height+1);assert.equal(geometry.overflow,false);
    }
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.resolve(__dirname,'../outputs/fixed-navigation-v014-20261030.png')});
    await page.locator('.pinned-heading .back-button').click();
    const discard=page.locator('.modal-actions .primary');if(await discard.isVisible())await discard.click();
    await page.locator('.greeting').waitFor();assert.deepEqual(errors,[]);
    console.log('Top return remains visible/clickable and bottom navigation remains fixed while scrolling at 320/390/510/1280px; real return navigation passed.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
