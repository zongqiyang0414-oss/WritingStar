import type { Category, Evaluation, PrototypeState, Review } from './model';
import { classAssignments } from './school';
import { demoPhotos, sampleReview } from './seed';
import { dimensionIds, emptyReview, rubric } from './rubric';

// Explicitly requested fictional classroom records. Never score user-uploaded work.
const studentNames = [
  '王梓涵', '李思远', '张雨桐', '刘子轩', '陈语汐', '杨浩然', '黄诗涵', '赵一诺', '周明轩', '吴欣妍',
  '徐嘉宁', '孙瑞霖', '朱若溪', '马晨阳', '胡佳悦', '郭书睿', '林可欣', '何宇辰', '高芷晴', '罗景行',
  '郑安琪', '梁亦帆', '谢沐瑶', '宋知礼', '唐婉宁', '许博文', '邓心怡', '冯奕辰', '韩雅雯', '曹俊熙',
  '曾乐言', '彭星宇', '肖梦琪', '田泽楷', '董念慈', '袁清越', '潘嘉禾', '于舒然', '蒋文昊', '蔡锦程',
  '魏可岚', '叶承泽', '杜晓彤', '苏逸凡', '余佳宁', '丁柏舟', '程语嫣', '陆子墨', '沈书瑶', '夏之恒'
];
const tasks = [
  ['我的乐园', '选择一处让你快乐的地方，写清它的样子和在那里发生的趣事。'],
  ['我的动物朋友', '介绍一位动物朋友，结合外形、习性和具体事例写出它的特点。'],
  ['春天的校园', '按观察顺序描写校园的春景，抓住颜色、声音和变化。'],
  ['一次难忘的合作', '写一次和同伴共同完成任务的经历，说明困难和解决过程。'],
  ['我学会了做一道菜', '写清学习做菜的步骤，描写遇到的困难和成功后的感受。'],
  ['家乡的节日', '介绍家乡的一种节日习俗，写出亲身参与的经历。'],
  ['窗外的风景', '观察窗外的景物，按一定顺序描写，表达自己的感受。'],
  ['给未来的自己写封信', '用书信的形式写下当前的愿望，并说明准备怎样努力。'],
  ['一次小小的勇敢', '选择一次克服害怕的经历，写清行动和前后的心理变化。'],
  ['我心中的美好世界', '展开合理想象，描写一个美好的世界，写出其中的生活场景。']
];
const day = 86400000;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function fillScores(evaluation: Evaluation, category: Category, score: number, offset: number) {
  const values = rubric[category].map(d => Math.floor(score * d.max / 100));
  let remaining = score - values.reduce((sum, value) => sum + value, 0);
  for (let step = 0; remaining; step++) {
    const index = (step + offset) % dimensionIds.length;
    if (values[index] < rubric[category][index].max) {values[index]++; remaining--;}
  }
  dimensionIds.forEach((id, i) => {evaluation.scores[id] = values[i];});
}

function classroomReview(studentIndex: number, taskIndex: number, title: string): Review {
  const review = emptyReview();
  const score = (category: Category) => {
    const ability = 64 + (studentIndex * (category === 'handwriting' ? 11 : 7) + (category === 'handwriting' ? 0 : 9)) % 24;
    const fluctuation = (studentIndex * 17 + taskIndex * 13 + (category === 'handwriting' ? 3 : 8)) % 9 - 4;
    return Math.max(58, Math.min(98, ability + Math.round(taskIndex * 0.65) + fluctuation));
  };
  fillScores(review.handwriting, 'handwriting', score('handwriting'), studentIndex % 5);
  fillScores(review.composition, 'composition', score('composition'), (studentIndex + 2) % 5);
  review.handwriting.summary = '页面布局清楚，字迹易于辨认。继续留意字的重心、笔画方向和行间距，保持书写的稳定性。';
  review.composition.summary = `能够围绕《${title}》组织内容，表达自己的观察和感受。修改时补充关键细节，让叙述更加具体。`;
  const handwriting = ['整体书写规范，注意标点的位置。', '横画方向较稳定，收笔可以更清楚。', '左右结构注意各部分的比例。', '段首空格和行间距保持一致。', '在规范基础上尝试自然、连贯的表达。'];
  const composition = ['选材与题目相关，表达较清楚。', '增加一处具体的动作、语言或景物描写。', '叙述顺序清楚，重点部分可写得更充分。', '能表达积极的认识和自己的感受。', '尝试恰当的修辞，使语言更生动。'];
  dimensionIds.forEach((id, i) => {review.handwriting.comments[id] = handwriting[i]; review.composition.comments[id] = composition[i];});
  review.nextSteps = '1. 补充最重要的一处细节，再读一遍检查语句。\n2. 选三个字练习结构比例，保持段首空格与行间距。';
  return review;
}

