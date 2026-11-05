import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertWeixinBuildPolicy} from '../scripts/weixin-build-policy.mjs';

test('微信上传启用压缩和按需注入，预构建PDF/名单引擎不再交给开发者工具转译',()=>{
 const manifest=JSON.parse(fs.readFileSync('src/manifest.json','utf8'));
 const config={setting:manifest['mp-weixin'].setting};
 assert.doesNotThrow(()=>assertWeixinBuildPolicy(config));
 assert.equal(manifest['mp-weixin'].lazyCodeLoading,'requiredComponents');
 assert.throws(()=>assertWeixinBuildPolicy({setting:{...config.setting,minified:false}}),/minification/);
 assert.throws(()=>assertWeixinBuildPolicy({setting:{...config.setting,babelSetting:{ignore:[]}}}),/skip DevTools Babel/);
});
