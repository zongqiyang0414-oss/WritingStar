import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_PHOTO_BYTES, validatePhotoSizes, chooseDevicePhotos} from '../src/platform/photos.js';

test('原照片保留六页和20MB输入上限，不以压缩替换超限文件', () => {
  assert.doesNotThrow(() => validatePhotoSizes([1, MAX_PHOTO_BYTES], 4));
  assert.throws(() => validatePhotoSizes([1, 1], 5), /最多添加/);
  assert.doesNotThrow(() => validatePhotoSizes([10 * 1024 * 1024]));
  assert.throws(() => validatePhotoSizes([MAX_PHOTO_BYTES + 1]), /20 MB/);
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
test('微信取消保留原列表，超过旧800KB预算的原图也不缩图或压缩', async () => {
  const previous = globalThis.uni;
  let saves = 0;
  try {
    globalThis.uni = {chooseImage(options) {options.fail({errMsg:'chooseImage:fail cancel'});}};
    assert.deepEqual(await chooseDevicePhotos(0), []);
    globalThis.uni = {
      chooseImage(options) {assert.deepEqual(options.sizeType,['original']);options.success({tempFiles:[{path:'/tmp/original.png',size:12*1024*1024}]});},
      getImageInfo() {assert.fail('ordinary upload must not decode/resize an original');},
      compressImage() {assert.fail('original must never be re-compressed');},
      saveFile(options) {assert.equal(options.tempFilePath,'/tmp/original.png'); saves++; options.success({savedFilePath:'/saved/original.png'});}
    };
    const result = await chooseDevicePhotos(0);
    assert.equal(saves, 1); assert.equal(result[0].url, '/saved/original.png'); assert.equal(result[0].sample, false);assert.equal(result[0].original,true);
  } finally {globalThis.uni = previous;}
});

test('多张原照片保存中途失败只清理本次新文件，不留下半批上传', async () => {
 const previous=globalThis.uni,removed=[];let calls=0;
 globalThis.uni={chooseImage(options){options.success({tempFiles:[{path:'/tmp/a.png',size:2000},{path:'/tmp/b.jpg',size:3000}]});},
  saveFile(options){if(++calls===1)options.success({savedFilePath:'/saved/new-a.png'});else options.fail();},
  getFileSystemManager(){return {unlink(options){removed.push(options.filePath);}};}};
 try {await assert.rejects(chooseDevicePhotos(0),/保存失败/);assert.deepEqual(removed,['/saved/new-a.png']);}
 finally {globalThis.uni=previous;}
});
