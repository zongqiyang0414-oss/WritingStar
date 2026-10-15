import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','preview');
const release=JSON.parse(await readFile(path.join(root,'release.json'),'utf8'));
const manifest=JSON.parse(await readFile(path.join(root,'.openai/hosting.json'),'utf8'));
const metadata=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
assert.equal(release.version,'0.9.1');
assert.equal(metadata.version,release.version);
assert.equal(manifest.project_id,release.project_id);
assert.equal(manifest.static.directory,'dist');
const expected=new Set();
for(const entry of release.files){
  const file=path.resolve(root,entry.path);
  assert.ok(file.startsWith(root+path.sep));
  const stat=await lstat(file);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink(),entry.path);
  const contents=await readFile(file);
  assert.equal(contents.length,entry.size_bytes,entry.path);
  assert.equal(createHash('sha256').update(contents).digest('hex'),entry.sha256,entry.path);
  expected.add(entry.path);
}
async function walk(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())await walk(file);
    else assert.ok(expected.has(path.relative(root,file).split(path.sep).join('/')),file);
  }
}
await walk(path.join(root,'dist'));
const html=await readFile(path.join(root,'dist/index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="\/(assets\/[^"?]+)"/g))assert.ok(expected.has('dist/'+match[1]),match[1]);
console.log(`WritingStar v${release.version}: ${release.files.length} files match the deployed preview (${release.source_commit.slice(0,7)}).`);
