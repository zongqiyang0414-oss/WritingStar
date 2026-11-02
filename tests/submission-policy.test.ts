import { test } from "node:test";
import assert from "node:assert/strict";
import { MockService, clone } from "../src/services/mock.js";
import { createSeed, samplePhotos, sampleReview } from "../src/services/seed.js";
import { aiAssignmentRows, aiAssignmentSummary } from "../src/services/aiReview.js";
import { submissionRecordsModel, classStatisticsModel, studentGrowthModel } from "../src/services/pageModels.js";
import { canResubmit, prepareSubmissionPolicy } from "../src/services/submissionPolicy.js";
import { studentReports, latestPublishedSubmission } from "../src/services/school.js";

async function setup() {
  let saved: any = null, timestamp = Date.parse("2026-10-23T04:00:00Z"), fail = false;
  const storage = { read: () => clone(saved), write: (value: any) => { if (fail) throw new Error("存储满"); saved = clone(value); } };
  const service = new MockService(storage, () => new Date(timestamp));
  for (const [role, code] of [["teacher", "JS2026"], ["student", "XS2026"], ["admin", "MA2026"]]) { await service.signIn(role); await service.bindInvitation(code, role); }
  const assignment = await service.createAssignment({ title: "讨论确认后的流程", classId: "class-1", dueAt: "", requirements: "" }, "teacher");
  const advance = () => { service.advanceAiReviews(); timestamp += 3000; service.advanceAiReviews(); };
  return { service, storage, assignment, advance, fail: (value: boolean) => { fail = value; } };
}

test("技术失败自动重试一次，保留提交和照片，学生在本人页面用原图重试", async () => {
  const { service, assignment, advance } = await setup();
  const item = await service.submit(assignment.id, samplePhotos, "原提交说明", "student", false, true);
  advance();
  assert.equal(service.aiResult(item.id, "student").state, "reading");
  assert.equal(service.aiResult(item.id, "student").autoRetryCount, 1);
  advance();
  const failed = service.aiResult(item.id, "student");
  assert.equal(failed.state, "failed"); assert.equal(failed.reportedAt, null);
  assert.equal(service.latest(assignment.id, "student-1").version, 1);
  assert.equal(aiAssignmentSummary(aiAssignmentRows(service.read(), assignment.id)).attention, 0, "技术故障不作为教师质量提醒");
  await service.startAiReview(item.id, "student"); advance();
  assert.equal(service.aiResult(item.id, "student").state, "completed");
  assert.deepEqual(service.latest(assignment.id, "student-1").photos, samplePhotos);
  assert.equal(service.read().submissions.filter((s: any) => s.assignmentId === assignment.id).length, 1);
});

test("低于60或图片质量问题需逐份审核，不进入一键发布；图片异常仍需教师允许后重新提交", async () => {
  const { service, assignment, advance } = await setup();
  const item = await service.submit(assignment.id, samplePhotos, "", "student"); advance();
  const state = service.read(), row = state.submissions.find((s: any) => s.id === item.id);
  row.aiReview.result.handwriting.scores.imaginal = 20;
  service.commit(state);
  const model = aiAssignmentRows(service.read(), assignment.id).find((s: any) => s.submission?.id === item.id);
  assert.equal(model.needsAttention, true); assert.equal(model.publishable, false);
  assert.match(model.qualityReasons.join(), /低于60/);
  assert.deepEqual((await service.publishAiBatch(assignment.id, "teacher")).published, []);
  await assert.rejects(service.submit(assignment.id, samplePhotos, "", "student"), /老师同意/);
  const next = service.read(); next.submissions.find((s: any) => s.id === item.id).aiReview.qualityFlags = ["wrongImage"];
  service.commit(next);
  await assert.rejects(service.submit(assignment.id, samplePhotos, "", "student"), /老师同意/);
  await service.agreeResubmission(item.id, "teacher");
  const replacement = await service.submit(assignment.id, samplePhotos, "换成正确作品", "student");
  assert.equal(replacement.version, 2); assert.equal(replacement.aiReview.state, "queued");
  assert.ok(service.read().submissions.find((s: any) => s.id === item.id));
});

