// Repair the exact deployed v0.9 preview while its original Vue/TS source is unavailable.
// This is a reproducible preview patch, not a replacement for the mini-program source.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const root = path.resolve(process.argv[2] || '/workspace/sites/WritingStar-preview');
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.openai/hosting.json'), 'utf8'));
assert.equal(manifest.project_id, 'appgprj_6ace5dfae30c8191976ecd1706cbbdf5');
const assets = path.join(root, manifest.static.directory, 'assets');
const originalPage = 'pages-index-index.zD3qeT0t.js';
const originalRuntime = 'index-BmJhwZIG.js';
const raw = fs.readFileSync(path.join(assets, originalPage), 'utf8');
assert.match(raw, /v0\.9\.0/);
const ast = parser.parse(raw, {sourceType:'module'});
const key = node => node && (node.name ?? node.value);
const counts = {roles:0, invitations:0, accounts:0, folded:0, constructor:0, methods:0, switchRole:0, seed:0, learner:0};
const methodRoles = {signIn:0, previewBinding:1, bindInvitation:1, restartBinding:0, feedback:1};
const textChanges = new Map([
  ['原型展示 · v0.9.0', '原型展示 · v0.9.1'],
  ['微信登录按钮仅模拟登录；教师、家长和学生各自保留独立绑定。以下为虚构邀请码：', '微信登录按钮仅模拟登录；教师和学生各自保留独立绑定。以下为虚构邀请码：'],
  ['这是学生或家长邀请码，请向学校获取教师邀请码。', '这是学生邀请码，请向学校获取教师邀请码。'],
  ['此入口用于家长或学生提交。', '此入口仅供学生提交。'],
  ['草稿已保存，发布后学生与家长可见', '草稿已保存，发布后学生可见'],
  ['发布后，学生和家长可查看这份书写与写作评分、评语及订正建议。', '发布后，学生可查看这份书写与写作评分、评语及订正建议。'],
  ['请结合原作品复核评分和评语，确认后发布给学生与家长。', '请结合原作品复核评分和评语，确认后发布给学生。'],
  ['老师复核并发布后，学生和家长可查看反馈。', '老师复核并发布后，学生可查看反馈。'],
  ['发布后，班级学生与家长即可在任务中查看这份作业。', '发布后，班级学生即可在任务中查看这份作业。'],
  ['切换家长或学生', '切换学生身份'],
  ['各身份通过学校邀请码绑定，', '教师和学生通过学校邀请码绑定，'],
  ['家长代交', '家长代交（历史）'],
  ['家长', '学生']
]);

traverse(ast, {
  ObjectProperty(p) {
    if (key(p.node.key) === 'roles' && t.isArrayExpression(p.node.value)) {
      const before = p.node.value.elements.length;
      p.node.value.elements = p.node.value.elements.filter(item => !t.isObjectExpression(item) || !item.properties.some(prop => t.isObjectProperty(prop) && key(prop.key) === 'id' && t.isStringLiteral(prop.value, {value:'parent'})));
      counts.roles += before - p.node.value.elements.length;
    }
    if (key(p.node.key) === 'parent') { counts.accounts++; p.remove(); return; }
    if (key(p.node.key) === 'role' && t.isStringLiteral(p.node.value, {value:'parent'})) {
      // Previously issued codes remain valid student aliases, without a parent role.
      p.node.value = t.stringLiteral('student');
      p.parent.properties.push(t.objectProperty(t.identifier('legacy'), t.booleanLiteral(true)));
      counts.invitations++;
    }
    if (key(p.node.key) === 'switchRole' && t.isFunction(p.node.value)) {
      p.node.value.body.body.unshift(parser.parse('if (e !== "teacher" && e !== "student") return;', {allowReturnOutsideFunction:true}).program.body[0]);
      counts.switchRole++;
    }
  },
  ConditionalExpression(p) {
    const test = p.node.test;
    if (!t.isBinaryExpression(test) || !['===','==','!==','!='].includes(test.operator)) return;
    const other = t.isStringLiteral(test.left, {value:'parent'}) ? test.right : t.isStringLiteral(test.right, {value:'parent'}) ? test.left : null;
    if (!other) return;
    if (t.isMemberExpression(other) && key(other.property) === 'actor') return;
    p.replaceWith(test.operator.includes('!') ? p.node.consequent : p.node.alternate);
    counts.folded++;
  },
  StringLiteral(p) {
    if (textChanges.has(p.node.value)) p.node.value = textChanges.get(p.node.value);
  },
  VariableDeclarator(p) {
    if (t.isIdentifier(p.node.id, {name:'fe'}) && t.isArrayExpression(p.node.init)) {
      for (const item of p.node.init.elements) if (t.isSpreadElement(item) && t.isIdentifier(item.argument, {name:'ce'})) item.argument = parser.parseExpression('ce.filter(invitation => !invitation.legacy)');
    }
  },
  FunctionDeclaration(p) {
    if (p.node.id.name === 'Le') {
      p.traverse({ReturnStatement(q) {
        if (!t.isSequenceExpression(q.node.argument)) return;
        const items = q.node.argument.expressions;
        if (t.isIdentifier(items[items.length-1], {name:'n'})) {items[items.length-1] = t.callExpression(t.identifier('studentEntryState'), [t.identifier('n')]); counts.seed++;}
      }});
    }
    if (p.node.id.name === 'me') {
      p.node.body.body[0].test = parser.parseExpression('a !== "student"');
      counts.learner++;
    }
    if (p.node.id.name === 'ge') p.node.body.body.unshift(parser.parse('studentEntryRole(t);').program.body[0]);
  },
  ClassMethod(p) {
    const name = key(p.node.key);
    if (name === 'constructor') {
      p.traverse({
        AssignmentExpression(q) {
          if (t.isMemberExpression(q.node.left) && t.isThisExpression(q.node.left.object) && key(q.node.left.property) === 'state') {
            q.node.right = t.callExpression(t.identifier('studentEntryState'), [q.node.right]);
            counts.constructor++;
            q.skip();
          }
        }
      });
      p.traverse({BinaryExpression(q) {
        const n = q.node;
        if (!t.isNumericLiteral(n.left, {value:5}) || !t.isMemberExpression(n.right) || key(n.right.property) !== 'schemaVersion') return;
        if (t.isIdentifier(n.right.object, {name:'e'})) {q.replaceWith(parser.parseExpression('e.schemaVersion === 5 || e.schemaVersion === 6'));q.skip();}
        else if (t.isIdentifier(n.right.object, {name:'s'})) n.left.value = 6;
      }});
    }
    if (Object.hasOwn(methodRoles, name)) {
      const arg = p.node.params[methodRoles[name]];
      p.node.body.body.unshift(t.expressionStatement(t.callExpression(t.identifier('studentEntryRole'), [t.cloneNode(arg)])));
      counts.methods++;
    }
    if (name === 'learner') p.node.body.body.unshift(parser.parse('if (e !== "student") throw new Error("请选择学生身份。 ");').program.body[0]);
    if (name === 'submit') p.node.body.body[0].test = parser.parseExpression('s !== "student"');
  }
});

