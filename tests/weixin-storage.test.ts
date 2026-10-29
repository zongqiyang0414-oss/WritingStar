import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWeixinStateStorage} from '../src/platform/weixinStateStorage.js';
import {MockService} from '../src/services/mock.js';

function setup(legacy = '') {
 const previousUni=globalThis.uni, previousWx=globalThis.wx;
 let value=legacy, failFile=false, failPointer=false;
 const files=new Map();
 globalThis.uni={getStorageSync:()=>value,setStorageSync:(_key,data)=>{
  if(failPointer||Buffer.byteLength(data)>1024*1024)throw new Error('storage limit');value=data;
 }} as any;
 globalThis.wx={env:{USER_DATA_PATH:'/user'},getFileSystemManager:()=>({
  readFileSync:path=>{if(!files.has(path))throw new Error('missing');return files.get(path);},
  writeFileSync:(path,data)=>{if(failFile)throw new Error('disk full');files.set(path,data);},
 })} as any;
 return {storage:createWeixinStateStorage('test'), files, value:()=>value,
 failFile:()=>{failFile=true;},failPointer:()=>{failPointer=true;},
 restore:()=>{globalThis.uni=previousUni;globalThis.wx=previousWx;}};
}

test('微信初始化完整练习数据库超过1MiB仍可保存、修改、重启读取，Storage只有小索引',()=>{
 const x=setup();try{
 const service=new MockService(x.storage);service.prepareClassPractice();service.preparePaperCards();service.prepareAutoAi();
 const before=service.read();assert.ok(Buffer.byteLength(JSON.stringify(before))>1024*1024);
 assert.ok(Buffer.byteLength(x.value())<100);
 assert.deepEqual(new MockService(x.storage).read(),before);
 const changed=service.read();changed.teacherAccount.signedIn=true;service.commit(changed);
 assert.deepEqual(new MockService(x.storage).read(),changed);
 }finally{x.restore();}
});

test('旧JSON记录无损迁移，文件写失败和索引写失败均保持上一份提交记录',()=>{
 for(const failure of ['file','pointer']){
 const old={schemaVersion:6,photos:[{url:'/user/real-photo.jpg'}],note:'原记录'};
 const x=setup(JSON.stringify(old));try{
 assert.deepEqual(x.storage.read(),old);
 x.storage.write(old);assert.deepEqual(x.storage.read(),old);
 if(failure==='file')x.failFile();else x.failPointer();
 assert.throws(()=>x.storage.write({...old,note:'尚未提交'}),/保存失败/);
 assert.deepEqual(x.storage.read(),old);
 }finally{x.restore();}
 }
});

test('初次迁移失败保留旧Storage；已提交文件缺失不静默创建示例覆盖数据',()=>{
 const old={photos:['old']};const x=setup(JSON.stringify(old));try{
 x.failPointer();assert.throws(()=>x.storage.write({photos:['new']}),/保存失败/);
 assert.equal(x.value(),JSON.stringify(old));assert.deepEqual(x.storage.read(),old);
 }finally{x.restore();}
 const y=setup();try{y.storage.write(old);y.files.clear();assert.throws(()=>y.storage.read(),/不要重置/);}finally{y.restore();}
});
