export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const PDF_DPI = 200;
export function pdfImportError(error) {
  if(error?.name==='PasswordException')return '该PDF有密码保护，请先解除密码后上传。';
  if(error?.name==='InvalidPDFException')return 'PDF文件损坏或格式无法识别，请重新导出后上传。';
  return error?.message||'PDF导入失败，请检查文件是否完整。';
}
export function pdfPageSize(width, height) {
  const scale=Math.min(PDF_DPI/72,4200/Math.max(width,height),Math.sqrt(10_000_000/(width*height)));
  return {scale,width:Math.ceil(width*scale),height:Math.ceil(height*scale)};
}
export function scanFileKind(file) {
  const name=file.name||'', type=file.type||'';
  if(type==='application/pdf'||/\.pdf$/i.test(name)) return 'pdf';
  if(/^image\/(jpeg|png|webp)$/.test(type)||/\.(jpe?g|png|webp)$/i.test(name)) return 'image';
  throw new Error('请选择 JPG、PNG、WebP 图片或 PDF 文件。');
}
export function validateScanFiles(files, remaining) {
  if(files.length>remaining) throw new Error(`本批还可添加 ${remaining} 页，请分批导入。`);
  for(const file of files) {
    const kind=scanFileKind(file),limit=kind==='pdf'?MAX_PDF_BYTES:20*1024*1024;
    if(!Number.isFinite(file.size)||file.size<=0||file.size>limit) throw new Error(kind==='pdf'?'单份PDF需在50 MB以内。':'单张图片需在20 MB以内。');
  }
  return files;
}
let browserEngine;
// #ifdef H5
export function chooseBrowserScanUploads(remaining) {
  return new Promise((resolve,reject)=>{
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,application/pdf,.pdf';input.multiple=true;
    input.oncancel=()=>resolve([]);input.onchange=()=>{try{resolve(validateScanFiles(Array.from(input.files||[]),remaining));}catch(error){reject(error);}};input.click();
  });
}
export async function browserPdfEngine() {
  browserEngine ||= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'),import('pdfjs-dist/legacy/build/pdf.worker.mjs')]).then(([engine,worker])=>{
    globalThis.pdfjsWorker={WorkerMessageHandler:worker.WorkerMessageHandler};return engine;
  });
  return browserEngine;
}
export async function* browserPdfPages(file, remaining, cancelled=()=>false) {
  const engine=await browserPdfEngine();
  const task=engine.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWasm:false,stopAtErrors:true,
    cMapUrl:'/pdf-cmaps/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdf-fonts/fonts/'});
  let doc;
  try {
    doc=await task.promise;
    if(doc.numPages>remaining) throw new Error(`${file.name}共${doc.numPages}页，本批只剩${remaining}页，请分批导入。`);
    for(let pageNumber=1;pageNumber<=doc.numPages&&!cancelled();pageNumber++) {
      const page=await doc.getPage(pageNumber),base=page.getViewport({scale:1}),size=pdfPageSize(base.width,base.height);
      const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      try {
        await page.render({canvasContext:canvas.getContext('2d'),viewport:page.getViewport({scale:size.scale}),background:'rgb(255,255,255)'}).promise;
        if(cancelled()) return;
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob) throw new Error('PDF页面无法生成图片，请重试。');
        yield {file:new File([blob],`${file.name} · 第${pageNumber}页.png`,{type:'image/png'}),pdf:{fileName:file.name,page:pageNumber,total:doc.numPages,dpi:PDF_DPI}};
      } finally { canvas.width=canvas.height=1;page.cleanup(); }
    }
  } catch(error) {
    throw new Error(pdfImportError(error));
  } finally { await task.destroy(); }
}
// #endif
// #ifdef MP-WEIXIN
export function chooseDeviceScanUploads(remaining) {
  return new Promise((resolve,reject)=>uni.showActionSheet({itemList:['从相册选择图片','选择图片或PDF文件'],success:result=>{
    if(result.tapIndex===0) uni.chooseImage({count:Math.min(9,remaining),sourceType:['album'],sizeType:['original'],success:result=>{
      try {resolve(validateScanFiles(result.tempFiles.map((f,i)=>({name:`相册图片${i+1}.jpg`,path:f.path,size:f.size})),remaining));}catch(error){reject(error);}
    },fail:error=>/cancel/.test(error.errMsg)?resolve([]):reject(new Error('选择图片失败，请重试。'))});
    else wx.chooseMessageFile({count:Math.min(100,remaining),type:'file',extension:['jpg','jpeg','png','webp','pdf'],success:result=>{
      try {resolve(validateScanFiles(result.tempFiles,remaining));}catch(error){reject(error);}
    },fail:error=>/cancel/.test(error.errMsg)?resolve([]):reject(new Error('选择文件失败，请重试。'))});
  },fail:error=>/cancel/.test(error.errMsg)?resolve([]):reject(new Error('无法打开文件选择。'))}));
}
export function devicePdfPages(file, remaining) {
  return new Promise((resolve,reject)=>{
    let settled=false;
    uni.navigateTo({url:'/pdf-import/index',events:{rendered:photos=>{settled=true;setTimeout(()=>resolve(photos),150);},cancelled:message=>{settled=true;reject(new Error(message||'已取消PDF导入。'));}},
      success:result=>result.eventChannel.emit('document',{file,remaining}),fail:()=>{if(!settled)reject(new Error('PDF导入页面未能打开，请重试。'));}});
  });
}
// #endif
