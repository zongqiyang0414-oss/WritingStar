import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printAnswerCards } from '../src/platform/answerCards.js';

test('全班106页逐页准备、加载完毕再打印，不依赖弹窗，结束释放图片', async () => {
  const previous = globalThis.document, create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  let generated = 0, loaded = 0, printed = 0, revoked = 0, removed = 0, afterprint;
  const inner = { title: '', head: { append() {} }, body: { append() {} }, fonts: { ready: Promise.resolve() },
    createElement(tag) {
      if (tag === 'img') return { set src(value) { queueMicrotask(() => { loaded++; this.onload(); }); } };
      return {};
    } };
  const frame = { title: '', style: {}, contentDocument: inner, remove() { removed++; }, contentWindow: {
    addEventListener(event, handler) { afterprint = handler; }, focus() {}, print() {
      assert.equal(generated,106); assert.equal(loaded,106); printed++; afterprint();
    } } };
  globalThis.document = { body: { append() {} }, createElement(tag) {
    if (tag === 'iframe') return frame;
    assert.equal(tag,'canvas');
    return { width:0,height:0,getContext() { return new Proxy({}, {get: () => () => {}}); }, toBlob(callback) { generated++; callback(new Blob(['page'])); } };
  } };
  URL.createObjectURL = () => `blob:page-${generated}`; URL.revokeObjectURL = () => { revoked++; };
  try {
    const cards = Array.from({length:53},(_,i)=>({id:`card-${i}`,studentName:`学生${i}`,className:'四年级（1）班'}));
    let progress = 0;
    await printAnswerCards({title:'打印验证',requirements:'写一次发现',paperPacket:{pages:2}}, cards, done => {progress=done;});
    assert.equal(progress,106); assert.equal(printed,1); assert.equal(revoked,106); assert.equal(removed,1);
  } finally { globalThis.document = previous; URL.createObjectURL=create;URL.revokeObjectURL=revoke; }
});
