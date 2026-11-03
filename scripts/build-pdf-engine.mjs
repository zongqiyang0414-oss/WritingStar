import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),native=process.argv[2]==='mp-weixin';
const output=path.join(root,'dist/build',native?'mp-weixin':'h5'),pdf=path.join(root,'node_modules/pdfjs-dist');
await mkdir(output,{recursive:true});
if(native){
  await build({stdin:{contents:"export {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';export {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';",resolveDir:root},bundle:true,minify:true,platform:'browser',format:'cjs',target:'es2020',outfile:path.join(output,'pdf-import/engine.js'),external:['node:*','@napi-rs/canvas']});
}
await cp(path.join(pdf,'standard_fonts'),path.join(output,'pdf-fonts/fonts'),{recursive:true});
await cp(path.join(pdf,'cmaps'),path.join(output,'pdf-cmaps/cmaps'),{recursive:true});
await mkdir(path.join(output,'pdf-import'),{recursive:true});
for(const name of ['LICENSE'])await cp(path.join(pdf,name),path.join(output,'pdf-import',name));
await cp(path.join(root,'node_modules/web-streams-polyfill/LICENSE'),path.join(output,'pdf-import/LICENSE.web-streams-polyfill'));
console.log('PDF.js engine/resources prepared in separate packages; document conversion stays on-device.');
