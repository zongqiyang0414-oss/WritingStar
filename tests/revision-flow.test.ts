import { test } from "node:test";
import assert from "node:assert/strict";
import { MockService, clone } from "../src/services/mock.js";
import { createSeed, samplePhotos, sampleReview } from "../src/services/seed.js";
import { aiAssignmentRows, aiAssignmentSummary } from "../src/services/aiReview.js";
import { submissionHistoryGroups, classStatisticsModel } from "../src/services/pageModels.js";
import { validateReview, total } from "../src/services/rubric.js";

async function setup() {
  let saved: any = null, timestamp = Date.parse("2026-10-23T04:00:00Z"), fail = false;
  const storage = { read: () => clone(saved), write: (value: any) => { if (fail) throw new Error("存储满"); saved = clone(value); } };
  const service = new MockService(storage, () => new Date(timestamp));
  for (const [role, code] of [["teacher", "JS2026"], ["student", "XS2026"], ["admin", "MA2026"]]) { await service.signIn(role); await service.bindInvitation(code, role); }
  const assignment = await service.createAssignment({ title: "讨论确认后的流程", classId: "class-1", dueAt: "", requirements: "" }, "teacher");
  const advance = () => { service.advanceAiReviews(); timestamp += 3000; service.advanceAiReviews(); };
  return { service, storage, assignment, advance, fail: (value: boolean) => { fail = value; } };
}

test("技术失败自动重试一次，保留提交和照片，管理员只得到故障元数据，学生用原图重试", async () => {
  const { service, assignment, advance } = await setup();
  const item = await service.submit(assignment.id, samplePhotos, "原提交说明", "student", false, true);
  advance();
  assert.equal(service.aiResult(item.id, "student").state, "reading");
  assert.equal(service.aiResult(item.id, "student").autoRetryCount, 1);
  advance();
  const failed = service.aiResult(item.id, "student");
  assert.equal(failed.state, "failed"); assert.ok(failed.reportedAt);
  assert.equal(service.latest(assignment.id, "student-1").version, 1);
  const issues = service.technicalAiIssues("organization-1", "admin");
  assert.equal(issues.length, 1);
  assert.equal("photos" in issues[0], false); assert.equal("published" in issues[0], false); assert.equal("note" in issues[0], false);
  assert.equal(aiAssignmentSummary(aiAssignmentRows(service.read(), assignment.id)).attention, 0, "技术故障不作为教师质量提醒");
  await service.startAiReview(item.id, "student"); advance();
  assert.equal(service.aiResult(item.id, "student").state, "completed");
  assert.deepEqual(service.latest(assignment.id, "student-1").photos, samplePhotos);
  assert.equal(service.read().submissions.filter((s: any) => s.assignmentId === assignment.id).length, 1);
  assert.equal(service.technicalAiIssues("organization-1", "admin").length, 0);
});

test("低于60或图片质量问题需逐份审核，不进入一键发布；错误图片可生成替换版本", async () => {
  const { service, assignment, advance } = await setup();
  const item = await service.submit(assignment.id, samplePhotos, "", "student"); advance();
  const state = service.read(), row = state.submissions.find((s: any) => s.id === item.id);
  row.aiReview.result.handwriting.scores.imaginal = 20;
  service.commit(state);
  const model = aiAssignmentRows(service.read(), assignment.id).find((s: any) => s.submission?.id === item.id);
  assert.equal(model.needsAttention, true); assert.equal(model.publishable, false);
  assert.match(model.qualityReasons.join(), /低于60/);
  assert.deepEqual((await service.publishAiBatch(assignment.id, "teacher")).published, []);
  await assert.rejects(service.submit(assignment.id, samplePhotos, "", "student"), /等待老师/);
  const next = service.read(); next.submissions.find((s: any) => s.id === item.id).aiReview.qualityFlags = ["wrongImage"];
  service.commit(next);
  const replacement = await service.submit(assignment.id, samplePhotos, "换成正确作品", "student");
  assert.equal(replacement.version, 2); assert.equal(replacement.aiReview.state, "queued");
  assert.ok(service.read().submissions.find((s: any) => s.id === item.id));
});

test("管理员技术处理按学校鉴权，失败回滚；教师和普通学生不能操作管理入口", async () => {
  const { service, assignment, advance, fail } = await setup();
  const item = await service.submit(assignment.id, samplePhotos, "", "student", false, true); advance(); advance();
  assert.throws(() => service.technicalAiIssues("organization-2", "admin"), /管理范围/);
  assert.throws(() => service.technicalAiIssues("organization-1", "teacher"), /管理员/);
  await assert.rejects(service.retryAiIssue({ submissionId: item.id }, "student"), /管理员/);
  const before = service.read(); fail(true);
  await assert.rejects(service.retryAiIssue({ submissionId: item.id }, "admin"), /存储满/);
  assert.deepEqual(service.read(), before); fail(false);
  await service.retryAiIssue({ submissionId: item.id }, "admin"); advance();
  assert.equal(service.aiResult(item.id, "student").state, "completed");
  assert.equal(service.read().administrationEvents[0].description, "处理AI服务问题并重新分析");
});

test("作品记录按作业分组、版本倒序，趋势仅含已发布成绩且正序，不返回照片或草稿", () => {
  const state = createSeed(new Date("2026-10-23T04:00:00Z"));
  const base = clone(state.submissions[0]);
  state.submissions = [
    { ...base, id: "v1", version: 1, status: "published", published: sampleReview(), submittedAt: "2026-10-21T04:00:00Z" },
    { ...base, id: "v2", version: 2, status: "published", published: sampleReview(), submittedAt: "2026-10-22T04:00:00Z" },
    { ...base, id: "v3", version: 3, status: "pending", published: null, submittedAt: "2026-10-23T04:00:00Z" },
  ];
  const groups = submissionHistoryGroups(state, "student-1");
  assert.equal(groups.length, 1); assert.deepEqual(groups[0].versions.map((s: any) => s.version), [3,2,1]);
  assert.deepEqual(groups[0].points.map((s: any) => s.id), ["v1","v2"]);
  const json = JSON.stringify(groups); assert.ok(!json.includes('"photos"')); assert.ok(!json.includes('"draft"')); assert.ok(!json.includes('"aiReview"'));
  const statistics = classStatisticsModel(state, "class-1", Date.now());
  assert.deepEqual(statistics.assignments.map((a: any) => a.id), [...statistics.trend.map((a: any) => a.id)].reverse());
});

test("小禾三次订正示例只追加一次，评分合法递增且不改已有记录，旧无AI任务自动入队", async () => {
  const { service } = await setup();
  const before = service.read(); service.prepareRevisionPractice();
  const snapshot = service.read(); service.prepareRevisionPractice(); assert.deepEqual(service.read(), snapshot);
  for (const item of before.submissions) assert.deepEqual(snapshot.submissions.find((s: any) => s.id === item.id), item);
  const versions = snapshot.submissions.filter((s: any) => s.example);
  assert.equal(versions.length, 3); assert.deepEqual(versions.map((s: any) => total(s.published.handwriting)), [56,73,87]);
  assert.ok(versions.every((s: any) => !validateReview(s.published)));
  service.prepareAutoAi();
  assert.equal(service.aiResult("submission-1", "student").state, "queued");
  const prepared = service.read(); service.prepareAutoAi(); assert.deepEqual(service.read(), prepared);
});
