import { build } from 'esbuild';
import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist/build/mp-weixin/roster-import');
await mkdir(output, { recursive: true });
const entry = path.join(output, 'engine.js');
await build({ entryPoints: [path.join(root, 'src/platform/studentRosterParser.js')], bundle: true, minify: true,
  platform: 'browser', format: 'cjs', target: 'es2020', supported: { 'dynamic-import': false }, define: { process: 'undefined' }, outfile: entry });
const nodes = [parse(await readFile(entry, 'utf8'), { sourceType: 'script', createImportExpressions: true })];
while (nodes.length) {
  const node = nodes.pop();
  if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration') throw new Error('Native roster engine must use CommonJS without dynamic imports.');
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) nodes.push(...value.filter((item) => item && typeof item.type === 'string'));
    else if (value && typeof value === 'object' && typeof value.type === 'string') nodes.push(value);
  }
}
await cp(path.join(root, 'node_modules/xlsx/LICENSE'), path.join(output, 'LICENSE.xlsx'));
await cp(path.join(root, 'node_modules/fflate/LICENSE'), path.join(output, 'LICENSE.fflate'));
console.log('Word/Excel roster engine prepared in its separate on-device mini-program package.');
