import type { Assignment, Photo, PrototypeState, Review, Role, StorageAdapter, Submission } from './model';
import { createSeed, sampleReview } from './seed';
import { emptyReview, validateReview } from './rubric';
import { upgradeState } from './migration';
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export class MockService {
  private state: PrototypeState;
  constructor(private storage: StorageAdapter, private clock: () => Date = () => new Date()) {
    const stored = storage.read();
    this.state = stored ? upgradeState(stored, clock()) : createSeed(clock());
    if (!stored || stored.schemaVersion !== 2) storage.write(this.state);
  }
  read(): PrototypeState { return clone(this.state); }
  private commit(next: PrototypeState) { this.storage.write(next); this.state = next; }
  private teacher(role: Role) { if (role !== 'teacher') throw new Error('此操作需要教师身份。'); }
  private get(state: PrototypeState, id: string): Submission {
    const item = state.submissions.find(s => s.id === id);
    if (!item) throw new Error('没有找到这份作品。');
    return item;
  }
  latest(assignmentId: string, studentId: string): Submission | null {
    return clone(this.state.submissions.filter(s => s.assignmentId === assignmentId && s.studentId === studentId).sort((a,b) => b.version-a.version)[0] || null);
  }
  feedback(id: string, role: Role): Review | null {
    const s = this.get(this.state, id);
    if (role !== 'teacher' && s.studentId !== 'student-1') throw new Error('只能查看当前关联孩子的反馈。');
    return s.published ? clone(s.published) : null;
  }
  async saveDraft(id: string, review: Review, role: Role) {
    this.teacher(role); const next = this.read(); const s = this.get(next,id);
    if (s.status !== 'pending') throw new Error('这份作品当前不能修改草稿。');
    s.draft = clone(review); this.commit(next);
  }
  async publish(id: string, review: Review, role: Role) {
    this.teacher(role); const error = validateReview(review); if (error) throw new Error(error);
    const next = this.read(); const s = this.get(next,id);
    if (s.status !== 'pending') throw new Error('反馈已经发布或作品仍在处理中，请刷新查看。');
    s.draft = clone(review); s.published = clone(review); s.status = 'published'; s.publishedAt = this.clock().toISOString(); this.commit(next);
  }
  async submit(assignmentId: string, photos: Photo[], note: string, role: Role, simulateFailure = false) {
    if (role === 'teacher') throw new Error('此入口用于家长或学生提交。');
    const assignment = this.state.assignments.find(a => a.id === assignmentId);
    if (!assignment) throw new Error('作业不存在。');
    const student = this.state.students.find(s => s.id === 'student-1');
    if (!student || assignment.classId !== student.classId) throw new Error('只能提交当前学生所在班级的作业。');
    if (Date.parse(assignment.dueAt) <= this.clock().getTime()) throw new Error('作业已截止，暂不能提交。');
    if (!photos.length || photos.length > 6) throw new Error('请添加 1–6 张作品图片。');
    if (new Set(photos.map(p => p.id)).size !== photos.length) throw new Error('图片重复，请重新选择。');
    const latest = this.latest(assignmentId, 'student-1');
    if (latest && latest.status !== 'published') throw new Error('本轮作品已提交，请等待老师发布反馈后再订正。');
    if (simulateFailure) throw new Error('提交失败，图片已保留，请重试。');
    const next = this.read(); const now = this.clock().toISOString();
    const submission: Submission = {id:`submission-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,assignmentId,studentId:'student-1',version:(latest?.version || 0)+1,photos:clone(photos),note:note.trim(),actor:role,submittedAt:now,status:'processing',draft:emptyReview(),published:null,publishedAt:null};
    next.submissions.push(submission); this.commit(next); return clone(submission);
  }
  async finishAnalysis(id: string, fail = false) {
    const next = this.read(); const s = this.get(next,id);
    if (s.status !== 'processing' && s.status !== 'failed') return;
    s.status = fail ? 'failed' : 'pending';
    // Selected user files remain unscored. Only bundled examples receive preset demonstration scores.
    if (!fail) s.draft = s.photos.every(p => p.sample) ? sampleReview() : emptyReview();
    this.commit(next);
  }
  async manualReview(id: string, role: Role) {
    this.teacher(role); const next=this.read(); const s=this.get(next,id);
    if (s.status !== 'failed' && s.status !== 'processing') throw new Error('当前作品无需转入人工批阅。');
    s.status='pending'; s.draft=emptyReview(); this.commit(next);
  }
  async createAssignment(input: Pick<Assignment,'title'|'requirements'|'dueAt'|'classId'>, role: Role) {
    this.teacher(role);
    const schoolClass = this.state.classes.find(c => c.id === input.classId);
    if (!schoolClass) throw new Error('请选择任教班级。');
    if (!input.title.trim() || !input.requirements.trim()) throw new Error('请填写作业标题和要求。');
    if (!Number.isFinite(Date.parse(input.dueAt)) || Date.parse(input.dueAt) <= this.clock().getTime()) throw new Error('截止时间需要晚于现在。');
    const next=this.read(); const assignment: Assignment={...input,title:input.title.trim(), requirements:input.requirements.trim(), id:`assignment-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,className:schoolClass.name,createdAt:this.clock().toISOString()};
    next.assignments.unshift(assignment); this.commit(next); return clone(assignment);
  }
  reset() { const next=createSeed(this.clock()); this.commit(next); }
}
