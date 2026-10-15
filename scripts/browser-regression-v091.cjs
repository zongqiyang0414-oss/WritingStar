const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'../dist/build/h5');
const outputs=path.resolve(__dirname,'../outputs');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
function storageRead(){
  const raw=JSON.parse(localStorage.getItem('jiaxiu-prototype-v1'));
  if(raw.schemaVersion)return raw;
  if(typeof raw==='string')return JSON.parse(raw);
  if(typeof raw.data==='string')return JSON.parse(raw.data);
  if(raw.data&&raw.data.schemaVersion)return raw.data;
  throw new Error('Unexpected uni storage shape: '+Object.keys(raw).join(','));
}
function storageInstall(state){
  const key='jiaxiu-prototype-v1';const raw=JSON.parse(localStorage.getItem(key));
  if(raw.schemaVersion)localStorage.setItem(key,JSON.stringify(state));
  else if(typeof raw==='string')localStorage.setItem(key,JSON.stringify(JSON.stringify(state)));
  else {raw.data=typeof raw.data==='string'?JSON.stringify(state):state;localStorage.setItem(key,JSON.stringify(raw));}
}
(async()=>{
  let browser;
  const errors=[],badAssets=[];
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch({executablePath:process.env.WRITINGSTAR_CHROMIUM_EXECUTABLE || undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
    await context.route('**/*',route=>{const url=new URL(route.request().url());return url.hostname==='127.0.0.1'||url.protocol==='data:'?route.continue():route.abort();});
    const page=await context.newPage();page.setDefaultTimeout(12000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))badAssets.push({url:r.url(),status:r.status()});});
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
    const roles=page.locator('.role-button');
    const role=async name=>{await roles.filter({hasText:new RegExp(`^${name}$`)}).click();};
    const button=(name,scope=page)=>scope.locator('uni-button').filter({hasText:name});
    const nav=async name=>{await button(name,page.locator('.bottom-nav')).click();};
    const bind=async(name,code)=>{
      await role(name);
      await page.locator('.binding-login').click();
      await page.locator('.modal-actions .primary').click();
      await page.locator('.binding-code input').fill(code);
      await button('查看绑定信息').click();
      await button(name==='教师'?'确认绑定，进入教师工作台':'确认绑定，进入我的任务').click();
      await page.locator('.greeting').waitFor();
    };
    const task=async()=>{await page.locator('.assignment-card').filter({hasText:'放学路上的一件小事'}).locator('.compact-button').click();};
    const review=async()=>{await role('教师');await task();await page.locator('.student-row').filter({hasText:'小禾'}).locator('.text-button').click();await page.locator('.review-top').waitFor();};
    const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(await roles.allTextContents(),['教师','学生']);
    assert.equal(await page.locator('.fatal').count(),0);
    assert.match(await page.locator('.mobile-preview-tools').innerText(),/v0\.9\.1/);
    assert.doesNotMatch(await page.locator('body').innerText(),/家长/);
    await bind('教师','JS2026');console.log('teacher binding passed');
    await page.locator('.organization-context .text-button').click();
    await page.locator('.organization-option').filter({hasText:'青禾学习中心'}).click();
    assert.match(await page.locator('.organization-context').innerText(),/青禾学习中心/);
    await page.locator('.organization-context .text-button').click();
    await page.locator('.organization-option').filter({hasText:'星河小学'}).click();
    await noOverflow();
    await page.screenshot({path:path.join(outputs,'prototype-source-teacher-mobile-v0.9.1.jpg'),type:'jpeg',quality:85,fullPage:true});
    await bind('学生','XS2026');
    assert.match(await page.locator('.greeting').innerText(),/小禾同学/);
    await nav('我的');assert.doesNotMatch(await page.locator('.profile-card').innerText(),/家长|关联孩子/);
    await nav('任务');
    await page.screenshot({path:path.join(outputs,'prototype-source-student-mobile-v0.9.1.jpg'),type:'jpeg',quality:85,fullPage:true});
    await task();assert.equal(await page.locator('.dual-scores').count(),0);
    await review();await page.locator('.action-bar .secondary').click();
    await page.getByText('草稿已保存，发布后学生可见',{exact:true}).waitFor();
    await role('学生');await task();assert.equal(await page.locator('.dual-scores').count(),0);
    await review();await page.locator('.action-bar .primary').click();
    assert.doesNotMatch(await page.locator('.modal-card').innerText(),/家长/);
    await page.locator('.modal-actions .primary').click();
    await page.locator('.modal-card').waitFor({state:'hidden'});
    await role('学生');await task();await page.locator('.dual-scores').waitFor();
    assert.equal(await page.locator('.score-value').count(),2);
    console.log('draft visibility and publication passed');
    await button('按建议，再写一次',page.locator('.page-body')).click();
    const tools=page.locator('.mobile-preview-tools');
    await tools.locator('.prototype-tools-heading .text-button').click();
    await button('装载两页练习作品',tools).click();assert.equal(await page.locator('.upload-row').count(),2);
    await button('确认页序并提交订正',page.locator('.page-body')).click();
    await page.locator('.modal-actions .primary').click();
    await page.getByText('作品已提交，等待老师复核。老师发布后，你才能看到评分和建议。',{exact:true}).waitFor();
    await nav('记录');
    const attempts=page.locator('.history-card').filter({hasText:'放学路上的一件小事'});
    assert.equal(await attempts.count(),2);assert.equal(await attempts.locator('.history-score').count(),1);
    await nav('成长');await page.locator('.student-growth-heading').waitFor();assert.equal(await page.locator('.growth-rank').count(),0);
    await page.reload({waitUntil:'networkidle'});await role('学生');await nav('记录');
    assert.equal(await attempts.count(),2);assert.equal(await attempts.locator('.history-score').count(),1);
    console.log('student revision, own growth and refresh passed');
    await role('教师');await nav('我的');
    await button('查看全部',page.locator('.profile-information')).click();
    assert.equal(await page.locator('.teaching-class').count(),2);
    await page.locator('.teaching-class').first().click();
    assert.equal(await page.locator('.teaching-student').count(),53);
    await page.locator('.student-search input').fill('王梓涵');
    assert.equal(await page.locator('.teaching-student').count(),1);
    await button('查看班级学情').click();
    await page.locator('.trend-card').waitFor();
    await page.locator('.trend-series-toggle').first().click();
    await page.locator('.trend-series-toggle').first().click();
    await button('查看全班学生学情').click();
    await page.locator('.student-search input').fill('王梓涵');
    assert.equal(await page.locator('.ranking-row').count(),1);
    await page.locator('.ranking-row').click();
    await page.locator('.student-growth-heading').waitFor();
    assert.equal(await page.locator('.growth-rank').count(),1);
    await role('学生');await nav('记录');
    console.log('teaching classes, roster search, score curves, ranking and teacher growth passed');
    const legacy=await page.evaluate(storageRead);legacy.schemaVersion=5;delete legacy.studentEntryVersion;
    legacy.accounts={student:{signedIn:false,studentId:null},parent:{signedIn:true,studentId:'student-1'}};
    legacy.submissions.find(s=>s.id==='submission-1').actor='parent';
    const before=JSON.parse(JSON.stringify(legacy.submissions));
    await page.evaluate(storageInstall,legacy);await page.reload({waitUntil:'networkidle'});await role('学生');
    await page.locator('.greeting').waitFor();assert.match(await page.locator('.greeting').innerText(),/小禾同学/);
    const migrated=await page.evaluate(storageRead);
    assert.equal(migrated.schemaVersion,6);assert.deepEqual(Object.keys(migrated.accounts),['student']);
    assert.deepEqual(migrated.submissions,before);assert.deepEqual(migrated.legacyParentAccount,legacy.accounts.parent);
    assert.deepEqual(await roles.allTextContents(),['教师','学生']);
    await nav('记录');assert.equal(await attempts.count(),2);
    await noOverflow();
    await page.setViewportSize({width:1280,height:900});await page.reload({waitUntil:'networkidle'});
    assert.deepEqual(await roles.allTextContents(),['教师','学生']);await noOverflow();
    assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
    console.log(JSON.stringify({version:'v0.9.1',roles:['教师','学生'],mobileWidth:390,desktopWidth:1280,
      checks:['教师学生模拟绑定','多学校切换','家长入口及专属文案移除','草稿对学生不可见','教师发布双反馈','学生两页订正','学生个人成长无全班排名','刷新保留两版作品','旧家长绑定迁入学生端且作品逐项一致'],
      pageErrors:errors,badAssets,screenshots:['prototype-source-teacher-mobile-v0.9.1.jpg','prototype-source-student-mobile-v0.9.1.jpg']},null,2));
  }finally{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
