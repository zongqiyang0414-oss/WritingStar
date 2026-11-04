import { test } from "node:test";
import assert from "node:assert/strict";
import { MockService, clone } from "../src/services/mock.js";
import { samplePhotos } from "../src/services/seed.js";

async function setup() {
  let saved: any = null, writes = 0, fail = false;
  const storage = {
    read: () => saved && clone(saved),
    write: (value: any) => {
      if (fail) throw new Error("存储满");
      saved = clone(value);
      writes++;
    },
  };
  const service = new MockService(storage, () => new Date("2026-10-22T10:00:00Z"));
  await service.signIn("teacher");
  await service.bindInvitation("JS2026", "teacher");
  return { service, storage, writes: () => writes, fail: (value: boolean) => { fail = value; } };
}

test("多班级发布在同一次保存创建独立班级作业，允许要求选填和不限截止", async () => {
  const { service, writes } = await setup();
  const before = service.read();
  const count = writes();
  const assignments = await service.createAssignments({
    title: "  一次发现  ", requirements: "  ", dueAt: "", classIds: ["class-1", "class-2"],
  }, "teacher");
  assert.equal(writes(), count + 1);
  assert.equal(assignments.length, 2);
  assert.equal(new Set(assignments.map((item: any) => item.id)).size, 2);
  assert.deepEqual(assignments.map((item: any) => item.classId), ["class-1", "class-2"]);
  assert.ok(assignments.every((item: any) => item.title === "一次发现" && item.requirements === "" && item.dueAt === ""));
  assert.deepEqual(service.read().submissions, before.submissions);
  await service.signIn("student");
  await service.bindInvitation("XS2026", "student");
  const submission = await service.submit(assignments[0].id, samplePhotos, "", "student");
  assert.equal(submission.assignmentId, assignments[0].id);
});

test("多班级任教范围、必填标题、截止日期及存储失败均不会留下部分作业", async () => {
  const { service, fail } = await setup();
  const before = service.read();
  const input = { title: "一次发现", requirements: "", dueAt: "", classIds: ["class-1", "class-2"] };
  await assert.rejects(service.createAssignments({ ...input, classIds: ["class-1", "missing"] }, "teacher"), /任教班级/);
  await assert.rejects(service.createAssignments({ ...input, classIds: [] }, "teacher"), /发布班级/);
  await assert.rejects(service.createAssignments({ ...input, title: " " }, "teacher"), /作业标题/);
  for (const dueAt of ["invalid", "2026-10-21T10:00:00Z"])
    await assert.rejects(service.createAssignments({ ...input, dueAt }, "teacher"), /截止时间/);
  fail(true);
  await assert.rejects(service.createAssignments(input, "teacher"), /存储满/);
  assert.deepEqual(service.read(), before);
  fail(false);
  await service.restartBinding("teacher");
  await service.signIn("teacher");
  await service.bindInvitation("LS2026", "teacher");
  const restricted = service.read();
  await assert.rejects(service.createAssignments(input, "teacher"), /任教范围/);
  assert.deepEqual(service.read(), restricted);
});

test("题库预设可读取，个人模板可新增更新删除并刷新保留，旧数据不清空", async () => {
  const { service, storage } = await setup();
  const original = service.read();
  assert.ok(service.assignmentTemplates("teacher").every((item: any) => item.builtin));
  const template = await service.saveAssignmentTemplate({ title: "  周末见闻  ", requirements: " " }, "teacher");
  assert.equal(template.title, "周末见闻");
  assert.equal(template.requirements, "");
  assert.equal(template.ownerTeacherId, "teacher-chen");
  const edited = await service.saveAssignmentTemplate({ ...template, title: "周末观察", requirements: "观察一朵花。" }, "teacher");
  const reloaded = new MockService(storage);
  assert.deepEqual(reloaded.assignmentTemplates("teacher")[0], edited);
  assert.deepEqual(service.read().submissions, original.submissions);
  assert.deepEqual(service.read().assignments, original.assignments);
  assert.equal(service.read().schemaVersion, 6);
  await reloaded.deleteAssignmentTemplate(template.id, "teacher");
  assert.equal(reloaded.assignmentTemplates("teacher").some((item: any) => item.id === template.id), false);
});

test("个人题库按教师隔离，禁止修改他人或内置模板，失败保存可重试", async () => {
  const { service, fail } = await setup();
  const preset = service.assignmentTemplates("teacher")[0];
  const own = await service.saveAssignmentTemplate({ title: "我的模板", requirements: "" }, "teacher");
  const before = service.read();
  fail(true);
  await assert.rejects(service.saveAssignmentTemplate({ title: "未保存", requirements: "" }, "teacher"), /存储满/);
  assert.deepEqual(service.read(), before);
  fail(false);
  await assert.rejects(service.saveAssignmentTemplate({ ...preset, title: "改预设" }, "teacher"), /自己的作业模板/);
  await assert.rejects(service.deleteAssignmentTemplate(preset.id, "teacher"), /自己的作业模板/);
  await service.restartBinding("teacher");
  await service.signIn("teacher");
  await service.bindInvitation("LS2026", "teacher");
  assert.equal(service.assignmentTemplates("teacher").some((item: any) => item.id === own.id), false);
  await assert.rejects(service.saveAssignmentTemplate({ ...own, title: "改他人" }, "teacher"), /自己的作业模板/);
  await assert.rejects(service.deleteAssignmentTemplate(own.id, "teacher"), /自己的作业模板/);
  assert.throws(() => service.assignmentTemplates("student"), /教师身份/);
});

test("题目插图随模板、跨班发布和刷新保存，移除插图后更新模板不残留旧图", async () => {
  const { service, storage } = await setup();
  const illustration = "data:image/png;base64,aW1hZ2U=";
  const template = await service.saveAssignmentTemplate({ title: "看图写话", requirements: "观察画面。\n写出自己的发现。", illustration }, "teacher");
  const assignments = await service.createAssignments({ ...template, dueAt: "", classIds: ["class-1", "class-2"] }, "teacher");
  assert.ok(assignments.every(item => item.illustration === illustration));
  const reloaded = new MockService(storage);
  assert.equal(reloaded.assignmentTemplates("teacher").find(item => item.id === template.id)?.illustration, illustration);
  assert.equal(reloaded.read().assignments.find(item => item.id === assignments[0].id)?.illustration, illustration);
  const cleared = await reloaded.saveAssignmentTemplate({ ...template, illustration: "" }, "teacher");
  assert.equal(cleared.illustration, undefined);
  assert.equal(reloaded.read().assignments.find(item => item.id === assignments[0].id)?.illustration, illustration);
});
