import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
const root=fileURLToPath(new URL('..',import.meta.url)),native=process.argv[2]==='mp-weixin';
const output=path.join(root,'dist/build',native?'mp-weixin':'h5'),pdf=path.join(root,'node_modules/pdfjs-dist');
await mkdir(output,{recursive:true});
if(native){
  const entry=path.join(output,'pdf-import/engine.js');
  const licenses=JSON.stringify({pdfjs:await readFile(path.join(pdf,'LICENSE'),'utf8'),streams:await readFile(path.join(root,'node_modules/web-streams-polyfill/LICENSE'),'utf8')});
  await build({stdin:{contents:"export const THIRD_PARTY_LICENSES="+licenses+";export {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';export {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';",resolveDir:root},bundle:true,minify:true,platform:'browser',format:'cjs',target:'es2020',supported:{'dynamic-import':false},define:{process:'undefined'},outfile:entry,external:['node:*','@napi-rs/canvas']});
  const nodes=[parse(await readFile(entry,'utf8'),{sourceType:'script',createImportExpressions:true})];
  while(nodes.length){const node=nodes.pop();if(node.type==='ImportExpression'||node.type==='ImportDeclaration')throw new Error('Native PDF engine must use CommonJS, without dynamic import syntax.');for(const value of Object.values(node)){if(Array.isArray(value))nodes.push(...value.filter(item=>item&&typeof item.type==='string'));else if(value&&typeof value==='object'&&typeof value.type==='string')nodes.push(value);}}
}
for(const [source,destination] of [['standard_fonts','pdf-fonts/fonts'],['cmaps','pdf-cmaps/cmaps']]) {
  const from=path.join(pdf,source),to=path.join(output,destination);
  await rm(to,{recursive:true,force:true});await mkdir(to,{recursive:true});
  if(native) {
    // DevTools excludes .pfb/.bcmap from upload. .br is an allowed resource
    // format and readCompressedFile restores the original bytes on device.
    for(const file of await readdir(from,{withFileTypes:true}))if(file.isFile()) {
      const original=await readFile(path.join(from,file.name));
      await writeFile(path.join(to,file.name+'.br'),brotliCompressSync(original));
    }
  } else await cp(from,to,{recursive:true});
}
await mkdir(path.join(output,'pdf-import'),{recursive:true});
for(const name of ['LICENSE'])await cp(path.join(pdf,name),path.join(output,'pdf-import',name));
await cp(path.join(root,'node_modules/web-streams-polyfill/LICENSE'),path.join(output,'pdf-import/LICENSE.web-streams-polyfill'));
console.log('PDF.js engine/resources prepared in separate packages; document conversion stays on-device.');
