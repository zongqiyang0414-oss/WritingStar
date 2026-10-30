// Reproducible synthetic quality comparison; user screenshots are never copied
// into the repository. Optional SCAN_V015_PRIVATE_DIRECTORY holds local RGBA
// crops + hand-marked JSON corners, e.g. reference-2.{rgba,json}.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {deflateSync} from 'node:zlib';
import * as current from '../src/platform/documentScan.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const baselineDirectory=process.env.SCAN_V015_BASELINE_DIRECTORY;
if(!baselineDirectory) throw new Error('Set SCAN_V015_BASELINE_DIRECTORY to documentScan.js and scanGeometry.js from v0.14.0.');
const baseline=await import(pathToFileURL(path.resolve(baselineDirectory,'documentScan.js')).href);
type Point={x:number;y:number};
type Pixels={width:number;height:number;data:Uint8ClampedArray};
const copy=(image:Pixels)=>({...image,data:image.data.slice()});
const luma=(data:Uint8ClampedArray,i:number)=>(77*data[i]+150*data[i+1]+29*data[i+2])/256;
const inside=(quad:Point[],x:number,y:number)=>quad.every((a,i)=>{const b=quad[(i+1)%4];return (b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x)>=0;});

function detectionScene(sameLuminance=false) {
  const width=480,height=640,data=new Uint8ClampedArray(width*height*4);
  const corners=[{x:100/479,y:90/639},{x:386/479,y:98/639},{x:370/479,y:540/639},{x:89/479,y:526/639}];
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const onPaper=inside(corners,x/479,y/639),grain=2*Math.sin(x*.11+y*.9)+1.3*Math.sin(y*.33);
    let rgb:number[];
    if(onPaper) {
      const light=sameLuminance?1:1-.28*y/height;
      rgb=(sameLuminance?[175,175,175]:[222,219,217]).map(v=>v*light);
      if(x>140&&x<340&&y>130&&y<490&&(x<142||x>338||y<132||y>488)) rgb=[65,65,65];
    } else {
      const light=y>590?.55:.88;
      rgb=sameLuminance?[180+grain,178+grain,145+grain]:[190*light+grain,184*light+grain,163*light+grain];
    }
    data.set([...rgb,255],(y*width+x)*4);
  }
  return {image:{width,height,data},corners};
}

function enhancementScene():Pixels {
  const width=360,height=510,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const illumination=.95-.4*(x/width)*(.3+.7*y/height)-.18*Math.exp(-(((x-190-y*.08)/65)**2));
    let reflectance=[1,1,1];
    // Fine frame and short glyph-like marks, all explicitly synthetic.
    if(x>29&&x<331&&y>34&&y<476&&(x<31||x>329||y<36||y>474)) reflectance=[.16,.16,.16];
    if(x>42&&x<146&&y>48&&y<61&&((x-42)%9<2||(y-48)%6<2)) reflectance=[.12,.12,.12];
    if(x>48&&x<290&&y>416&&y<445&&((x-48)%10<2||(y-416)%10<2)) reflectance=[.16,.16,.16];
    if(x>65&&x<271&&y>177&&y<180) reflectance=[.80,.80,.80];
    if(x>65&&x<270&&Math.abs(y-(241+5*Math.sin(x*.07)))<1.5) reflectance=[.15,.30,.83];
    const radius=Math.hypot(x-263,y-361);
    if(radius>22&&radius<25) reflectance=[.80,.15,.16];
    data.set([236*illumination*reflectance[0],226*illumination*reflectance[1],208*illumination*reflectance[2],255],(y*width+x)*4);
  }
  return {width,height,data};
}

function enhancementMetrics(image:Pixels) {
  const values:number[]=[];
  for(let y=75;y<390;y+=5) for(let x=45;x<315;x+=5) {
    if(y>165&&y<190||y>225&&y<255||Math.hypot(x-263,y-361)<30) continue;
    values.push(luma(image.data,(y*image.width+x)*4));
  }
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  const sample=(x:number,y:number)=>Array.from(image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+3));
  return {blankMean:+mean.toFixed(2),blankStd:+Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length).toFixed(2),
    pencilContrast:+(luma(image.data,(171*image.width+120)*4)-luma(image.data,(178*image.width+120)*4)).toFixed(2),
    blueRGB:sample(120,Math.round(241+5*Math.sin(120*.07))),redRGB:sample(286,361)};
}

