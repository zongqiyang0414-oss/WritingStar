import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeed, samplePhotos, sampleReview } from "../src/services/seed.js";
import { rubric } from "../src/services/rubric.js";
import { rankedStudents, studentSummary } from "../src/services/analytics.js";
import {
  classStatisticsModel,
  studentRankingModel,
  studentGrowthModel,
  teachingClassesModel,
} from "../src/services/pageModels.js";

const now = new Date("2026-10-15T10:00:00Z");
const rawContent = "INTERNAL_RAW_CONTENT";
const clone = (value) => JSON.parse(JSON.stringify(value));

function review(handwriting, composition) {
  const value = sampleReview();
  for (const [category, score] of Object.entries({ handwriting, composition })) {
    let remaining = score;
    value[category].scores = Object.fromEntries(
      rubric[category].map((dimension) => {
        const points = Math.min(dimension.max, remaining);
        remaining -= points;
        return [dimension.id, points];
      }),
    );
    value[category].summary = rawContent;
  }
  value.nextSteps = rawContent;
  return value;
}

function submission(id, studentId, assignmentId, version, score, submittedAt) {
  return {
    id,
    studentId,
    assignmentId,
    version,
    submittedAt,
    status: score ? "published" : "pending",
    photos: clone(samplePhotos),
    note: rawContent,
    draft: review(99, 99),
    published: score ? review(score[0], score[1]) : null,
    publishedAt: score ? submittedAt : null,
    internalSecret: rawContent,
  };
}

function fixture() {
  const state = createSeed(now);
  state.internalSecret = rawContent;
  state.students = [
    ...state.students.filter((student) => student.classId === "class-1"),
    { id: "student-quiet", name: "小青", initial: "青", classId: "class-1", className: "四年级（1）班" },
    { id: "student-archived", name: "已离班", initial: "离", classId: "class-1", archived: true },
    ...state.students.filter((student) => student.classId === "class-2"),
  ].map((student, index) => ({
    ...student,
    studentNumber: `XH00${index + 1}`,
    internalSecret: rawContent,
  }));
  state.classes = state.classes.map((schoolClass) => ({ ...schoolClass, internalSecret: rawContent }));
  state.assignments = [
    { id: "second", title: "第二次作业", classId: "class-1", createdAt: "2026-10-02T10:00:00Z", dueAt: "2026-10-14T10:00:00Z" },
    { id: "other", title: "另班作业", classId: "class-2", createdAt: "2026-10-01T10:00:00Z", dueAt: "2026-10-20T10:00:00Z" },
    { id: "empty", title: "暂无提交", classId: "class-1", createdAt: "2026-10-03T10:00:00Z", dueAt: now.toISOString() },
    { id: "first", title: "第一次作业", classId: "class-1", createdAt: "2026-10-01T10:00:00Z", dueAt: "2026-10-20T10:00:00Z" },
  ].map((assignment) => ({ ...assignment, requirements: rawContent, internalSecret: rawContent }));
  // Deliberately unsorted: current task status uses the newest submission,
  // and averages use only that same submission when published.
  state.submissions = [
    submission("he-pending", "student-1", "first", 3, null, "2026-10-13T10:00:00Z"),
    submission("lin-first", "student-2", "first", 1, [85, 80], "2026-10-11T10:00:00Z"),
    submission("he-original", "student-1", "first", 1, [81, 81], "2026-10-10T10:00:00Z"),
    submission("he-second", "student-1", "second", 1, [75, 74], "2026-10-12T10:00:00Z"),
    submission("archived-first", "student-archived", "first", 1, [100, 100], "2026-10-11T10:00:00Z"),
    submission("yu-first", "student-3", "first", 1, [70, 90], "2026-10-11T10:00:00Z"),
    submission("he-revision", "student-1", "first", 2, [85, 84], "2026-10-11T11:00:00Z"),
    submission("lin-second", "student-2", "second", 1, [75, 78], "2026-10-12T10:00:00Z"),
    submission("other-first", "student-4", "other", 1, [100, 100], "2026-10-11T10:00:00Z"),
  ];
  return state;
}

function assertKeys(value, expected) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
}

function assertPresentationOnly(value) {
  assert.ok(!JSON.stringify(value).includes(rawContent), "原始作品或额外状态不应进入页面模型");
  const forbidden = new Set([
    "photos", "draft", "accounts", "teacherAccount", "submissions",
    "requirements", "internalSecret", "scores", "comments", "nextSteps",
  ]);
  function visit(entry) {
    if (!entry || typeof entry !== "object") return;
    for (const [key, child] of Object.entries(entry)) {
      assert.ok(!forbidden.has(key), `页面模型不应包含 ${key}`);
      if (key === "published") assert.equal(typeof child, "boolean");
      visit(child);
    }
  }
  visit(value);
}

