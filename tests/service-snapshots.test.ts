import { test } from "node:test";
import assert from "node:assert/strict";
import { MockService } from "../src/services/mock.js";
import { createSeed, samplePhotos, sampleReview } from "../src/services/seed.js";
import { emptyReview, total } from "../src/services/rubric.js";
import {
  assignmentCounts,
  latestPublishedSubmission,
  latestSubmission,
  studentReports,
  studentSubmissions,
} from "../src/services/school.js";
import {
  rankedStudents,
  studentHistory,
  studentSummary,
} from "../src/services/analytics.js";

const clock = () => new Date("2026-10-15T10:00:00Z");
const copy = (value) => JSON.parse(JSON.stringify(value));
function setup() {
  let saved = null,
    failing = false;
  const service = new MockService({
    read: () => copy(saved),
    write: (state) => {
      if (failing) throw new Error("存储满");
      saved = copy(state);
    },
  }, clock);
  return {
    service,
    saved: () => copy(saved),
    fail: (value) => { failing = value; },
  };
}

test("只读快照可重复读取，账户与草稿更新保留旧快照和无关作品", async () => {
  const { service, saved, fail } = setup();
  service.prepareClassPractice();
  const initial = service.snapshot();
  assert.equal(service.snapshot(), initial);
  assert.equal(Object.isFrozen(initial.submissions[0].draft.handwriting.scores), true);
  assert.equal(Reflect.set(initial.accounts.student, "signedIn", true), false);
  assert.equal(initial.accounts.student.signedIn, false);
  const editable = service.read();
  editable.submissions[0].draft.nextSteps = "只修改独立副本";
  assert.notEqual(initial.submissions[0].draft.nextSteps, editable.submissions[0].draft.nextSteps);

  await service.signIn("teacher");
  const signedIn = service.snapshot();
  assert.equal(initial.teacherAccount.signedIn, false);
  assert.equal(signedIn.submissions, initial.submissions);
  await service.bindInvitation("JS2026", "teacher");
  const beforeDraft = service.snapshot(),
    review = sampleReview();
  review.nextSteps = "下一次请补充具体细节。";
  await service.saveDraft("submission-1", review, "teacher");
  const afterDraft = service.snapshot();
  review.nextSteps = "调用方稍后修改";
  assert.equal(afterDraft.submissions[0].draft.nextSteps, "下一次请补充具体细节。");
  assert.equal(afterDraft.assignments, beforeDraft.assignments);
  assert.notEqual(afterDraft.submissions, beforeDraft.submissions);
  assert.equal(afterDraft.submissions[1], beforeDraft.submissions[1]);
  assert.equal(afterDraft.submissions[0].photos, beforeDraft.submissions[0].photos);
  assert.notEqual(beforeDraft.submissions[0].draft.nextSteps, afterDraft.submissions[0].draft.nextSteps);

  const persisted = saved();
  fail(true);
  await assert.rejects(service.publish("submission-1", sampleReview(), "teacher"), /存储满/);
  assert.equal(service.snapshot(), afterDraft);
  assert.deepEqual(saved(), persisted);
  fail(false);
  await service.publish("submission-1", sampleReview(), "teacher");
  const published = service.snapshot();
  assert.equal(afterDraft.submissions[0].published, null);
  assert.equal(latestSubmission(published, "assignment-1", "student-1").status, "published");
  assert.equal(total(published.submissions[0].published.handwriting), 81);
});

test("冻结快照中提交、分析和人工批阅按新作品更新，原反馈保留", async () => {
  const { service } = setup();
  await service.signIn("teacher");
  await service.bindInvitation("JS2026", "teacher");
  await service.signIn("student");
  await service.bindInvitation("XS2026", "student");
  await service.publish("submission-1", sampleReview(), "teacher");
  const original = service.snapshot();
  const revision = await service.submit("assignment-1", [{
    ...samplePhotos[0], id: "own-photo", sample: false,
  }], "学生订正", "student");
  const processing = service.snapshot();
  assert.equal(original.submissions.length, 1);
  assert.equal(processing.submissions[0], original.submissions[0]);
  assert.equal(latestSubmission(processing, "assignment-1", "student-1").id, revision.id);
  assert.equal(latestPublishedSubmission(processing, "assignment-1", "student-1").id, "submission-1");
  await service.finishAnalysis(revision.id, true);
  const failed = service.snapshot();
  assert.equal(latestSubmission(failed, "assignment-1", "student-1").status, "failed");
  await service.manualReview(revision.id, "teacher");
  const pending = service.snapshot();
  assert.equal(latestSubmission(pending, "assignment-1", "student-1").status, "pending");
  assert.equal(total(latestSubmission(pending, "assignment-1", "student-1").draft.handwriting), null);
  assert.equal(service.feedback(revision.id, "student"), null);
  assert.deepEqual(service.feedback("submission-1", "student"), sampleReview());
  await service.createAssignment({
    title: "新习作", requirements: "写清一件小事。", classId: "class-1",
    dueAt: "2026-10-22T10:00:00Z",
  }, "teacher");
  const assigned = service.snapshot();
  assert.equal(assigned.submissions, pending.submissions);
  await service.restartBinding("student");
  assert.equal(service.snapshot().accounts.student.studentId, null);
  assert.equal(assigned.accounts.student.studentId, "student-1");
});

