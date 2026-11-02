const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:900}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(() => new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes)
        if (node.tagName === 'IFRAME' && node.title?.includes('答题卡打印')) node.contentWindow.print = () => {
          window.__printResult = {pages:node.contentDocument.images.length,style:node.contentDocument.querySelector('style').textContent};
          node.contentWindow.dispatchEvent(new Event('afterprint'));
        };
    }).observe(document,{childList:true,subtree:true}));
    await page.goto(process.env.WRITINGSTAR_TEST_URL || 'http://127.0.0.1:5173',{waitUntil:'networkidle'});
    const button=text=>page.locator('uni-button').filter({hasText:text});
    await page.locator('.binding-login').click();await page.locator('.binding-code input').fill('JS2026');
    await button('查看绑定信息').click();await button(/^\s*确认\s*$/).click();await page.locator('.greeting').waitFor();
    await button('布置作业').click();await page.locator('.form-input input').fill('校园里的一次发现');await button('发布作业').click();
    await button('查看 / 打印答题卡').click();await page.locator('.paper-preview-image').waitFor();
    assert.match(await page.locator('.paper-card-controls').innerText(),/A3 横向/);
    await button('下一页').click();await page.locator('.paper-preview-image').waitFor();
    await button('上一页').click();await page.locator('.paper-preview-image').waitFor();
    await page.screenshot({path:path.join(root,'outputs/v017-template-mobile.png'),fullPage:true});
    await button('打印 / 下载此生 PDF').click();await page.waitForFunction(()=>window.__printResult);
    const printed=await page.evaluate(()=>window.__printResult);assert.equal(printed.pages,2);assert.match(printed.style,/A3 landscape/);
    await page.exposeFunction('saveArtifact',(name,encoded)=>fs.writeFileSync(path.join(root,'outputs',name),Buffer.from(encoded,'base64')));
    const result=await page.evaluate(async()=>{
      const {answerCardImage,CARD_WIDTH,CARD_HEIGHT}=await import('/src/platform/answerCards.js');
      const {encodePaperCode}=await import('/src/services/paperWorkflow.js');
      const {readPaperScanCode}=await import('/src/platform/scanCode.js');
      const {exportWeixinAnswerCards}=await import('/src/platform/weixinAnswerCards.js');
      const assignment={title:'校园里的一次发现',requirements:'观察校园中的一处景物，写清楚你的发现和感受。',paperPacket:{pages:2}};
      const cards=[{id:'demo-template-1',studentName:'示例学生',studentNumber:'20260001',className:'四年级（1）班'},
        {id:'demo-template-2',studentName:'示例学生二',studentNumber:'20260002',className:'四年级（2）班'}];
      const codes=[];
      const saveData=async(name,data)=>window.saveArtifact(name,data.split(',')[1]);
      for(let p=1;p<=2;p++) {
        const data=await answerCardImage(assignment,cards[0],p,2);
        const image=new Image();image.src=data;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);codes.push(readPaperScanCode(ctx.getImageData(0,0,canvas.width,canvas.height)));
        await saveData(`v017-template-page-${p}.png`,data);
      }
      const longTitle='春天的校园里有许多值得我们细细观察的美好事物请用自己的语言记录下你的一次发现和真实感受吧';
      await saveData('v017-template-long-title.png',await answerCardImage({...assignment,title:longTitle},cards[0],1,1));
      const files=new Map(),rasters=new Map();let frame,serial=0,peak=0;const nativeCodes=[];
      globalThis.wx={env:{USER_DATA_PATH:'/user'},getFileSystemManager:()=>({access:o=>o.success({}),readdir:o=>o.success({files:[]}),
        writeFile:o=>{files.set(o.filePath,[]);o.success({});},appendFile:o=>{files.get(o.filePath).push(o.data);o.success({});},
        readFile:o=>o.success({data:rasters.get(o.filePath)}),unlink:o=>{files.delete(o.filePath);rasters.delete(o.filePath);o.success({});}})};
      globalThis.uni={createCanvasContext:()=>{
        frame=document.createElement('canvas');frame.width=CARD_WIDTH;frame.height=CARD_HEIGHT;const ctx=frame.getContext('2d');
        return {setFillStyle:v=>ctx.fillStyle=v,setStrokeStyle:v=>ctx.strokeStyle=v,setFontSize:v=>ctx.font=`${v}px sans-serif`,setLineWidth:v=>ctx.lineWidth=v,
          fillRect:(...v)=>ctx.fillRect(...v),fillText:(...v)=>ctx.fillText(...v),drawImage:(...v)=>ctx.drawImage(...v),
          beginPath:()=>ctx.beginPath(),moveTo:(...v)=>ctx.moveTo(...v),lineTo:(...v)=>ctx.lineTo(...v),stroke:()=>ctx.stroke(),draw:(_,done)=>done()};},
        canvasToTempFilePath:async o=>{
          const canvas=document.createElement('canvas');canvas.width=o.destWidth;canvas.height=o.destHeight;const ctx=canvas.getContext('2d');ctx.drawImage(frame,0,0,canvas.width,canvas.height);
          const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',o.quality));
          const decoded=await createImageBitmap(blob);ctx.drawImage(decoded,0,0);decoded.close();nativeCodes.push(readPaperScanCode(ctx.getImageData(0,0,canvas.width,canvas.height)));
          const name=`/tmp/template-${serial++}.jpg`;rasters.set(name,await blob.arrayBuffer());peak=Math.max(peak,rasters.size);o.success({tempFilePath:name});
        }};
      const file=await exportWeixinAnswerCards(assignment,cards,{canvasId:'print',scope:{}});
      const blob=new Blob(files.get(file),{type:'application/pdf'});
      const encoded=await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(blob);});
      await saveData('v017-template-sample.pdf',encoded);
      return {codes,expected:[encodePaperCode(cards[0],1,2),encodePaperCode(cards[0],2,2)],nativeCodes,
        nativeExpected:cards.flatMap(c=>[encodePaperCode(c,1,2),encodePaperCode(c,2,2)]),peak,pdfBytes:blob.size};
    });
    assert.deepEqual(result.codes,result.expected);assert.deepEqual(result.nativeCodes,result.nativeExpected);assert.equal(result.peak,1);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({uiAndPrint:printed,...result}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
