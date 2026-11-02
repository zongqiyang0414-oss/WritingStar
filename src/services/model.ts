/** Frontend prototype state. These types do not define an agreed backend API. */
export type Role = "teacher" | "student" | "admin";
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
  | "notifications"
  | "profile"
  | "create"
  | "classes"
  | "classMembers"
  | "adminClasses"
  | "adminTeachers"
  | "adminStudents"
  | "aiReview"
  | "aiBatch"
  | "paperCards"
  | "paperScan"
  | "excellentWorks"
  | "excellentWork"
  | "growth";
// Administration uses separate navigation and does not grant teaching or feedback access.
export type AdminScreen = "home" | "adminClasses" | "adminTeachers" | "adminStudents" | "profile";

export interface Administrator {
  id: string;
  name: string;
  initial: string;
  organizationIds: string[];
}
export interface AdministratorAccount {
  signedIn: boolean;
  administratorId: string | null;
}
export interface AdministrationEvent {
  id: string;
  organizationId: string;
  description: string;
  administratorId: string;
  administratorName: string;
  createdAt: string;
}

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
  /** Original selected/captured bytes; analysis previews never replace this file. */
  original?: boolean;
  cropped?: boolean;
  cropBounds?: { left: number; top: number; width: number; height: number };
  sourceWidth?: number;
  sourceHeight?: number;
  width?: number;
  height?: number;
  captureCorners?: { x: number; y: number }[] | null;
}
export interface TeacherSummary {
  id: string;
  name: string;
  initial: string;
}
export interface Teacher extends TeacherSummary {
  subject: string;
  /** Optional contact information; not a verified login or binding credential. */
  phone?: string;
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
  /** Empty string means no deadline; historical ISO timestamps remain valid. */
  dueAt: string;
  requirements: string;
  createdAt: string;
  teacher?: TeacherSummary;
  paperPacket?: { version: 1; pages: number; cards: { id: string; studentId: string; studentName: string; studentNumber: string; className: string }[] };
}
export interface AssignmentTemplate {
  id: string;
  title: string;
  requirements: string;
  builtin: boolean;
  ownerTeacherId?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  /** Internal upload order; no correction/version workflow in the UI. */
  version: number;
  photos: Photo[];
  note: string;
  submittedAt: string;
  /** Parent may occur only as the source of an unchanged historical submission. */
  actor: Exclude<Role, "admin"> | "parent";
  /** Teacher who submitted this version on the student's behalf. */
  submittedBy?: TeacherSummary;
  paper?: { batchId: string; cardId: string; source: "teacher-scan" | "student-paper"; pages: { page: number; manual: boolean }[] };
  /** Selection belongs to a version whose feedback has been published. */
  excellent?: { selectedAt: string; selectedBy: TeacherSummary } | null;
  status: "processing" | "failed" | "pending" | "published";
  draft: Review;
  published: Review | null;
  publishedAt: string | null;
  publishedBy?: TeacherSummary;
  draftRevision?: number;
  example?: boolean;
  resubmission?: { allowedAt: string; allowedBy: TeacherSummary; consumedAt?: string } | null;
  aiReview?: AiReviewTask;
}
export interface AiReviewTask {
  id: string;
  attempt: number;
  state: "queued" | "reading" | "reviewing" | "completed" | "failed" | "unavailable" | "cancelled";
  source: "student" | "teacher" | "teacher-batch" | "admin";
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: Review | null;
  resultSource: "sample" | "backend" | null;
  error: string;
  /** Local-only simulation flags, not an agreed backend contract. */
  simulateFailure?: boolean;
  initializeDraft?: boolean;
  autoRetryCount?: number;
  studentRetryTimes?: string[];
  reportedAt?: string | null;
  qualityFlags?: Array<"wrongImage" | "unreadable">;
}
export interface PrototypeState {
  schemaVersion: 6;
  studentEntryVersion: 1;
  administrationVersion: 1;
  adminAccount: AdministratorAccount;
  administrators: Administrator[];
  administrationEvents: AdministrationEvent[];
  classPracticeVersion?: number;
  accounts: { student: StudentAccount };
  teacherAccount: TeacherAccount;
  legacyParentAccount?: StudentAccount;
  organizations: Organization[];
  teachers: Teacher[];
  teacherClassIds: string[];
  classes: SchoolClass[];
  assignments: Assignment[];
  /** Added without changing schema or clearing existing records. */
  assignmentTemplates?: AssignmentTemplate[];
  students: Student[];
  submissions: Submission[];
  /** Per-student read receipts; notifications derive from actual task events. */
  studentNotificationReads?: Record<string, Record<string, string>>;
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
  | TeacherBindingCandidate
  | { role: "admin"; code: string; administrator: Administrator; organizations: Organization[] };