// Small standalone PNG writer using only Node built-ins.
function crc32(bytes:Uint8Array) {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(name:string,bytes:Buffer){const type=Buffer.from(name),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([type,bytes])));return Buffer.concat([len,type,bytes,crc]);}
function png(image:Pixels) {
  const {width,height,data}=image,header=Buffer.alloc(13),rows=Buffer.alloc(height*(width*4+1));
  header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  for(let y=0;y<height;y++) rows.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function cornerError(found:any,expected:Point[],image:Pixels) {
  return found?expected.map(p=>+Math.min(...found.corners.map((q:Point)=>Math.hypot((p.x-q.x)*(image.width-1),(p.y-q.y)*(image.height-1)))).toFixed(2)):null;
}
const report:any={baseline:'v0.14.0 / 6f6736f',version:'0.15.0',measurement:'Synthetic pixel quality; 0..255 luminance; corner error in source pixels. Does not measure phone timing or guarantee camera accuracy.',detection:[],enhancement:{}};
for(const sameLuminance of [false,true]) {
  const {image,corners}=detectionScene(sameLuminance);
  const before=baseline.analyzeDocument(image),after=current.analyzeDocument(image);
  report.detection.push({scene:sameLuminance?'similar-luminance-paper-vs-warm-desk':'shadowed-paper-on-wood-with-desk-edge',before:{corners:before?.corners??null,confidence:before?.confidence??0,error:cornerError(before,corners,image)},after:{corners:after?.corners??null,confidence:after?.confidence??0,error:cornerError(after,corners,image)}});
}
const original=enhancementScene(),before=await baseline.enhanceDocument(copy(original)),after=await current.enhanceDocument(copy(original));
for(const [name,image] of [['input',original],['v014',before],['v015',after]] as const) {
  report.enhancement[name]=enhancementMetrics(image);
  fs.writeFileSync(path.join(root,`outputs/scan-enhancement-${name}-synthetic-v015.png`),png(image));
}
const panels=[['Synthetic camera input',original],['v0.14 grayscale correction',before],['v0.15 color paper restoration',after]] as const;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1152" height="580" viewBox="0 0 1152 580"><rect width="1152" height="580" fill="#edf2ef"/>${panels.map(([name,image],i)=>`<text x="${i*380+16}" y="28" font-family="sans-serif" font-size="17" fill="#173e32">${name}</text><image x="${i*380+16}" y="43" width="360" height="510" href="data:image/png;base64,${png(image).toString('base64')}"/>`).join('')}<text x="16" y="574" font-family="sans-serif" font-size="12" fill="#50635c">Synthetic fixture only: paper cast, uneven shadows, fine frame, faint pencil, blue ink and red stamp.</text></svg>`;
fs.writeFileSync(path.join(root,'outputs/scan-enhancement-comparison-v015.svg'),svg);
fs.writeFileSync(path.join(root,'outputs/scan-quality-v015.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

const privateDirectory=process.env.SCAN_V015_PRIVATE_DIRECTORY;
if(privateDirectory) {
  const results=[];
  for(const n of [1,2]) {
    const meta=JSON.parse(fs.readFileSync(path.join(privateDirectory,`reference-${n}.json`),'utf8'));
    const image={width:meta.width,height:meta.height,data:new Uint8ClampedArray(fs.readFileSync(path.join(privateDirectory,`reference-${n}.rgba`)))};
    const old=baseline.analyzeDocument(image),next=current.analyzeDocument(image);
    const output=await current.enhanceDocument(await current.rectifyDocument(image,meta.corners));
    fs.writeFileSync(path.join(privateDirectory,`reference-${n}-v015.png`),png(output));
    results.push({n,before:{corners:old?.corners??null,error:cornerError(old,meta.corners,image)},after:{corners:next?.corners??null,error:cornerError(next,meta.corners,image)}});
  }
  fs.writeFileSync(path.join(privateDirectory,'quality-v015.json'),JSON.stringify({limitation:'Screenshots include green UI crop overlays; manual approximate corners; not unmodified camera frames.',results},null,2)+'\n');
  console.log('Private screenshot comparison saved only in '+privateDirectory);
}
