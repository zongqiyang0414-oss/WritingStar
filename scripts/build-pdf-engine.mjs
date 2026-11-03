import { build } from 'esbuild';
import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
const root=fileURLToPath(new URL('..',import.meta.url)),native=process.argv[2]==='mp-weixin';
const output=path.join(root,'dist/build',native?'mp-weixin':'h5'),pdf=path.join(root,'node_modules/pdfjs-dist');
await mkdir(output,{recursive:true});
if(native){
  const entry=path.join(output,'pdf-import/engine.js');
  await build({stdin:{contents:"export {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';export {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';",resolveDir:root},bundle:true,minify:true,platform:'browser',format:'cjs',target:'es2020',supported:{'dynamic-import':false},define:{process:'undefined'},outfile:entry,external:['node:*','@napi-rs/canvas']});
  const nodes=[parse(await readFile(entry,'utf8'),{sourceType:'script',createImportExpressions:true})];
  while(nodes.length){const node=nodes.pop();if(node.type==='ImportExpression'||node.type==='ImportDeclaration')throw new Error('Native PDF engine must use CommonJS, without dynamic import syntax.');for(const value of Object.values(node)){if(Array.isArray(value))nodes.push(...value.filter(item=>item&&typeof item.type==='string'));else if(value&&typeof value==='object'&&typeof value.type==='string')nodes.push(value);}}
}
await cp(path.join(pdf,'standard_fonts'),path.join(output,'pdf-fonts/fonts'),{recursive:true});
await cp(path.join(pdf,'cmaps'),path.join(output,'pdf-cmaps/cmaps'),{recursive:true});
await mkdir(path.join(output,'pdf-import'),{recursive:true});
for(const name of ['LICENSE'])await cp(path.join(pdf,name),path.join(output,'pdf-import',name));
await cp(path.join(root,'node_modules/web-streams-polyfill/LICENSE'),path.join(output,'pdf-import/LICENSE.web-streams-polyfill'));
console.log('PDF.js engine/resources prepared in separate packages; document conversion stays on-device.');
