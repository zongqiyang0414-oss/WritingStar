import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/services/seed.js";
import { migrateStudentEntry } from "../src/services/migration.js";
import { MockService } from "../src/services/mock.js";

test("旧 schema 6 示例学校更名且保留绑定、班级和作品", () => {
  const previous = createSeed(new Date("2026-10-22T08:00:00Z"));
  previous.organizations[0].name = "星河小学";
  previous.teacherAccount = { signedIn: true, teacherId: "teacher-chen" };
  previous.accounts.student = { signedIn: true, studentId: "student-1" };
  const before = JSON.parse(JSON.stringify(previous));
  const migrated = migrateStudentEntry(previous);
  assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.organizations[0].name, "甲秀小学");
  assert.equal(migrated.organizations[1].name, "青禾学习中心");
  assert.deepEqual(migrated.teacherAccount, before.teacherAccount);
  assert.deepEqual(migrated.accounts, before.accounts);
  assert.deepEqual(migrated.classes, before.classes);
  assert.deepEqual(migrated.assignments, before.assignments);
  assert.deepEqual(migrated.submissions, before.submissions);
  assert.deepEqual(previous, before);
  assert.equal(migrateStudentEntry(migrated), migrated);
  const service = new MockService({ read: () => previous, write: () => {} });
  assert.equal(service.snapshot().organizations[0].name, "甲秀小学");
});

test("学校更名迁移不覆盖用户自定义名称或其他组织", () => {
  const customized = createSeed();
  customized.organizations[0].name = "用户的学校";
  customized.organizations[1].name = "星河小学";
  assert.equal(migrateStudentEntry(customized), customized);
  assert.equal(customized.organizations[0].name, "用户的学校");
  assert.equal(customized.organizations[1].name, "星河小学");
});
