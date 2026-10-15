import {cp, mkdir, readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'dist/build/h5');
const output = path.join(root, 'dist/client');
const manifest = JSON.parse(await readFile(path.join(root, '.openai/hosting.json'), 'utf8'));
if (manifest.static.directory !== 'dist/client') throw new Error('Unexpected hosting directory');
if (!(await stat(path.join(source, 'index.html'))).isFile()) throw new Error('Run build:h5 first');
await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});
await cp(source, output, {recursive:true});
console.log('Current source build prepared in dist/client.');
