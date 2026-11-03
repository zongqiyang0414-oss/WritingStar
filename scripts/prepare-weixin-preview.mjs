import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
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
const output = await files(root);
const runtime = (await Promise.all(output.filter(file => /\.(?:js|json|wxml|wxss)$/.test(file)).map(file => readFile(file, 'utf8')))).join('\n');
// Keep the original artwork in src/ and H5. Only remove known unused originals
// from the mini-program output, and stop if runtime code begins using them.
for (const name of ['writingstar-logo-horizontal.png', 'writingstar-logo-app.png']) {
  if (runtime.includes(name)) throw new Error(`Original brand asset is now referenced: ${name}; review mini-program packaging.`);
  await rm(path.join(root, 'static/brand', name), { force: true });
}
const app=JSON.parse(await readFile(path.join(root,'app.json'),'utf8'));
const packages=app.subPackages||app.subpackages||[],sizes=new Map([['main',0],...packages.map(item=>[item.root.replace(/\/$/,''),0])]);
for(const file of await files(root)){
  const name=path.relative(root,file),owner=[...sizes.keys()].find(key=>key!=='main'&&name.startsWith(key+'/'))||'main';
  sizes.set(owner,sizes.get(owner)+(await readFile(file)).length);
}
const bytes=[...sizes.values()].reduce((sum,size)=>sum+size,0);
for(const [name,size]of sizes)if(size>2*1024*1024)throw new Error(`Mini-program package ${name} exceeds 2 MiB: ${size} bytes.`);
if(bytes>20*1024*1024)throw new Error(`Mini-program total exceeds 20 MiB: ${bytes} bytes.`);
console.log(`WeChat preview assets prepared: ${bytes} bytes; packages ${JSON.stringify(Object.fromEntries(sizes))}; source originals retained.`);
