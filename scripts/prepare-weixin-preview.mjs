import { readFile, readdir, rm, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/build/mp-weixin');
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}
await mkdir(path.join(root,'paper-assets'),{recursive:true});
await cp(fileURLToPath(new URL('../src/static/paper',import.meta.url)),path.join(root,'paper-assets/paper'),{recursive:true});
await rm(path.join(root,'static/paper'),{recursive:true,force:true});
const output = await files(root);
const runtime = (await Promise.all(output.filter(file => /\.(?:js|json|wxml|wxss)$/.test(file)).map(file => readFile(file, 'utf8')))).join('\n');
// Keep the original artwork in src/ and H5. Only remove known unused originals
// from the mini-program output, and stop if runtime code begins using them.
for (const name of ['writingstar-logo-horizontal.png', 'writingstar-logo-app.png']) {
  if (runtime.includes(name)) throw new Error(`Original brand asset is now referenced: ${name}; review mini-program packaging.`);
  await rm(path.join(root, 'static/brand', name), { force: true });
}
// The phone header displays this mark below 300 CSS px. A dedicated 800 px
// native rendition meets high-density screens while keeping each asset <200KiB.
// Preserve the original artwork for H5 and future export; never resize papers.
const logoPath=path.join(root,'static/brand/writingstar-logo-horizontal-transparent.png');
const logo=await loadImage(fileURLToPath(new URL('../src/static/brand/writingstar-logo-horizontal-transparent.png',import.meta.url))),width=800,height=Math.round(width*logo.height/logo.width);
const canvas=createCanvas(width,height);canvas.getContext('2d').drawImage(logo,0,0,width,height);
await writeFile(logoPath,canvas.toBuffer('image/png'));
const app=JSON.parse(await readFile(path.join(root,'app.json'),'utf8'));
const packages=app.subPackages||app.subpackages||[],sizes=new Map([['main',0],...packages.map(item=>[item.root.replace(/\/$/,''),0])]);
for(const file of await files(root)){
  const name=path.relative(root,file),owner=[...sizes.keys()].find(key=>key!=='main'&&name.startsWith(key+'/'))||'main';
  sizes.set(owner,sizes.get(owner)+(await readFile(file)).length);
}
if(sizes.get('main')>1.5*1024*1024)throw new Error(`Mini-program main exceeds 1.5 MiB quality target: ${sizes.get('main')}`);
for(const file of await files(path.join(root,'static')))if(/\.(?:png|jpe?g|gif|webp)$/i.test(file)&&(await readFile(file)).length>200*1024)throw new Error(`Mini-program image exceeds 200 KiB: ${file}`);
const bytes=[...sizes.values()].reduce((sum,size)=>sum+size,0);
for(const [name,size]of sizes)if(size>2*1024*1024)throw new Error(`Mini-program package ${name} exceeds 2 MiB: ${size} bytes.`);
if(bytes>20*1024*1024)throw new Error(`Mini-program total exceeds 20 MiB: ${bytes} bytes.`);
console.log(`WeChat preview assets prepared: ${bytes} bytes; packages ${JSON.stringify(Object.fromEntries(sizes))}; source originals retained.`);
