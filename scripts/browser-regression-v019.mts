import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { MockService, clone } from '../src/services/mock.js';
import { createSeed, samplePhotos, sampleReview } from '../src/services/seed.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.WRITINGSTAR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve('dist/client');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url!, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const types: any = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
let time = Date.now(), saved: any = createSeed(new Date(time)); saved.assignments = []; saved.submissions = []; saved.classPracticeVersion = 1;
const service = new MockService({ read: () => clone(saved), write: state => { saved = clone(state); } }, () => new Date(time));
for (const [role, code] of [['teacher','JS2026'],['student','XS2026']]) { await service.signIn(role); await service.bindInvitation(code,role); }
const tasks: any = {};
for (const [id, title] of [['unsubmitted','尚未提交的作业'],['submitted','等待反馈的作业'],['reviewed','教师已批阅的作业'],['resubmit','需要重交的作业'],['expired','错过截止的作业']]) {
  time += 1000;
  const assignment = await service.createAssignment({ classId:'class-1', title, requirements:'消息与分类浏览器验收', dueAt:'' },'teacher');
  tasks[id] = assignment;
  if (['submitted','reviewed','resubmit'].includes(id)) {
    const submission = await service.submit(assignment.id, samplePhotos, '', 'student'); await service.finishAnalysis(submission.id);
    if (id !== 'submitted') { time += 1000; await service.publish(submission.id, sampleReview(), 'teacher'); }
    if (id === 'resubmit') { time += 1000; await service.agreeResubmission(submission.id, 'teacher'); }
  }
}
const state = service.read();
for (const assignment of state.assignments) if (assignment.id !== tasks.unsubmitted.id) assignment.dueAt = '2026-01-01T00:00:00Z';
service.commit(state);
let browser;
try {
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  browser = await chromium.launch({ executablePath:'/usr/bin/chromium', headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport:{width:390,height:963} });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
  await context.addInitScript(state => { if (!localStorage.getItem('jiaxiu-prototype-v1')) localStorage.setItem('jiaxiu-prototype-v1',JSON.stringify(state)); }, service.read());
  const page = await context.newPage(), errors: string[] = []; page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(15000);
  const button = (text: any, scope: any = page) => scope.locator('uni-button').filter({hasText:text});
  const role = (text: string) => button(text,page.locator('.role-picker')).click();
  const nav = (text: string) => button(text,page.locator('.bottom-nav')).click();
  const noAuditCopy = async () => assert.doesNotMatch(await page.locator('body').innerText(), /审核/, 'student-visible copy consistently uses teacher review/feedback wording');
  await page.goto(base,{waitUntil:'networkidle'}); await role('学生');
  await page.locator('.student-task-tabs').waitFor(); await noAuditCopy();
  assert.equal(await page.locator('.new-assignment-entry').count(),0);
  assert.equal(await page.locator('.notification-home .notification-item').count(),3);
  assert.deepEqual((await page.locator('.student-task-tab').allTextContents()).map(t=>t.trim().replace(/\s+/g,'')),['未提交1','已提交1','已批阅1','需重交1','已截止1']);
  for (const [category,title] of [['未提交','尚未提交的作业'],['已提交','等待反馈的作业'],['已批阅','教师已批阅的作业'],['需重交','需要重交的作业'],['已截止','错过截止的作业']]) {
    await button(category,page.locator('.student-task-tabs')).click();
    assert.equal(await page.locator('.assignment-card').count(),1); assert.match(await page.locator('.assignment-card').innerText(),new RegExp(title));
    assert.equal((await page.locator('.assignment-card .badge').innerText()).trim(),category); await noAuditCopy();
  }
  await button('需重交',page.locator('.student-task-tabs')).click();
  await button('重新提交',page.locator('.assignment-card')).click(); await noAuditCopy();
  assert.ok(await button('重新提交本次作业').count()); await page.locator('.back-button').click();
  assert.match(await page.locator('.student-task-tab.active').innerText(),/需重交/);
  await button('查看全部',page.locator('.notification-home')).click();
  assert.equal(await page.locator('.student-notifications .notification-item').count(),8); await noAuditCopy();
  const returned = page.locator('.notification-item').filter({hasText:'作业需重新提交'}); await returned.click();
  assert.match(await page.locator('.page-body').innerText(),/需要重交的作业/); await page.locator('.back-button').click();
  assert.ok(!((await page.locator('.notification-item').filter({hasText:'作业需重新提交'}).getAttribute('class'))||'').includes('is-unread'));
  const feedback = page.locator('.notification-item').filter({hasText:'教师批阅完成'}).filter({hasText:'教师已批阅的作业'});
  await feedback.click(); await page.locator('.dual-scores').waitFor(); await noAuditCopy();
  await page.locator('.back-button').click();
  const newTask = page.locator('.notification-item').filter({hasText:'新布置的作业'}).filter({hasText:'尚未提交的作业'}); await newTask.click();
  assert.match(await page.locator('.page-body').innerText(),/尚未提交的作业/); await noAuditCopy();
  await page.locator('.back-button').click(); await page.screenshot({path:'outputs/v019-notifications.png'});
  await page.locator('.back-button').click(); await page.locator('.student-task-tabs').scrollIntoViewIfNeeded(); await page.screenshot({path:'outputs/v019-task-categories.png'});
  await nav('记录'); await noAuditCopy(); await nav('成长'); await noAuditCopy(); await nav('我的'); await noAuditCopy();
  await page.reload({waitUntil:'networkidle'}); await role('学生');
  await button('查看全部',page.locator('.notification-home')).click();
  assert.equal(await page.locator('.notification-item.is-unread').count(),5,'three read receipts survive reload');
  await nav('任务');
  for (const width of [320,390,977]) { await page.setViewportSize({width,height:963}); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); }
  await role('教师'); assert.equal(await page.locator('.student-task-tabs').count(),0); assert.equal(await page.locator('.notification-home').count(),0);
  assert.ok(await page.getByText('待审核',{exact:true}).count(),'teacher workbench keeps its existing workflow');
  assert.deepEqual(errors,[]);
  console.log('v0.19 browser checks passed: all five exclusive task filters, deadline/return precedence, three notification types and detail links, persistent read receipts, back navigation, audit-free student copy across home/task/feedback/records/growth/profile, teacher compatibility and 320/390/977px layouts.');
} finally { await browser?.close(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
