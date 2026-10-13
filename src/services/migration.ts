import type { PersistedState, PrototypeState, SchoolClass } from './model';
import { createSeed } from './seed';

// Keep every original assignment, submission, teacher edit and published snapshot.
export function upgradeState(stored: PersistedState, now: Date): PrototypeState {
  if (stored.schemaVersion === 2) return stored;
  if (stored.schemaVersion !== 1) throw new Error('数据版本不匹配，请从展示设置恢复初始数据。');
  const seed = createSeed(now);
  const classes: SchoolClass[] = [...seed.classes];
  const classId = (name: string) => {
    let item = classes.find(c => c.name === name);
    if (!item) {item = {id: 'class-legacy-' + classes.length, name}; classes.push(item);}
    return item.id;
  };
  const assignments = stored.assignments.map(a => ({...a, classId: classId(a.className)}));
  const students = stored.students.map(s => ({...s, classId: classId(s.className)}));
  return {schemaVersion: 2, classes,
    assignments: [...assignments, ...seed.assignments.filter(a => !assignments.some(old => old.id === a.id))],
    students: [...students, ...seed.students.filter(s => !students.some(old => old.id === s.id))],
    submissions: stored.submissions};
}
