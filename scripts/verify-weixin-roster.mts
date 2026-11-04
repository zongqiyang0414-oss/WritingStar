// Execute the actual mini-program roster page and separately bundled parser.
// Native filesystem/navigation APIs are simulated; all Word/Excel bytes are real.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as vue from 'vue';
import {utils, write} from 'xlsx';
import {zipSync, strToU8} from 'fflate';

const root = path.resolve('dist/build/mp-weixin');
function excel(bookType: 'xlsx' | 'xls') {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([['姓名', '学号'], ['林青', '0007'], ['周晓', '0008']]), '名单');
  return new Uint8Array(write(book, {type: 'array', bookType}));
}
const cell = (text: string) => `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
const docx = zipSync({'word/document.xml': strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tr>${cell('姓名')}${cell('学号')}</w:tr><w:tr>${cell('林青')}${cell('0007')}</w:tr><w:tr>${cell('周晓')}${cell('0008')}</w:tr></w:tbl></w:body></w:document>`)});

async function check({extension = 'xlsx', cancelled = false, invalid = false}: {extension?: 'xlsx' | 'xls' | 'docx'; cancelled?: boolean; invalid?: boolean} = {}) {
  const bytes = invalid ? strToU8('broken') : extension === 'docx' ? docx : excel(extension);
  let definition: any, pendingRead: any, navigations = 0;
  const hooks: Record<string, Function[]> = {}, handlers: Record<string, Function> = {}, messages: any[] = [];
  const channel = {on: (name, callback) => handlers[name] = callback, emit: (name, value) => messages.push({name, value})};
  const unload = () => hooks.onUnload?.forEach((callback) => callback());
  const uni = {navigateBack() { navigations++; unload(); }};
  const wx = {createPage: (component) => { definition = component; }, getFileSystemManager: () => ({readFile: (options) => {
    pendingRead = options;
    if (!cancelled) options.success({data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
  }})};
  const vendor: any = {...vue, index: uni, wx$1: wx, getCurrentInstance: () => ({proxy: {getOpenerEventChannel: () => channel}}), _export_sfc: (component) => component};
  for (const name of ['onLoad', 'onUnload']) vendor[name] = (callback) => (hooks[name] ||= []).push(callback);
  const context = vm.createContext({console, wx, uni, setTimeout, clearTimeout});
  const cache = new Map();
  function load(file: string) {
    if (file === path.join(root, 'common/vendor.js')) return vendor;
    if (cache.has(file)) return cache.get(file).exports;
    const source = fs.readFileSync(file, 'utf8');
    for (const alias of source.matchAll(/\.((?:nextTick|ref|computed|watch)\$\d+)\b/g)) vendor[alias[1]] = vue[alias[1].split('$')[0]];
    const module = {exports: {}}; cache.set(file, module);
    const run = vm.runInContext(`(function(module,exports,require){${source}\n})`, context, {filename: file});
    run(module, module.exports, (name) => {
      assert.ok(name.startsWith('.'), `Native roster parser cannot require a Node module: ${name}`);
      return load(path.resolve(path.dirname(file), name));
    });
    return module.exports;
  }
  load(path.join(root, 'roster-import/index.js')); definition.setup({}); hooks.onLoad.forEach((callback) => callback());
  const parsing = handlers.roster({name: `名单.${extension}`, size: bytes.length, path: '/input'});
  if (cancelled) {
    unload(); pendingRead.success({data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
  }
  await parsing;
  const parsed = messages.find((message) => message.name === 'parsed');
  if (cancelled) { assert.equal(parsed, undefined); assert.equal(navigations, 0); assert.equal(messages.filter((message) => message.name === 'cancelled').length, 1); }
  else if (invalid) { assert.equal(parsed, undefined); assert.match(messages.find((message) => message.name === 'failed')?.value, /文件无法读取/); assert.equal(navigations, 1); }
  else { assert.deepEqual(JSON.parse(JSON.stringify(parsed?.value.map(({name, studentNumber}) => ({name, studentNumber})))), [{name: '林青', studentNumber: '0007'}, {name: '周晓', studentNumber: '0008'}]); assert.equal(navigations, 1); }
  return {extension, cancelled, invalid, rows: parsed?.value.length || 0};
}

const results = [];
for (const extension of ['xlsx', 'xls', 'docx'] as const) results.push(await check({extension}));
results.push(await check({extension: 'docx', invalid: true}), await check({cancelled: true}));
const vendorSource = fs.readFileSync(path.join(root, 'common/vendor.js'), 'utf8');
assert.doesNotMatch(vendorSource, /SheetNames|sheet_to_json/, 'XLSX engine must stay outside the main vendor');
console.log('Compiled WeChat Word/Excel package passed:', JSON.stringify(results));
