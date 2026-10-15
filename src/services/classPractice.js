import { DIMENSION_IDS, emptyReview, rubric } from "./rubric.js";
import { classAssignments } from "./school.js";
import { samplePhotos, sampleReview } from "./seed.js";

export const DEMO_STUDENT_NAMES = [
  "王梓涵",
  "李思远",
  "张雨桐",
  "刘子轩",
  "陈语汐",
  "杨浩然",
  "黄诗涵",
  "赵一诺",
  "周明轩",
  "吴欣妍",
  "徐嘉宁",
  "孙瑞霖",
  "朱若溪",
  "马晨阳",
  "胡佳悦",
  "郭书睿",
  "林可欣",
  "何宇辰",
  "高芷晴",
  "罗景行",
  "郑安琪",
  "梁亦帆",
  "谢沐瑶",
  "宋知礼",
  "唐婉宁",
  "许博文",
  "邓心怡",
  "冯奕辰",
  "韩雅雯",
  "曹俊熙",
  "曾乐言",
  "彭星宇",
  "肖梦琪",
  "田泽楷",
  "董念慈",
  "袁清越",
  "潘嘉禾",
  "于舒然",
  "蒋文昊",
  "蔡锦程",
  "魏可岚",
  "叶承泽",
  "杜晓彤",
  "苏逸凡",
  "余佳宁",
  "丁柏舟",
  "程语嫣",
  "陆子墨",
  "沈书瑶",
  "夏之恒",
];
export const DEMO_ASSIGNMENTS = [
  ["我的乐园", "选择一处让你快乐的地方，写清它的样子和在那里发生的趣事。"],
  ["我的动物朋友", "介绍一位动物朋友，结合外形、习性和具体事例写出它的特点。"],
  ["春天的校园", "按观察顺序描写校园的春景，抓住颜色、声音和变化。"],
  ["一次难忘的合作", "写一次和同伴共同完成任务的经历，说明困难和解决过程。"],
  ["我学会了做一道菜", "写清学习做菜的步骤，描写遇到的困难和成功后的感受。"],
  ["家乡的节日", "介绍家乡的一种节日习俗，写出亲身参与的经历。"],
  ["窗外的风景", "观察窗外的景物，按一定顺序描写，表达自己的感受。"],
  ["给未来的自己写封信", "用书信的形式写下当前的愿望，并说明准备怎样努力。"],
  ["一次小小的勇敢", "选择一次克服害怕的经历，写清行动和前后的心理变化。"],
  [
    "我心中的美好世界",
    "展开合理想象，描写一个美好的世界，写出其中的生活场景。",
  ],
];
export const PRACTICE_DAY_MS = 864e5;
export const practiceTime = (e) => JSON.parse(JSON.stringify(e));
export function seededReview(assignmentIndex, studentIndex, version, offset) {
  const l = rubric[studentIndex].map((e) =>
    Math.floor((version * e.max) / 100),
  );
  let n = version - l.reduce((e, a) => e + a, 0);
  for (let i = 0; n; i++) {
    const e = (i + offset) % DIMENSION_IDS.length;
    l[e] < rubric[studentIndex][e].max && (l[e]++, n--);
  }
  DIMENSION_IDS.forEach((a, t) => {
    assignmentIndex.scores[a] = l[t];
  });
}
export function withClassPractice(state, now = new Date()) {
  if (1 === state.classPracticeVersion) return state;
  const t = state.classes.find((e) => "class-1" === e.id);
  if (!t) return state;
  const s = {
      ...state,
      assignments: [...state.assignments],
      students: [...state.students],
      submissions: [...state.submissions],
    },
    l = new Set();
  DEMO_ASSIGNMENTS.forEach(([e, n], i) => {
    const u = `practice-v041-assignment-${i + 1}`;
    if ((l.add(u), s.assignments.some((e) => e.id === u))) return;
    const d = i < 8 ? 63 - 7 * i : 8 === i ? 5 : 2,
      o = new Date(now.getTime() - d * PRACTICE_DAY_MS),
      c = new Date(o.getTime() + 7 * PRACTICE_DAY_MS);
    c.setHours(20, 0, 0, 0);
    s.assignments.push({
      id: u,
      title: e,
      requirements: n + " 建议300—400字，字迹工整，分段清楚。",
      classId: t.id,
      className: t.name,
      createdAt: o.toISOString(),
      dueAt: c.toISOString(),
    });
  });
  DEMO_STUDENT_NAMES.forEach((e, a) => {
    const l = `practice-v041-student-${a + 1}`;
    s.students.some((e) => e.id === l) ||
      s.students.push({
        id: l,
        name: e,
        initial: e[0],
        classId: t.id,
        className: t.name,
      });
  });
  const n = classAssignments(s, t.id),
    i = s.students.filter((e) => e.classId === t.id),
    u = new Set(s.submissions.map((e) => `${e.assignmentId}:${e.studentId}`));
  i.forEach((e, t) =>
    n.forEach((n, i) => {
      if (u.has(`${n.id}:${e.id}`)) return;
      const d = "student-1" === e.id;
      if (d && !l.has(n.id)) return;
      const o = new Date(
        Math.min(
          Date.parse(n.createdAt) + 2 * PRACTICE_DAY_MS,
          now.getTime() - 72e5,
        ) +
          6e4 * t,
      );
      o.setTime(Math.max(o.getTime(), Date.parse(n.createdAt)));
      o.setTime(Math.min(o.getTime(), now.getTime()));
      const c = d
          ? sampleReview()
          : (function (e, a, t) {
              const s = emptyReview(),
                l = (t) => {
                  const s =
                      64 +
                      ((e * ("handwriting" === t ? 11 : 7) +
                        ("handwriting" === t ? 0 : 9)) %
                        24),
                    l =
                      ((17 * e + 13 * a + ("handwriting" === t ? 3 : 8)) % 9) -
                      4;
                  return Math.max(
                    58,
                    Math.min(98, s + Math.round(0.65 * a) + l),
                  );
                };
              seededReview(
                s.handwriting,
                "handwriting",
                l("handwriting"),
                e % 5,
              );
              seededReview(
                s.composition,
                "composition",
                l("composition"),
                (e + 2) % 5,
              );
              s.handwriting.summary =
                "页面布局清楚，字迹易于辨认。继续留意字的重心、笔画方向和行间距，保持书写的稳定性。";
              s.composition.summary = `能够围绕《${t}》组织内容，表达自己的观察和感受。修改时补充关键细节，让叙述更加具体。`;
              const n = [
                  "整体书写规范，注意标点的位置。",
                  "横画方向较稳定，收笔可以更清楚。",
                  "左右结构注意各部分的比例。",
                  "段首空格和行间距保持一致。",
                  "在规范基础上尝试自然、连贯的表达。",
                ],
                i = [
                  "选材与题目相关，表达较清楚。",
                  "增加一处具体的动作、语言或景物描写。",
                  "叙述顺序清楚，重点部分可写得更充分。",
                  "能表达积极的认识和自己的感受。",
                  "尝试恰当的修辞，使语言更生动。",
                ];
              DIMENSION_IDS.forEach((e, a) => {
                s.handwriting.comments[e] = n[a];
                s.composition.comments[e] = i[a];
              });
              s.nextSteps =
                "1. 补充最重要的一处细节，再读一遍检查语句。\n2. 选三个字练习结构比例，保持段首空格与行间距。";
              return s;
            })(t, i, n.title),
        r = new Date(Math.min(o.getTime() + 36e5, now.getTime())).toISOString();
      s.submissions.push({
        id: `practice-v041-${n.id}-${e.id}`,
        assignmentId: n.id,
        studentId: e.id,
        version: 1,
        photos: practiceTime(samplePhotos),
        note: "已完成习作，请老师查看。",
        actor: "student",
        submittedAt: o.toISOString(),
        status: d ? "pending" : "published",
        draft: practiceTime(c),
        published: d ? null : c,
        publishedAt: d ? null : r,
      });
    }),
  );
  s.classPracticeVersion = 1;
  return s;
}