assert.equal(counts.roles, 1);
assert.equal(counts.accounts, 2);
assert.equal(counts.invitations, 4);
assert.equal(counts.constructor, 1);
assert.equal(counts.methods, 5);
assert.equal(counts.switchRole, 1);
assert.equal(counts.seed, 1);
assert.equal(counts.learner, 1);
assert.ok(counts.folded >= 15, JSON.stringify(counts));
const helpers = parser.parse(`
function studentEntryRole(role) {
  if (role !== 'teacher' && role !== 'student') throw new Error('请选择教师或学生身份。');
  return role;
}
function studentEntryState(state) {
  if (state.schemaVersion === 6) return state;
  const next = JSON.parse(JSON.stringify(state));
  const accounts = next.accounts || {};
  const student = accounts.student || {signedIn:false, studentId:null};
  const parent = accounts.parent;
  const bound = account => account && account.signedIn && next.students.some(item => item.id === account.studentId);
  next.accounts = {student: bound(student) ? student : bound(parent) ? parent : student};
  if (parent) next.legacyParentAccount = JSON.parse(JSON.stringify(parent));
  next.schemaVersion = 6;
  next.studentEntryVersion = 1;
  return next;
}
`, {sourceType:'module'}).program.body;
ast.program.body.push(...helpers);
const patchId = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex').slice(0,10);
const pageName = `pages-index-index.v091-${patchId}.js`;
const runtimeName = `index.v091-${patchId}.js`;
for (const item of ast.program.body) if (t.isImportDeclaration(item) && item.source.value === './'+originalRuntime) item.source.value = './'+runtimeName;
const output = generate(ast, {minified:true, comments:false, jsescOption:{minimal:true}}).code;
parser.parse(output, {sourceType:'module'});
fs.writeFileSync(path.join(assets,pageName), output);
const runtime = fs.readFileSync(path.join(assets, originalRuntime), 'utf8');
assert.ok(runtime.includes(originalPage));
const runtimeOutput = runtime.replaceAll(originalPage, pageName);
fs.writeFileSync(path.join(assets,runtimeName), runtimeOutput);
const index = path.join(root,manifest.static.directory,'index.html');
const html = fs.readFileSync(index,'utf8');
assert.ok(html.includes(originalRuntime));
fs.writeFileSync(index,html.replaceAll(originalRuntime,runtimeName));
fs.unlinkSync(path.join(assets,originalPage));
fs.unlinkSync(path.join(assets,originalRuntime));
fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
fs.copyFileSync(__filename,path.join(root,'scripts/repair-v09-student-entry.cjs'));
fs.writeFileSync(path.join(root,'PREVIEW-PATCH.md'), `# WritingStar v0.9.1 preview repair\n\nBased on deployed preview commit 870056c5d1deb8cc81999631147633e8cda4f311.\n\nThe original Vue/TypeScript v0.9 source was unavailable in this environment and the connected GitHub main. This patch changes the deployed preview's own application module, preserves its other v0.9 behavior, removes active parent roles, migrates existing learner bindings, and retains historical submissions. The script records the exact reproducible edits; it is not a mini-program source replacement.\n\nStorage schema 5 upgrades to 6 without changing assignment, photo, draft or published feedback records. A valid student binding takes priority; otherwise a valid prior parent binding becomes the student binding. Prior parent binding metadata is retained as legacyParentAccount. Previously issued learner codes remain aliases for the student role; only current student codes are listed in the demo tools.\n`);
console.log(JSON.stringify({root,pageName,runtimeName,counts,version:'v0.9.1'},null,2));