export function fillClassPractice(state: PrototypeState, now = new Date()): PrototypeState {
  if (state.classPracticeVersion === 1) return state;
  const schoolClass = state.classes.find(c => c.id === 'class-1');
  if (!schoolClass) return state;
  const next: PrototypeState = {...state, assignments: [...state.assignments], students: [...state.students], submissions: [...state.submissions]};
  const newTaskIds = new Set<string>();
  tasks.forEach(([title, requirements], i) => {
    const id = `practice-v041-assignment-${i + 1}`;
    newTaskIds.add(id);
    if (next.assignments.some(a => a.id === id)) return;
    const daysAgo = i < 8 ? 63 - i * 7 : i === 8 ? 5 : 2;
    const createdAt = new Date(now.getTime() - daysAgo * day);
    const dueAt = new Date(createdAt.getTime() + 7 * day);
    dueAt.setHours(20, 0, 0, 0);
    next.assignments.push({id, title, requirements: requirements + ' 建议300—400字，字迹工整，分段清楚。', classId: schoolClass.id, className: schoolClass.name, createdAt: createdAt.toISOString(), dueAt: dueAt.toISOString()});
  });
  studentNames.forEach((name, i) => {
    const id = `practice-v041-student-${i + 1}`;
    if (!next.students.some(s => s.id === id)) next.students.push({id, name, initial: name[0], classId: schoolClass.id, className: schoolClass.name});
  });
  const assignments = classAssignments(next, schoolClass.id);
  const students = next.students.filter(s => s.classId === schoolClass.id);
  const occupied = new Set(next.submissions.map(s => `${s.assignmentId}:${s.studentId}`));
  students.forEach((student, studentIndex) => assignments.forEach((assignment, taskIndex) => {
    if (occupied.has(`${assignment.id}:${student.id}`)) return;
    const isXiaoHe = student.id === 'student-1';
    if (isXiaoHe && !newTaskIds.has(assignment.id)) return;
    const submittedAt = new Date(Math.min(Date.parse(assignment.createdAt) + 2 * day, now.getTime() - 2 * 3600000) + studentIndex * 60000);
    // A recent pre-existing assignment may have been created less than two hours ago.
    submittedAt.setTime(Math.max(submittedAt.getTime(), Date.parse(assignment.createdAt)));
    submittedAt.setTime(Math.min(submittedAt.getTime(), now.getTime()));
    const review = isXiaoHe ? sampleReview() : classroomReview(studentIndex, taskIndex, assignment.title);
    const publishedAt = new Date(Math.min(submittedAt.getTime() + 3600000, now.getTime())).toISOString();
    next.submissions.push({id: `practice-v041-${assignment.id}-${student.id}`, assignmentId: assignment.id, studentId: student.id,
      version: 1, photos: copy(demoPhotos), note: '已完成习作，请老师查看。', actor: 'student', submittedAt: submittedAt.toISOString(),
      status: isXiaoHe ? 'pending' : 'published', draft: copy(review), published: isXiaoHe ? null : review, publishedAt: isXiaoHe ? null : publishedAt});
  }));
  next.classPracticeVersion = 1;
  return next;
}
