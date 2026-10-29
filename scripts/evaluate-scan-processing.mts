// Targeted local comparison. SCAN_STUDY_BASELINE_DIRECTORY contains
// documentScan.js and scanGeometry.js extracted from commit 27ec764.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {processScanPixels} from '../src/platform/scanProcessing.js';
import {readStudentCode} from '../src/platform/documentScanner.js';
import {qrMatrix} from '../src/platform/answerCards.js';
const directory=process.env.SCAN_STUDY_BASELINE_DIRECTORY;
if(!directory)throw new Error('Set SCAN_STUDY_BASELINE_DIRECTORY to the extracted 27ec764 baseline files.');
const before=await import(pathToFileURL(path.join(directory,'documentScan.js')).href);
const root=fileURLToPath(new URL('../',import.meta.url));
function image(withCode){
 const width=1600,height=2200,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,value=x>140&&x<1450&&y>100&&y<2100?(y%47<2&&x>400&&x<1200?80:210+x*.02):50;
  data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
 }
 if(withCode){
  const m=qrMatrix('WS1|profile-card|1|2|CHECK'),unit=6,left=1100,top=180,size=(m.length+8)*unit;
  for(let y=top;y<top+size;y++)for(let x=left;x<left+size;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=255;}
  for(let y=0;y<m.length;y++)for(let x=0;x<m.length;x++)if(m[y][x])for(let yy=0;yy<unit;yy++)for(let xx=0;xx<unit;xx++){const i=(((y+4)*unit+yy+top)*width+(x+4)*unit+xx+left)*4;data[i]=data[i+1]=data[i+2]=0;}
 }
 return {width,height,data};
}
// Published v0.13 code reading downsamples with one temporary view per pixel.
function oldRead(image){
 const scale=Math.min(1,1600/Math.max(image.width,image.height));if(scale===1)return readStudentCode(image);
 const width=Math.round(image.width*scale),height=Math.round(image.height*scale),data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(Math.min(image.height-1,Math.floor(y/scale))*image.width+Math.min(image.width-1,Math.floor(x/scale)))*4;data.set(image.data.subarray(i,i+4),(y*width+x)*4);}
 return readStudentCode({width,height,data});
}
const q=[{x:.09,y:.05},{x:.9,y:.055},{x:.91,y:.95},{x:.08,y:.945}];
async function original(source){let code=oldRead(source);const out=await before.rectifyDocument(source,q);if(!code)code=oldRead(out);return {image:await before.enhanceDocument(out),code};}
async function measure(fn){await fn();const times=[];let result;for(let i=0;i<3;i++){const t=performance.now();result=await fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {medianMs:+times[1].toFixed(2),result};}
const cases=[{scene:'printed-card',withCode:true,readCode:true},{scene:'custom-document-in-paper-inbox',withCode:false,readCode:true},{scene:'ordinary-document-scan',withCode:false,readCode:false}];
const report={baseline:'27ec764',version:'0.14.0',runtime:process.version,input:[1600,2200],measurement:'CPU pixel pipeline only; warm up once; median of three runs; excludes photo decode/JPEG export; not phone timing',cases:[]};
for(const c of cases){
 const source=image(c.withCode),old=await measure(()=>original(source)),next=await measure(()=>processScanPixels(source,q,{readCode:c.readCode}));
 let maxPixelDifference=0;for(let i=0;i<old.result.image.data.length;i++)maxPixelDifference=Math.max(maxPixelDifference,Math.abs(old.result.image.data[i]-next.result.image.data[i]));
 report.cases.push({scene:c.scene,oldMedianMs:old.medianMs,newMedianMs:next.medianMs,codePreserved:old.result.code===next.result.code,output:[next.result.image.width,next.result.image.height],maxPixelDifference});
}
fs.writeFileSync(path.join(root,'outputs/scan-processing-v014-20261030.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