test("原图重试仅本人可用，管理员不能批阅；保存失败不消耗次数", async () => {
  const { service, assignment, advance, fail } = await setup();
  const item = await service.submit(assignment.id, samplePhotos, "", "student", false, true); advance(); advance();
  await assert.rejects(service.startAiReview(item.id, "admin"), /教师或学生/);
  const before = service.read(); fail(true);
  await assert.rejects(service.startAiReview(item.id, "student"), /存储满/);
  assert.deepEqual(service.read(), before); fail(false);
  await service.startAiReview(item.id, "student"); advance();
  assert.equal(service.aiResult(item.id, "student").state, "completed");
  assert.equal(service.read().submissions.find((s: any) => s.id === item.id).aiReview.studentRetryTimes.length, 1);
});


test("学生首次提交后始终锁定，反馈发布不解锁；教师同意一次且重复同意不会叠加次数", async () => {
  const { service, assignment, advance } = await setup();
  const first = await service.submit(assignment.id, samplePhotos, "原作", "student");
  await assert.rejects(service.submit(assignment.id, samplePhotos, "", "student"), /老师同意/);
  advance(); await service.publish(first.id, sampleReview(), "teacher");
  await assert.rejects(service.submit(assignment.id, samplePhotos, "", "student"), /老师同意/);
  await service.agreeResubmission(first.id, "teacher");
  assert.ok(canResubmit(service.latest(assignment.id, "student-1")));
  const agreed = service.read();
  await service.agreeResubmission(first.id, "teacher");
  assert.deepEqual(service.read(), agreed, "重复同意不创建或叠加新的机会");
  const second = await service.submit(assignment.id, samplePhotos, "新作", "student");
  assert.equal(second.version, 2); assert.ok(second.aiReview); assert.equal(canResubmit(second), false);
  await assert.rejects(service.submit(assignment.id, samplePhotos, "", "student"), /老师同意/);
  assert.equal(canResubmit(service.read().submissions.find((item: any) => item.id === first.id)), false);
  assert.deepEqual(service.feedback(first.id, "student"), sampleReview());
  await assert.rejects(service.agreeResubmission(first.id, "teacher"), /作品已更新/);
});

test("教师同意和重新提交保存失败都回滚，同意状态刷新保留并可覆盖原截止时间", async () => {
  const { service, storage, assignment, fail } = await setup();
  const first = await service.submit(assignment.id, samplePhotos, "原作说明", "student");
  const before = service.read(); fail(true);
  await assert.rejects(service.agreeResubmission(first.id, "teacher"), /存储满/);
  assert.deepEqual(service.read(), before); fail(false);
  await service.agreeResubmission(first.id, "teacher");
  const state = service.read(); state.assignments.find((item: any) => item.id === assignment.id).dueAt = "2026-10-01T00:00:00Z"; service.commit(state);
  const granted = service.read(); fail(true);
  await assert.rejects(service.submit(assignment.id, samplePhotos, "新作", "student"), /存储满/);
  assert.deepEqual(service.read(), granted); fail(false);
  const reload = new MockService(storage, () => new Date("2026-10-23T04:00:00Z"));
  const second = await reload.submit(assignment.id, samplePhotos, "新作", "student");
  assert.equal(second.version, 2);
  assert.equal(reload.read().submissions.find((item: any) => item.id === first.id).aiReview.state, "cancelled");
  assert.deepEqual(reload.read().submissions.find((item: any) => item.id === first.id).photos, samplePhotos);
  await assert.rejects(reload.publish(first.id, sampleReview(), "teacher"), /重新提交/);
});

test("教师代交只限首次，即使已同意学生重新提交也不能代交第二次", async () => {
  const { service, assignment, advance } = await setup();
  const first = await service.submitForStudent(assignment.id, "student-1", samplePhotos, "代交", "teacher");
  advance(); await service.publish(first.id, sampleReview(), "teacher");
  await assert.rejects(service.submitForStudent(assignment.id, "student-1", samplePhotos, "", "teacher"), /作品已提交/);
  await service.agreeResubmission(first.id, "teacher");
  await assert.rejects(service.submitForStudent(assignment.id, "student-1", samplePhotos, "", "teacher"), /作品已提交/);
  assert.equal((await service.submit(assignment.id, samplePhotos, "本人重新提交", "student")).actor, "student");
});

