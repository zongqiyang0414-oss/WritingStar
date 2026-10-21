<script setup>
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
import { displayPhoto } from "../../services/presentation.js";
import { growthIllustration } from "../../services/assets.js";
import { ref } from "vue";
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
    panel: panel,
    photoIndex: photoIndex,
    openDimension: openDimension,
    filter: filter,
    busy: busy,
    error: error,
    toast: toast,
    photos: photos,
    note: note,
    failSubmit: failSubmit,
    failAnalysis: failAnalysis,
    newTitle: newTitle,
    newRequirements: newRequirements,
    newDue: newDue,
    newClassId: newClassId,
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
    startSingleAi,
    refreshAi,
    applyAiSuggestions,
    reviewAiSubmission,
    mine: mine,
    isTeacher: isTeacher,
    isAdmin,
    adminIdentity,
    adminDirty,
    adminAction,
    identity: identity,
    myHistory: myHistory,
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
</script>

<template>
  <view class="stage" :style="{ '--wechat-bottom-inset': bottomInset + 'px' }">
    <!-- #ifdef H5 -->
    <view class="desktop-intro">
      <view class="intro-brand">
        <view class="brand-mark"> 星 </view>
        <view>
          <view class="brand-name"> 写字星 </view>
          <view class="eyebrow"> WRITINGSTAR </view>
        </view>
      </view>
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
        原型展示 · v0.11.0
      </view>
    </view>
    <!-- #endif -->
    <view class="mobile-preview-tools">
      <PrototypeTools
        :screen="screen"
        :role="role"
        :needs-binding="needsBinding"
        :signed-in="accountSignedIn"
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
    <view class="app-shell">
      <view class="app-header">
        <view class="top-row">
          <view class="mobile-brand">
            <view class="brand-mark small"> 星 </view>
            <view>
              <view class="brand-name"> 写字星 </view>
              <view class="subtle tiny"> 写字 · 写作 · 一起成长 </view>
            </view>
          </view>
          <view class="header-avatar">
            {{
              isAdmin ? adminIdentity?.initial || "人" : isTeacher
                ? teacherIdentity?.initial || "人"
                : boundStudent?.initial || "人"
            }}
          </view>
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
        <template v-if="needsBinding" />
        <template v-else>
          <OrganizationSelector
            :key="0"
            :organizations="organizationOptions"
            :model-value="currentOrganization?.id || ''"
            :allow-switch="isTeacher || isAdmin"
            :disabled="busy"
            @update:modelValue="switchOrganization"
          />
        </template>
      </view>
      <template v-if="startupError">
        <view :key="0" class="fatal card">
          <view class="section-title"> 数据暂不可用 </view>
          <view class="paragraph">
            {{ startupError }}
          </view>
        </view>
      </template>
      <template v-else-if="isAdmin">
        <view key="admin-content" class="page-body admin-page-body">
          <InvitationBinding
            v-if="needsBinding"
            :role="role"
            :signed-in="accountSignedIn"
            :candidate="bindingCandidate"
            :busy="busy"
            v-model:code="inviteCode"
            @login="loginForBinding"
            @preview="previewBinding"
            @edit="editBindingCode"
            @confirm="confirmBinding"
            @help="bindingHelp"
          />
          <view v-if="error" class="error-message" role="alert">{{ error }}</view>
          <AdminWorkspace
            v-if="!needsBinding"
            :key="currentOrganization?.id"
            :state="state"
            :organization="currentOrganization"
            :administrator="adminIdentity"
            :section="screen"
            :busy="busy"
            @navigate="go"
            @action="adminAction"
            @confirm="modal = $event"
            @dirty="adminDirty = $event"
          />
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
                :class="['page-heading', { 'root-heading': isRoot }]"
              >
                <template v-if="isRoot" />
                <template v-else>
                  <button
                    :key="0"
                    class="back-button"
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
            <template v-if="needsBinding">
              <InvitationBinding
                :key="1"
                :role="role"
                :signed-in="accountSignedIn"
                :candidate="bindingCandidate"
                :busy="busy"
                @login="loginForBinding"
                @preview="previewBinding"
                @edit="editBindingCode"
                @confirm="confirmBinding"
                @help="bindingHelp"
                v-model:code="inviteCode"
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
                @refresh="refreshAi"
                @review="reviewAiSubmission"
                @apply="applyAiSuggestions"
                @feedback="openFeedback(selectedSubmission)"
                @back="back"
              />
            </template>
            <template v-else-if="screen === 'aiBatch' && isTeacher && selectedAssignment">
              <AiBatchReview
                :key="'ai-batch-' + selectedAssignment.id"
                :assignment="selectedAssignment"
                :rows="aiRows"
                :summary="aiSummary"
                :busy="busy"
                @start="beginAiBatch(false)"
                @retry="beginAiBatch(true)"
                @view="openAiReview"
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
                        <text>
                          进行中作业 · {{ ongoingAssignments.length }} 项
                        </text>
                        <text> {{ classStudents.length }} 位学生 </text>
                      </view>
                      <view class="stats">
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
                            待批阅
                          </view>
                        </view>
                        <view class="stat">
                          <view class="stat-number">
                            {{ workCounts.completed }}
                            <text class="stat-unit"> 份 </text>
                          </view>
                          <view class="stat-label">
                            <text class="tiny-dot" />
                            已完成
                          </view>
                        </view>
                      </view>
                      <view class="tiny subtle">
                        每名学生的每项作业计 1 份，按最新提交状态统计。
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
                        已截止的作业
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
                        当前学生已不在班级，作品与已发布反馈保留。请联系学校管理员核对。
                      </view>
                    </template>
                    <view class="student-tip">
                      <view class="tip-symbol"> ✦ </view>
                      <view>
                        <view class="strong">
                          {{ "先读要求，再动笔" }}
                        </view>
                        <view class="small subtle">
                          同一份作文，收获书写和写作两份建议。
                        </view>
                      </view>
                    </view>
                    <button
                      class="personal-growth-entry card"
                      @click="(e) => go('growth')"
                    >
                      <view>
                        <view class="strong"> {{ "看看我的成长" }} ↗ </view>
                        <view class="small subtle">
                          已收到
                          {{ growthSummary?.feedbackCount || 0 }} 份作业反馈 ·
                          {{ growthSummary?.revisionCount || 0 }} 次订正
                        </view>
                      </view>
                      <text class="personal-growth-entry-mark"> ↗ </text>
                    </button>
                    <view class="section-heading">
                      <view class="section-title">
                        我的双写任务
                        <text class="count-label">
                          {{ visibleAssignments.length }}
                        </text>
                      </view>
                    </view>
                  </template>
                  <template v-for="item2 in visibleAssignments" :key="item2.id">
                    <view class="assignment-card card">
                      <view class="card-top">
                        <view class="task-type">
                          <text class="task-icon"> 文 </text>
                          <text> 作文双评 </text>
                        </view>
                        <template v-if="expired(item2)">
                          <text :key="0" class="badge neutral"> 已截止 </text>
                        </template>
                        <template v-else>
                          <template v-if="isTeacher">
                            <text :key="2" class="badge green"> 进行中 </text>
                          </template>
                          <template v-else>
                            <text
                              :key="1"
                              :class="[
                                'badge',
                                statusClass(
                                  latest(item2.id, boundStudent?.id || ''),
                                ),
                              ]"
                            >
                              {{
                                statusLabel(
                                  latest(item2.id, boundStudent?.id || ""),
                                )
                              }}
                            </text>
                          </template>
                        </template>
                      </view>
                      <view class="assignment-title">
                        {{ item2.title }}
                      </view>
                      <view class="small subtle">
                        {{ date(item2.dueAt) }} 截止
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
                            待批阅
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
                            isTeacher ||
                            "published" !==
                              latest(item2.id, boundStudent?.id || "")?.status
                              ? isTeacher
                                ? counts(item2).pending
                                  ? "查看与批阅"
                                  : "查看作业"
                                : "查看任务"
                              : "查看反馈"
                          }}
                          <text> ↗ </text>
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
                            : "本班暂无已截止的作业。"
                          : "老师还没有布置作业。"
                      }}
                    </view>
                  </template>
                  <view class="home-footer"> 写字有章法 · 写作有温度 </view>
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
                                {{ date(selectedAssignment.dueAt) }} 截止
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
                            <template v-if="isTeacher">
                              <view class="card ai-assignment-entry">
                                <view class="ai-entry-heading"><view class="ai-entry-symbol">✧</view><view class="grow"><view class="section-title">全班AI批阅</view><view class="tiny subtle">已提交作品统一批阅，逐份查看双写建议</view></view></view>
                                <view class="ai-entry-counts"><text>待AI批阅 {{ aiSummary.eligible }}</text><text>处理中 {{ aiSummary.running }}</text><text>AI已完成 {{ aiSummary.completed }}</text></view>
                                <button class="primary full-width" :disabled="busy || !aiSummary.eligible" @click="beginAiBatch(false)">{{ aiSummary.eligible ? '一键AI批阅 · ' + aiSummary.eligible + ' 份' : aiSummary.running ? '全班批阅进行中' : '暂无待AI批阅作品' }}</button>
                                <button class="text-button full-width spaced-small" :disabled="busy" @click="openAiBatch">查看全班进度与结果 ›</button>
                              </view>
                              <view class="section-heading">
                                <view class="section-title"> 提交名单 </view>
                                <text class="small subtle">
                                  {{ counts(selectedAssignment).total }} 位学生
                                </text>
                              </view>
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
                                    <view class="small subtle">
                                      {{
                                        item4.submission
                                          ? "第 " +
                                            item4.submission.version +
                                            " 版 · " +
                                            item4.submission.photos.length +
                                            " 页" +
                                            (item4.submission.version > 1
                                              ? " · 订正"
                                              : "")
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
                                              ? "作品处理中"
                                              : "处理失败，可人工批阅"
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
                                        {{
                                          "published" ===
                                          item4.submission.status
                                            ? "查看反馈"
                                            : "进入批阅"
                                        }}
                                        ›
                                      </button>
                                    </template>
                                  </view>
                                </view>
                              </template>
                              <view v-if="formerStudentsInAssignment.length" class="section-heading"><view class="section-title">已离班学生的提交</view><text class="tiny subtle">保留原班批阅</text></view>
                              <view v-for="former in formerStudentsInAssignment" :key="former.id" class="student-row card former-student-row">
                                <view class="avatar pale">{{ former.initial }}</view>
                                <view class="grow"><view class="strong">{{ former.name }}</view><view class="tiny subtle">{{ former.archived ? '已归档' : '已调班' }} · 第 {{ former.submission.version }} 版</view></view>
                                <view class="row-actions"><text :class="['badge', statusClass(former.submission)]">{{ statusLabel(former.submission) }}</text><button class="text-button" :disabled="busy" @click="former.submission.status === 'published' ? openFeedback(former.submission) : openReview(former.submission)">{{ former.submission.status === 'published' ? '查看反馈' : '进入批阅' }} ›</button></view>
                              </view>
                              <template v-if="studentsInAssignment.length || formerStudentsInAssignment.length" />
                              <template v-else>
                                <view :key="0" class="empty-state">
                                  这个状态下还没有作品。
                                </view>
                              </template>
                            </template>
                            <template v-else>
                              <view v-if="mine" class="card ai-student-entry"><view class="ai-entry-heading"><view class="ai-entry-symbol">✧</view><view class="grow"><view class="section-title">我的AI批阅</view><view class="tiny subtle">{{ aiStateLabel(mine) }} · 第 {{ mine.version }} 版</view></view><button class="text-button" :disabled="busy" @click="openAiReview(mine)">{{ mine.aiReview?.result ? '查看建议' : '查看进度' }} ›</button></view><view class="small subtle spaced-small">AI学习建议可以先看，老师正式反馈单独发布。</view></view>
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
                                      第 {{ mine.version }} 版 ·
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
                                        : "学生提交"
                                    }}
                                  </view>
                                  <view class="paragraph small">
                                    {{
                                      "published" === mine.status
                                        ? "老师已发布反馈，读完建议后可以提交订正。"
                                        : "failed" === mine.status
                                          ? "处理失败，作品已保留。请重试，或联系老师进行人工批阅。"
                                          : "processing" === mine.status
                                            ? "作品已接收，正在处理。你可以稍后回来查看。"
                                            : "作品已提交，可以先查看AI学习建议。老师正式反馈将在复核后单独发布。"
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
                                        @click="(e) => retry(mine)"
                                      >
                                        {{
                                          "failed" === mine.status
                                            ? "重新处理"
                                            : "刷新处理状态"
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
                                    mine ? "按建议提交订正" : "选择照片并提交"
                                  }}
                                </button>
                              </template>
                              <template v-else>
                                <template v-if="expired(selectedAssignment)">
                                  <view :key="3" class="notice">
                                    作业已经截止，暂不能提交或订正。
                                  </view>
                                </template>
                              </template>
                              <button
                                class="text-button full-width spaced"
                                @click="(e) => go('records')"
                              >
                                查看历次作品与反馈 ›
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
                                    第 {{ selectedSubmission.version }} 版 ·
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
                              <view class="ai-review-shortcut"><view><view class="strong">AI双写建议</view><view class="tiny subtle">{{ aiStateLabel(selectedSubmission) }} · 与教师草稿分别保留</view></view><button class="text-button" :disabled="busy" @click="openAiReview(selectedSubmission)">查看AI批阅 ›</button></view>
                              <template
                                v-if="
                                  'processing' === selectedSubmission.status ||
                                  'failed' === selectedSubmission.status
                                "
                              >
                                <view :key="0" class="card">
                                  <view class="empty-state">
                                    <view class="empty-symbol">
                                      {{
                                        "failed" === selectedSubmission.status
                                          ? "!"
                                          : "◌"
                                      }}
                                    </view>
                                    <view class="strong">
                                      {{
                                        "failed" === selectedSubmission.status
                                          ? "作品处理失败"
                                          : "作品正在处理"
                                      }}
                                    </view>
                                    <view class="paragraph small">
                                      作品已保留。可以重新处理，或直接进行人工批阅。
                                    </view>
                                    <button
                                      class="primary"
                                      :disabled="busy"
                                      @click="(e) => retry(selectedSubmission)"
                                    >
                                      重新处理
                                    </button>
                                    <button
                                      class="secondary spaced"
                                      :disabled="busy"
                                      @click="(e) => manual(selectedSubmission)"
                                    >
                                      转入人工批阅
                                    </button>
                                  </view>
                                </view>
                              </template>
                              <template v-else>
                                <view class="segmented">
                                  <button
                                    :class="{ active: 'evaluation' === panel }"
                                    @click="(e) => (panel = 'evaluation')"
                                  >
                                    双写评价
                                  </button>
                                  <button
                                    :class="{ active: 'photos' === panel }"
                                    @click="(e) => (panel = 'photos')"
                                  >
                                    查看原作品
                                  </button>
                                </view>
                                <template v-if="'photos' === panel">
                                  <view :key="0" class="card photo-reader">
                                    <view class="small subtle">
                                      第 {{ photoIndex + 1 }} 页 ·
                                      {{
                                        assignmentFor(selectedSubmission).title
                                      }}
                                    </view>
                                    <image
                                      class="essay-image"
                                      :src="
                                        displayPhoto(
                                          selectedSubmission.photos[photoIndex]
                                            .url,
                                        )
                                      "
                                      mode="widthFix"
                                    />
                                    <view class="photo-pagination">
                                      <button
                                        class="secondary"
                                        :disabled="0 === photoIndex"
                                        @click="(e) => photoIndex--"
                                      >
                                        上一页
                                      </button>
                                      <text>
                                        {{ photoIndex + 1 }} /
                                        {{ selectedSubmission.photos.length }}
                                      </text>
                                      <button
                                        class="secondary"
                                        :disabled="
                                          photoIndex ===
                                          selectedSubmission.photos.length - 1
                                        "
                                        @click="(e) => photoIndex++"
                                      >
                                        下一页
                                      </button>
                                    </view>
                                    <template v-if="selectedSubmission.note">
                                      <view :key="0" class="paragraph small">
                                        提交说明：{{ selectedSubmission.note }}
                                      </view>
                                    </template>
                                  </view>
                                </template>
                                <template v-else>
                                  <view class="notice">
                                    {{
                                      null === total(review.handwriting) ||
                                      null === total(review.composition)
                                        ? "评分待填写，请查看原作品后完成批阅。"
                                        : "请结合原作品复核评分和评语，确认后发布给学生。"
                                    }}
                                  </view>
                                  <ReviewEditor
                                    :review="review"
                                    :category="category"
                                    :open-dimension="openDimension"
                                    :readonly="
                                      'published' === selectedSubmission.status
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
                                </template>
                                <template
                                  v-if="'pending' === selectedSubmission.status"
                                >
                                  <view :key="2" class="action-bar">
                                    <button
                                      class="secondary"
                                      :disabled="busy"
                                      @click="saveDraft"
                                    >
                                      {{ busy ? "保存中…" : "保存草稿" }}
                                    </button>
                                    <button
                                      class="primary"
                                      :disabled="busy"
                                      @click="publish"
                                    >
                                      发布反馈 ↗
                                    </button>
                                  </view>
                                </template>
                              </template>
                            </view>
                          </template>
                          <template v-else>
                            <template v-if="'submit' === screen">
                              <view :key="9">
                                <view class="submit-intro">
                                  <view class="eyebrow">
                                    {{ selectedAssignment.title }}
                                  </view>
                                  <view class="detail-title">
                                    {{
                                      mine
                                        ? "下一次，写得更好"
                                        : "提交作品，看看AI的建议"
                                    }}
                                  </view>
                                  <view class="paragraph small subtle">
                                    整页拍清楚，按阅读顺序排列。提交前检查是否有缺页或模糊的照片。
                                  </view>
                                </view>
                                <view class="ai-submit-preview"><view class="ai-entry-symbol">✧</view><view class="grow"><view class="strong">提交后，开始AI双写批阅</view><view class="tiny subtle">识别作品 → 分析书写与写作 → 生成学习建议</view><view class="tiny subtle spaced-small">你可以先看AI建议，老师正式反馈单独发布。</view></view></view>
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
                                  每张照片不超过 800 KB，最多提交 6 页。
                                </view>
                                <button
                                  class="primary spaced"
                                  :disabled="busy || !photos.length"
                                  @click="submit"
                                >
                                  {{
                                    busy
                                      ? "提交中…"
                                      : mine ? "提交订正并开始AI批阅" : "提交并开始AI批阅"
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
                                    <view class="feedback-intro">
                                      <view class="eyebrow">
                                        第 {{ selectedSubmission.version }} 版 ·
                                        老师已发布
                                      </view>
                                      <view class="detail-title">
                                        你的努力，被看见了
                                      </view>
                                      <view class="small subtle">
                                        {{
                                          assignmentFor(selectedSubmission)
                                            .title
                                        }}
                                      </view>
                                    </view>
                                    <view class="dual-scores">
                                      <view class="score-tile">
                                        <view class="small"> 书写评价 </view>
                                        <view class="score-value">
                                          {{ total(feedback.handwriting) }}
                                          <text> / 100 </text>
                                        </view>
                                        <view class="small subtle">
                                          把每一个字写清楚
                                        </view>
                                      </view>
                                      <view class="score-tile warm">
                                        <view class="small"> 写作评价 </view>
                                        <view class="score-value">
                                          {{ total(feedback.composition) }}
                                          <text> / 100 </text>
                                        </view>
                                        <view class="small subtle">
                                          把自己的感受写具体
                                        </view>
                                      </view>
                                    </view>
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
                                          已发布
                                        </text>
                                      </view>
                                      <view class="paragraph">
                                        {{ feedback.composition.summary }}
                                      </view>
                                    </view>
                                    <view class="next-steps card">
                                      <view class="eyebrow">
                                        下一步 / 小小的进步
                                      </view>
                                      <view class="section-title">
                                        先做好这两件事
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
                                            @click="
                                              (a) =>
                                                (openDimension =
                                                  openDimension === item6.id
                                                    ? null
                                                    : item6.id)
                                            "
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
                                            <text class="subtle">
                                              {{
                                                openDimension === item6.id
                                                  ? "−"
                                                  : "＋"
                                              }}
                                            </text>
                                          </button>
                                          <template
                                            v-if="openDimension === item6.id"
                                          >
                                            <view
                                              :key="0"
                                              class="paragraph small"
                                            >
                                              {{
                                                feedback[category].comments[
                                                  item6.id
                                                ] || "本维度暂无单独评语。"
                                              }}
                                              <view
                                                class="small subtle spaced-small"
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
                                        按建议，再写一次 ↗
                                      </button>
                                    </template>
                                    <button
                                      class="text-button full-width spaced"
                                      @click="(e) => go('records')"
                                    >
                                      查看历次作品与反馈 ›
                                    </button>
                                  </template>
                                  <template v-else>
                                    <view :key="1" class="empty-state card">
                                      <view class="empty-symbol"> ◌ </view>
                                      <view class="strong">
                                        老师还没有发布反馈
                                      </view>
                                      <view class="paragraph small">
                                        老师完成批阅并发布后，你就能看到评分和订正建议。
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
                                  <view :key="11">
                                    <view class="section-heading">
                                      <view class="section-title">
                                        每一次，都是进步的足迹
                                      </view>
                                    </view>
                                    <view class="small subtle">
                                      {{ historyStudent?.name }} ·
                                      {{ myHistory.length }} 次提交
                                    </view>
                                    <template
                                      v-for="item7 in myHistory"
                                      :key="item7.id"
                                    >
                                      <view class="history-card card">
                                        <view class="card-top">
                                          <view class="strong">
                                            {{ assignmentFor(item7).title }}
                                          </view>
                                          <text
                                            :class="[
                                              'badge',
                                              statusClass(item7),
                                            ]"
                                          >
                                            {{ statusLabel(item7) }}
                                          </text>
                                        </view>
                                        <view class="small subtle">
                                          第 {{ item7.version }} 版 ·
                                          {{ date(item7.submittedAt) }} ·
                                          {{ item7.photos.length }} 页
                                        </view>
                                        <view class="history-thumbs">
                                          <template
                                            v-for="item8 in item7.photos"
                                            :key="item8.id"
                                          >
                                            <image
                                              :src="displayPhoto(item8.url)"
                                              mode="aspectFill"
                                              lazy-load
                                            />
                                          </template>
                                        </view>
                                        <template v-if="item7.published">
                                          <view
                                            :key="0"
                                            class="history-score small"
                                          >
                                            书写
                                            {{
                                              total(item7.published.handwriting)
                                            }}
                                            / 100
                                            <text> · </text>
                                            写作
                                            {{
                                              total(item7.published.composition)
                                            }}
                                            / 100
                                          </view>
                                        </template>
                                        <template v-if="item7.published">
                                          <button
                                            :key="1"
                                            class="text-button"
                                            @click="(a) => openFeedback(item7)"
                                          >
                                            查看这一版反馈 ›
                                          </button>
                                        </template>
                                        <template v-else>
                                          <view
                                            :key="2"
                                            class="small subtle spaced-small"
                                          >
                                            {{ item7.aiReview ? '老师反馈尚未发布，AI建议单独查看。' : '反馈尚未发布，本轮暂不显示评分。' }}
                                          </view>
                                        </template>
                                        <button v-if="item7.aiReview" class="text-button spaced-small ai-history-entry" :disabled="busy" @click="openAiReview(item7)">{{ item7.aiReview.result ? '查看这一版AI建议' : '查看这一版AI批阅进度' }} ›</button>
                                      </view>
                                    </template>
                                    <template v-if="myHistory.length" />
                                    <template v-else>
                                      <view :key="0" class="empty-state">
                                        还没有提交记录。写好后，来这里看看自己的进步。
                                      </view>
                                    </template>
                                  </view>
                                </template>
                                <template v-else>
                                  <template v-if="'profile' === screen">
                                    <view :key="12">
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
                                              学校／机构
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
                                              {{ myHistory.length }} 次提交 ›
                                            </button>
                                          </view>
                                          <button
                                            class="secondary spaced"
                                            @click="(e) => go('home')"
                                          >
                                            {{ "查看我的任务" }} ↗
                                          </button>
                                          <button
                                            class="secondary spaced personal-growth-profile-link"
                                            @click="(e) => go('growth')"
                                          >
                                            查看成长趋势 ↗
                                          </button>
                                          <button
                                            class="text-button full-width spaced"
                                            @click="bindingHelp"
                                          >
                                            绑定信息有误？联系学校管理员
                                          </button>
                                        </view>
                                      </template>
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
                                          老师复核并发布后，学生可查看反馈。
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
                                        <view :key="14">
                                          <view class="card form-card">
                                            <view class="field-label">
                                              作业标题
                                            </view>
                                            <input
                                              placeholder="例如：我想感谢的一个人"
                                              maxlength="50"
                                              class="form-input"
                                              v-model="newTitle"
                                            />
                                            <view class="field-label">
                                              写作要求
                                            </view>
                                            <textarea
                                              placeholder="告诉孩子写什么、怎样写，以及拍照要求"
                                              maxlength="1500"
                                              auto-height=""
                                              :cursor-spacing="100"
                                              v-model="newRequirements"
                                            />
                                            <view class="field-label">
                                              截止日期
                                            </view>
                                            <picker
                                              mode="date"
                                              :value="newDue"
                                              @change="
                                                (e) => (newDue = e.detail.value)
                                              "
                                            >
                                              <view class="date-picker">
                                                {{ newDue }}
                                                <text> 20:00 截止 › </text>
                                              </view>
                                            </picker>
                                            <view class="field-label">
                                              发布班级
                                            </view>
                                            <ClassSelector
                                              :classes="teachingClassOptions"
                                              :disabled="busy"
                                              v-model="newClassId"
                                            />
                                            <view class="small subtle">
                                              {{
                                                activeStudents(
                                                  state,
                                                  newClassId,
                                                ).length
                                              }}
                                              位学生将收到这份作业
                                            </view>
                                            <view class="dual-tags">
                                              <text> 书写 100 分 </text>
                                              <text> 写作 100 分 </text>
                                              <text> 五大思维量表 </text>
                                            </view>
                                          </view>
                                          <view class="notice">
                                            发布后，班级学生即可在任务中查看这份作业。
                                          </view>
                                          <button
                                            class="primary spaced"
                                            :disabled="busy"
                                            @click="createAssignment"
                                          >
                                            发布作业 ↗
                                          </button>
                                        </view>
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
            <template v-if="error">
              <view :key="15" class="error-message" role="alert">
                {{ error }}
              </view>
            </template>
          </view>
        </template>
        <template v-else>
          <view :key="1" class="page-body">
            <view class="empty-state card">
              <view class="strong"> 暂无任教班级 </view>
              <view class="small subtle">
                请联系学校管理员分配学校与班级。
              </view>
            </view>
          </view>
        </template>
      </template>
      <view v-if="isAdmin && !needsBinding" key="admin-navigation" class="bottom-nav admin-bottom-nav">
        <button :class="{ active: screen === 'home' }" :disabled="busy" @click="go('home')"><text class="nav-glyph">⌂</text><text>管理台</text></button>
        <button :class="{ active: screen === 'adminClasses' }" :disabled="busy" @click="go('adminClasses')"><text class="nav-glyph">▦</text><text>班级</text></button>
        <button :class="{ active: screen === 'adminTeachers' }" :disabled="busy" @click="go('adminTeachers')"><text class="nav-glyph">♧</text><text>教师</text></button>
        <button :class="{ active: screen === 'adminStudents' }" :disabled="busy" @click="go('adminStudents')"><text class="nav-glyph">♙</text><text>学生</text></button>
        <button :class="{ active: screen === 'profile' }" :disabled="busy" @click="go('profile')"><text class="nav-glyph">○</text><text>我的</text></button>
      </view>
      <template v-else-if="needsBinding" />
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
              <text class="nav-glyph"> ↗ </text>
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
          <view class="strong"> 教师修改与发布 </view>
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
            教师和学生通过学校邀请码绑定，
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
            订正记录持续保留。
          </view>
        </view>
      </view>
      <PrototypeTools
        :screen="screen"
        :role="role"
        :needs-binding="needsBinding"
        :signed-in="accountSignedIn"
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
    <template v-if="toast">
      <view :key="0" class="toast" role="status">
        {{ toast }}
      </view>
    </template>
    <template v-if="modal">
      <view :key="1" class="modal-overlay" @touchmove.stop.prevent="() => {}">
        <view class="modal-card">
          <view class="section-title">
            {{ modal.title }}
          </view>
          <view class="paragraph">
            {{ modal.body }}
          </view>
          <view class="modal-actions">
            <button class="secondary" @click="(e) => (modal = null)">
              取消
            </button>
            <button class="primary" @click="confirmModal">
              {{ modal.confirm }}
            </button>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>
