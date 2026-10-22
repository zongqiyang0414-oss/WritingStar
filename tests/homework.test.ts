import { test } from "node:test";
import assert from "node:assert/strict";
import { MockService, clone } from "../src/services/mock.js";
import { samplePhotos, sampleReview } from "../src/services/seed.js";
import { assignmentCounts } from "../src/services/school.js";

async function setup() {
  let now = new Date("2026-10-21T10:00:00Z"), saved: any = null, failWrite = false;
  const storage = {
    read: () => saved && clone(saved),
    write: (state: any) => {
      if (failWrite) throw new Error("存储满");
      saved = clone(state);
    },
  };
  const service = new MockService(storage, () => now);
  await bind(service, "teacher", "JS2026");
  await bind(service, "student", "XS2026");
  const assignment = await service.createAssignment({
    title: "分享一次发现", requirements: "按顺序写清经过。", classId: "class-1", dueAt: "2026-10-22T10:00:00Z",
  }, "teacher");
  return {
    service, storage, assignment,
    advance: () => { now = new Date("2026-10-23T10:00:00Z"); },
    fail: (value: boolean) => { failWrite = value; },
  };
}
async function bind(service: any, role: string, code: string) {
  await service.signIn(role);
  await service.bindInvitation(code, role);
}

test("教师代交记录学生、页序和教师来源，学生可查看自己的AI任务", async () => {
  const { service, assignment, storage } = await setup();
  const pages = clone(samplePhotos).reverse();
  const submission = await service.submitForStudent(assignment.id, "student-1", pages, "  课堂代交  ", "teacher");
  assert.equal(submission.actor, "teacher");
  assert.equal(submission.submittedBy.name, "陈老师");
  assert.equal(submission.studentId, "student-1");
  assert.equal(submission.note, "课堂代交");
  assert.deepEqual(submission.photos, pages);
  assert.equal(submission.aiReview.source, "teacher");
  assert.equal(service.aiResult(submission.id, "student").state, "queued");
  assert.equal(assignmentCounts(service.read(), assignment).pending, 1);
  const reloaded = new MockService(storage);
  assert.deepEqual(reloaded.latest(assignment.id, "student-1"), submission);
});

test("教师可补交已截止作业，学生截止限制及本轮防重复提交继续生效", async () => {
  const { service, assignment, advance } = await setup();
  advance();
  await assert.rejects(service.submit(assignment.id, samplePhotos, "", "student"), /已截止/);
  const first = await service.submitForStudent(assignment.id, "student-1", samplePhotos, "补交", "teacher");
  await assert.rejects(service.submitForStudent(assignment.id, "student-1", samplePhotos, "", "teacher"), /本轮作品已提交/);
  await service.finishAnalysis(first.id);
  await service.publish(first.id, sampleReview(), "teacher");
  await service.setExcellent(first.id, true, "teacher");
  const original = service.latest(assignment.id, "student-1");
  const revision = await service.submitForStudent(assignment.id, "student-1", samplePhotos, "订正", "teacher");
  assert.equal(revision.version, 2);
  assert.equal(revision.excellent, undefined);
  assert.deepEqual(service.read().submissions.find((item: any) => item.id === first.id), original);
  assert.equal(service.excellentWorks("class-1", "student")[0].id, first.id);
  assert.equal(assignmentCounts(service.read(), assignment).pending, 1);
});

test("代交只允许已绑定的任教教师和本班在班学生", async () => {
  const { service, assignment } = await setup();
  for (const role of ["student", "admin", "parent"])
    await assert.rejects(service.submitForStudent(assignment.id, "student-1", samplePhotos, "", role), /教师身份/);
  for (const studentId of ["student-4", "missing"])
    await assert.rejects(service.submitForStudent(assignment.id, studentId, samplePhotos, "", "teacher"), /本班在班学生/);
  // Change the fixture through persisted state to simulate a concurrent transfer/archive.
  const state = service.read();
  state.students.find((item: any) => item.id === "student-1").archived = true;
  service.commit(state);
  await assert.rejects(service.submitForStudent(assignment.id, "student-1", samplePhotos, "", "teacher"), /本班在班学生/);
  await service.restartBinding("teacher");
  await assert.rejects(service.submitForStudent(assignment.id, "student-2", samplePhotos, "", "teacher"), /绑定/);
  await bind(service, "teacher", "LS2026");
  await assert.rejects(service.submitForStudent(assignment.id, "student-2", samplePhotos, "", "teacher"), /任教范围/);
});

