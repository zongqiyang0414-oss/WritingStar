import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_PHOTO_BYTES, validatePhotoSizes, chooseDevicePhotos} from '../src/platform/photos.js';

test('图片数量与800KB上限保留原版限制', () => {
  assert.doesNotThrow(() => validatePhotoSizes([1, MAX_PHOTO_BYTES], 4));
  assert.throws(() => validatePhotoSizes([1, 1], 5), /最多添加/);
  assert.throws(() => validatePhotoSizes([MAX_PHOTO_BYTES + 1]), /800 KB/);
  for (const size of [0, -1, NaN, Infinity]) assert.throws(() => validatePhotoSizes([size]), /无法读取/);
});
test('微信选图先校验全部文件，再保存持久路径，不生成示例评分', async () => {
  const previous = globalThis.uni;
  const saved = [];
  globalThis.uni = {
    chooseImage(options) {
      assert.equal(options.count, 4);
      options.success({tempFiles:[{path:'/tmp/a.jpg',size:100},{path:'/tmp/b.png',size:200}]});
    },
    saveFile(options) {saved.push(options.tempFilePath); options.success({savedFilePath:'/saved/'+saved.length});}
  };
  try {
    const photos = await chooseDevicePhotos(2);
    assert.deepEqual(saved, ['/tmp/a.jpg','/tmp/b.png']);
    assert.deepEqual(photos.map(photo => [photo.url, photo.sample]), [['/saved/1',false],['/saved/2',false]]);
  } finally {globalThis.uni = previous;}
});
test('微信取消选图保留原列表，过大图片不会写入永久文件', async () => {
  const previous = globalThis.uni;
  let saves = 0;
  try {
    globalThis.uni = {chooseImage(options) {options.fail({errMsg:'chooseImage:fail cancel'});}};
    assert.deepEqual(await chooseDevicePhotos(0), []);
    globalThis.uni = {
      chooseImage(options) {options.success({tempFiles:[{path:'/tmp/a',size:MAX_PHOTO_BYTES+1}]});},
      saveFile() {saves++;}
    };
    await assert.rejects(chooseDevicePhotos(0), /800 KB/);
    assert.equal(saves, 0);
  } finally {globalThis.uni = previous;}
});