test("统计与成长历史按最新版本计状态、按最新已发布版本计分并隔离班级", () => {
  const state = createSeed(clock()),
    assignment = state.assignments[0],
    second = { ...assignment, id: "assignment-2", createdAt: "2026-10-15T10:00:00Z" },
    student = state.students[0];
  state.assignments = [assignment, second, state.assignments[3]];
  state.students = [student,
    { ...student, id: "student-2", name: "同学乙" },
    { ...student, id: "student-3", name: "暂无反馈" },
    { ...student, id: "archived", name: "已归档", archived: true },
  ];
  const original = {
    ...state.submissions[0], status: "published", published: sampleReview(),
    publishedAt: clock().toISOString(),
  }, higher = sampleReview();
  higher.handwriting.scores.intuitive = 9;
  higher.composition.scores.intuitive = 9;
  state.submissions = [
    original,
    { ...original, id: "revision", version: 2, status: "pending", published: null,
      draft: emptyReview(), submittedAt: "2026-10-15T10:00:00Z" },
    { ...original, id: "student-2-first", studentId: "student-2" },
    { ...original, id: "student-2-second", studentId: "student-2", assignmentId: second.id, published: higher },
    { ...original, id: "archived-first", studentId: "archived" },
    { ...original, id: "different-class", assignmentId: "assignment-class-2" },
  ];
  const service = new MockService({ read: () => state, write: () => {} }, clock),
    snapshot = service.snapshot(),
    reports = studentReports(snapshot, "class-1");
  assert.deepEqual(assignmentCounts(snapshot, assignment), { missing: 1, pending: 1, completed: 1, total: 3 });
  assert.deepEqual(assignmentCounts(snapshot, second), { missing: 2, pending: 0, completed: 1, total: 3 });
  assert.deepEqual(reports.map(({ id, missing, pending, completed, feedbackCount, handwriting, composition }) =>
    ({ id, missing, pending, completed, feedbackCount, handwriting, composition })), [
    { id: "student-1", missing: 1, pending: 1, completed: 0, feedbackCount: 1, handwriting: 81, composition: 81 },
    { id: "student-2", missing: 0, pending: 0, completed: 2, feedbackCount: 2, handwriting: 81.5, composition: 81.5 },
    { id: "student-3", missing: 2, pending: 0, completed: 0, feedbackCount: 0, handwriting: null, composition: null },
  ]);
  assert.deepEqual(rankedStudents(snapshot, "class-1", "handwriting").map(({ id, rank }) => ({ id, rank })), [
    { id: "student-2", rank: 1 }, { id: "student-1", rank: 2 }, { id: "student-3", rank: null },
  ]);
  assert.equal(rankedStudents(snapshot, "class-1", "composition", " 同学乙 ")[0].rank, 1);
  assert.deepEqual(studentHistory(snapshot, "class-1", "student-1").map(item => item.id), ["submission-1", "revision"]);
  assert.deepEqual(studentSummary(snapshot, "class-1", "student-1"), {
    studentId: "student-1", classId: "class-1", handwriting: 81, composition: 81,
    feedbackCount: 1, submissionCount: 2, revisionCount: 1,
  });
  assert.deepEqual(studentHistory(snapshot, "class-2", "student-1"), []);
  assert.equal(studentSummary(snapshot, "class-2", "student-1"), null);
  const history = studentSubmissions(snapshot, "student-1");
  history.pop();
  assert.equal(studentSubmissions(snapshot, "student-1").length, 3);
});

test("可变调用方修改版本与发布状态后查询不沿用过期索引", () => {
  const state = createSeed(clock());
  assert.equal(latestPublishedSubmission(state, "assignment-1", "student-1"), null);
  const revision = { ...state.submissions[0], id: "revision", version: 2 };
  state.submissions.push(revision);
  assert.equal(latestSubmission(state, "assignment-1", "student-1"), revision);
  revision.published = sampleReview();
  assert.equal(latestPublishedSubmission(state, "assignment-1", "student-1"), revision);
});