test("班级统计只取最新提交及其已发布成绩，排除离班学生及其他班级", () => {
  const model = classStatisticsModel(fixture(), "class-1", now.getTime());
  assert.equal(model.studentCount, 4);
  assert.equal(model.ongoing, 1);
  assert.equal(model.closed, 2);
  assert.deepEqual(model.assignments.map((assignment) => ({
    id: assignment.id, ongoing: assignment.ongoing, counts: assignment.counts,
  })), [
    { id: "first", ongoing: true, counts: { total: 4, missing: 1, pending: 1, completed: 2 } },
    { id: "second", ongoing: false, counts: { total: 4, missing: 2, pending: 0, completed: 2 } },
    { id: "empty", ongoing: false, counts: { total: 4, missing: 4, pending: 0, completed: 0 } },
  ].reverse());
  assert.deepEqual(model.trend.map(({ id, handwriting, composition, note }) => ({
    id, handwriting, composition, note,
  })), [
    { id: "first", handwriting: 77.5, composition: 85, note: "已审核 2 / 4 人" },
    { id: "second", handwriting: 75, composition: 76, note: "已审核 2 / 4 人" },
    { id: "empty", handwriting: null, composition: null, note: "已审核 0 / 4 人" },
  ]);
});

test("排名保留并列、未发布不计分与全班搜索名次，两套量表独立排序", () => {
  const state = fixture();
  const model = studentRankingModel(state, "class-1", "handwriting");
  assert.equal(model.studentCount, 4);
  assert.equal(model.className, "四年级（1）班");
  assert.equal(model.organizationName, "甲秀小学");
  assert.deepEqual(model.ranks.map(({ id, rank, handwriting }) => ({ id, rank, handwriting })).sort((a, b) => a.id.localeCompare(b.id)), [
    { id: "student-1", rank: 2, handwriting: 75 },
    { id: "student-2", rank: 1, handwriting: 80 },
    { id: "student-3", rank: 3, handwriting: 70 },
    { id: "student-quiet", rank: null, handwriting: null },
  ]);
  const searched = studentRankingModel(state, "class-1", "handwriting", "  小雨  ");
  assert.equal(searched.studentCount, 4);
  assert.deepEqual(searched.ranks.map(({ id, rank }) => ({ id, rank })), [{ id: "student-3", rank: 3 }]);
  assert.deepEqual(studentRankingModel(state, "class-1", "composition").ranks.map(({ id, rank }) => ({ id, rank })),
    rankedStudents(state, "class-1", "composition").map(({ id, rank }) => ({ id, rank })));
  assert.equal(studentRankingModel(state, "class-1", "composition").ranks[0].id, "student-3");
});

test("个人成长每份作业只取最新提交，最新反馈未发布不沿用旧成绩", () => {
  const state = fixture();
  const model = studentGrowthModel(state, "class-1", "student-1");
  assert.deepEqual(model.summary, studentSummary(state, "class-1", "student-1"));
  assert.deepEqual(model.summary, {
    studentId: "student-1", classId: "class-1", handwriting: 75, composition: 74,
    feedbackCount: 1, submissionCount: 2,
  });
  assert.deepEqual(model.rankEntry, { rank: 2 });
  assert.deepEqual(model.history.map(({ id, published, handwriting, composition }) => ({ id, published, handwriting, composition })), [
    { id: "he-pending", published: false, handwriting: null, composition: null },
    { id: "he-second", published: true, handwriting: 75, composition: 74 },
  ]);
  assert.deepEqual(model.trend.map(({ id, handwriting, composition }) => ({ id, handwriting, composition })),
    model.history.map(({ id, handwriting, composition }) => ({ id, handwriting, composition })));
  assert.equal(model.trend[0].note, "待审核成绩");
  assert.equal(model.organizationName, "甲秀小学");
  const learner = studentGrowthModel(state, "class-1", "student-1", "composition", "learner");
  assert.equal(learner.rankEntry, null);
  assert.deepEqual(learner.summary, model.summary);
  assert.deepEqual(learner.history, model.history);
});

test("跨班学生不可进入个人成长，未提交学生保留空白摘要", () => {
  const state = fixture();
  const missing = studentGrowthModel(state, "class-1", "student-4");
  assert.equal(missing.student, null);
  assert.equal(missing.summary, null);
  assert.equal(missing.rankEntry, null);
  assert.deepEqual(missing.history, []);
  assert.deepEqual(missing.trend, []);
  const quiet = studentGrowthModel(state, "class-1", "student-quiet");
  assert.deepEqual(quiet.rankEntry, { rank: null });
  assert.equal(quiet.summary.handwriting, null);
  assert.equal(quiet.summary.composition, null);
  assert.equal(quiet.summary.feedbackCount, 0);
  assert.deepEqual(quiet.history, []);
});

