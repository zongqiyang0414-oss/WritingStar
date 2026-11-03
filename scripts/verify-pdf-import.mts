import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createImagePdf} from '../src/platform/imagePdf.js';
import {PdfMatrix,PdfPath,pdfCanvasContext,clonePdfMessage,installPdfCanvasGlobals} from '../src/platform/pdfCanvas.js';
import {pdfPageSize} from '../src/platform/pdfImport.js';
const require=createRequire(import.meta.url),native=require('@napi-rs/canvas');
const root=path.resolve('dist/build/mp-weixin'),context:any={
 console,performance,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,
 DOMMatrix:PdfMatrix,Path2D:PdfPath,ImageData:native.ImageData,structuredClone:value=>clonePdfMessage(value),
 ArrayBuffer,Uint8Array,Uint8ClampedArray,Int8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,
 Map,Set,WeakMap,WeakSet,
 module:{exports:{}},exports:{},require:()=>{throw Error('PDF engine must not load Node or network modules in the native runtime');},
};
context.globalThis=context;
installPdfCanvasGlobals(context);
vm.runInNewContext(fs.readFileSync(path.join(root,'pdf-import/engine.js'),'utf8'),context,{filename:'pdf-import/engine.js'});
const engine=context.module.exports;context.pdfjsWorker={WorkerMessageHandler:engine.WorkerMessageHandler};
let adapter=true;
const canvasContext=canvas=>adapter?pdfCanvasContext(canvas):canvas.getContext('2d');
class CanvasFactory{
 create(width,height){const canvas=native.createCanvas(Math.ceil(width),Math.ceil(height));return {canvas,context:canvasContext(canvas)};}
 reset(item,width,height){item.canvas.width=width;item.canvas.height=height;item.context=pdfCanvasContext(item.canvas);}
 destroy(item){item.canvas.width=item.canvas.height=1;item.canvas=null;item.context=null;}
 getNoAlphaContext(canvas){return pdfCanvasContext(canvas);}
}
class BinaryDataFactory{constructor(options){Object.assign(this,options);}async fetch({kind,filename}){return new Uint8Array(fs.readFileSync(path.join(root,this[kind],filename)));}}
class Filters{addFilter(){return 'none';}addHCMFilter(){return 'none';}addAlphaFilter(){return 'none';}addLuminosityFilter(){return 'none';}destroy(){}}
const options={disableFontFace:true,useSystemFonts:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,useWorkerFetch:false,useWasm:false,isEvalSupported:false,stopAtErrors:true,disableWorkerRendering:true,CanvasFactory,BinaryDataFactory,FilterFactory:Filters,cMapUrl:'pdf-cmaps/cmaps/',standardFontDataUrl:'pdf-fonts/fonts/'};
async function render(data,name){
 const loading=engine.getDocument({...options,data:new Uint8Array(data)}),doc=await loading.promise,results=[];
 try{
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),base=page.getViewport({scale:1}),size=pdfPageSize(base.width,base.height),canvas=native.createCanvas(size.width,size.height);
   await page.render({canvasContext:canvasContext(canvas),viewport:page.getViewport({scale:size.scale}),background:'rgb(255,255,255)'}).promise;
   const image=canvas.getContext('2d').getImageData(0,0,size.width,size.height);let dark=0;
   for(let i=0;i<image.data.length;i+=100)if(image.data[i]+image.data[i+1]+image.data[i+2]<600)dark++;
   assert.ok(dark>100,`${name} page ${n} must not be blank`);results.push({page:n,width:size.width,height:size.height,dark,pixelHash:createHash('sha256').update(image.data).digest('hex')});
   if(n===1)fs.writeFileSync(`/tmp/writingstar-pdf-${name}.png`,canvas.toBuffer('image/png'));
   page.cleanup();canvas.width=canvas.height=1;
  }
  return results;
 }catch(error){console.error('PDF_RENDER_FAILURE',error.message,error.stack?.split('\n').slice(0,5).join('\n'));throw error;}finally{await loading.destroy().catch(()=>{});}
}
const approved=await render(fs.readFileSync('assets/templates/fangyuan-front-back.pdf'),'vector-template');assert.equal(approved.length,2);
adapter=false;context.Path2D=native.Path2D;context.DOMMatrix=native.DOMMatrix;
const reference=await render(fs.readFileSync('assets/templates/fangyuan-front-back.pdf'),'reference-template');
context.structuredClone=globalThis.structuredClone;
const nativeCloneReference=await render(fs.readFileSync('assets/templates/fangyuan-front-back.pdf'),'native-clone-reference');
context.structuredClone=value=>clonePdfMessage(value);
assert.deepEqual(approved,reference,'path/matrix adapter must preserve every rendered pixel');
assert.deepEqual(approved,nativeCloneReference,'custom message clone must preserve fonts and pixels exactly like native structuredClone');
adapter=true;context.Path2D=PdfPath;context.DOMMatrix=PdfMatrix;
const chunks=[],writer=await createImagePdf(data=>{chunks.push(Buffer.from(data));});
for(let n=0;n<4;n++){
 const c=native.createCanvas(1600,1132),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=['#205a41','#804333','#234c84','#624a83'][n];ctx.fillRect(100,100,1400,25);ctx.font='70px sans-serif';ctx.fillText(`Student ${Math.floor(n/2)+1} - page ${n%2+1}`,120,250);ctx.strokeStyle='#222';for(let y=350;y<1000;y+=60){ctx.beginPath();ctx.moveTo(120,y);ctx.lineTo(1480,y);ctx.stroke();}
 await writer.addPage(c.toBuffer('image/jpeg'),c.width,c.height,{width:1190.55,height:841.89});
}
await writer.finish();const scanned=Buffer.concat(chunks);fs.writeFileSync('/tmp/writingstar-multiple-essays.pdf',scanned);
const photos=await render(scanned,'multiple-essays');assert.equal(photos.length,4);assert.ok(photos.every(p=>p.width>3300&&p.height>2300));
await assert.rejects(engine.getDocument({...options,data:new Uint8Array([1,2,3,4,5])}).promise);
console.log(JSON.stringify({nativeEngine:'No DOM, Worker, Node or network APIs; Canvas2D path adapter',vectorPages:approved,scannedPages:photos,malformedRejected:true}));
