import { test } from "node:test";
import assert from "node:assert/strict";
import { MockService, clone } from "../src/services/mock.js";
import { createSeed, samplePhotos, sampleReview } from "../src/services/seed.js";
import { emptyReview } from "../src/services/rubric.js";
import { aiAssignmentRows, aiAssignmentSummary, aiPublishStatus } from "../src/services/aiReview.js";

const now = new Date("2026-10-22T10:00:00Z");
function complete(submission: any) {
  return {
    ...clone(submission), status: "pending", draft: emptyReview(),
    aiReview: { id: `ai-${submission.id}`, state: "completed", result: sampleReview(), resultSource: "sample", attempt: 1 },
  };
}
async function setup(initial: any = createSeed(now)) {
  let saved = clone(initial), writes = 0, fail = false, time = now.getTime();
  const storage = {
    read: () => clone(saved),
    write: (state: any) => { if (fail) throw new Error("存储满"); saved = clone(state); writes++; },
  };
  const service = new MockService(storage, () => new Date(time));
  await service.signIn("teacher"); await service.bindInvitation("JS2026", "teacher");
  return { service, storage, writes: () => writes, fail: (value: boolean) => { fail = value; }, advance: (milliseconds: number) => { time += milliseconds; } };
}
function fixture() {
  const state = createSeed(now);
  const base = state.submissions[0];
  const old = complete({ ...base, id: "old", version: 1 });
  const latest = complete({ ...base, id: "latest", version: 2 });
  const edited = complete({ ...base, id: "edited", studentId: "student-2" });
  edited.draft = sampleReview(); edited.draftRevision = 1;
  edited.draft.handwriting.scores.intuitive = 4;
  edited.draft.nextSteps = "教师修改后要求先调整字距。";
  const published = { ...complete({ ...base, id: "published", studentId: "student-3" }), status: "published", published: sampleReview() };
  state.submissions = [old, latest, edited, published];
  for (const [index, phase] of ["reading", "failed", "unavailable", "notStarted"].entries()) {
    const studentId = `extra-${index}`;
    state.students.push({ ...state.students[0], id: studentId, name: `测试${index}` });
    const item = complete({ ...base, id: `skip-${phase}`, studentId });
    if (phase === "notStarted") delete item.aiReview;
    else item.aiReview.state = phase;
    state.submissions.push(item);
  }
  state.students.push({ ...state.students[0], id: "missing", name: "未交" });
  return state;
}

test("一键发布仅取最新已完成AI结果，保留教师改分、旧版及其他状态，整批一次保存", async () => {
  const env = await setup(fixture()), { service } = env;
  const before = service.read(), count = env.writes();
  const rows = aiAssignmentRows(before, "assignment-1");
  const summary = aiAssignmentSummary(rows);
  assert.equal(summary.readyToPublish, 2);
  assert.equal(summary.requiresReview, 0);
  assert.equal(rows.find((row: any) => row.submission?.id === "latest")?.publishSource, "ai");
  assert.equal(rows.find((row: any) => row.submission?.id === "edited")?.publishSource, "teacher");
  const result = await service.publishAiBatch("assignment-1", "teacher");
  assert.deepEqual(result.published, ["latest", "edited"]);
  assert.deepEqual(result.sources, { ai: 1, teacher: 1 });
  assert.equal(result.skipped, rows.length - 2);
  assert.equal(env.writes(), count + 1);
  const after = service.read();
  for (const id of result.published) {
    const previous = before.submissions.find((item: any) => item.id === id)!;
    const current = after.submissions.find((item: any) => item.id === id)!;
    assert.equal(current.status, "published");
    assert.equal(current.publishedAt, now.toISOString());
    assert.equal(current.publishedBy?.name, "陈老师");
    assert.deepEqual(current.published, id === "edited" ? previous.draft : previous.aiReview.result);
    assert.deepEqual(current.aiReview, previous.aiReview);
  }
  for (const original of before.submissions.filter((item: any) => !result.published.includes(item.id)))
    assert.deepEqual(after.submissions.find((item: any) => item.id === original.id), original);
  assert.equal(aiAssignmentSummary(aiAssignmentRows(after, "assignment-1")).readyToPublish, 0);
  assert.deepEqual((await service.publishAiBatch("assignment-1", "teacher")).published, []);
  assert.equal(env.writes(), count + 1, "重复点击不写入或重复发布");
});

