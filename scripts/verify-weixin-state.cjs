// Exercise the compiled service with WeChat's 1 MiB per-Storage-entry limit.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/build/mp-weixin'), cache = {};
let stored = '', largest = 0;
const files = new Map();
const uni = {getStorageSync: () => stored, setStorageSync: (_key, value) => {
  largest = Math.max(largest, Buffer.byteLength(value));
  assert.ok(Buffer.byteLength(value) <= 1024 * 1024, 'WeChat Storage entry exceeds 1 MiB');
  stored = value;
}};
const wx = {env: {USER_DATA_PATH: '/user'}, getFileSystemManager: () => ({
  writeFileSync: (file, text) => files.set(file, text), readFileSync: file => files.get(file),
})};
function load(file) {
  if (file === path.join(root, 'common/vendor.js')) return {index: uni, wx$1: wx};
  if (cache[file]) return cache[file].exports;
  const module = {exports: {}}; cache[file] = module;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {module, exports: module.exports,
    require: name => load(path.resolve(path.dirname(file), name)), console, uni, wx}, {filename: file});
  return module.exports;
}
const api = load(path.join(root, 'services/index.js'));
const first = api.createPrototypeService().read();
assert.deepEqual(JSON.parse(JSON.stringify(api.createPrototypeService().read())), JSON.parse(JSON.stringify(first)));
assert.ok(largest < 1024, 'Database should be in files, not Storage');
const template = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8');
assert.ok(template.indexOf('mobile-preview-tools') > template.indexOf('app-shell'), 'Mobile tools must follow application');
const cards = fs.readFileSync(path.join(root, 'components/AnswerCardPanel.wxml'), 'utf8');
assert.match(cards, /打印全班/); assert.match(cards, /打印 \/ 下载此生 PDF/);
console.log(`WeChat compiled service save/reload passed: ${Buffer.byteLength(JSON.stringify(first))} bytes in files, largest Storage entry ${largest} bytes; tools below app, both print entries retained.`);
