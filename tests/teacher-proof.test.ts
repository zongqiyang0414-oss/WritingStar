import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTeacherProof, chooseWeixinTeacherProof, previewWeixinTeacherProof } from '../src/platform/teacherProof.js';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const pdf = new TextEncoder().encode('%PDF-1.7\nproof');
function device(data = png, options: { choice?: number; cancel?: boolean; size?: number; previewFail?: boolean } = {}) {
  const oldUni = globalThis.uni, oldWx = globalThis.wx;
  const files = new Map<string, string>([['/user/state.json', 'application-state'], ['/user/photo-original.png', 'original'], ['/user/writingstar-proof-preview-old.png', 'old-preview']]);
  const previews: string[] = [], documents: string[] = [], reads: string[] = [];
  const fs = {
    readFile: o => { reads.push(o.filePath); o.success({ data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) }); },
    readdir: o => o.success({ files: [...files.keys()].map(path => path.split('/').at(-1)) }),
    writeFile: o => { assert.equal(o.encoding, 'base64'); files.set(o.filePath, o.data); o.success({}); },
    unlink: o => { files.delete(o.filePath); o.success?.({}); o.complete?.({}); },
  };
  globalThis.wx = { env: { USER_DATA_PATH: '/user' }, getFileSystemManager: () => fs, arrayBufferToBase64: buffer => Buffer.from(buffer).toString('base64'),
    chooseMessageFile: o => o.success({ tempFiles: [{ name: '在职证明.pdf', path: '/temp/file', size: options.size ?? data.length }] }) } as any;
  globalThis.uni = {
    showActionSheet: o => options.cancel ? o.fail({ errMsg: 'showActionSheet:fail cancel' }) : o.success({ tapIndex: options.choice || 0 }),
    chooseImage: o => { assert.deepEqual(o.sizeType, ['original']); o.success({ tempFiles: [{ path: '/temp/unknown-extension', size: options.size ?? data.length }] }); },
    previewImage: o => { assert.ok(!o.urls[0].startsWith('data:')); assert.ok(files.has(o.urls[0])); previews.push(o.urls[0]); options.previewFail ? o.fail({}) : o.success({}); },
    openDocument: o => { assert.equal(o.fileType, 'pdf'); assert.ok(files.has(o.filePath)); documents.push(o.filePath); o.success({}); },
  } as any;
  return { files, previews, documents, reads, restore() { globalThis.uni = oldUni; globalThis.wx = oldWx; } };
}

test('微信相册原始PNG无后缀时保留正确MIME，PDF读取为可持久化dataURL；取消和超限不读文件', async () => {
  let current = device();
  try {
    const proof = await chooseWeixinTeacherProof();
    assert.equal(proof.name, '教师证明.png'); assert.equal(proof.type, 'image/png'); assert.equal(proof.size, png.length);
    assert.equal(proof.url, `data:image/png;base64,${Buffer.from(png).toString('base64')}`);
  } finally { current.restore(); }
  current = device(pdf, { choice: 1 });
  try {
    const proof = await chooseWeixinTeacherProof(); assert.equal(proof.name, '在职证明.pdf'); assert.equal(proof.type, 'application/pdf');
    assert.equal(proof.url, `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`);
  } finally { current.restore(); }
  for (const options of [{ cancel: true }, { size: 2 * 1024 * 1024 + 1 }]) {
    current = device(png, options);
    try {
      if (options.cancel) assert.equal(await chooseWeixinTeacherProof(), null);
      else await assert.rejects(chooseWeixinTeacherProof(), /2 MB/);
      assert.equal(current.reads.length, 0);
    } finally { current.restore(); }
  }
  current = device(new TextEncoder().encode('unsupported-heic'));
  try { await assert.rejects(chooseWeixinTeacherProof(), /JPG、PNG/); } finally { current.restore(); }
});

test('微信证明预览写本地文件供原生查看器使用，保留至下次预览，仅清理专用临时文件', async () => {
  const current = device();
  try {
    const proof = await chooseWeixinTeacherProof(); await previewWeixinTeacherProof(proof);
    assert.equal(current.previews.length, 1); const imagePath = current.previews[0];
    assert.ok(imagePath.endsWith('.png')); assert.ok(current.files.has(imagePath), 'native viewer may read after success callback');
    assert.equal(current.files.has('/user/writingstar-proof-preview-old.png'), false);
    await previewWeixinTeacherProof({ type: 'application/pdf', url: `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}` });
    assert.equal(current.files.has(imagePath), false); assert.equal(current.documents.length, 1);
    assert.ok(current.files.has(current.documents[0]));
    assert.equal(current.files.get('/user/state.json'), 'application-state'); assert.equal(current.files.get('/user/photo-original.png'), 'original');
  } finally { current.restore(); }
  const failed = device(png, { previewFail: true });
  try {
    await assert.rejects(previewWeixinTeacherProof(await chooseWeixinTeacherProof()), /预览失败/);
    assert.equal([...failed.files.keys()].some(path => path.includes('proof-preview-')), false);
    assert.ok(failed.files.has('/user/state.json'));
  } finally { failed.restore(); }
});

test('浏览器文件MIME为空时采用已校验格式构建dataURL，避免有效PNG被申请服务拒绝', async () => {
  const oldDocument = globalThis.document, oldReader = globalThis.FileReader;
  globalThis.document = { createElement: () => {
    const input: any = { files: [{ name: '教师证明.png', type: '', size: png.length }] };
    input.click = () => input.onchange(); return input;
  } } as any;
  globalThis.FileReader = class {
    result = `data:application/octet-stream;base64,${Buffer.from(png).toString('base64')}`;
    onload: () => void;
    readAsDataURL() { this.onload(); }
  } as any;
  try { assert.equal((await chooseTeacherProof()).url, `data:image/png;base64,${Buffer.from(png).toString('base64')}`); }
  finally { globalThis.document = oldDocument; globalThis.FileReader = oldReader; }
});
