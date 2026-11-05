<script setup>
import { getCurrentInstance, ref } from 'vue';
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app';
import { installPdfCanvasGlobals, pdfCanvasContext } from './pdfCanvas.js';
import { pdfPageSize, PDF_DPI, MAX_PDF_BYTES, pdfImportError } from '../platform/pdfImport.js';
import { createScanProcessor } from '../platform/scanProcessor.js';
import { decodePaperCode, paperId } from '../services/paperWorkflow.js';
const progress=ref('正在打开PDF…'),error=ref(''),busy=ref(true),scope=getCurrentInstance().proxy;
let channel,alive=true,delivered=false,task,renderTask,outputs=[],resolveCanvas;
const processor=createScanProcessor();
const canvasReady=new Promise(resolve=>{resolveCanvas=resolve;});
function cancel(){renderTask?.cancel();task?.destroy().catch(()=>{});uni.navigateBack();}
// #ifdef MP-WEIXIN
const read=path=>new Promise((resolve,reject)=>uni.getFileSystemManager().readFile({filePath:path,success:r=>resolve(new Uint8Array(r.data)),fail:()=>reject(new Error('PDF或所需字体文件无法读取，请重试。'))}));
class NativeCanvasFactory {
  create(width,height){const canvas=wx.createOffscreenCanvas({type:'2d',width,height});return {canvas,context:pdfCanvasContext(canvas)};}
  reset(item,width,height){item.canvas.width=width;item.canvas.height=height;item.context=pdfCanvasContext(item.canvas);}
  destroy(item){item.canvas.width=item.canvas.height=1;item.canvas=null;item.context=null;}
  getNoAlphaContext(canvas){return pdfCanvasContext(canvas);}
}
class NativeBinaryFactory {
  constructor(options){Object.assign(this,options);}
  fetch({kind,filename}){if(!/^[\w.-]+$/.test(filename)||!this[kind])throw new Error('PDF资源路径无效。');const fs=uni.getFileSystemManager();
    if(!fs.readCompressedFile)throw new Error('当前微信版本不支持PDF字体读取，请更新微信后重试。');
    return new Promise((resolve,reject)=>fs.readCompressedFile({filePath:(this[kind]+filename+'.br').replace(/^\//,''),compressionAlgorithm:'br',success:result=>resolve(new Uint8Array(result.data)),fail:()=>reject(new Error('PDF字体文件读取失败，请重试。'))}));}
}
class NativeFilters {
  addFilter(){return 'none';} addHCMFilter(){return 'none';} addAlphaFilter(){return 'none';} addLuminosityFilter(){return 'none';} addKnockoutFilter(){return 'none';} destroy(){}
}
function loadPackage(name){return new Promise((resolve,reject)=>wx.loadSubpackage({name,success:resolve,fail:()=>reject(new Error('PDF模块加载失败，请检查网络后重试。'))}));}
async function convert({file,remaining}) {
  try {
    if(!file?.path||file.size>MAX_PDF_BYTES)throw new Error('请选择50 MB以内的PDF文件。');
    progress.value='正在加载PDF模块与字体…';
    await Promise.all([loadPackage('pdf-fonts'),loadPackage('pdf-cmaps')]);
    if(!alive)return;
    installPdfCanvasGlobals();
    // Compiled separately into this subpackage; never added to the main vendor.
    const loadEngine=require;
    const engine=loadEngine('./engine.js');
    globalThis.pdfjsWorker={WorkerMessageHandler:engine.WorkerMessageHandler};
    const data=await read(file.path);
    if(!alive)return;
    task=engine.getDocument({data,disableFontFace:true,useSystemFonts:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,
      useWorkerFetch:false,useWasm:false,isEvalSupported:false,stopAtErrors:true,disableWorkerRendering:true,
      CanvasFactory:NativeCanvasFactory,BinaryDataFactory:NativeBinaryFactory,FilterFactory:NativeFilters,
      cMapUrl:'/pdf-cmaps/cmaps/',standardFontDataUrl:'/pdf-fonts/fonts/',cMapPacked:true});
    const doc=await task.promise;
    if(doc.numPages>remaining)throw new Error(`PDF共${doc.numPages}页，本批只剩${remaining}页，请分批导入。`);
    const canvas=await canvasReady;
    if(!canvas)throw new Error('当前微信不支持PDF画布，请更新微信后重试。');
    for(let i=1;i<=doc.numPages&&alive;i++){
      progress.value=`正在导入 ${i} / ${doc.numPages} 页`;
      const page=await doc.getPage(i),base=page.getViewport({scale:1}),size=pdfPageSize(base.width,base.height);
      canvas.width=size.width;canvas.height=size.height;
      try {
        renderTask=page.render({canvasContext:pdfCanvasContext(canvas),viewport:page.getViewport({scale:size.scale}),background:'rgb(255,255,255)'});
        await renderTask.promise;renderTask=null;
        if(!alive)break;
        const path=await new Promise((resolve,reject)=>uni.canvasToTempFilePath({canvas,fileType:'png',width:size.width,height:size.height,destWidth:size.width,destHeight:size.height,success:r=>resolve(r.tempFilePath),fail:()=>reject(new Error('PDF页面导出失败，请检查设备存储后重试。'))},scope));
        if(!alive){uni.getFileSystemManager().unlink({filePath:path,fail:()=>{}});break;}
        const saved=await new Promise((resolve,reject)=>uni.saveFile({tempFilePath:path,success:r=>resolve(r.savedFilePath),fail:()=>reject(new Error('PDF页面保存失败，请检查设备存储。'))}));
        if(!alive){uni.getFileSystemManager().unlink({filePath:saved,fail:()=>{}});break;}
        const photo={id:paperId('photo'),url:saved,name:`${file.name} · 第${i}页`,sample:false,original:false,pdfRendered:true,width:size.width,height:size.height,pdf:{fileName:file.name,page:i,total:doc.numPages,dpi:PDF_DPI}};
        const row={id:paperId('scan'),photo,code:'',corrected:false,manual:false};outputs.push(row);
        try {
          const ratio=Math.min(1,1600/Math.max(size.width,size.height)),small=wx.createOffscreenCanvas({type:'2d',width:Math.round(size.width*ratio),height:Math.round(size.height*ratio)}),ctx=small.getContext('2d');
          ctx.drawImage(canvas,0,0,small.width,small.height);
          const result=await processor.process(ctx.getImageData(0,0,small.width,small.height),[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],{identifyOnly:true});
          decodePaperCode(result.code);row.code=result.code.trim();small.width=small.height=1;
        }catch{/* Valid PDF page can always be matched manually. */}
      } finally {canvas.width=canvas.height=1;page.cleanup();}
      await new Promise(resolve=>setTimeout(resolve,16));
    }
    if(!alive)return;
    delivered=true;channel.emit('rendered',outputs);uni.navigateBack();
  } catch(failure){if(alive){error.value=pdfImportError(failure);busy.value=false;}}
  finally {await task?.destroy().catch(()=>{});task=null;}
}
onLoad(()=>{channel=scope.getOpenerEventChannel();channel.on('document',convert);});
onReady(()=>uni.createSelectorQuery().in(scope).select('#pdf-canvas').fields({node:true}).exec(result=>resolveCanvas(result[0]?.node)));
// #endif
onUnload(()=>{
  alive=false;renderTask?.cancel();task?.destroy().catch(()=>{});processor.dispose();
  if(!delivered){channel?.emit('cancelled',error.value||'已取消PDF导入。');
    // #ifdef MP-WEIXIN
    for(const output of outputs)uni.getFileSystemManager().unlink({filePath:output.photo.url,fail:()=>{}});
    // #endif
  }
});
</script>
<template><view class="pdf-import-page"><view class="pdf-import-title">导入PDF作业</view><view class="pdf-import-progress" role="status">{{ error || progress }}</view><view class="small subtle">按页导入，完成后可核对学生和页码。</view><button class="secondary full-width spaced" @click="cancel">{{ busy ? '取消导入' : '返回文件上传' }}</button><canvas id="pdf-canvas" type="2d" class="pdf-import-canvas" /></view></template>
<style scoped>.pdf-import-page{padding:80px 24px 24px;padding-top:calc(80px + env(safe-area-inset-top));}.pdf-import-title{font-size:22px;font-weight:700;margin-bottom:20px;}.pdf-import-progress{line-height:1.8;margin-bottom:16px;}.pdf-import-canvas{position:fixed;left:-10000px;top:-10000px;width:100px;height:100px;}</style>
