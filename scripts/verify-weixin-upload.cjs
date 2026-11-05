// Offline verification with the official SDK. No upload, signing key or user
// document is used. Install miniprogram-ci@2.1.31 in an isolated tools directory
// and pass WRITINGSTAR_CI_MODULE (module path), never production credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sdkPath=process.env.WRITINGSTAR_CI_MODULE;
if(!sdkPath)throw new Error('Set WRITINGSTAR_CI_MODULE to the installed miniprogram-ci module.');
const ci=require(sdkPath),sdkRoot=path.dirname(require.resolve(path.join(sdkPath,'package.json')));
// Use the SDK's built-in whitelist for a reproducible offline check. The only
// server metadata needed here is substituted; JS/WXML/WXSS compilation is real.
const whitelist=require(path.join(sdkRoot,'dist/utils/white_ext_list.js'));
whitelist.getWhiteExtList=async()=>({MiniProgramWhiteList:new Set(whitelist.MiniProgramWhiteList),GameWhiteList:new Set(whitelist.GameWhiteList)});
const root=path.resolve(process.argv[2]||'dist/build/mp-weixin'),destination=process.argv[3]?path.resolve(process.argv[3]):null;
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
(async()=>{
 const projectConfig=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
 // A non-key marker only satisfies the SDK constructor. Metadata is supplied
 // locally; getCompiledResult never signs or publishes anything.
 const project=new ci.Project({appid:projectConfig.appid,type:'miniProgram',projectPath:root,privateKey:'OFFLINE_COMPILATION_ONLY',attr:async()=>({...ci.DefaultProjectAttr}),ignores:['node_modules/**/*']});
 const compiled=await ci.getCompiledResult({project,setting:{useProjectConfig:true},threads:1});
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
 const roots=(app.subPackages||app.subpackages||[]).map(item=>item.root.replace(/\/$/,''));
 const sizes={main:0};for(const pack of roots)sizes[pack]=0;
 const owner=name=>roots.find(pack=>name.startsWith(pack+'/'))||'main';
 // Retain every raw asset in the accounting, even if the SDK filters it out.
 // Count transformed JS instead of raw JS and include generated helper files.
 const accounting=new Map(files(root).map(file=>[path.relative(root,file).split(path.sep).join('/'),fs.readFileSync(file)]));
 for(const [name,data]of Object.entries(compiled))if(!name.endsWith('.map'))accounting.set(name,Buffer.isBuffer(data)?data:Buffer.from(data));
 for(const [name,data]of accounting)sizes[owner(name)]+=data.length;
 if(sizes.main>1.5*1024*1024)console.log('Largest compiler increases:',JSON.stringify(Object.entries(compiled).map(([name,data])=>({name,bytes:Buffer.byteLength(data),growth:Buffer.byteLength(data)-(fs.existsSync(path.join(root,name))?fs.statSync(path.join(root,name)).size:0)})).sort((a,b)=>b.growth-a.growth).slice(0,8)));
 console.log('Upload compiler sizes:',JSON.stringify(sizes));
 for(const [pack,size]of Object.entries(sizes))assert.ok(size<=2*1024*1024,`Upload-compiled ${pack} exceeds 2 MiB: ${size}`);
 assert.ok(sizes.main<=1.5*1024*1024,`Upload-compiled main exceeds 1.5 MiB: ${sizes.main}`);
 assert.ok(Object.values(sizes).reduce((sum,size)=>sum+size,0)<=20*1024*1024);
 for(const pack of ['pdf-fonts','pdf-cmaps']) {
   const resources=files(path.join(root,pack)).filter(file=>file.endsWith('.br'));
   assert.ok(resources.length,`${pack} has no packed resources`);
   for(const file of resources)assert.ok(compiled[path.relative(root,file).split(path.sep).join('/')],`SDK excluded PDF resource ${file}`);
 }
 assert.ok(!compiled['platform/pdfCanvas.js'],'PDF adapter leaked into main');
 for(const page of [1,2]) { const name=`paper-assets/paper/fangyuan-${page}.png`;assert.ok(compiled[name],`Missing on-demand paper ${page}`);assert.deepEqual(Buffer.from(compiled[name]),fs.readFileSync(path.resolve('src/static/paper',`fangyuan-${page}.png`)),'Paper pixels must remain in the original file bytes'); }
 if(destination){fs.mkdirSync(destination,{recursive:true});for(const [name,data]of accounting){const file=path.join(destination,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}}
 const report={sdkVersion:require(path.join(sdkRoot,'package.json')).version,offline:true,sizes,mainLimit:1.5*1024*1024,packageLimit:2*1024*1024,pdfResourcesRetained:true};
 fs.writeFileSync('/tmp/writingstar-weixin-upload-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 await project.destroy?.();process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
