import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_PHOTO_BYTES, validatePhotoSizes, chooseDevicePhotos} from '../src/platform/photos.js';

test('保留六页上限，大图可选并交由自动优化', () => {
  assert.doesNotThrow(() => validatePhotoSizes([1, MAX_PHOTO_BYTES], 4));
  assert.throws(() => validatePhotoSizes([1, 1], 5), /最多添加/);
  assert.doesNotThrow(() => validatePhotoSizes([10 * 1024 * 1024]));
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
test('微信取消选图保留原列表，大图压缩后才保存持久文件', async () => {
  const previous = globalThis.uni;
  let saves = 0;
  try {
    globalThis.uni = {chooseImage(options) {options.fail({errMsg:'chooseImage:fail cancel'});}};
    assert.deepEqual(await chooseDevicePhotos(0), []);
    globalThis.uni = {
      chooseImage(options) {options.success({tempFiles:[{path:'/tmp/a',size:MAX_PHOTO_BYTES+1}]});},
      getImageInfo(options) {options.success({width:4000,height:3000});},
      compressImage(options) {assert.equal(options.compressedWidth,2600); options.success({tempFilePath:'/tmp/compressed'});},
      getFileInfo(options) {options.success({size:500*1024});},
      saveFile(options) {assert.equal(options.tempFilePath,'/tmp/compressed'); saves++; options.success({savedFilePath:'/saved/compressed'});}
    };
    const result = await chooseDevicePhotos(0);
    assert.equal(saves, 1); assert.equal(result[0].url, '/saved/compressed'); assert.equal(result[0].sample, false);
  } finally {globalThis.uni = previous;}
});
