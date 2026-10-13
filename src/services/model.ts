export type Role = 'teacher' | 'parent' | 'student';
export type Category = 'handwriting' | 'composition';
export type DimensionId = 'intuitive' | 'imaginal' | 'logical' | 'dialectical' | 'creative';
export type Screen = 'home' | 'statistics' | 'assignment' | 'review' | 'submit' | 'feedback' | 'records' | 'profile' | 'create';
export interface Dimension { id: DimensionId; name: string; max: number; description: string }
export interface Evaluation { scores: Record<DimensionId, number | null>; comments: Record<DimensionId, string>; summary: string }
export interface Review { handwriting: Evaluation; composition: Evaluation; nextSteps: string; rubricVersion: string }
export interface Photo { id: string; url: string; name: string; sample: boolean }
export interface Submission {
  id: string; assignmentId: string; studentId: string; version: number;
  photos: Photo[]; note: string; submittedAt: string; actor: Role;
  status: 'processing' | 'failed' | 'pending' | 'published';
  draft: Review; published: Review | null; publishedAt: string | null;
}
export interface SchoolClass { id: string; name: string }
export interface Assignment { id: string; title: string; classId: string; className: string; dueAt: string; requirements: string; createdAt: string }
export interface Student { id: string; name: string; classId: string; className: string; initial: string }
export interface PrototypeState { schemaVersion: 2; classes: SchoolClass[]; assignments: Assignment[]; students: Student[]; submissions: Submission[] }
export interface LegacyPrototypeState { schemaVersion: 1; assignments: Omit<Assignment, 'classId'>[]; students: Omit<Student, 'classId'>[]; submissions: Submission[] }
export type PersistedState = PrototypeState | LegacyPrototypeState;
export interface StorageAdapter { read(): PersistedState | null; write(state: PrototypeState): void }
