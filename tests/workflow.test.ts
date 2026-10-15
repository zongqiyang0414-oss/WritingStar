import { test } from "node:test";
import assert from "node:assert/strict";
import { MockService } from "../src/services/mock.js";
import {
  createSeed,
  sampleReview,
  samplePhotos,
} from "../src/services/seed.js";
import { rubric, total } from "../src/services/rubric.js";
const api = {
  Service: MockService,
  seed: createSeed,
  review: sampleReview,
  photos: samplePhotos,
  total,
  rubric,
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const clock = () => new Date("2026-10-15T10:00:00Z");
function setup(initial = null) {
  let saved = clone(initial),
    writes = 0,
    fail = false;
  const storage = {
    read: () => clone(saved),
    write: (state) => {
      if (fail) throw new Error("存储满");
      saved = clone(state);
      writes++;
    },
  };
  const service = new api.Service(storage, clock);
  return {
    service,
    storage,
    writes: () => writes,
    saved: () => clone(saved),
    fail: (value) => {
      fail = value;
    },
  };
}
async function bind(service, role, code) {
  await service.signIn(role);
  await service.bindInvitation(code, role);
}
function legacyState() {
  const state = clone(api.seed(clock()));
  state.schemaVersion = 5;
  delete state.studentEntryVersion;
  state.accounts = {
    student: { signedIn: false, studentId: null },
    parent: { signedIn: true, studentId: "student-1" },
  };
  state.teacherAccount = { signedIn: true, teacherId: "teacher-chen" };
  return state;
}

test("新状态仅保留学生账户，教师任教范围与双写量表延续v0.9", async () => {
  const { service } = setup();
  assert.equal(service.read().schemaVersion, 6);
  assert.deepEqual(Object.keys(service.read().accounts), ["student"]);
  await bind(service, "teacher", "JS2026");
  await bind(service, "student", "XS2026");
  assert.equal(service.read().accounts.student.studentId, "student-1");
  assert.equal(service.read().teacherAccount.teacherId, "teacher-chen");
  assert.equal(service.read().organizations.length, 2);
  assert.deepEqual(
    clone(api.rubric.handwriting.map((d) => d.max)),
    [10, 60, 10, 10, 10],
  );
  assert.deepEqual(
    clone(api.rubric.composition.map((d) => d.max)),
    [10, 20, 30, 20, 20],
  );
  assert.equal(api.total(api.review().handwriting), 81);
});
test("已移除的家长角色不能登录、绑定、读反馈或新提交", async () => {
  const { service } = setup();
  const before = service.read();
  await assert.rejects(service.signIn("parent"), /教师或学生/);
  assert.throws(() => service.previewBinding("JZ2026", "parent"), /教师或学生/);
  await assert.rejects(
    service.bindInvitation("JZ2026", "parent"),
    /教师或学生/,
  );
  await assert.rejects(service.restartBinding("parent"), /教师或学生/);
  assert.throws(() => service.feedback("submission-1", "parent"), /教师或学生/);
  await assert.rejects(
    service.submit("assignment-1", api.photos, "", "parent"),
    /仅供学生/,
  );
  assert.deepEqual(clone(service.read()), clone(before));
});
test("仅旧家长已绑定时迁入学生端，原图、评分、反馈与订正刷新保留", async () => {
  const previous = legacyState();
  const review = clone(api.review());
  review.handwriting.scores.intuitive = 9;
  review.nextSteps = "保留原建议。";
  Object.assign(previous.submissions[0], {
    actor: "parent",
    status: "published",
    draft: clone(review),
    published: clone(review),
    publishedAt: clock().toISOString(),
    note: "原说明",
    photos: [
      {
        id: "original",
        url: "data:image/png;base64,original",
        name: "原作品.png",
        sample: false,
      },
    ],
  });
  const snapshot = clone(previous);
  const { service, storage, writes } = setup(previous);
  assert.equal(writes(), 1);
  assert.equal(service.read().accounts.student.studentId, "student-1");
  assert.equal(service.read().accounts.parent, undefined);
  assert.deepEqual(
    clone(service.read().legacyParentAccount),
    snapshot.accounts.parent,
  );
  assert.deepEqual(clone(service.read().submissions), snapshot.submissions);
  assert.deepEqual(previous, snapshot);
  assert.equal(
    api.total(service.feedback("submission-1", "student").handwriting),
    82,
  );
  const revision = await service.submit(
    "assignment-1",
    api.photos,
    "学生订正",
    "student",
  );
  assert.equal(revision.actor, "student");
  assert.equal(revision.version, 2);
  await service.finishAnalysis(revision.id);
  await service.publish(revision.id, api.review(), "teacher");
  const reload = new api.Service(storage, clock);
  assert.deepEqual(
    clone(reload.read().submissions[0]),
    snapshot.submissions[0],
  );
  assert.equal(
    api.total(reload.feedback("submission-1", "student").handwriting),
    82,
  );
  assert.equal(
    api.total(reload.feedback(revision.id, "student").handwriting),
    81,
  );
});
test("两种旧绑定指向不同学生时优先延续学生绑定并保留旧绑定资料", () => {
  const previous = legacyState();
  previous.accounts.student = { signedIn: true, studentId: "student-4" };
  const snapshot = clone(previous);
  const { service, storage, writes } = setup(previous);
  assert.deepEqual(
    clone(service.read().accounts.student),
    snapshot.accounts.student,
  );
  assert.deepEqual(
    clone(service.read().legacyParentAccount),
    snapshot.accounts.parent,
  );
  assert.deepEqual(clone(service.read().submissions), snapshot.submissions);
  new api.Service(storage, clock);
  assert.equal(writes(), 1);
});
test("schema 4升级保留作品并合并旧家长绑定", () => {
  const previous = legacyState();
  previous.schemaVersion = 4;
  delete previous.teachers;
  delete previous.teacherAccount;
  const snapshot = clone(previous);
  const { service } = setup(previous);
  assert.equal(service.read().schemaVersion, 6);
  assert.equal(service.read().accounts.student.studentId, "student-1");
  assert.deepEqual(clone(service.read().submissions), snapshot.submissions);
  assert.deepEqual(previous, snapshot);
});
test("迁移保存失败不改写原数据，重试后只保存一次", () => {
  const previous = legacyState(),
    snapshot = clone(previous);
  let saved = clone(previous),
    fail = true,
    writes = 0;
  const storage = {
    read: () => clone(saved),
    write: (state) => {
      if (fail) throw new Error("存储满");
      saved = clone(state);
      writes++;
    },
  };
  assert.throws(() => new api.Service(storage, clock), /存储满/);
  assert.deepEqual(saved, snapshot);
  fail = false;
  new api.Service(storage, clock);
  new api.Service(storage, clock);
  assert.equal(writes, 1);
  assert.equal(saved.schemaVersion, 6);
});
test("任教与学生班级隔离保留，旧学习码可作为学生别名，自选图片不伪造评分", async () => {
  const { service } = setup();
  await bind(service, "teacher", "LS2026");
  await bind(service, "student", "CJ2026");
  assert.equal(service.read().accounts.student.studentId, "student-4");
  await assert.rejects(
    service.createAssignment(
      {
        title: "越班",
        requirements: "要求",
        classId: "class-1",
        dueAt: "2026-10-22T10:00:00Z",
      },
      "teacher",
    ),
    /任教范围/,
  );
  await assert.rejects(
    service.submit("assignment-1", api.photos, "", "student"),
    /所在班级/,
  );
  const assignment = await service.createAssignment(
    {
      title: "本班作业",
      requirements: "要求",
      classId: "class-2",
      dueAt: "2026-10-22T10:00:00Z",
    },
    "teacher",
  );
  const submission = await service.submit(
    assignment.id,
    [
      {
        id: "mine",
        url: "data:image/png;base64,user",
        name: "自己的作品.png",
        sample: false,
      },
    ],
    "",
    "student",
  );
  await service.finishAnalysis(submission.id);
  const pending = service.latest(assignment.id, "student-4");
  assert.equal(api.total(pending.draft.handwriting), null);
  assert.equal(service.feedback(submission.id, "student"), null);
  await assert.rejects(
    service.publish(submission.id, pending.draft, "teacher"),
  );
  await service.publish(submission.id, api.review(), "teacher");
  assert.equal(
    api.total(service.feedback(submission.id, "student").composition),
    81,
  );
});
test("未分配班级教师、过期码与错误身份不能建立错误关联", async () => {
  const { service } = setup();
  await bind(service, "teacher", "WK2026");
  await assert.rejects(
    service.createAssignment(
      {
        title: "无任教班",
        requirements: "要求",
        classId: "class-1",
        dueAt: "2026-10-22T10:00:00Z",
      },
      "teacher",
    ),
    /任教范围/,
  );
  await service.signIn("student");
  const before = clone(service.read());
  assert.throws(() => service.previewBinding("EX2026", "student"), /过期/);
  assert.throws(
    () => service.previewBinding("JS2026", "student"),
    /教师邀请码/,
  );
  assert.deepEqual(clone(service.read()), before);
});
