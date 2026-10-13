import type { Photo, PrototypeState, Review } from './model';
import { dimensionIds, emptyReview, RUBRIC_VERSION } from './rubric';
export const demoPhotos: Photo[] = [
  {id: 'sample-1', url: '/static/essay-1.svg', name: '作文 · 第 1 页', sample: true},
  {id: 'sample-2', url: '/static/essay-2.svg', name: '作文 · 第 2 页', sample: true}
];
export function sampleReview(): Review {
  const review = emptyReview();
  review.handwriting.scores = Object.fromEntries(dimensionIds.map((id,i) => [id,[8,48,8,9,8][i]])) as Review['handwriting']['scores'];
  review.composition.scores = Object.fromEntries(dimensionIds.map((id,i) => [id,[8,16,24,17,16][i]])) as Review['composition']['scores'];
  review.handwriting.summary = '整篇布局整洁，字与字之间的距离较均匀。练习时可以留意左右结构的比例，把每个字写得更舒展。';
  review.composition.summary = '你用一个放学路上的小故事，写出了对他人的关心。试着把帮助阿姨的过程再写具体一些，让读者也能感受到当时的情景。';
  const h = ['整体清楚、规范。请结合原作品检查标点位置；书写速度需结合课堂观察评价。','练习时留意横画的方向与收笔，逐字检查笔画是否舒展。','左右结构注意左窄右宽，避免两部分互相挤压。','段首空格保持一致，行间留白均匀。','先保持整体规范，再尝试自然、连贯的书写。'];
  const c = ['选取生活中的小事表达关心，主题明确。','“袋子里的橘子滚了出来”让场景具体；可增加人物神态。','按事情的发展顺序叙述，帮助的经过可以写得更细。','“原来，一点小小的帮助也能让人开心”表达了积极的主题。','“像小太阳”使用比喻；可补充一处动作或对话描写。'];
  dimensionIds.forEach((id,i) => {review.handwriting.comments[id] = h[i]; review.composition.comments[id] = c[i];});
  review.nextSteps = '1. 把捡橘子、递袋子的动作写具体，补充一句当时的对话。\n2. 订正时注意左右结构的间距，并保持段首空格一致。';
  review.rubricVersion = RUBRIC_VERSION;
  return review;
}
export function createSeed(now = new Date()): PrototypeState {
  const due = new Date(now); due.setDate(due.getDate() + 7); due.setHours(20,0,0,0);
  const before = new Date(now.getTime() - 3600000).toISOString();
  const later = new Date(due.getTime() + 3 * 86400000).toISOString();
  const pastDue = new Date(now.getTime() - 86400000).toISOString();
  return {schemaVersion: 2,
    classes: [{id:'class-1',name:'四年级（1）班'}, {id:'class-2',name:'四年级（2）班'}],
    assignments: [
      {id:'assignment-1', title:'放学路上的一件小事', classId:'class-1', className:'四年级（1）班', dueAt:due.toISOString(), createdAt:before, requirements:'写一件放学路上发生的小事。把事情的经过写清楚，写出你的真实感受。建议 300–400 字，字迹工整，拍照时让整页完整入镜。'},
      {id:'assignment-plan-1', title:'我想感谢的一个人', classId:'class-1', className:'四年级（1）班', dueAt:later, createdAt:now.toISOString(), requirements:'写一位你想感谢的人，用一件具体的事情说明原因。注意人物的动作、语言和自己的感受。'},
      {id:'assignment-closed-1', title:'校园里的一次发现', classId:'class-1', className:'四年级（1）班', dueAt:pastDue, createdAt:new Date(now.getTime()-8*86400000).toISOString(), requirements:'观察校园里的一处景物，把观察到的变化和自己的发现写清楚。'},
      {id:'assignment-class-2', title:'我想感谢的一个人', classId:'class-2', className:'四年级（2）班', dueAt:due.toISOString(), createdAt:before, requirements:'写一位你想感谢的人，用一件具体的事情说明原因。注意人物的动作、语言和自己的感受。'}
    ],
    students: [
      {id:'student-1',name:'小禾',initial:'禾',classId:'class-1',className:'四年级（1）班'},
      {id:'student-2',name:'小林',initial:'林',classId:'class-1',className:'四年级（1）班'},
      {id:'student-3',name:'小雨',initial:'雨',classId:'class-1',className:'四年级（1）班'},
      {id:'student-4',name:'小川',initial:'川',classId:'class-2',className:'四年级（2）班'},
      {id:'student-5',name:'小宁',initial:'宁',classId:'class-2',className:'四年级（2）班'}
    ],
    submissions: [{id:'submission-1',assignmentId:'assignment-1',studentId:'student-1',version:1,photos:JSON.parse(JSON.stringify(demoPhotos)),note:'请老师看看我的写作过程。',submittedAt:before,actor:'student',status:'pending',draft:sampleReview(),published:null,publishedAt:null}]
  };
}
