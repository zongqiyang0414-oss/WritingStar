// Same synthetic photographed worksheet through the real old/new reader,
// processing and JPEG exporter. No student images are bundled or uploaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { build } = require('esbuild');
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const baseline = process.env.WRITINGSTAR_SCAN_BASELINE || '844e496';
const version = process.env.WRITINGSTAR_SCAN_ARTIFACT_VERSION || 'v020';
const date = process.env.WRITINGSTAR_SCAN_ARTIFACT_DATE || '20261102';
function h5(source) {
  let active = true; const stack = [];
  return source.split('\n').filter(line => {
    const match = line.match(/^\s*\/\/ #(ifdef|ifndef) (\S+)/);
    if (match) { stack.push(active); active = active && (match[1] === 'ifdef' ? match[2] === 'H5' : match[2] !== 'H5'); return false; }
    if (/^\s*\/\/ #endif/.test(line)) { active = stack.pop(); return false; }
    return active;
  }).join('\n');
}
async function bundle(ref, globalName) {
  const result = await build({ stdin: { contents: 'export {createScanRenderer} from "./src/platform/scanner.js"; export {processScanPixels} from "./src/platform/scanProcessing.js";', resolveDir: root },
    absWorkingDir: root, bundle: true, write: false, format: 'iife', globalName, platform: 'browser', plugins: [{ name: 'h5-source', setup(api) {
      api.onLoad({ filter: /\/src\/.*\.js$/ }, args => ({ contents: h5(ref ? execFileSync('git', ['show', `${ref}:${path.relative(root, args.path)}`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(args.path, 'utf8')), loader: 'js' }));
    } }] });
  return result.outputFiles[0].text;
}
(async () => {
  let browser, server;
  try {
    const before = await bundle(baseline, 'BeforeScan'), after = await bundle(null, 'AfterScan');
    server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><script>' + before + '</script><script>' + after + '</script></body></html>'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ executablePath: process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1150 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const results = await page.evaluate(async () => {
      await document.fonts.ready;
      const source = document.createElement('canvas'); source.width = 3200; source.height = 2240;
      const ctx = source.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 3200, 2240);
      ctx.fillStyle = '#222'; ctx.font = 'bold 52px "Noto Sans CJK SC",sans-serif'; ctx.fillText('作文练习 · 合成清晰度样张', 100, 150);
      ctx.font = '32px "Noto Sans CJK SC",sans-serif'; ctx.fillText('测试资料，无真实学生信息', 100, 250);
      ctx.fillText('细线、淡铅笔与彩色批注应保留', 100, 350);
      ctx.fillStyle = '#f0f0f0'; ctx.fillRect(150, 1050, 650, 3);
      ctx.fillStyle = '#888'; ctx.fillRect(150, 1150, 650, 8);
      ctx.strokeStyle = '#2455ae'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(160, 1300); ctx.lineTo(450, 1330); ctx.lineTo(800, 1290); ctx.stroke();
      ctx.strokeStyle = '#ba2838'; ctx.lineWidth = 8; ctx.strokeRect(150, 1450, 130, 100);
      for (let col = 0; col < 2; col++) {
        const left = 1120 + col * 1000, top = 100, cw = 99, ch = 100;
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5; ctx.strokeRect(left, top, cw * 9, ch * 20);
        for (let y = 0; y < 20; y++) for (let x = 0; x < 9; x++) {
          ctx.strokeRect(left + x * cw, top + y * ch, cw, ch);
          ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.ellipse(left + (x + .5) * cw, top + (y + .5) * ch, 40, 42, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          if (col === 0 && (x + y) % 5 !== 0) { ctx.fillStyle = '#626262'; ctx.font = '46px "Noto Serif CJK SC",serif'; ctx.fillText('春山江海风云天地人'[ (y * 9 + x) % 9 ], left + x * cw + 24, top + y * ch + 68); }
        }
      }
      const pixels = ctx.getImageData(0, 0, source.width, source.height); let seed = 71;
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const grain = (seed / 4294967296 - .5) * 12;
        const shade = .72 + .21 * x / source.width - .12 * Math.exp(-Math.pow((x - 1350) / 160, 2));
        const i = (y * source.width + x) * 4;
        pixels.data[i] = pixels.data[i] * shade + grain;
        pixels.data[i + 1] = pixels.data[i + 1] * shade * .97 + grain;
        pixels.data[i + 2] = pixels.data[i + 2] * shade * .93 + grain;
      }
      ctx.putImageData(pixels, 0, 0); const url = source.toDataURL('image/png');
      const output = [];
      for (const [name, api] of [['v0.19', BeforeScan], ['v0.20', AfterScan]]) {
        const renderer = await api.createScanRenderer({});
        const image = await renderer.read(url);
        const corners = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
        const result = await api.processScanPixels(image, corners, { readCode: false });
        const jpeg = await renderer.exportImage(result.image); renderer.dispose();
        const img = new Image(); await new Promise(resolve => { img.onload = resolve; img.src = jpeg; });
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const c = canvas.getContext('2d'); c.drawImage(img, 0, 0); const data = c.getImageData(0, 0, img.width, img.height).data;
        const at = (x,y) => Array.from(data.slice((Math.round(y / 2240 * (img.height - 1)) * img.width + Math.round(x / 3200 * (img.width - 1))) * 4, (Math.round(y / 2240 * (img.height - 1)) * img.width + Math.round(x / 3200 * (img.width - 1))) * 4 + 3));
        const paper = []; for(let y=500;y<800;y+=2)for(let x=150;x<800;x+=2)paper.push(at(x,y)[0]);
        const mean = paper.reduce((a,b)=>a+b,0)/paper.length, sigma = Math.sqrt(paper.reduce((a,b)=>a+(b-mean)**2,0)/paper.length);
        const stroke = sourceY => { const values=[]; for(let x=250;x<700;x+=3)values.push(Math.min(...[-2,-1,0,1,2].map(d=>at(x,sourceY+d)[0])));return values.reduce((a,b)=>a+b,0)/values.length; };
        output.push({name,width:img.width,height:img.height,bytes:Math.ceil((jpeg.length-jpeg.indexOf(',')-1)*3/4),paperMean:mean,paperSigma:sigma,pencil:stroke(1051),ink:stroke(1154),blue:at(450,1330),red:at(150,1500)});
        const section = document.createElement('section'); section.style.cssText='display:inline-block;vertical-align:top;width:730px;margin:4px;font:18px sans-serif';
        const label=document.createElement('p');label.textContent=`${name} · ${img.width}×${img.height} · 合成样张`;section.appendChild(label);
        img.style.cssText='width:720px;display:block;border:1px solid #ddd';section.appendChild(img);
        // Identical field of view, identical display size; no mismatched zoom.
        const crop=document.createElement('canvas');crop.width=720;crop.height=360;crop.getContext('2d').drawImage(canvas,1100/3200*canvas.width,600/2240*canvas.height,900/3200*canvas.width,450/2240*canvas.height,0,0,720,360);section.appendChild(crop);document.body.appendChild(section);
      }
      return output;
    });
    const [oldScan, newScan] = results;
    assert.equal(oldScan.width, 1800); assert.equal(newScan.width, 2400);
    assert.ok(newScan.paperMean >= 251 && newScan.paperMean > oldScan.paperMean + 1);
    assert.ok(newScan.paperSigma < oldScan.paperSigma);
    assert.ok(newScan.ink < oldScan.ink - 5, 'grey ink contrast improves');
    assert.ok(newScan.pencil > 210 && newScan.pencil < 246, 'faint pencil remains visible after JPEG');
    assert.ok(newScan.blue[2]-newScan.blue[0]>80 && newScan.red[0]-newScan.red[1]>80);
    assert.ok(newScan.bytes <= 1536 * 1024);
    const artifact = path.join(root, `outputs/scan-quality-${version}-${date}.png`);
    await page.screenshot({path:artifact,fullPage:true});
    fs.writeFileSync(path.join(root, `outputs/scan-quality-${version}-${date}.json`),JSON.stringify({baseline,synthetic:true,results},null,2)+'\n');
    console.log(JSON.stringify({results,artifact}));
  } finally { await browser?.close(); await new Promise(resolve=>server?server.close(resolve):resolve()); }
})().catch(error=>{console.error(error);process.exitCode=1;});
