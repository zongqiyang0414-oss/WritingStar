import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, sampleReview } from '../src/services/seed';
import { clone } from '../src/services/mock';
import { rubric } from '../src/services/rubric';
import { classTrend, studentAttempts, studentRanking, studentTrend } from '../src/services/analytics';
import type { Review, Submission } from '../src/services/model';

const now = new Date('2026-10-14T10:00:00+08:00');
function review(handwriting: number, composition: number): Review {
  const result = sampleReview();
  for (const category of ['handwriting','composition'] as const) {
    let rest = category === 'handwriting' ? handwriting : composition;
    for (const dimension of rubric[category]) {
      result[category].scores[dimension.id] = Math.min(rest, dimension.max);
      rest -= result[category].scores[dimension.id]!;
    }
  }
  return result;
}
function scored(base: Submission, id: string, studentId: string, assignmentId: string, version: number, handwriting: number, composition: number): Submission {
  const scores = review(handwriting, composition);
  return {...clone(base), id, studentId, assignmentId, version, status:'published',
    draft:clone(scores), published:scores, publishedAt:now.toISOString()};
}

test('班级趋势每项作业按每名学生最近已发布成绩求均分，保留无成绩空点和教学顺序', () => {
  const state = createSeed(now); const base = state.submissions[0];
  const assignments = state.assignments.filter(a => a.classId === 'class-1');
  assignments.forEach((a,i) => {a.createdAt = new Date(now.getTime()+i*1000).toISOString();});
  state.submissions = [
    scored(base,'old','student-1',assignments[0].id,1,60,50),
    scored(base,'latest','student-1',assignments[0].id,2,90,80),
    scored(base,'other','student-2',assignments[0].id,1,70,60),
    {...clone(base),id:'draft',version:3,draft:review(100,100)},
    scored(base,'cross-class','student-4',assignments[0].id,1,100,100),
    scored(base,'next','student-1',assignments[1].id,1,0,0),
  ];
  const trend = classTrend(state,'class-1');
  assert.deepEqual(trend.map(p=>p.id),assignments.map(a=>a.id));
  assert.equal(trend[0].handwriting,80); assert.equal(trend[0].composition,70);
  assert.equal(trend[0].note,'已发布 2 / 3 人');
  assert.equal(trend[1].handwriting,0); assert.equal(trend[2].handwriting,null);
  assert.ok(classTrend(state,'class-2').every(p=>p.handwriting===null));
});

test('全班排名区分书写写作，均分并列保留名次，搜索不重新排名，无成绩不按零分排', () => {
  const state = createSeed(now); const base = state.submissions[0];
  state.students.push({...state.students[0],id:'student-zero',name:'零分学生'});
  state.submissions = [scored(base,'one','student-1','assignment-1',1,80,70),
    scored(base,'two','student-2','assignment-1',1,80,90),
    scored(base,'zero','student-zero','assignment-1',1,0,0),
    scored(base,'foreign','student-4','assignment-class-2',1,100,100)];
  const handwriting=studentRanking(state,'class-1','handwriting');
  assert.deepEqual(handwriting.map(s=>s.rank),[1,1,3,null]);
  assert.equal(handwriting[2].handwriting,0); assert.equal(handwriting[3].id,'student-3');
  const writing=studentRanking(state,'class-1','composition');
  assert.equal(writing[0].id,'student-2'); assert.equal(writing[1].rank,2);
  const search=studentRanking(state,'class-1','composition','  小禾 ');
  assert.equal(search.length,1); assert.equal(search[0].rank,2);
  assert.equal(studentRanking(state,'class-1','composition','不存在').length,0);
});

test('个人成长按提交时间保留每轮已发布成绩，未发布草稿留空，名单均分仍按作业去重', () => {
  const state = createSeed(now); const base = state.submissions[0];
  const first=scored(base,'first','student-1','assignment-1',1,70,60);
  first.submittedAt='2026-10-12T10:00:00+08:00';
  const second=scored(base,'second','student-1','assignment-1',2,90,80);
  second.submittedAt='2026-10-13T10:00:00+08:00';
  const pending={...clone(base),id:'pending',version:3,submittedAt:now.toISOString(),draft:review(100,100)};
  state.submissions=[pending,second,first];
  const trend=studentTrend(state,'class-1','student-1');
  assert.deepEqual(trend.map(p=>p.id),['first','second','pending']);
  assert.deepEqual(trend.map(p=>p.handwriting),[70,90,null]);
  assert.equal(studentRanking(state,'class-1','handwriting')[0].handwriting,90);
  const before=clone(state); studentAttempts(state,'class-1','student-1');
  assert.deepEqual(state,before);
});

test('个人成长拒绝跨班学生和作业，不泄漏其他学生的提交', () => {
  const state=createSeed(now); const base=state.submissions[0];
  state.submissions=[scored(base,'mine','student-1','assignment-1',1,80,70),
    scored(base,'foreign-assignment','student-1','assignment-class-2',1,100,100),
    scored(base,'foreign-student','student-4','assignment-1',1,100,100)];
  assert.deepEqual(studentAttempts(state,'class-1','student-1').map(s=>s.id),['mine']);
  assert.equal(studentAttempts(state,'class-1','student-4').length,0);
  assert.equal(studentAttempts(state,'class-2','student-1').length,0);
});
