// Generated fictional work: no user documents, account IDs or network access.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createImagePdf } from '../src/platform/imagePdf.js';
import { encodePaperCode } from '../src/services/paperWorkflow.js';
const require=createRequire(import.meta.url);
export async function writePdfScanFixture(filePath: string) {
  const {createCanvas}=require('@napi-rs/canvas'),qrcode=require('qrcode-generator'),chunks=[];
  const writer=await createImagePdf(bytes=>chunks.push(Buffer.from(bytes)));
  for(let student=1;student<=2;student++)for(let page=1;page<=2;page++){
    const canvas=createCanvas(1600,1132),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,1132);
    ctx.fillStyle='#263d34';ctx.font='48px sans-serif';ctx.fillText(`Student ${student} / ${page}`,100,100);
    const qr=qrcode(0,'M');qr.addData(encodePaperCode({id:`pdf-check-student-${student}`},page,2));qr.make();
    for(let y=0;y<qr.getModuleCount();y++)for(let x=0;x<qr.getModuleCount();x++)if(qr.isDark(y,x))ctx.fillRect(150+(x+4)*7,200+(y+4)*7,7,7);
    for(let y=600;y<1050;y+=50)ctx.fillRect(150,y,1300,2);
    await writer.addPage(canvas.toBuffer('image/jpeg'),1600,1132,{width:1190.55,height:841.89});
  }
  await writer.finish();fs.writeFileSync(filePath,Buffer.concat(chunks));
}
