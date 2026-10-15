/** Frontend prototype state. These types do not define an agreed backend API. */
export type Role = "teacher" | "student";
export type Category = "handwriting" | "composition";
export type DimensionId =
  | "intuitive"
  | "imaginal"
  | "logical"
  | "dialectical"
  | "creative";
export type Screen =
  | "home"
  | "statistics"
  | "statisticsStudents"
  | "statisticsStudent"
  | "assignment"
  | "review"
  | "submit"
  | "feedback"
  | "records"
  | "profile"
  | "create"
  | "classes"
  | "classMembers"
  | "growth";

export interface Dimension {
  id: DimensionId;
  name: string;
  max: number;
  description: string;
}
export interface Evaluation {
  scores: Record<DimensionId, number | null>;
  comments: Record<DimensionId, string>;
  summary: string;
}
export interface Review {
  handwriting: Evaluation;
  composition: Evaluation;
  nextSteps: string;
  rubricVersion: string;
}
export interface Photo {
  id: string;
  url: string;
  name: string;
  sample: boolean;
}
export interface TeacherSummary {
  id: string;
  name: string;
  initial: string;
}
export interface Teacher extends TeacherSummary {
  subject: string;
  organizationIds: string[];
  classIds: string[];
}
export interface Organization {
  id: string;
  name: string;
  kind: "school" | "institution";
}
export interface SchoolClass {
  id: string;
  name: string;
  organizationId: string;
}
export interface Student {
  id: string;
  name: string;
  initial: string;
  classId: string;
  className: string;
  studentNumber?: string;
  archived?: boolean;
}
export interface StudentAccount {
  signedIn: boolean;
  studentId: string | null;
}
export interface TeacherAccount {
  signedIn: boolean;
  teacherId: string | null;
}
export interface Assignment {
  id: string;
  title: string;
  classId: string;
  className: string;
  dueAt: string;
  requirements: string;
  createdAt: string;
  teacher?: TeacherSummary;
}
export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  version: number;
  photos: Photo[];
  note: string;
  submittedAt: string;
  /** Parent may occur only as the source of an unchanged historical submission. */
  actor: Role | "parent";
  status: "processing" | "failed" | "pending" | "published";
  draft: Review;
  published: Review | null;
  publishedAt: string | null;
  publishedBy?: TeacherSummary;
}
export interface PrototypeState {
  schemaVersion: 6;
  studentEntryVersion: 1;
  classPracticeVersion?: number;
  accounts: { student: StudentAccount };
  teacherAccount: TeacherAccount;
  legacyParentAccount?: StudentAccount;
  organizations: Organization[];
  teachers: Teacher[];
  teacherClassIds: string[];
  classes: SchoolClass[];
  assignments: Assignment[];
  students: Student[];
  submissions: Submission[];
}
export interface StorageAdapter {
  read(): unknown;
  write(state: PrototypeState): void;
}
export interface StudentBindingCandidate {
  role: "student";
  code: string;
  student: Student;
  schoolClass: SchoolClass;
  organization: Organization;
}
export interface TeacherBindingCandidate {
  role: "teacher";
  code: string;
  teacher: Teacher;
  organizations: Organization[];
  classes: SchoolClass[];
}
export type BindingCandidate =
  | StudentBindingCandidate
  | TeacherBindingCandidate;
