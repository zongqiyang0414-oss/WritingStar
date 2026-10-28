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
const bytes = (await Promise.all((await files(root)).map(file => readFile(file)))).reduce((sum, data) => sum + data.length, 0);
if (bytes > 2 * 1024 * 1024) throw new Error(`Mini-program output exceeds 2 MiB: ${bytes} bytes. Review assets or subpackages.`);
console.log(`WeChat preview assets prepared: ${bytes} bytes; source originals retained.`);