test("代交图片校验、模拟失败和存储失败均不创建半份提交", async () => {
  const { service, assignment, fail } = await setup();
  const before = service.read();
  for (const pages of [[], [...samplePhotos, ...samplePhotos], Array.from({ length: 7 }, (_, index) => ({ ...samplePhotos[0], id: String(index) }))])
    await assert.rejects(service.submitForStudent(assignment.id, "student-1", pages, "", "teacher"), /图片/);
  await assert.rejects(service.submitForStudent(assignment.id, "student-1", samplePhotos, "", "teacher", true), /提交失败/);
  fail(true);
  await assert.rejects(service.submitForStudent(assignment.id, "student-1", samplePhotos, "", "teacher"), /存储满/);
  assert.deepEqual(service.read(), before);
  fail(false);
  await service.submitForStudent(assignment.id, "student-1", samplePhotos, "", "teacher");
  assert.equal(service.read().submissions.length, before.submissions.length + 1);
});

test("优秀作品须先完成批阅，全班取得原图和正式评价，不取得私密草稿", async () => {
  const { service, assignment } = await setup();
  const own = await service.submit(assignment.id, samplePhotos, "私密提交说明", "student");
  const another = await service.submitForStudent(assignment.id, "student-2", samplePhotos, "不向全班展示", "teacher");
  await assert.rejects(service.setExcellent(own.id, true, "teacher"), /先完成批阅/);
  for (const submission of [own, another]) {
    await service.finishAnalysis(submission.id);
    await service.publish(submission.id, sampleReview(), "teacher");
  }
  await service.setExcellent(own.id, true, "teacher");
  await service.setExcellent(another.id, true, "teacher");
  assert.equal(service.excellentWorks("class-1", "student", assignment.id).length, 2);
  const shared = service.excellentWork(another.id, "student");
  assert.equal(shared.studentName, service.read().students.find((item: any) => item.id === "student-2").name);
  assert.deepEqual(shared.photos, another.photos);
  assert.deepEqual(shared.published, sampleReview());
  shared.published.nextSteps = "读取结果不能改写原反馈";
  assert.deepEqual(service.excellentWork(another.id, "student").published, sampleReview());
  for (const key of ["draft", "aiReview", "note", "studentId", "submittedBy"])
    assert.equal(Object.hasOwn(shared, key), false, key);
  assert.throws(() => service.feedback(another.id, "student"), /只能查看/);
  assert.throws(() => service.aiResult(another.id, "student"), /本人|当前关联|只能/);
  await service.setExcellent(another.id, false, "teacher");
  assert.equal(service.excellentWorks("class-1", "student").length, 1);
  assert.throws(() => service.excellentWork(another.id, "student"), /取消展示/);
  assert.deepEqual(service.latest(assignment.id, "student-2").photos, another.photos);
});

test("优秀作业的管理和阅读均按任教或当前学生班级隔离", async () => {
  const { service, assignment } = await setup();
  const submission = await service.submit(assignment.id, samplePhotos, "", "student");
  await service.finishAnalysis(submission.id);
  await service.publish(submission.id, sampleReview(), "teacher");
  await service.setExcellent(submission.id, true, "teacher");
  for (const role of ["student", "admin", "parent"])
    await assert.rejects(service.setExcellent(submission.id, true, role), /教师身份/);
  for (const role of ["admin", "parent"])
    assert.throws(() => service.excellentWork(submission.id, role), /学生身份/);
  assert.throws(() => service.excellentWorks("class-2", "student"), /当前所在班级/);
  assert.throws(() => service.excellentWorks("class-1", "student", "assignment-2"), /当前班级/);
  await service.restartBinding("student");
  await bind(service, "student", "CX2026");
  assert.throws(() => service.excellentWork(submission.id, "student"), /当前所在班级/);
  await service.restartBinding("teacher");
  await bind(service, "teacher", "LS2026");
  await assert.rejects(service.setExcellent(submission.id, false, "teacher"), /任教范围/);
  assert.throws(() => service.excellentWork(submission.id, "teacher"), /任教范围/);
});

test("优秀标记存储失败不假成功，刷新、重复操作和订正不改写作品与反馈", async () => {
  const { service, assignment, storage, fail } = await setup();
  const submission = await service.submit(assignment.id, samplePhotos, "原说明", "student");
  await service.finishAnalysis(submission.id);
  await service.publish(submission.id, sampleReview(), "teacher");
  const before = service.latest(assignment.id, "student-1");
  fail(true);
  await assert.rejects(service.setExcellent(submission.id, true, "teacher"), /存储满/);
  assert.equal(service.excellentWorks("class-1", "student").length, 0);
  fail(false);
  await service.setExcellent(submission.id, true, "teacher");
  const selected = service.latest(assignment.id, "student-1");
  await service.setExcellent(submission.id, true, "teacher");
  assert.deepEqual(service.latest(assignment.id, "student-1"), selected);
  const reloaded = new MockService(storage);
  assert.equal(reloaded.excellentWorks("class-1", "student")[0].id, submission.id);
  assert.deepEqual(reloaded.feedback(submission.id, "student"), before.published);
  await service.setExcellent(submission.id, false, "teacher");
  const { excellent, ...unchanged } = service.latest(assignment.id, "student-1");
  assert.equal(excellent, null);
  assert.deepEqual(unchanged, before);
});
