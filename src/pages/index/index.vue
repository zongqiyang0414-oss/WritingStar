<script setup>
import WorkViewer from "../../components/WorkViewer.vue";
import AssignmentComposer from "../../components/AssignmentComposer.vue";
import SlideDownPanel from "../../components/SlideDownPanel.vue";
import StudentNotifications from "../../components/StudentNotifications.vue";
import SubmissionRecords from "../../components/SubmissionRecords.vue";
import ClassSelector from "../../components/ClassSelector.vue";
import ClassStatistics from "../../components/ClassStatistics.vue";
import InvitationBinding from "../../components/InvitationBinding.vue";
import OrganizationSelector from "../../components/OrganizationSelector.vue";
import PrototypeTools from "../../components/PrototypeTools.vue";
import ReviewEditor from "../../components/ReviewEditor.vue";
import StudentGrowth from "../../components/StudentGrowth.vue";
import StudentRanking from "../../components/StudentRanking.vue";
import TeachingClasses from "../../components/TeachingClasses.vue";
import AdminWorkspace from "../../components/AdminWorkspace.vue";
import AiReviewPanel from "../../components/AiReviewPanel.vue";
import AiBatchReview from "../../components/AiBatchReview.vue";
import ExcellentWorks from "../../components/ExcellentWorks.vue";
import AnswerCardPanel from "../../components/AnswerCardPanel.vue";
import PaperScanner from "../../components/PaperScanner.vue";
import { displayPhoto } from "../../services/presentation.js";
import { growthIllustration } from "../../services/assets.js";
import { ref, watch, onMounted } from "vue";
import { nativeNavigationMetrics } from "../../platform/pageInsets.js";
// #ifdef MP-WEIXIN
import { onResize } from "@dcloudio/uni-app";
// #endif
import { usePrototype } from "../../composables/usePrototype.js";

const { bottomInset: bottomInset } = {
    topInset: ref(0),
    bottomInset: ref(0),
  },
  {
    state: state,
    statisticsModel,
    rankingModel,
    teacherGrowthModel,
    learnerGrowthModel,
    teachingModel,
    role: role,
    screen: screen,
    category: category,
    review: review,
    reviewFocus: reviewFocus,
    panel: panel,
    photoIndex: photoIndex,
    openDimension: openDimension,
    filter: filter,
    studentSearch,
    aiBatchView,
    logout,
    busy: busy,
    error: error,
    toast: toast,
    photos: photos,
    note: note,
    submissionStudents,
    submissionStudent,
    classExcellentWorks,
    excellentWorks,
    excellentWork,
    excellentAssignmentId,
    openExcellentWorks,
    openExcellentWork,
    toggleExcellent,
    failSubmit: failSubmit,
    failAnalysis: failAnalysis,
    newTitle: newTitle,
    newRequirements: newRequirements,
    newIllustration,
    teacherApplication,
    demoAccount,
    applyTeacher,
    useDemoAccount,
    reviewTeacherApplication,
    newPaperPages,
    paperCards,
    openPaperCards,
    openPaperScan,
    issuePaperCards,
    submitPaper,
    newDue: newDue,
    newClassId: newClassId,
    newClassIds,
    assignmentTemplates,
    saveAssignmentTemplate,
    deleteAssignmentTemplate,
    modal: modal,
    roles: roles,
    startupError: startupError,
    selectedAssignment: selectedAssignment,
    selectedSubmission: selectedSubmission,
    aiTask,
    aiRows,
    aiSummary,
    aiStateLabel,
    openAiReview,
    openAiBatch,
    beginAiBatch,
    publishAiBatch,
    startSingleAi,
    refreshAi,
    mine: mine,
    isTeacher: isTeacher,
    isAdmin,
    adminIdentity,
    adminDirty,
    adminAction,
    identity: identity,
    myHistory: myHistory,
    submissionRecords,
    canResubmit,
    canAllowResubmission,
    agreeResubmission,
    feedback: feedback,
    canSubmit: canSubmit,
    title: title,
    studentsInAssignment: studentsInAssignment,
    formerStudentsInAssignment,
    rubric: rubric,
    total: total,
    latest: latest,
    expired: expired,
    assignmentFor: assignmentFor,
    studentFor: studentFor,
    statusLabel: statusLabel,
    statusClass: statusClass,
    date: date,
    go: go,
    switchRole: switchRole,
    openAssignment: openAssignment,
    openReview: openReview,
    openFeedback: openFeedback,
    openSubmit: openSubmit,
    editScore: editScore,
    saveDraft: saveDraft,
    publish: publish,
    confirmModal: confirmModal,
    addSamples: addSamples,
    movePhoto: movePhoto,
    choosePhotos: choosePhotos,
    submit: submit,
    retry: retry,
    manual: manual,
    createAssignment: createAssignment,
    reset: reset,
    assignmentAction: assignmentAction,
    currentClass: currentClass,
    classStudents: classStudents,
    visibleAssignments: visibleAssignments,
    learnerNotifications,
    openStudentNotification,
    openNotifications,
    studentTaskFilter,
    studentTaskRows,
    studentTaskCategories,
    studentTaskLabel,
    studentTaskBadge,
    ongoingAssignments: ongoingAssignments,
    closedAssignments: closedAssignments,
    workCounts: workCounts,
    assignmentPeriod: assignmentPeriod,
    switchClass: switchClass,
    counts: counts,
    taskStatuses: taskStatuses,
    isRoot: isRoot,
    activeTab: activeTab,
    back: back,
    boundStudent: boundStudent,
    now: now,
    statisticsPanel: statisticsPanel,
    historyStudent: historyStudent,
    analyticsSearch: analyticsSearch,
    rankingCategory: rankingCategory,
    analyticsStudentId: analyticsStudentId,
    openStudentAnalytics: openStudentAnalytics,
    activeStudents: activeStudents,
    rosterClassId: rosterClassId,
    memberSearch: memberSearch,
    openClassMembers: openClassMembers,
    visitRosterClass: visitRosterClass,
    organizationOptions: organizationOptions,
    currentOrganization: currentOrganization,
    teachingClassOptions: teachingClassOptions,
    organizationAssignmentCount: organizationAssignmentCount,
    organizationNameForClass: organizationNameForClass,
    switchOrganization: switchOrganization,
    inviteCode: inviteCode,
    bindingCandidate: bindingCandidate,
    accountSignedIn: accountSignedIn,
    teacherIdentity: teacherIdentity,
    growthSummary: growthSummary,
    teacherForAssignment: teacherForAssignment,
    teacherForFeedback: teacherForFeedback,
    needsBinding: needsBinding,
    loginForBinding: loginForBinding,
    previewBinding: previewBinding,
    editBindingCode: editBindingCode,
    confirmBinding: confirmBinding,
    restartBinding: restartBinding,
    bindingHelp: bindingHelp,
  } = usePrototype();
const feedbackCollapsed = ref([]);
const nativeNavigation = ref(false), nativeInsets = ref({ top: 0, height: 44, bottom: 0, menuSpace: 96 });
// #ifdef MP-WEIXIN
nativeNavigation.value = true;
function updateNativeInsets() {
  const info = uni.getWindowInfo?.() || uni.getSystemInfoSync?.() || {};
  let capsule = {};
  try { capsule = uni.getMenuButtonBoundingClientRect?.() || {}; } catch {}
  nativeInsets.value = nativeNavigationMetrics(info, capsule);
  bottomInset.value = nativeInsets.value.bottom;
}
updateNativeInsets();
onMounted(updateNativeInsets);
onResize(updateNativeInsets);
// #endif
watch([category, selectedSubmission], () => { feedbackCollapsed.value = []; });
function toggleFeedbackDimension(id) {
  feedbackCollapsed.value = feedbackCollapsed.value.includes(id)
    ? feedbackCollapsed.value.filter(value => value !== id)
    : [...feedbackCollapsed.value, id];
}

