import { computed, ref, onUnmounted } from 'vue';
import { createPrototypeService, STORAGE_KEY } from '../services';
import { clone } from '../services/mock';
import { presentReview } from '../services/presentation';
import { createSeed, demoPhotos } from '../services/seed';
import { emptyReview, rubric, total, validateReview } from '../services/rubric';
import { activeCounts, assignmentCounts, classAssignments, latestSubmission, taskStatus, taskStatuses } from '../services/school';
import type { Assignment, Category, DimensionId, Photo, Review, Role, Screen, Student, Submission } from '../services/model';

export function usePrototype() {
  let service: ReturnType<typeof createPrototypeService> | null = null;
  const startupError = ref('');
  try { service = createPrototypeService(); } catch (e) { startupError.value = (e as Error).message; }
  const state = ref(service?.read() || createSeed());
  const role = ref<Role>('teacher');
  const screen = ref<Screen>('home');
  const selectedClassId = ref('class-1');
  const newClassId = ref('class-1');
  const statisticsPanel = ref<'students' | 'assignments'>('students');
  const analyticsSearch = ref('');
  const rankingCategory = ref<Category>('handwriting');
  const analyticsStudentId = ref('');
  const assignmentPeriod = ref<'ongoing' | 'closed'>('ongoing');
  const detailReturn = ref<Screen>('home');
  const feedbackReturn = ref<Screen>('assignment');
  const now = ref(Date.now());
  const clockTimer = setInterval(() => {now.value = Date.now();}, 60000);
  const assignmentId = ref('assignment-1');
  const submissionId = ref('submission-1');
  const category = ref<Category>('handwriting');
  const review = ref<Review>(emptyReview());
  const reviewBaseline = ref('');
  const panel = ref<'evaluation' | 'photos'>('evaluation');
  const photoIndex = ref(0);
  const openDimension = ref<DimensionId | null>(null);
  const filter = ref('全部');
  const busy = ref(false);
  const error = ref('');
  const toast = ref('');
  let toastTimer: ReturnType<typeof setTimeout>;
  const photos = ref<Photo[]>([]);
  const note = ref('');
  const failSubmit = ref(false);
  const failAnalysis = ref(false);
  const newTitle = ref('');
  const newRequirements = ref('');
  const newDue = ref(new Date(Date.now() + 7 * 86400000).toLocaleDateString('sv-SE'));
  const modal = ref<{title: string; body: string; confirm: string; action: () => void | Promise<void>} | null>(null);
  const roles: {id: Role; label: string}[] = [{id:'teacher',label:'教师'},{id:'parent',label:'家长'},{id:'student',label:'学生'}];
  const boundStudent = computed(() => state.value.students.find(s => s.id === 'student-1')!);
  const currentClass = computed(() => state.value.classes.find(c => c.id === (isTeacher.value ? selectedClassId.value : boundStudent.value.classId)) || state.value.classes[0]);
  const scopedAssignments = computed(() => classAssignments(state.value, currentClass.value.id));
  const classStudents = computed(() => state.value.students.filter(s => s.classId === currentClass.value.id));
  const ongoingAssignments = computed(() => scopedAssignments.value.filter(a => !expired(a)));
  const closedAssignments = computed(() => scopedAssignments.value.filter(a => expired(a)));
  const visibleAssignments = computed(() => isTeacher.value ? assignmentPeriod.value === 'ongoing' ? ongoingAssignments.value : closedAssignments.value : [...ongoingAssignments.value, ...closedAssignments.value]);
  const workCounts = computed(() => activeCounts(state.value, currentClass.value.id, now.value));
  const selectedAssignment = computed(() => state.value.assignments.find(a => a.id === assignmentId.value) || scopedAssignments.value[0]);
  const selectedSubmission = computed(() => state.value.submissions.find(s => s.id === submissionId.value));
  const mine = computed(() => latest(assignmentId.value, 'student-1'));
  const isTeacher = computed(() => role.value === 'teacher');
  const identity = computed(() => isTeacher.value ? '陈老师' : role.value === 'parent' ? '小禾家长' : '小禾同学');
  const historyStudent = computed(() => isTeacher.value && selectedSubmission.value ? studentFor(selectedSubmission.value) : boundStudent.value);
  const myHistory = computed(() => state.value.submissions.filter(s => s.studentId === historyStudent.value.id).sort((a,b) => b.submittedAt.localeCompare(a.submittedAt)));
  const feedback = computed(() => selectedSubmission.value?.published ? presentReview(selectedSubmission.value.published) : null);
  const dirty = computed(() => screen.value === 'review' && selectedSubmission.value?.status === 'pending' && JSON.stringify(review.value) !== reviewBaseline.value);
  const canSubmit = computed(() => (!mine.value || mine.value.status === 'published') && !expired(selectedAssignment.value));
  const title = computed(() => ({home: isTeacher.value ? '工作台' : '我的任务',statistics:'学情',statisticsStudents:'全班学生学情',statisticsStudent:'学生成长',assignment:'作业详情',review:'双写批阅',submit:mine.value ? '提交订正' : '提交作品',feedback:'老师的反馈',records:'作品记录',profile:'我的',create:'布置双写作业'}[screen.value]));
  const rootScreens: Screen[] = ['home', 'statistics', 'profile', 'records'];
  const isRoot = computed(() => rootScreens.includes(screen.value) && (screen.value !== 'records' || !isTeacher.value));
  const activeTab = computed(() => screen.value.startsWith('statistics') ? 'statistics' : screen.value === 'profile' ? 'profile' : screen.value === 'records' && !isTeacher.value ? 'records' : 'home');
  const studentsInAssignment = computed(() => state.value.students.filter(st => st.classId === selectedAssignment.value.classId).map(st => ({...st,submission:latest(assignmentId.value,st.id)})).filter(st => filter.value === '全部' || taskStatus(st.submission) === filter.value));
  function latest(a: string, student: string): Submission | null {return latestSubmission(state.value, a, student);}
  function counts(a: Assignment) {return assignmentCounts(state.value, a);}
  function expired(a?: Assignment) {return a ? Date.parse(a.dueAt)<=now.value : false;}
  function assignmentFor(s: Submission) {return state.value.assignments.find(a => a.id===s.assignmentId)!;}
  function studentFor(s: Submission) {return state.value.students.find(st => st.id===s.studentId)!;}
  function statusLabel(s?: Submission | null) {return isTeacher.value ? taskStatus(s) : !s ? '未提交' : ({processing:'处理中',failed:'处理失败',pending:'待批阅',published:'已完成'}[s.status]);}
  function statusClass(s?: Submission | null) {return !s ? 'neutral' : s.status==='published' ? 'green' : s.status==='failed' ? 'red' : 'amber';}
  function date(value: string) {const d=new Date(value); return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
  function refresh() {if(service) state.value=service.read();}
  function notify(message: string) {toast.value=message;clearTimeout(toastTimer);toastTimer=setTimeout(() => {toast.value='';},3200);}
  function navigate(next: Screen) {screen.value=next;error.value='';filter.value='全部';uni.pageScrollTo({scrollTop:0,duration:0});}
  function guard(action: () => void) {if(busy.value)return;if(dirty.value)modal.value={title:'还有未保存的修改',body:'离开后，未保存的评分和评语会丢失。你可以取消并先保存草稿。',confirm:'放弃修改',action};else action();}
  function go(next: Screen) {guard(() => {if(next==='create')newClassId.value=currentClass.value.id; navigate(next);});}
  function back() {go(screen.value==='statisticsStudent' ? 'statisticsStudents' : screen.value==='statisticsStudents' ? 'statistics' : screen.value==='review' || screen.value==='submit' ? 'assignment' : screen.value==='feedback' ? feedbackReturn.value : screen.value==='records' && isTeacher.value ? 'feedback' : screen.value==='assignment' ? detailReturn.value : 'home');}
  function switchClass(id: string) {if(!state.value.classes.some(c => c.id===id))return;guard(() => {selectedClassId.value=id;assignmentPeriod.value='ongoing';analyticsSearch.value='';analyticsStudentId.value='';const a=classAssignments(state.value,id)[0];if(a)assignmentId.value=a.id;error.value='';uni.pageScrollTo({scrollTop:0,duration:0});});}
  function openStudentAnalytics(student: Student) {if(!isTeacher.value || student.classId!==currentClass.value.id)return;guard(() => {analyticsStudentId.value=student.id;navigate('statisticsStudent');});}
  function switchRole(next: Role) {if(next===role.value)return;guard(() => {role.value=next;navigate('home');});}
  function openAssignment(a: Assignment) {guard(() => {detailReturn.value=screen.value==='statistics' ? 'statistics' : 'home';assignmentId.value=a.id;navigate('assignment');});}
  function openReview(s: Submission) {guard(() => {submissionId.value=s.id;assignmentId.value=s.assignmentId;review.value=presentReview(s.draft);reviewBaseline.value=JSON.stringify(review.value);category.value='handwriting';panel.value='evaluation';photoIndex.value=0;openDimension.value=null;navigate('review');});}
  function openFeedback(s: Submission) {guard(() => {feedbackReturn.value=screen.value==='records' ? 'records' : screen.value==='home' ? 'home' : 'assignment';submissionId.value=s.id;assignmentId.value=s.assignmentId;category.value='handwriting';openDimension.value=null;photoIndex.value=0;navigate('feedback');});}
  function openSubmit(a: Assignment) {guard(() => {assignmentId.value=a.id;photos.value=[];note.value='';failSubmit.value=false;failAnalysis.value=false;navigate('submit');});}
  async function run(action: () => Promise<void>) {if(busy.value)return;busy.value=true;error.value='';try{if(!service)throw new Error(startupError.value||'保存暂不可用，请稍后重试。');await action();refresh();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
  function editScore(id: DimensionId,event: {detail: {value: string}}) {const raw=event.detail.value.trim();review.value[category.value].scores[id]=raw==='' ? null : Number(raw);}
  async function saveDraft() {await run(async () => {await service!.saveDraft(submissionId.value,review.value,role.value);reviewBaseline.value=JSON.stringify(review.value);notify('草稿已保存，发布后学生与家长可见');});}
  function publish() {const issue=validateReview(review.value);if(issue){error.value=issue;return;}modal.value={title:'发布这份反馈？',body:'发布后，学生和家长可查看这份书写与写作评分、评语及订正建议。',confirm:'确认发布',action:async () => {await run(async () => {await service!.publish(submissionId.value,review.value,role.value);reviewBaseline.value=JSON.stringify(review.value);notify('反馈已发布');navigate('assignment');});}};}
  async function confirmModal() {const action=modal.value?.action;modal.value=null;if(action)await action();}
  function addSamples() {if(photos.value.some(p => !p.sample)){error.value='请先移除已选图片，再装载练习作品。';return;}photos.value=clone(demoPhotos);error.value='';}
  function movePhoto(index: number,direction: number) {const target=index+direction;if(target<0||target>=photos.value.length)return;const next=[...photos.value];[next[index],next[target]]=[next[target],next[index]];photos.value=next;}
  async function choosePhotos() {
    error.value='';if(photos.value.length>=6){error.value='最多添加 6 张图片。';return;}
    // #ifdef H5
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=true;
    input.onchange=async () => {
      const files=Array.from(input.files||[]);
      if(files.length+photos.value.length>6){error.value='最多添加 6 张图片，请减少数量。';return;}
      if(files.some(f => !['image/jpeg','image/png','image/webp'].includes(f.type))){error.value='请使用 JPG、PNG 或 WebP 图片。';return;}
      if(files.some(f => f.size>800*1024)){error.value='单张图片需小于 800 KB，请压缩后重试。';return;}
      try{const added=await Promise.all(files.map(file => new Promise<Photo>((resolve,reject) => {const reader=new FileReader();reader.onerror=() => reject(new Error('图片读取失败，请重新选择。'));reader.onload=() => resolve({id:`photo-${Date.now()}-${Math.random()}`,url:String(reader.result),name:file.name,sample:false});reader.readAsDataURL(file);})));photos.value.push(...added);}catch(e){error.value=(e as Error).message;}
    };input.click();
    // #endif
    // #ifndef H5
    uni.chooseImage({count:6-photos.value.length,sourceType:['album','camera'],success:result => {const paths=Array.isArray(result.tempFilePaths) ? result.tempFilePaths : [result.tempFilePaths];photos.value.push(...paths.map((url,i) => ({id:`photo-${Date.now()}-${i}`,url,name:'作品照片',sample:false})));},fail:result => {if(!result.errMsg.includes('cancel'))error.value='选择图片失败，请重试。';}});
    // #endif
  }
  function submit() {if(!photos.value.length){error.value='请先选择作品照片。';return;}modal.value={title:mine.value ? '确认提交订正？' : '确认提交作品？',body:`共 ${photos.value.length} 页。请检查页序和清晰度，提交后本轮不可重复提交。原作品和反馈将保留。`,confirm:'确认提交',action:async () => {await run(async () => {await new Promise(resolve => setTimeout(resolve,400));const s=await service!.submit(assignmentId.value,photos.value,note.value,role.value,failSubmit.value);refresh();navigate('assignment');notify('作品已提交，正在处理');void finish(s.id,failAnalysis.value);});}};}
  async function finish(id: string,fail=false) {await new Promise(resolve => setTimeout(resolve,1200));try{await service?.finishAnalysis(id,fail);refresh();}catch(e){error.value=(e as Error).message;}}
  function retry(s: Submission) {void run(async () => {await service!.finishAnalysis(s.id);notify('处理已完成，请等待老师复核');});}
  async function manual(s: Submission) {await run(async () => {await service!.manualReview(s.id,role.value);});if(!error.value)openReview(state.value.submissions.find(item => item.id===s.id)!);}
  async function createAssignment() {await run(async () => {const due=new Date(`${newDue.value}T20:00:00`);if(!Number.isFinite(due.getTime()))throw new Error('请选择有效的截止日期。');const a=await service!.createAssignment({title:newTitle.value,requirements:newRequirements.value,dueAt:due.toISOString(),classId:newClassId.value},role.value);selectedClassId.value=a.classId;assignmentPeriod.value='ongoing';detailReturn.value='home';assignmentId.value=a.id;refresh();navigate('assignment');newTitle.value='';newRequirements.value='';notify('作业已发布到'+a.className);});}
  function reset() {modal.value={title:'重置原型数据？',body:'这会清除当前浏览器中的作业、提交、评分和订正记录，恢复初始原型。此操作不能撤销。',confirm:'确认重置',action:() => {try{uni.removeStorageSync(STORAGE_KEY);service=createPrototypeService();startupError.value='';refresh();role.value='teacher';selectedClassId.value='class-1';newClassId.value='class-1';assignmentPeriod.value='ongoing';statisticsPanel.value='students';analyticsSearch.value='';analyticsStudentId.value='';rankingCategory.value='handwriting';assignmentId.value='assignment-1';submissionId.value='submission-1';navigate('home');notify('已恢复初始原型');}catch(e){startupError.value=(e as Error).message;}}};}
  function assignmentAction(a: Assignment) {const s=latest(a.id,'student-1');if(s?.status==='published')openFeedback(s);else openAssignment(a);}
  onUnmounted(() => {clearTimeout(toastTimer);clearInterval(clockTimer);});
  return {state,role,screen,category,review,panel,photoIndex,openDimension,filter,busy,error,toast,photos,note,failSubmit,failAnalysis,newTitle,newRequirements,newDue,newClassId,modal,roles,startupError,selectedAssignment,selectedSubmission,mine,isTeacher,identity,myHistory,feedback,canSubmit,title,studentsInAssignment,rubric,total,latest,expired,assignmentFor,studentFor,statusLabel,statusClass,date,go,switchRole,openAssignment,openReview,openFeedback,openSubmit,editScore,saveDraft,publish,confirmModal,addSamples,movePhoto,choosePhotos,submit,retry,manual,createAssignment,reset,assignmentAction,currentClass,classStudents,scopedAssignments,visibleAssignments,ongoingAssignments,closedAssignments,workCounts,assignmentPeriod,switchClass,counts,taskStatuses,isRoot,activeTab,back,boundStudent,now,statisticsPanel,historyStudent,analyticsSearch,rankingCategory,analyticsStudentId,openStudentAnalytics};
}