test("未完成AI、残缺结果和无效教师修改不自动发布，旧无revision的修改也受保护", async () => {
  const state = createSeed(now), base = state.submissions[0];
  const malformed = complete({ ...base, id: "malformed" });
  malformed.aiReview.result = { rubricVersion: "broken" };
  const invalidDraft = complete({ ...base, id: "invalid-draft", studentId: "student-2" });
  invalidDraft.draftRevision = 1;
  const manualOnly = { ...clone(base), id: "manual-only", studentId: "student-3" };
  state.submissions = [malformed, invalidDraft, manualOnly];
  const env = await setup(state), before = env.service.read(), count = env.writes();
  const summary = aiAssignmentSummary(aiAssignmentRows(before, "assignment-1"));
  assert.equal(summary.readyToPublish, 0); assert.equal(summary.requiresReview, 2);
  const result = await env.service.publishAiBatch("assignment-1", "teacher");
  assert.deepEqual(result.published, []);
  assert.deepEqual(result.requiresReview, ["malformed", "invalid-draft"]);
  assert.deepEqual(env.service.read(), before);
  assert.equal(env.writes(), count);
  const legacy = complete({ ...base, id: "legacy" });
  legacy.draft = sampleReview(); legacy.draft.composition.summary = "没有revision字段的旧教师修改。";
  assert.deepEqual(aiPublishStatus(legacy), { publishable: true, publishSource: "teacher", publishIssue: "" });
  legacy.draft.nextSteps = "";
  assert.equal(aiPublishStatus(legacy).publishable, false);
  assert.match(aiPublishStatus(legacy).publishIssue, /订正建议/);
});

test("批量发布校验任教权限，存储失败不留下部分反馈或修改AI结果", async () => {
  const env = await setup(fixture()), { service } = env;
  const before = service.read(); env.fail(true);
  await assert.rejects(service.publishAiBatch("assignment-1", "teacher"), /存储满/);
  assert.deepEqual(service.read(), before);
  env.fail(false);
  await assert.rejects(service.publishAiBatch("assignment-1", "student"), /教师/);
  await assert.rejects(service.publishAiBatch("assignment-1", "admin"), /教师/);
  await assert.rejects(service.publishAiBatch("missing", "teacher"), /任教班级/);
  await service.restartBinding("teacher");
  await assert.rejects(service.publishAiBatch("assignment-1", "teacher"), /教师身份绑定/);
  await service.signIn("teacher"); await service.bindInvitation("LS2026", "teacher");
  await assert.rejects(service.publishAiBatch("assignment-1", "teacher"), /任教范围/);
});

test("学生与教师代交在提交时自动入AI队列，完成后即可批量发布且自选图不伪造结果", async () => {
  const env = await setup(), { service } = env;
  await service.signIn("student"); await service.bindInvitation("XS2026", "student");
  const assignment = await service.createAssignment({ title: "自动AI", requirements: "", classId: "class-1", dueAt: "" }, "teacher");
  const student = await service.submit(assignment.id, samplePhotos, "", "student");
  const teacher = await service.submitForStudent(assignment.id, "student-2", samplePhotos, "", "teacher");
  const uploaded = await service.submitForStudent(assignment.id, "student-3", [{ id: "uploaded", url: "data:image/png;base64,fixture", name: "照片" }], "", "teacher");
  assert.ok([student, teacher, uploaded].every((item: any) => item.aiReview.state === "queued"));
  service.advanceAiReviews(); env.advance(1200); service.advanceAiReviews(); env.advance(1800); service.advanceAiReviews(); env.advance(3000); service.advanceAiReviews();
  const summary = aiAssignmentSummary(aiAssignmentRows(service.read(), assignment.id));
  assert.equal(summary.readyToPublish, 2); assert.equal(summary.unavailable, 1);
  assert.deepEqual((await service.publishAiBatch(assignment.id, "teacher")).published, [student.id, teacher.id]);
  assert.equal(service.aiResult(uploaded.id, "teacher")?.result, null);
  assert.equal(service.latest(assignment.id, "student-3")?.published, null);
  assert.deepEqual(service.feedback(student.id, "student"), sampleReview());
});
