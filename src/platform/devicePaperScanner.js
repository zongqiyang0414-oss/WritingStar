import { detectPaperCorners, readStudentCode, rectifyPaperPixels, paperOutputSize } from "./documentScanner.js";
import { paperId } from "../services/paperWorkflow.js";
import { enhanceDocument } from "./documentScan.js";
function call(api, args, scope) {
  return new Promise((resolve, reject) => uni[api]({ ...args, success: resolve, fail: () => reject(new Error("扫描处理失败，请重新选图或使用人工确认。")) }, scope));
}
export function chooseDeviceScanImages(remaining) {
  return new Promise((resolve, reject) => uni.chooseImage({count: Math.min(9, remaining), sourceType: ["camera", "album"], sizeType: ["compressed"],
    success: result => {
      if (result.tempFiles.some(f => f.size > 20 * 1024 * 1024)) {reject(new Error("单张图片不能超过 20 MB。"));return;}
      resolve(result.tempFiles.map((f, i) => ({id:paperId("photo"),url:f.path,name:`扫描照片${i+1}`,sample:false})));
    }, fail: result => result.errMsg.includes("cancel") ? resolve([]) : reject(new Error("选图失败，请重试。")) }));
}
export async function preserveDeviceScan(photo) {
  const saved = await call("saveFile", {tempFilePath: photo.url});
  return {id:paperId("scan"),photo:{...photo,url:saved.savedFilePath},code:"",corrected:false,manual:false};
}
export async function processDeviceScan(photo, canvasId, scope, resize) {
  const info = await call("getImageInfo", {src: photo.url});
  const ratio = Math.min(1, 1600 / Math.max(info.width, info.height)), width = Math.round(info.width * ratio), height = Math.round(info.height * ratio);
  await resize(width, height);
  const ctx = uni.createCanvasContext(canvasId, scope); ctx.drawImage(info.path || photo.url, 0, 0, width, height);
  await new Promise(resolve => ctx.draw(false, resolve));
  const pixels = await call("canvasGetImageData", {canvasId, x:0, y:0, width, height}, scope);
  pixels.width = width; pixels.height = height;
  let code = readStudentCode(pixels), corrected = false;
  // Downsample before corner detection so the connected-component pass stays small.
  const scale = Math.min(1, 480 / Math.max(width, height)), sw = Math.round(width * scale), sh = Math.round(height * scale), small = new Uint8ClampedArray(sw * sh * 4);
  for(let y=0;y<sh;y++) for(let x=0;x<sw;x++) {const from=(Math.min(height-1,Math.round(y/scale))*width+Math.min(width-1,Math.round(x/scale)))*4,to=(y*sw+x)*4;for(let c=0;c<4;c++)small[to+c]=pixels.data[from+c];}
  const corners = detectPaperCorners({data:small,width:sw,height:sh})?.map(p=>({x:p.x/scale,y:p.y/scale}));
  let outputWidth=width,outputHeight=height, outputPixels=pixels;
  if(corners) {
    const size=paperOutputSize(corners,1000), output=rectifyPaperPixels(pixels,corners,size.width,size.height);outputWidth=output.width;outputHeight=output.height;
    await resize(outputWidth,outputHeight);
    await call("canvasPutImageData",{canvasId,x:0,y:0,width:outputWidth,height:outputHeight,data:output.data},scope);
    if(!code)code=readStudentCode(output);corrected=true;outputPixels=output;
  }
  await enhanceDocument(outputPixels);
  await call("canvasPutImageData",{canvasId,x:0,y:0,width:outputWidth,height:outputHeight,data:outputPixels.data},scope);
  const image = await call("canvasToTempFilePath",{canvasId,width:outputWidth,height:outputHeight,destWidth:outputWidth,destHeight:outputHeight,fileType:"jpg",quality:.8},scope);
  const saved = await call("saveFile",{tempFilePath:image.tempFilePath});
  return {id:paperId("scan"),photo:{...photo,url:saved.savedFilePath},code,corrected,manual:false};
}