test("同意重新提交只限任教班级在班学生的最新作品，普通学生、管理员和跨班教师不能同意重新提交", async () => {
  const { service, assignment } = await setup();
  const first = await service.submit(assignment.id, samplePhotos, "", "student");
  await assert.rejects(service.agreeResubmission(first.id, "student"), /教师身份/);
  await assert.rejects(service.agreeResubmission(first.id, "admin"), /教师身份/);
  await assert.rejects(service.agreeResubmission(first.id, "unknown"), /教师身份/);
  const state = service.read(); state.students.find((item: any) => item.id === "student-1").archived = true; service.commit(state);
  await assert.rejects(service.agreeResubmission(first.id, "teacher"), /在班学生/);
  await service.restartBinding("teacher"); await service.signIn("teacher"); await service.bindInvitation("ZS2026", "teacher");
  await assert.rejects(service.agreeResubmission(first.id, "teacher"), /任教范围/);
});

test("记录、成长、排名及班级均分只取最新提交，未发布不沿用旧成绩或旧优秀", async () => {
  const { service, assignment, advance } = await setup();
  const first = await service.submit(assignment.id, samplePhotos, "", "student"); advance();
  await service.publish(first.id, sampleReview(), "teacher"); await service.setExcellent(first.id, true, "teacher");
  await service.agreeResubmission(first.id, "teacher");
  assert.equal(aiAssignmentSummary(aiAssignmentRows(service.read(), assignment.id)).readyToPublish, 0);
  const second = await service.submit(assignment.id, samplePhotos, "", "student");
  const state = service.snapshot();
  assert.equal(latestPublishedSubmission(state, assignment.id, "student-1"), null);
  const records = submissionRecordsModel(state, "student-1").filter((item: any) => item.assignmentId === assignment.id);
  assert.equal(records.length, 1); assert.equal(records[0].id, second.id); assert.equal(records[0].handwriting, null);
  assert.ok(!JSON.stringify(records).match(/"photos"|"draft"|"aiReview"|"version"|"versions"/));
  assert.equal(studentReports(state, "class-1").find((item: any) => item.id === "student-1").handwriting, null);
  assert.equal(studentGrowthModel(state, "class-1", "student-1").trend.find((item: any) => item.id === second.id).handwriting, null);
  assert.equal(classStatisticsModel(state, "class-1", Date.now()).trend.find((item: any) => item.id === assignment.id).handwriting, null);
  assert.equal(service.excellentWorks("class-1", "student").length, 0);
  advance(); await service.publish(second.id, sampleReview(), "teacher");
  assert.equal(submissionRecordsModel(service.snapshot(), "student-1").find((item: any) => item.id === second.id).handwriting, 81);
});

test("旧三版虚构样例精准移除，真实旧作品保留且迁移幂等；旧无任务作品自动入队", async () => {
  const { service } = await setup();
  const before = service.read(), state = clone(before), assignmentId = "assignment-xiaohe-revision-example";
  state.revisionPracticeVersion = 1;
  state.assignments.push({ ...state.assignments[0], id: assignmentId, title: "校园里的一次发现（订正示例）" });
  for (let i=1;i<=3;i++) state.submissions.push({ ...state.submissions[0], assignmentId, id:`revision-demo-xiaohe-${i}`, example:true, version:i });
  const prepared = prepareSubmissionPolicy(state);
  assert.deepEqual(prepared, before); assert.equal(prepareSubmissionPolicy(prepared), prepared);
  state.submissions.push({ ...state.submissions[0], id:"real-personal-upload", assignmentId, note:"用户自选作品", version:4 });
  const withReal = prepareSubmissionPolicy(state);
  assert.ok(withReal.submissions.some((item: any) => item.id === "real-personal-upload"));
  assert.equal(withReal.assignments.find((item: any) => item.id === assignmentId).title, "校园里的一次发现");
  service.prepareAutoAi(); assert.equal(service.aiResult("submission-1", "student").state, "queued");
  const queued = service.read(); service.prepareAutoAi(); assert.deepEqual(service.read(), queued);
});
