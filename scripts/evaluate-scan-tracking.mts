// Evaluation only. OpenCV and jscanify are not production dependencies.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
type Point = { x: number; y: number };
const perspective: Point[] = [{ x: .19, y: .11 }, { x: .81, y: .17 }, { x: .89, y: .87 }, { x: .13, y: .92 }];
function fixture(quad: Point[], options: { paper?: number; desk?: number; shadow?: number; printOnly?: boolean; noise?: number; blur?: boolean } = {}) {
  const width = 420, height = 500, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x / (width - 1), py = y / (height - 1);
    const distances = quad.map((a, i) => {
      const b = quad[(i + 1) % 4];
      return ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
    });
    const inside = distances.every(distance => distance >= 0);
    let value = inside ? (options.paper ?? 235) - (options.shadow ?? 0) * px : (options.desk ?? 65);
    if (options.printOnly) value = inside && Math.min(...distances) < .004 ? 40 : 230;
    if (inside && px > .3 && px < .7 && py > .25 && py < .7 && y % 37 < 2) value = 45;
    value += (options.noise ?? 0) * ((x * 13 + y * 7) % 7 - 3) / 3;
    const index = (y * width + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = value; data[index + 3] = 255;
  }
  if (options.blur) {
    const original = data.slice();
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      const value = (original[index] * 4 + original[index - 4] + original[index + 4] + original[index - width * 4] + original[index + width * 4]) / 8;
      data[index] = data[index + 1] = data[index + 2] = value;
    }
  }
  return { width, height, data };
}

const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=process.env.SCAN_STUDY_BASELINE_DIRECTORY;
if(!baseline) throw new Error('Set SCAN_STUDY_BASELINE_DIRECTORY to documentScan.js and scanGeometry.js extracted from commit 11072a1.');
const {analyzeDocument:before}=await import(pathToFileURL(path.join(baseline,'documentScan.js')).href);
import { analyzeDocument as after } from '../src/platform/documentScan.js';
const require=createRequire(import.meta.url);
const cvPath=process.env.SCAN_STUDY_OPENCV_MODULE, jscanifyPath=process.env.SCAN_STUDY_JSCANIFY_MODULE;
if(!cvPath || !jscanifyPath) throw new Error('Set SCAN_STUDY_OPENCV_MODULE and SCAN_STUDY_JSCANIFY_MODULE to local evaluation-only files.');
const t=performance.now();const cv=await require(cvPath);const initializeMs=performance.now()-t;
globalThis.cv=cv;const Jscanify=require(jscanifyPath);const scanner=new Jscanify();
function upstream(image) {
 const input=cv.matFromImageData(image),small=new cv.Mat();
 cv.resize(input,small,new cv.Size(Math.round(image.width*384/image.height),384));
 const contour=scanner.findPaperContour(small);
 let corners=null;
 if(contour){const c=scanner.getCornerPoints(contour);corners=[c.topLeftCorner,c.topRightCorner,c.bottomRightCorner,c.bottomLeftCorner];if(corners.some(p=>!p))corners=null;else corners=corners.map(p=>({x:p.x/(small.cols-1),y:p.y/(small.rows-1)}));contour.delete();}
 input.delete();small.delete();return {corners};
}
function measure(fn){fn();fn();const ms=[];let result;for(let i=0;i<7;i++){const t=performance.now();result=fn();ms.push(performance.now()-t);}ms.sort((a,b)=>a-b);return {medianMs:+ms[3].toFixed(2),corners:result?.corners||null};}
const cases=[['plain',{}],['lowContrast',{paper:235,desk:223,noise:1,blur:true}],['shadow',{paper:240,desk:75,shadow:110,noise:2,blur:true}],['printedFrame',{printOnly:true}]];
const result={opencvVersion:'4.11.0-release.1',opencvFileBytes:fs.statSync(cvPath).size,initializeMs:+initializeMs.toFixed(2),runtime:process.version,sceneResults:[]};
for(const [scene,options] of cases){const image=fixture(perspective,options);const initial=before(image);result.sceneResults.push({scene,before:measure(()=>before(image)),tracked:initial?measure(()=>after(image,{previousCorners:initial.corners,trackingOnly:true})):null,opencvJscanify:measure(()=>upstream(image))});}
fs.writeFileSync(path.join(root,'outputs/scan-tracking-comparison-20261030.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