test("任教班级汇总在班学生、作业和去重提交记录，姓名学号搜索忽略空白与大小写", () => {
  const state = fixture();
  const classes = state.classes.filter((schoolClass) => ["class-1", "class-2"].includes(schoolClass.id));
  const model = teachingClassesModel(state, classes, "class-1", "  xh001  ");
  assert.deepEqual(model.classes, [
    { id: "class-1", name: "四年级（1）班", studentCount: 4, assignmentCount: 3 },
    { id: "class-2", name: "四年级（2）班", studentCount: 2, assignmentCount: 1 },
  ]);
  assert.equal(model.totalStudents, 6);
  assert.deepEqual(model.currentClass, model.classes[0]);
  assert.deepEqual(model.members.map(({ id, submissionCount }) => ({ id, submissionCount })), [
    { id: "student-1", submissionCount: 2 },
    { id: "student-2", submissionCount: 2 },
    { id: "student-3", submissionCount: 1 },
    { id: "student-quiet", submissionCount: 0 },
  ]);
  assert.deepEqual(model.filteredMembers.map(({ id }) => id), ["student-1"]);
  assert.deepEqual(teachingClassesModel(state, classes, "class-1", "小青").filteredMembers.map(({ id }) => id), ["student-quiet"]);
  assert.equal(teachingClassesModel(state, classes, "unknown").currentClass, null);
});

test("页面模型只传展示字段，原始照片、草稿、发布内容及额外状态留在数据层且不修改输入", () => {
  const state = fixture();
  const snapshot = clone(state);
  const statistics = classStatisticsModel(state, "class-1", now.getTime());
  const ranking = studentRankingModel(state, "class-1", "handwriting");
  const growth = studentGrowthModel(state, "class-1", "student-1");
  const teaching = teachingClassesModel(state, state.classes, "class-1");
  assertKeys(statistics, ["studentCount", "ongoing", "closed", "assignments", "trend"]);
  for (const row of statistics.assignments) {
    assertKeys(row, ["id", "title", "dueAt", "ongoing", "counts"]);
    assertKeys(row.counts, ["total", "missing", "pending", "completed"]);
  }
  assertKeys(ranking, ["ranks", "studentCount", "className", "organizationName"]);
  for (const row of ranking.ranks) assertKeys(row, ["id", "name", "initial", "handwriting", "composition", "feedbackCount", "rank"]);
  assertKeys(growth, ["student", "rankEntry", "summary", "history", "trend", "organizationName"]);
  assertKeys(growth.student, ["id", "name", "initial", "className"]);
  assertKeys(growth.rankEntry, ["rank"]);
  for (const row of growth.history) {
    assertKeys(row, ["id", "status", "published", "submittedAt", "assignment", "handwriting", "composition"]);
    assertKeys(row.assignment, ["title"]);
  }
  assertKeys(teaching, ["classes", "members", "filteredMembers", "currentClass", "totalStudents"]);
  for (const row of teaching.classes) assertKeys(row, ["id", "name", "studentCount", "assignmentCount"]);
  for (const row of teaching.members) assertKeys(row, ["id", "name", "initial", "studentNumber", "submissionCount"]);
  for (const model of [statistics, ranking, growth, teaching]) assertPresentationOnly(model);
  assert.deepEqual(state, snapshot);
});

test("不可变快照复用时，时间、搜索、量表、角色和下一份已发布快照仍各自更新", () => {
  const state = Object.freeze(fixture());
  const initial = studentGrowthModel(state, "class-1", "student-1");
  assert.equal(classStatisticsModel(state, "class-1", now.getTime()).ongoing, 1);
  assert.equal(classStatisticsModel(state, "class-1", Date.parse("2026-10-21T10:00:00Z")).ongoing, 0);
  assert.equal(studentRankingModel(state, "class-1", "handwriting", "小雨").ranks[0].rank, 3);
  assert.equal(studentRankingModel(state, "class-1", "composition", "小雨").ranks[0].rank, 1);
  assert.equal(studentGrowthModel(state, "class-1", "student-1", "handwriting", "learner").rankEntry, null);
  const next = clone(state);
  const revised = next.submissions.find((entry) => entry.id === "he-pending");
  revised.status = "published";
  revised.published = review(95, 96);
  const updated = studentGrowthModel(Object.freeze(next), "class-1", "student-1");
  assert.equal(initial.summary.handwriting, 75);
  assert.equal(updated.summary.handwriting, 85);
  assert.equal(updated.history[0].published, true);

  const mutable = fixture();
  studentRankingModel(mutable, "class-1", "handwriting");
  mutable.students.find((entry) => entry.id === "student-quiet").name = "改名学生";
  assert.equal(studentRankingModel(mutable, "class-1", "handwriting", "改名").ranks.length, 1);
});