</script>

<template>
  <view :class="['stage', { 'native-layout': nativeNavigation, 'native-detail': nativeNavigation && !isAdmin && !isRoot && !needsBinding }]" :style="{ '--wechat-bottom-inset': bottomInset + 'px', '--native-top-inset': nativeInsets.top + 'px', '--native-nav-height': nativeInsets.height + 'px', '--native-menu-space': nativeInsets.menuSpace + 'px' }">
    <!-- #ifdef H5 -->
    <view class="desktop-intro">
      <view class="intro-brand"><view class="brand-logo-frame desktop-logo-frame"><image class="desktop-brand-logo" src="/static/brand/writingstar-logo-horizontal-transparent.png" mode="aspectFit" aria-label="写字星" /></view></view>
      <view class="intro-body">
        <view class="intro-kicker">
          把每一次书写
          <br />
          变成成长的起点
        </view>
        <view class="intro-copy">
          写好字，也写好故事。
          <br />
          让老师的每一句建议，
          <br />
          陪伴下一次进步。
        </view>
        <image class="intro-art" :src="growthIllustration" mode="aspectFit" />
      </view>
      <view class="intro-foot">
        <text class="tiny-dot" />
        原型展示 · v0.25.0
      </view>
    </view>
    <!-- #endif -->
    <view class="app-shell">
      <view class="app-header">
        <view class="top-row">
          <view class="mobile-brand"><view class="brand-logo-frame"><image class="header-brand-logo" src="/static/brand/writingstar-logo-horizontal-transparent.png" mode="aspectFit" aria-label="写字星" /></view></view>
        </view>
        <view class="role-row">
          <text class="tiny subtle"> 当前身份 </text>
          <view class="role-picker">
            <template v-for="item1 in roles" :key="item1.id">
              <button
                :class="['role-button', { active: role === item1.id }]"
                :disabled="busy"
                @click="(a) => switchRole(item1.id)"
              >
                {{ item1.label }}
              </button>
            </template>
          </view>
        </view>
      </view>
      <template v-if="startupError">
        <view :key="0" class="fatal card">
          <view class="section-title"> 数据暂不可用 </view>
          <view class="paragraph">
            {{ startupError }}
          </view>
        </view>
      </template>
      <template v-else>
        <template
          v-if="
            !isTeacher ||
            needsBinding ||
            teachingClassOptions.length ||
            ('home' !== screen &&
              !screen.startsWith('statistics') &&
              'create' !== screen)
          "
        >
          <view :key="2" class="page-body">
            <template v-if="needsBinding || 'home' === screen" />
            <template v-else>
              <view
                :key="0"
                :class="['page-heading', { 'root-heading': isRoot, 'pinned-heading': !isRoot, 'native-page-heading': nativeNavigation && !isRoot && !needsBinding }]"
              >
                <template v-if="isRoot" />
                <template v-else>
                  <button
                    :key="0"
                    class="back-button"
                    aria-label="返回上一页"
                    :disabled="busy"
                    @click="back"
                  >
                    ‹ 返回
                  </button>
                </template>
                <text class="page-title">
                  {{ title }}
                </text>
                <template v-if="isRoot" />
                <template v-else>
                  <view :key="1" class="heading-spacer" />
                </template>
              </view>
            </template>
            <view v-if="nativeNavigation && !isRoot && !needsBinding" class="native-nav-spacer" />
            <template v-if="needsBinding">
              <InvitationBinding :key="role" :role="role" :busy="busy" :application="teacherApplication" :demo-account="demoAccount" @login="loginForBinding" @apply="applyTeacher" />
            </template>
            <template v-else-if="isTeacher && ['adminClasses', 'adminStudents'].includes(screen)">
              <AdminWorkspace :key="currentOrganization?.id" :state="state" :organization="currentOrganization" :administrator="teacherIdentity" :section="screen" :busy="busy" @navigate="go" @action="adminAction" @confirm="modal = $event" @dirty="adminDirty = $event" />
            </template>
            <template v-else-if="!isTeacher && screen === 'notifications'">
              <StudentNotifications :notifications="learnerNotifications" :busy="busy" @open="openStudentNotification" />
            </template>
            <template v-else-if="screen === 'excellentWorks' || screen === 'excellentWork'">
              <ExcellentWorks
                :works="excellentWorks"
                :work="excellentWork"
                :detail="screen === 'excellentWork'"
                :teacher="isTeacher"
                :busy="busy"
                :class-name="currentClass.name"
                :assignment-title="excellentAssignmentId ? selectedAssignment?.title || '' : ''"
                @view="openExcellentWork"
                @remove="toggleExcellent"
                @back="back"
              />
            </template>
            <template v-else-if="screen === 'aiReview' && selectedSubmission">
              <AiReviewPanel
                key="single-ai-review"
                :submission="selectedSubmission"
                :assignment="assignmentFor(selectedSubmission)"
                :student="studentFor(selectedSubmission)"
                :task="aiTask"
                :teacher="isTeacher"
                :busy="busy"
                @start="startSingleAi"
                @manual="manual(selectedSubmission)"
                @refresh="refreshAi"
                :can-resubmit="canSubmit"
                :can-allow-resubmission="canAllowResubmission(selectedSubmission)"
                @back="back"
              />
            </template>
            <template v-else-if="screen === 'paperCards' && selectedAssignment">
              <AnswerCardPanel :key="'cards-' + selectedAssignment.id" :assignment="selectedAssignment" :cards="paperCards" :teacher="isTeacher" :busy="busy" @issue="issuePaperCards" @scan="openPaperScan" />
            </template>
            <template v-else-if="screen === 'paperScan' && selectedAssignment">
              <PaperScanner :key="'scan-' + role + '-' + selectedAssignment.id" :state="state" :assignment="selectedAssignment" :cards="paperCards" :teacher="isTeacher" :student-id="boundStudent?.id || ''" :identity-id="isTeacher ? teacherIdentity?.id : boundStudent?.id" :busy="busy" @submit="submitPaper" @cards="openPaperCards" @ai="openAiBatch" @confirm="modal = $event" />
            </template>
            <template v-else-if="screen === 'aiBatch' && isTeacher && selectedAssignment">
              <AiBatchReview
                :key="'ai-batch-' + selectedAssignment.id"
                :assignment="selectedAssignment"
                :rows="aiRows"
                :view-state="aiBatchView"
                :summary="aiSummary"
                :busy="busy"
                @publish="publishAiBatch"
                @allow-resubmission="agreeResubmission"
                @view="openAiReview"
                @review="openReview"
                @feedback="openFeedback"
              />
            </template>
            <template v-else>
              <template v-if="'home' === screen">
                <view :key="2" class="home-view">
                  <view class="greeting-row">
                    <view>
                      <view class="eyebrow">
                        双写课堂{{
                          isTeacher
                            ? " / 教师工作台"
                            : " / " + currentClass.name
                        }}
                      </view>
                      <view class="greeting">
                        {{ identity }}，{{ isTeacher ? "你好" : "今天也加油" }}
                        <text class="greeting-dot"> 。 </text>
                      </view>
                    </view>
                  </view>
                  <template v-if="isTeacher">
                    <ClassSelector
                      :classes="teachingClassOptions"
                      :model-value="currentClass.id"
                      :disabled="busy"
                      @update:modelValue="switchClass"
                    />
                    <view class="work-overview">
                      <view class="overview-caption">
                        <text> {{ classStudents.length }} 位学生 </text>
                      </view>
                      <view class="stats">
                        <view class="stat">
                          <view class="stat-number">{{ ongoingAssignments.length }}<text class="stat-unit"> 项 </text></view>
                          <view class="stat-label"><text class="tiny-dot" />进行中的作业</view>
                        </view>

                        <view class="stat">
                          <view class="stat-number">
                            {{ workCounts.missing }}
                            <text class="stat-unit"> 份 </text>
                          </view>
                          <view class="stat-label">
                            <text class="tiny-dot grey-dot" />
                            未提交
                          </view>
                        </view>
                        <view class="stat">
                          <view class="stat-number">
                            {{ workCounts.pending }}
                            <text class="stat-unit"> 份 </text>
                          </view>
                          <view class="stat-label">
                            <text class="tiny-dot amber-dot" />
                            待审核
                          </view>
                        </view>
                      </view>

                    </view>
                    <view class="section-heading">
                      <view class="section-title"> 班级作业 </view>
                      <button class="text-button" @click="(e) => go('create')">
                        ＋ 布置作业
                      </button>
                    </view>
                    <view class="assignment-periods">
                      <button
                        :class="{ active: 'ongoing' === assignmentPeriod }"
                        @click="(e) => (assignmentPeriod = 'ongoing')"
                      >
                        进行中的作业
                        <text>
                          {{ ongoingAssignments.length }}
                        </text>
                      </button>
                      <button
                        :class="{ active: 'closed' === assignmentPeriod }"
                        @click="(e) => (assignmentPeriod = 'closed')"
                      >
                        已完成的作业
                        <text>
                          {{ closedAssignments.length }}
                        </text>
                      </button>
                    </view>
                  </template>
                  <template v-else>
                    <view class="hero">
                      <view class="hero-label"> 每一笔，都是新的可能 </view>
                      <view class="hero-title">
                        把生活写成
                        <br />
                        <text> 自己的故事 </text>
                      </view>
                      <view class="hero-sub">
                        认真写下小事，也认真写下感受。
                      </view>
                      <image
                        class="hero-art"
                        :src="growthIllustration"
                        mode="aspectFit"
                      />
                    </view>
                    <template v-if="boundStudent?.archived">
                      <view :key="0" class="notice">
                        当前学生已不在班级，作品与教师反馈保留。请联系学校管理员核对。
                      </view>
                    </template>
                    <StudentNotifications compact :notifications="learnerNotifications" :busy="busy" @open="openStudentNotification" @all="openNotifications" />
                    <view class="section-heading">
                      <view class="section-title">
                        我的双写任务
                        <text class="count-label">
                          {{ studentTaskRows.length }}
                        </text>
                      </view>
                    </view>
                  </template>
                  <view v-if="!boundStudent?.archived" class="card excellent-entry">
                    <view class="excellent-symbol">★</view>
                    <view class="grow"><view class="strong">班级优秀作业</view><view class="tiny subtle">{{ classExcellentWorks.length }} 份作品 · 一起学习好方法</view></view>
                    <button class="text-button" :disabled="busy" @click="openExcellentWorks()">去看看 ›</button>
                  </view>
                  <view v-if="!isTeacher" class="student-task-tabs" aria-label="作业分类">
                    <button v-for="item in studentTaskCategories" :key="item.id" :class="['student-task-tab', { active: studentTaskFilter === item.id }]" :disabled="busy" :aria-pressed="studentTaskFilter === item.id" @click="studentTaskFilter = item.id"><text>{{ item.label }}</text><text class="student-task-tab-count">{{ item.count }}</text></button>
                  </view>
                  <template v-for="item2 in visibleAssignments" :key="item2.id">
                    <view class="assignment-card card">
                      <view class="card-top">
                        <view class="task-type">
                          <text class="task-icon"> 文 </text>
                          <text> 作文双评 </text>
                        </view>
                        <template v-if="isTeacher && expired(item2)">
                          <text :key="0" class="badge neutral"> 已截止 </text>
                        </template>
                        <template v-else>
                          <template v-if="isTeacher">
                            <text :key="2" class="badge green">{{ assignmentPeriod === 'closed' ? '已完成' : '进行中' }}</text>
                          </template>
                          <template v-else>
                            <text :class="['badge', studentTaskBadge(item2)]">{{ studentTaskLabel(item2) }}</text>
                          </template>
                        </template>
                      </view>
                      <view class="assignment-title">
                        {{ item2.title }}
                      </view>
                      <view class="small subtle">
                        {{ item2.dueAt ? date(item2.dueAt) + ' 截止' : '不限截止时间' }}
                      </view>
                      <template v-if="isTeacher">
                        <view :key="0" class="task-counts">
                          <text>
                            未提交
                            <text class="strong">
                              {{ counts(item2).missing }}
                            </text>
                          </text>
                          <text>
                            待审核
                            <text class="strong">
                              {{ counts(item2).pending }}
                            </text>
                          </text>
                          <text>
                            已完成
                            <text class="strong">
                              {{ counts(item2).completed }}
                            </text>
                          </text>
                        </view>
                      </template>
                      <template v-else>
                        <view :key="1" class="dual-tags">
                          <text> 书写 / 100 分 </text>
                          <text> 写作 / 100 分 </text>
                        </view>
                      </template>
                      <view class="card-bottom">
                        <view class="small subtle">
                          {{
                            isTeacher
                              ? counts(item2).total + " 位学生"
                              : teacherForAssignment(item2).name +
                                "布置 · " +
                                item2.className
                          }}
                        </view>
                        <button
                          class="compact-button"
                          @click="
                            (a) =>
                              isTeacher
                                ? openAssignment(item2)
                                : assignmentAction(item2)
                          "
                        >
                          {{
                            isTeacher ? "查看详情"
                              : canResubmit(latest(item2.id, boundStudent?.id || "")) ? "重新提交"
                              : latest(item2.id, boundStudent?.id || "")?.status === "published" ? "查看反馈" : "查看任务"
                          }}
                          <text> </text>
                        </button>
                      </view>
                    </view>
                  </template>
                  <template v-if="visibleAssignments.length" />
                  <template v-else>
                    <view :key="2" class="empty-state card">
                      {{
                        isTeacher
                          ? "ongoing" === assignmentPeriod
                            ? "本班暂时没有进行中的作业。"
                            : "本班暂无已完成的作业。"
                          : "此分类下暂无作业。"
                      }}
                    </view>
                  </template>

                </view>
              </template>
              <template v-else>
                <template v-if="'statistics' === screen && isTeacher">
                  <view :key="3" class="statistics-view">
                    <ClassSelector
                      :classes="teachingClassOptions"
                      :model-value="currentClass.id"
                      :disabled="busy"
                      @update:modelValue="switchClass"
                    />
                    <ClassStatistics
                      :model="statisticsModel"
                      @assignment="openAssignment"
                      @students="(e) => go('statisticsStudents')"
                      v-model:panel="statisticsPanel"
                    />
                  </view>
                </template>
                <template v-else>
                  <template v-if="'statisticsStudents' === screen && isTeacher">
                    <view :key="4" class="statistics-students-view">
                      <StudentRanking
                        :model="rankingModel"
                        @student="openStudentAnalytics"
                        v-model:category="rankingCategory"
                        v-model:query="analyticsSearch"
                      />
                    </view>
                  </template>
                  <template v-else>
                    <template
                      v-if="'statisticsStudent' === screen && isTeacher"
                    >
                      <view :key="5" class="statistics-student-view">
                        <StudentGrowth
                          :model="teacherGrowthModel"
                          :category="rankingCategory"
                        />
                      </view>
                    </template>
                    <template v-else>
                      <template
                        v-if="'growth' === screen && !isTeacher && boundStudent"
                      >
                        <view :key="6" class="learner-growth-view">
                          <StudentGrowth
                            :model="learnerGrowthModel"
                            audience="learner"
                            @feedback="openFeedback"
                          />
                        </view>
                      </template>
                      <template v-else>
                        <template v-if="'assignment' === screen">
                          <view :key="7">
                            <view class="card task-detail">
                              <view class="eyebrow">
                                {{
                                  organizationNameForClass(
                                    selectedAssignment.classId,
                                  )
                                }}
                                · {{ selectedAssignment.className }}
                              </view>
                              <view class="detail-title">
                                {{ selectedAssignment.title }}
                              </view>
                              <view class="small subtle">
                                {{ selectedAssignment.dueAt ? date(selectedAssignment.dueAt) + ' 截止' : '不限截止时间' }}
                              </view>
                              <view class="divider" />
                              <view class="strong"> 这次写什么 </view>
                              <view class="paragraph">
                                {{ selectedAssignment.requirements }}
                              </view>
                              <view class="dual-tags">
                                <text> 书写 100 分 </text>
                                <text> 写作 100 分 </text>
                                <text> 完整五维评价 </text>
                              </view>
                            </view>
                            <view v-if="isTeacher || !boundStudent?.archived" class="card paper-assignment-entry">
                              <view class="paper-inline"><view class="paper-entry-icon">▤</view><view class="grow"><view class="section-title">纸上完成，自动归档</view><view class="tiny subtle">{{ selectedAssignment.paperPacket ? '每人 ' + selectedAssignment.paperPacket.pages + ' 页专属答题卡 · 学生码自动对应' : '生成带学生码的专属答题卡' }}</view></view></view>
                              <view class="paper-entry-flow"><text>布置作业</text><text>›</text><text>打印答题卡</text><text>›</text><text>扫描提交</text><text>›</text><text>AI批阅</text></view>
                              <view class="scan-import-actions"><button class="secondary" :disabled="busy" @click="openPaperCards">{{ isTeacher ? '查看 / 打印答题卡' : '下载 / 打印答题卡' }}</button><button class="primary" :disabled="busy" @click="openPaperScan">{{ isTeacher ? '批量上传' : '上传答题卡' }}</button></view>
                              <view v-if="!isTeacher" class="tiny subtle spaced-small">家长可协助打印和拍照，提交后可查看本人的AI学习建议。</view>
                            </view>
                            <view v-if="!isTeacher && !boundStudent?.archived" class="card excellent-entry">
                              <view class="excellent-symbol">★</view>
                              <view class="grow"><view class="strong">本次优秀作业</view><view class="tiny subtle">{{ classExcellentWorks.filter((item) => item.assignmentId === selectedAssignment.id).length }} 份作品供全班参考</view></view>
                              <button class="text-button" :disabled="busy" @click="openExcellentWorks(selectedAssignment)">查看作品 ›</button>
                            </view>
                            <template v-if="isTeacher">
                              <view class="card ai-assignment-entry">
                                <view class="ai-entry-heading"><view class="ai-entry-symbol">✧</view><view class="grow"><view class="section-title">全班AI批阅结果</view></view></view>
                                <view class="ai-entry-counts"><text>处理中 {{ aiSummary.running + aiSummary.waiting }}</text><text>待审核 {{ aiSummary.readyToPublish }}</text><text>已审核 {{ aiSummary.published }}</text></view>
                                <button class="primary full-width" :disabled="busy" @click="openAiBatch">查看全班AI批阅详情</button>
                              </view>
                            <view v-if="!boundStudent?.archived" class="card excellent-entry">
                              <view class="excellent-symbol">★</view>
                              <view class="grow"><view class="strong">本次优秀作业</view><view class="tiny subtle">{{ classExcellentWorks.filter((item) => item.assignmentId === selectedAssignment.id).length }} 份作品供全班参考</view></view>
                              <button class="text-button" :disabled="busy" @click="openExcellentWorks(selectedAssignment)">查看作品 ›</button>
                            </view>
                              <view class="section-heading">
                                <view class="section-title"> 提交名单 </view>
                                <text class="small subtle">
                                  {{ counts(selectedAssignment).total }} 位学生
                                </text>
                              </view>
                              <view class="student-search"><text class="search-symbol">⌕</text><input v-model="studentSearch" maxlength="40" placeholder="搜索学生姓名或学号" /><button v-if="studentSearch" class="search-clear" @click="studentSearch = ''">清除</button></view>
                              <view class="filter-row">
                                <template
                                  v-for="item3 in ['全部', ...taskStatuses]"
                                  :key="item3"
                                >
                                  <button
                                    :class="[
                                      'filter-button',
                                      { active: filter === item3 },
                                    ]"
                                    @click="(a) => (filter = item3)"
                                  >
                                    {{ item3 }}
                                  </button>
                                </template>
                              </view>
                              <template
                                v-for="item4 in studentsInAssignment"
                                :key="item4.id"
                              >
                                <view class="student-row card">
                                  <view class="avatar pale">
                                    {{ item4.initial }}
                                  </view>
                                  <view class="grow">
                                    <view class="strong">
                                      {{ item4.name }}
                                    </view>
                                    <view v-if="item4.submission?.excellent" class="tiny submission-provenance"><text class="badge excellent-badge">★ 优秀作业</text></view>
                                    <view v-if="item4.submission?.actor === 'teacher'" class="tiny subtle submission-provenance">{{ item4.submission.submittedBy?.name || '教师' }}代交</view>
                                    <view class="small subtle">
                                      {{
                                        item4.submission
                                          ? item4.submission.photos.length + " 页 · " + date(item4.submission.submittedAt)
                                          : "还没有提交作品"
                                      }}
                                      <template
                                        v-if="
                                          'processing' ===
                                            item4.submission?.status ||
                                          'failed' === item4.submission?.status
                                        "
                                      >
                                        <view :key="0" class="small subtle">
                                          {{
                                            "processing" ===
                                            item4.submission.status
                                              ? "结果待就绪"
                                              : "结果待就绪"
                                          }}
                                        </view>
                                      </template>
                                    </view>
                                  </view>
                                  <view class="row-actions">
                                    <text
                                      :class="[
                                        'badge',
                                        statusClass(item4.submission),
                                      ]"
                                    >
                                      {{ statusLabel(item4.submission) }}
                                    </text>
                                    <template v-if="item4.submission">
                                      <button
                                        :key="0"
                                        class="text-button"
                                        @click="
                                          (a) =>
                                            'published' ===
                                            item4.submission.status
                                              ? openFeedback(item4.submission)
                                              : openReview(item4.submission)
                                        "
                                      >
                                        查看详情
                                        ›
                                      </button>
                                      <button v-if="canAllowResubmission(item4.submission)" class="text-button return-work-action" :disabled="busy || canResubmit(item4.submission)" @click.stop="agreeResubmission(item4.submission)">{{ canResubmit(item4.submission) ? '待学生重交' : '打回作业' }}</button>
                                    </template>
                                  </view>
                                </view>
                              </template>
                              <view v-if="formerStudentsInAssignment.length" class="section-heading"><view class="section-title">已离班学生的提交</view><text class="tiny subtle">保留原班批阅</text></view>
                              <view v-for="former in formerStudentsInAssignment" :key="former.id" class="student-row card former-student-row">
                                <view class="avatar pale">{{ former.initial }}</view>
                                <view class="grow"><view class="strong">{{ former.name }}</view><view class="tiny subtle">{{ former.archived ? '已归档' : '已调班' }}</view></view>
                                <view class="row-actions"><text :class="['badge', statusClass(former.submission)]">{{ statusLabel(former.submission) }}</text><button class="text-button" :disabled="busy" @click="former.submission.status === 'published' ? openFeedback(former.submission) : openReview(former.submission)">查看详情 ›</button></view>
                              </view>
                              <template v-if="studentsInAssignment.length || formerStudentsInAssignment.length" />
                              <template v-else>
                                <view :key="0" class="empty-state">
                                  这个状态下还没有作品。
                                </view>
                              </template>
                            </template>
                            <template v-else>
                              <view v-if="mine" class="card ai-student-entry"><view class="ai-entry-heading"><view class="ai-entry-symbol">✧</view><view class="grow"><view class="section-title">我的AI批阅</view><view class="tiny subtle">{{ aiStateLabel(mine) }}</view></view><button class="text-button" :disabled="busy" @click="openAiReview(mine)">{{ mine.aiReview?.result ? '查看建议' : '查看进度' }} ›</button></view><view class="small subtle spaced-small">AI学习建议可以先看，教师批阅完成后即可查看正式反馈。</view></view>
                              <view class="section-heading">
                                <view class="section-title"> 我的提交 </view>
                                <text class="small subtle">
                                  {{ boundStudent?.name }}
                                </text>
                              </view>
                              <template v-if="mine">
                                <view :key="0" class="card">
                                  <view class="card-top">
                                    <view class="strong">
                                      {{ mine.photos.length }} 页
                                    </view>
                                    <text :class="['badge', statusClass(mine)]">
                                      {{ statusLabel(mine) }}
                                    </text>
                                  </view>
                                  <view class="small subtle">
                                    {{ date(mine.submittedAt) }} ·
                                    {{
                                      "parent" === mine.actor
                                        ? "家长代交（历史）"
                                        : "teacher" === mine.actor ? (mine.submittedBy?.name || "教师") + "代交"
                                        : "学生提交"
                                    }}
                                  </view>
                                  <view class="paragraph small">
                                    {{
                                      canResubmit(mine)
                                        ? "老师已同意重新提交一次。请核对照片后提交，成功后将以这次作品为准。"
                                        : "published" === mine.status
                                        ? "教师已完成批阅，可查看反馈。作品已锁定。"
                                        : "failed" === mine.status
                                          ? "作品已保留。AI批阅失败时可在批阅进度页用原图重试；教师批阅完成后可查看反馈。"
                                          : "processing" === mine.status
                                            ? "作品已接收，正在处理。你可以稍后回来查看。"
                                            : "作品已提交，可先查看AI学习建议；教师批阅完成后即可查看正式反馈。"
                                    }}
                                  </view>
                                  <template v-if="'published' === mine.status">
                                    <button
                                      :key="0"
                                      class="primary"
                                      @click="(e) => openFeedback(mine)"
                                    >
                                      阅读老师的反馈
                                    </button>
                                  </template>
                                  <template v-else>
                                    <template
                                      v-if="
                                        'failed' === mine.status ||
                                        'processing' === mine.status
                                      "
                                    >
                                      <button
                                        :key="1"
                                        class="secondary"
                                        :disabled="busy"
                                        @click="(e) => openAiReview(mine)"
                                      >
                                        {{
                                          "failed" === mine.status
                                            ? "查看批阅进度"
                                            : "查看批阅进度"
                                        }}
                                      </button>
                                    </template>
                                  </template>
                                </view>
                              </template>
                              <template v-else>
                                <view :key="1" class="empty-state card">
                                  <view class="empty-symbol"> ✎ </view>
                                  <view class="strong">
                                    等你写下自己的故事
                                  </view>
                                  <view class="small subtle">
                                    作品还没有提交，先读要求，再检查照片。
                                  </view>
                                </view>
                              </template>
                              <template v-if="canSubmit">
                                <button
                                  :key="2"
                                  class="primary spaced"
                                  @click="(e) => openSubmit(selectedAssignment)"
                                >
                                  {{
                                    mine ? "重新提交本次作业" : "选择照片并提交"
                                  }}
                                </button>
                              </template>
                              <template v-else>
                                <template v-if="expired(selectedAssignment) && !canSubmit">
                                  <view :key="3" class="notice">
                                    作业已经截止，暂不能提交。
                                  </view>
                                </template>
                              </template>
                              <button
                                class="text-button full-width spaced"
                                @click="(e) => go('records')"
                              >
                                查看作业记录 ›
                              </button>
                            </template>
                          </view>
                        </template>
                        <template v-else>
                          <template
                            v-if="'review' === screen && selectedSubmission"
                          >
                            <view :key="8">
                              <view class="review-top">
                                <view class="avatar pale">
                                  {{ studentFor(selectedSubmission).initial }}
                                </view>
                                <view class="grow">
                                  <view class="strong">
                                    {{
                                      studentFor(selectedSubmission).name
                                    }}的作品
                                  </view>
                                  <view class="small subtle">
                                    {{ selectedSubmission.photos.length }} 页
                                  </view>
                                </view>
                                <text
                                  :class="[
                                    'badge',
                                    statusClass(selectedSubmission),
                                  ]"
                                >
                                  {{ statusLabel(selectedSubmission) }}
                                </text>
                              </view>


                                  <view class="card photo-reader"><WorkViewer :photos="selectedSubmission.photos" v-model:page="photoIndex" /><view v-if="selectedSubmission.note" class="paragraph small">提交说明：{{ selectedSubmission.note }}</view></view>


                                  <view v-if="selectedSubmission.status === 'pending'" class="notice review-source-note">{{ selectedSubmission.aiReview?.result ? (selectedSubmission.draftRevision ? '当前显示的是教师在AI批阅结果基础上修改的分数和评价。可点击分数或评价继续修改。' : '下方分数和评价为AI批阅结果。如需调整，教师可点击分数或评价直接修改。') : 'AI批阅尚无可用结果，教师可直接填写或修改分数和评价。' }}</view>
                                  <view v-if="['failed', 'processing'].includes(selectedSubmission.status) && !canResubmit(selectedSubmission)" class="notice"><view class="small">AI结果暂未就绪，也可以直接进行教师批阅。</view><button class="primary full-width spaced" :disabled="busy" @click="manual(selectedSubmission)">教师批阅</button></view>
                                  <ReviewEditor
                                    v-if="['pending', 'published'].includes(selectedSubmission.status)"
                                    :review="review"
                                    :category="category"
                                    :open-dimension="openDimension"
                                    :focus-request="reviewFocus"
                                    :readonly="
                                      busy || 'published' === selectedSubmission.status || canResubmit(selectedSubmission)
                                    "
                                    @category="
                                      (e) => {
                                        category = e;
                                        openDimension = null;
                                      }
                                    "
                                    @dimension="(e) => (openDimension = e)"
                                    @score="editScore"
                                  />

                                <template
                                  v-if="'pending' === selectedSubmission.status && !canResubmit(selectedSubmission)"
                                >
                                  <view :key="2" class="action-bar">
                                    <button
                                      class="primary"
                                      :disabled="busy"
                                      @click="publish"
                                    >
                                      完成审核
                                    </button>
                                  </view>
                                </template>

                              <view v-if="canAllowResubmission(selectedSubmission)" class="spaced-small"><view v-if="canResubmit(selectedSubmission)" class="small subtle resubmission-agreed">作业已打回，待学生重新提交</view><button v-else class="secondary full-width" :disabled="busy" @click="agreeResubmission(selectedSubmission)">让学生重新提交本次作业</button></view>
                            </view>
                          </template>
                          <template v-else>
                            <template v-if="'submit' === screen">
                              <view :key="9">
                                <view class="submit-intro"><view class="detail-title">{{ selectedAssignment.title }}</view></view>
                                <view class="ai-submit-preview"><view class="ai-entry-symbol">✧</view><view class="grow"><view class="strong">提交后，开始AI双写批阅</view><view class="tiny subtle">识别作品 → 分析书写与写作 → 生成学习建议</view><view class="tiny subtle spaced-small">你可以先看AI建议，教师批阅完成后即可查看正式反馈。</view></view></view>
                                <view v-if="photos.length && photos.every(photo => photo.sample)" class="small subtle spaced-small">已预置示例作品，可直接提交体验。AI评分会标注“示例结果”；自选照片不会套用示例分数。</view>
                                <view class="upload-area">
                                  <view class="upload-icon"> ＋ </view>
                                  <view class="strong"> 添加作品照片 </view>
                                  <view class="small subtle">
                                    JPG / PNG / WebP · 最多 6 页
                                  </view>
                                  <button
                                    class="primary"
                                    :disabled="busy"
                                    @click="choosePhotos"
                                  >
                                    选择作品照片
                                  </button>
                                </view>
                                <template v-if="photos.length">
                                  <view :key="0" class="section-heading">
                                    <view class="section-title">
                                      检查页序
                                    </view>
                                    <text class="small subtle">
                                      {{ photos.length }} 页
                                    </text>
                                  </view>
                                </template>
                                <template
                                  v-for="(item5, index5) in photos"
                                  :key="item5.id"
                                >
                                  <view class="upload-row card">
                                    <image
                                      :src="displayPhoto(item5.url)"
                                      mode="aspectFill"
                                      class="photo-thumb"
                                    />
                                    <view class="grow">
                                      <view class="strong">
                                        第 {{ index5 + 1 }} 页
                                      </view>
                                      <view class="small subtle filename">
                                        {{
                                          item5.sample
                                            ? item5.name.replace(
                                                "作文排版示例",
                                                "作文",
                                              )
                                            : item5.name
                                        }}
                                      </view>
                                      <view class="photo-controls">
                                        <button
                                          :disabled="0 === index5 || busy"
                                          @click="(e) => movePhoto(index5, -1)"
                                        >
                                          上移
                                        </button>
                                        <button
                                          :disabled="
                                            index5 === photos.length - 1 || busy
                                          "
                                          @click="(e) => movePhoto(index5, 1)"
                                        >
                                          下移
                                        </button>
                                        <button
                                          :disabled="busy"
                                          class="delete-link"
                                          @click="
                                            (e) => photos.splice(index5, 1)
                                          "
                                        >
                                          移除
                                        </button>
                                      </view>
                                    </view>
                                  </view>
                                </template>
                                <view class="card form-card">
                                  <view class="section-title">
                                    给老师的话
                                    <text class="small subtle"> 选填 </text>
                                  </view>
                                  <textarea
                                    placeholder="有什么想请老师特别看一看？"
                                    auto-height=""
                                    :cursor-spacing="100"
                                    maxlength="400"
                                    v-model="note"
                                  />
                                </view>
                                <view class="evidence-note">
                                  按原照片保存，请确认字迹清晰；最多6页，单张不超过20MB。
                                </view>
                                <button
                                  class="primary spaced"
                                  :disabled="busy || !photos.length || !canSubmit"
                                  @click="submit"
                                >
                                  {{
                                    busy
                                      ? "提交中…"
                                      : "提交并开始AI批阅"
                                  }}
                                </button>
                              </view>
                            </template>
                            <template v-else>
                              <template
                                v-if="
                                  'feedback' === screen && selectedSubmission
                                "
                              >
                                <view :key="10">
                                  <template v-if="feedback">
                                    <view v-if="isTeacher" class="card homework-actions homework-selection-bar"><text class="small subtle">{{ selectedSubmission.excellent ? '★ 优秀作业 · 全班可参考' : '分享这份作品，供全班参考' }}</text><button class="primary excellent-action-button" :disabled="busy" @click="toggleExcellent(selectedSubmission)">{{ selectedSubmission.excellent ? '取消优秀作业' : '设为优秀作业' }}</button></view>
                                    <view class="feedback-intro">
                                      <view class="eyebrow">
                                            教师已完成批阅
                                      </view>
                                      <view class="detail-title">
                                        {{ assignmentFor(selectedSubmission).title }}
                                      </view>
                                    </view>
                                    <view class="dual-scores">
                                      <view class="score-tile">
                                        <view class="small"> 书写评价 </view>
                                        <view class="score-value">
                                          {{ total(feedback.handwriting) }}
                                          <text> / 100 </text>
                                        </view>
                                      </view>
                                      <view class="score-tile warm">
                                        <view class="small"> 写作评价 </view>
                                        <view class="score-value">
                                          {{ total(feedback.composition) }}
                                          <text> / 100 </text>
                                        </view>
                                      </view>
                                    </view>
                                    <view class="card feedback-original-work"><WorkViewer :photos="selectedSubmission.photos" v-model:page="photoIndex" title="学生提交的作品" /></view>
                                    <view class="teacher-note card">
                                      <view class="teacher-note-header">
                                        <view class="avatar tiny-avatar">
                                          {{
                                            teacherForFeedback(
                                              selectedSubmission,
                                            ).initial
                                          }}
                                        </view>
                                        <view class="strong">
                                          {{
                                            teacherForFeedback(
                                              selectedSubmission,
                                            ).name
                                          }}想对你说
                                        </view>
                                        <text class="small subtle">
                                          已批阅
                                        </text>
                                      </view>
                                      <view class="paragraph">
                                        {{ feedback.composition.summary }}
                                      </view>
                                    </view>
                                    <view class="next-steps card">
                                      <view class="section-title">
                                        批阅建议
                                      </view>
                                      <view class="paragraph preserve-lines">
                                        {{ feedback.nextSteps }}
                                      </view>
                                    </view>
                                    <view class="section-heading">
                                      <view class="section-title">
                                        完整五维评价
                                      </view>
                                      <text class="small subtle">
                                        书写与写作分别查看
                                      </text>
                                    </view>
                                    <view class="category-switch">
                                      <button
                                        :class="{
                                          active: 'handwriting' === category,
                                        }"
                                        @click="
                                          (e) => {
                                            category = 'handwriting';
                                            openDimension = null;
                                          }
                                        "
                                      >
                                        书写
                                      </button>
                                      <button
                                        :class="{
                                          active: 'composition' === category,
                                        }"
                                        @click="
                                          (e) => {
                                            category = 'composition';
                                            openDimension = null;
                                          }
                                        "
                                      >
                                        写作
                                      </button>
                                    </view>
                                    <view class="card">
                                      <view class="section-title">{{ category === 'composition' ? '教师寄语（作文总体评价）' : '教师寄语（书写总体评价）' }}</view>
                                      <view class="paragraph">
                                        {{ feedback[category].summary }}
                                      </view>
                                      <template
                                        v-for="item6 in rubric[category]"
                                        :key="item6.id"
                                      >
                                        <view class="feedback-dimension">
                                          <button
                                            class="feedback-dimension-head"
                                            :aria-expanded="!feedbackCollapsed.includes(item6.id)"
                                            @click="toggleFeedbackDimension(item6.id)"
                                          >
                                            <text>
                                              {{ item6.name }}
                                            </text>
                                            <text class="grow" />
                                            <text class="strong">
                                              {{
                                                feedback[category].scores[
                                                  item6.id
                                                ]
                                              }}
                                              <text class="subtle">
                                                / {{ item6.max }}
                                              </text>
                                            </text>
                                            <view class="review-collapse-label"><text>{{ feedbackCollapsed.includes(item6.id) ? '展开' : '收起' }}</text><view :class="['review-chevron', { expanded: !feedbackCollapsed.includes(item6.id) }]" /></view>
                                          </button>
                                          <template
                                            v-if="!feedbackCollapsed.includes(item6.id)"
                                          >
                                            <view
                                              :key="0"
                                              class="paragraph small"
                                            >
                                              <view class="feedback-comment-content">{{ feedback[category].comments[item6.id] || "本维度暂无单独评语。" }}</view>
                                              <view
                                                class="small subtle feedback-rule"
                                              >
                                                评价规则：{{
                                                  item6.description
                                                }}
                                              </view>
                                            </view>
                                          </template>
                                        </view>
                                      </template>
                                    </view>
                                    <template v-if="!isTeacher && canSubmit">
                                      <button
                                        :key="0"
                                        class="primary spaced"
                                        @click="
                                          (e) => openSubmit(selectedAssignment)
                                        "
                                      >
                                        重新提交本次作业
                                      </button>
                                    </template>
                                    <button
                                      class="text-button full-width spaced"
                                      @click="(e) => go('records')"
                                    >
                                      查看作业记录 ›
                                    </button>
                                  </template>
                                  <template v-else>
                                    <view :key="1" class="empty-state card">
                                      <view class="empty-symbol"> ◌ </view>
                                      <view class="strong">
                                        教师批阅中
                                      </view>
                                      <view class="paragraph small">
                                        教师反馈准备好后，你就能看到评分和批阅建议。
                                      </view>
                                      <button
                                        class="secondary"
                                        @click="(e) => go('assignment')"
                                      >
                                        返回作业详情
                                      </button>
                                    </view>
                                  </template>
                                </view>
                              </template>
                              <template v-else>
                                <template v-if="'records' === screen">
                                  <SubmissionRecords :key="11" :records="submissionRecords" :student-name="historyStudent?.name" :busy="busy" @feedback="openFeedback" @ai="openAiReview" />
                                </template>
                                <template v-else>
                                  <template v-if="'profile' === screen">
                                    <view :key="12">
                                      <OrganizationSelector :organizations="organizationOptions" :model-value="currentOrganization?.id || ''" :allow-switch="isTeacher" :disabled="busy" @update:modelValue="switchOrganization" />
                                      <view class="card profile-card">
                                        <view class="avatar">
                                          {{
                                            isTeacher
                                              ? teacherIdentity?.initial || "人"
                                              : boundStudent?.initial || "人"
                                          }}
                                        </view>
                                        <view class="detail-title">
                                          {{ identity }}
                                        </view>
                                        <view class="small subtle">
                                          {{ currentOrganization?.name }} ·
                                          {{
                                            isTeacher
                                              ? (teacherIdentity?.subject ||
                                                  "") +
                                                "教师 · 任教 " +
                                                teachingClassOptions.length +
                                                " 个班级"
                                              : "学生" +
                                                " · " +
                                                boundStudent?.className
                                          }}
                                        </view>
                                      </view>
                                      <template v-if="isTeacher">
                                        <view class="card"><view class="section-title">班级与学生管理</view><view class="small subtle spaced-small">创建自己的班级，批量导入学生并发放登录账号。</view><view class="admin-summary-actions"><button class="secondary" :disabled="busy" @click="go('adminClasses')">班级管理</button><button class="secondary" :disabled="busy" @click="go('adminStudents')">学生管理与导入</button></view></view>
                                        <view
                                          :key="0"
                                          class="card profile-information"
                                        >
                                          <view class="card-top">
                                            <view class="section-title">
                                              任教班级
                                            </view>
                                            <button
                                              class="text-button"
                                              :disabled="busy"
                                              @click="(e) => go('classes')"
                                            >
                                              查看全部 ›
                                            </button>
                                          </view>
                                          <template
                                            v-for="item9 in teachingClassOptions"
                                            :key="item9.id"
                                          >
                                            <button
                                              class="profile-information-row profile-class-entry"
                                              :disabled="busy"
                                              @click="
                                                (a) => openClassMembers(item9)
                                              "
                                            >
                                              <text>
                                                {{ item9.name }}
                                              </text>
                                              <text class="subtle">
                                                {{
                                                  activeStudents(
                                                    state,
                                                    item9.id,
                                                  ).length
                                                }}
                                                位学生 ›
                                              </text>
                                            </button>
                                          </template>
                                          <view class="profile-information-row">
                                            <text class="subtle">
                                              已布置作业
                                            </text>
                                            <text>
                                              {{
                                                organizationAssignmentCount
                                              }}
                                              项
                                            </text>
                                          </view>
                                          <button
                                            class="text-button full-width spaced"
                                            @click="bindingHelp"
                                          >
                                            任教信息有误？联系学校管理员
                                          </button>
                                        </view>
                                      </template>
                                      <template v-else>
                                        <view
                                          :key="1"
                                          class="card profile-information bound-profile"
                                        >
                                          <view class="card-top">
                                            <view class="section-title">
                                              {{ "我的学习档案" }}
                                            </view>
                                            <text class="badge green">
                                              已绑定
                                            </text>
                                          </view>
                                          <view class="profile-information-row">
                                            <text class="subtle"> 学生 </text>
                                            <text>
                                              {{ boundStudent?.name }}
                                            </text>
                                          </view>
                                          <view class="profile-information-row">
                                            <text class="subtle">
                                              学校
                                            </text>
                                            <text>
                                              {{ currentOrganization?.name }}
                                            </text>
                                          </view>
                                          <view class="profile-information-row">
                                            <text class="subtle"> 班级 </text>
                                            <text>
                                              {{ boundStudent?.className }}
                                            </text>
                                          </view>
                                          <template
                                            v-if="boundStudent?.studentNumber"
                                          >
                                            <view
                                              :key="0"
                                              class="profile-information-row"
                                            >
                                              <text class="subtle"> 学号 </text>
                                              <text>
                                                {{ boundStudent.studentNumber }}
                                              </text>
                                            </view>
                                          </template>
                                          <view class="profile-information-row">
                                            <text class="subtle">
                                              作品记录
                                            </text>
                                            <button
                                              class="text-button"
                                              @click="(e) => go('records')"
                                            >
                                              {{ myHistory.length }} 份作业 ›
                                            </button>
                                          </view>
                                          <button
                                            class="text-button full-width spaced"
                                            @click="bindingHelp"
                                          >
                                            绑定信息有误？联系学校管理员
                                          </button>
                                        </view>
                                      </template>
                                      <button class="secondary full-width spaced logout-button" :disabled="busy" @click="logout">退出登录</button>
                                      <view class="card">
                                        <view class="section-title">
                                          双写评价
                                        </view>
                                        <view class="paragraph small">
                                          同一份作品，分别获得书写和写作两份反馈。每类按五个维度评价，各计
                                          100 分。
                                        </view>
                                        <view class="dual-tags">
                                          <text> 书写 / 100 分 </text>
                                          <text> 写作 / 100 分 </text>
                                        </view>
                                        <view class="small subtle spaced-small">
                                          教师批阅完成后，即可查看反馈。
                                        </view>
                                      </view>
                                    </view>
                                  </template>
                                  <template v-else>
                                    <template
                                      v-if="
                                        ('classes' !== screen &&
                                          'classMembers' !== screen) ||
                                        !isTeacher
                                      "
                                    >
                                      <template v-if="'create' === screen">
                                        <AssignmentComposer :key="14" v-model:title="newTitle" v-model:requirements="newRequirements" v-model:illustration="newIllustration" v-model:due="newDue" v-model:classIds="newClassIds" v-model:paperPages="newPaperPages" :classes="teachingClassOptions" :student-counts="Object.fromEntries(teachingClassOptions.map(item => [item.id, activeStudents(state, item.id).length]))" :templates="assignmentTemplates" :busy="busy" @publish="createAssignment" @save-template="saveAssignmentTemplate" @delete-template="deleteAssignmentTemplate" />
                                      </template>
                                    </template>
                                    <template v-else>
                                      <view :key="13">
                                        <TeachingClasses
                                          :model="teachingModel"
                                          :organization="currentOrganization"
                                          :mode="
                                            'classes' === screen
                                              ? 'classes'
                                              : 'members'
                                          "
                                          :busy="busy"
                                          @open="openClassMembers"
                                          @visit="visitRosterClass"
                                          v-model:query="memberSearch"
                                        />
                                      </view>
                                    </template>
                                  </template>
                                </template>
                              </template>
                            </template>
                          </template>
                        </template>
                      </template>
                    </template>
                  </template>
                </template>
              </template>
            </template>
          </view>
        </template>
        <template v-else>
          <view :key="1" class="page-body">
            <view class="empty-state card">
              <view class="strong"> 暂无任教班级 </view>
              <view class="small subtle">
                新建班级后，即可导入学生并布置作业。
                <button class="primary full-width spaced" :disabled="busy" @click="go('adminClasses')">新建我的班级</button>
              </view>
            </view>
          </view>
        </template>
      </template>
      <template v-if="needsBinding" />
      <template v-else>
        <view
          key="learning-navigation"
          :class="['bottom-nav', { 'learner-bottom-nav': !isTeacher }]"
        >
          <button
            :class="{ active: 'home' === activeTab }"
            :disabled="busy"
            @click="(e) => go('home')"
          >
            <text class="nav-glyph"> ⌂ </text>
            <text>
              {{ isTeacher ? "工作台" : "任务" }}
            </text>
          </button>
          <template v-if="isTeacher" />
          <template v-else>
            <button
              :key="0"
              :class="{ active: 'growth' === activeTab }"
              :disabled="busy"
              @click="(e) => go('growth')"
            >
              <view class="nav-glyph growth-nav-icon" aria-hidden="true"><view /><view /><view /></view>
              <text> 成长 </text>
            </button>
          </template>
          <button
            :class="{
              active: 'statistics' === activeTab || 'records' === activeTab,
            }"
            :disabled="busy"
            @click="(e) => go(isTeacher ? 'statistics' : 'records')"
          >
            <text class="nav-glyph"> ▤ </text>
            <text>
              {{ isTeacher ? "学情" : "记录" }}
            </text>
          </button>
          <button
            :class="{ active: 'profile' === activeTab }"
            :disabled="busy"
            @click="(e) => go('profile')"
          >
            <text class="nav-glyph"> ○ </text>
            <text> 我的 </text>
          </button>
        </view>
      </template>
    </view>
    <view class="mobile-preview-tools">
      <PrototypeTools
        :screen="screen"
        :role="role"
        :needs-binding="needsBinding"
        :signed-in="accountSignedIn"
        :credentials="state.loginCredentials || []"
        :applications="state.teacherApplications || []"
        @use-account="useDemoAccount"
        @review-application="reviewTeacherApplication"
        :busy="busy"
        @restartBinding="restartBinding"
        @invite="
          (e) => {
            inviteCode = e;
            editBindingCode();
          }
        "
        @samples="addSamples"
        @reset="reset"
        v-model:failSubmit="failSubmit"
        v-model:failAnalysis="failAnalysis"
      />
    </view>
    <!-- #ifdef H5 -->
    <view class="desktop-guide">
      <view class="eyebrow"> 体验路径 </view>
      <view class="guide-title">
        一份作文
        <br />
        两份成长建议
      </view>
      <view class="guide-step">
        <text> 01 </text>
        <view>
          <view class="strong"> 教师批阅与反馈 </view>
          <view class="small subtle">
            教师登录并确认任教范围，
            <br />
            选择作业进入名单完成批阅。
          </view>
        </view>
      </view>
      <view class="guide-step">
        <text> 02 </text>
        <view>
          <view class="strong"> 切换学生身份 </view>
          <view class="small subtle">
            教师申请审核开户，学生领取老师发放的账号，
            <br />
            查看任务、反馈与个人成长。
          </view>
        </view>
      </view>
      <view class="guide-step">
        <text> 03 </text>
        <view>
          <view class="strong"> 查看学情与记录 </view>
          <view class="small subtle">
            按班级查看学生与作业统计，
            <br />
            每份作业以最新提交为准。
          </view>
        </view>
      </view>
      <PrototypeTools
        :screen="screen"
        :role="role"
        :needs-binding="needsBinding"
        :signed-in="accountSignedIn"
        :credentials="state.loginCredentials || []"
        :applications="state.teacherApplications || []"
        @use-account="useDemoAccount"
        @review-application="reviewTeacherApplication"
        :busy="busy"
        @restartBinding="restartBinding"
        @invite="
          (e) => {
            inviteCode = e;
            editBindingCode();
          }
        "
        @samples="addSamples"
        @reset="reset"
        v-model:failSubmit="failSubmit"
        v-model:failAnalysis="failAnalysis"
      />
    </view>
    <!-- #endif -->
    <SlideDownPanel v-if="toast || error" :key="error || toast" :error="!!error" @dismiss="() => { error = ''; toast = ''; }">{{ error || toast }}</SlideDownPanel>
    <template v-if="modal">
      <SlideDownPanel :key="1" modal @dismiss="modal = null">
          <view class="section-title">
            {{ modal.title }}
          </view>
          <view class="paragraph">
            {{ modal.body }}
          </view>
          <view class="modal-actions">
            <button v-if="modal.cancel !== false" class="secondary" @click="(e) => (modal = null)">
              取消
            </button>
            <button class="primary" @click="confirmModal">
              {{ modal.confirm }}
            </button>
          </view>
      </SlideDownPanel>
    </template>
  </view>
</template>
