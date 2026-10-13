<script setup lang="ts">
import ReviewEditor from '../../components/ReviewEditor.vue';
import PrototypeTools from '../../components/PrototypeTools.vue';
import ClassSelector from '../../components/ClassSelector.vue';
import ClassStatistics from '../../components/ClassStatistics.vue';
import StudentRanking from '../../components/StudentRanking.vue';
import StudentGrowth from '../../components/StudentGrowth.vue';
import { usePrototype } from '../../composables/usePrototype';
const {state,role,screen,category,review,panel,photoIndex,openDimension,filter,busy,error,toast,photos,note,failSubmit,failAnalysis,newTitle,newRequirements,newDue,newClassId,modal,roles,startupError,selectedAssignment,selectedSubmission,mine,isTeacher,identity,myHistory,feedback,canSubmit,title,studentsInAssignment,rubric,total,latest,expired,assignmentFor,studentFor,statusLabel,statusClass,date,go,switchRole,openAssignment,openReview,openFeedback,openSubmit,editScore,saveDraft,publish,confirmModal,addSamples,movePhoto,choosePhotos,submit,retry,manual,createAssignment,reset,assignmentAction,currentClass,classStudents,scopedAssignments,visibleAssignments,ongoingAssignments,closedAssignments,workCounts,assignmentPeriod,switchClass,counts,taskStatuses,isRoot,activeTab,back,boundStudent,now,statisticsPanel,historyStudent,analyticsSearch,rankingCategory,analyticsStudentId,openStudentAnalytics} = usePrototype();
</script>

<template>
  <view class="stage">
    <view class="desktop-intro">
      <view class="intro-brand"><view class="brand-mark">星</view><view><view class="brand-name">写字星</view><view class="eyebrow">WRITINGSTAR</view></view></view>
      <view class="intro-body"><view class="intro-kicker">把每一次书写<br />变成成长的起点</view><view class="intro-copy">写好字，也写好故事。<br />让老师的每一句建议，<br />陪伴下一次进步。</view><image class="intro-art" src="/static/growth.svg" mode="aspectFit" /></view>
      <view class="intro-foot"><text class="tiny-dot" />原型展示 · v0.4</view>
    </view>
    <!-- #ifdef H5 -->
    <view class="mobile-preview-tools"><PrototypeTools :screen="screen" :busy="busy" v-model:fail-submit="failSubmit" v-model:fail-analysis="failAnalysis" @samples="addSamples" @reset="reset" /></view>
    <!-- #endif -->
    <view class="app-shell">
      <view class="app-header">
        <view class="top-row"><view class="mobile-brand"><view class="brand-mark small">星</view><view><view class="brand-name">写字星</view><view class="subtle tiny">写字 · 写作 · 一起成长</view></view></view><view class="header-avatar">{{ isTeacher ? '陈' : '禾' }}</view></view>
        <view class="role-row"><text class="tiny subtle">当前身份</text><view class="role-picker"><button v-for="r in roles" :key="r.id" :class="['role-button',{active:role===r.id}]" :disabled="busy" @click="switchRole(r.id)">{{ r.label }}</button></view></view>
      </view>
      <view v-if="startupError" class="fatal card"><view class="section-title">数据暂不可用</view><view class="paragraph">{{ startupError }}</view></view>
      <view v-else class="page-body">
        <view v-if="screen!=='home'" :class="['page-heading', {'root-heading':isRoot}]"><button v-if="!isRoot" class="back-button" :disabled="busy" @click="back">‹ 返回</button><text class="page-title">{{ title }}</text><view v-if="!isRoot" class="heading-spacer" /></view>

        <view v-if="screen==='home'" class="home-view">
          <view class="greeting-row"><view><view class="eyebrow">双写课堂{{ isTeacher ? ' / 教师工作台' : ' / ' + currentClass.name }}</view><view class="greeting">{{ identity }}，{{ isTeacher ? '你好' : '今天也加油' }}<text class="greeting-dot">。</text></view></view></view>
          <template v-if="isTeacher">
            <ClassSelector :classes="state.classes" :model-value="currentClass.id" :disabled="busy" @update:model-value="switchClass" />
            <view class="work-overview">
              <view class="overview-caption"><text>进行中作业 · {{ ongoingAssignments.length }} 项</text><text>{{ classStudents.length }} 位学生</text></view>
              <view class="stats">
                <view class="stat"><view class="stat-number">{{ workCounts.missing }}<text class="stat-unit">份</text></view><view class="stat-label"><text class="tiny-dot grey-dot" />未提交</view></view>
                <view class="stat"><view class="stat-number">{{ workCounts.pending }}<text class="stat-unit">份</text></view><view class="stat-label"><text class="tiny-dot amber-dot" />待批阅</view></view>
                <view class="stat"><view class="stat-number">{{ workCounts.completed }}<text class="stat-unit">份</text></view><view class="stat-label"><text class="tiny-dot" />已完成</view></view>
              </view>
              <view class="tiny subtle">每名学生的每项作业计 1 份，按最新提交状态统计。</view>
            </view>
            <view class="section-heading"><view class="section-title">班级作业</view><button class="text-button" @click="go('create')">＋ 布置作业</button></view>
            <view class="assignment-periods">
              <button :class="{active:assignmentPeriod==='ongoing'}" @click="assignmentPeriod='ongoing'">进行中的作业 <text>{{ ongoingAssignments.length }}</text></button>
              <button :class="{active:assignmentPeriod==='closed'}" @click="assignmentPeriod='closed'">已截止的作业 <text>{{ closedAssignments.length }}</text></button>
            </view>
          </template>
          <template v-else>
            <view class="hero"><view class="hero-label">每一笔，都是新的可能</view><view class="hero-title">把生活写成<br /><text>自己的故事</text></view><view class="hero-sub">认真写下小事，也认真写下感受。</view><image class="hero-art" src="/static/growth.svg" mode="aspectFit" /></view>
            <view class="student-tip"><view class="tip-symbol">✦</view><view><view class="strong">{{ role==='parent' ? '陪孩子，把下一步做好' : '先读要求，再动笔' }}</view><view class="small subtle">同一份作文，收获书写和写作两份建议。</view></view></view>
            <view class="section-heading"><view class="section-title">我的双写任务<text class="count-label">{{ visibleAssignments.length }}</text></view></view>
          </template>
          <view v-for="a in visibleAssignments" :key="a.id" class="assignment-card card">
            <view class="card-top"><view class="task-type"><text class="task-icon">文</text><text>作文双评</text></view><text v-if="expired(a)" class="badge neutral">已截止</text><text v-else-if="!isTeacher" :class="['badge',statusClass(latest(a.id,'student-1'))]">{{ statusLabel(latest(a.id,'student-1')) }}</text><text v-else class="badge green">进行中</text></view>
            <view class="assignment-title">{{ a.title }}</view><view class="small subtle">{{ date(a.dueAt) }} 截止</view>
            <view v-if="isTeacher" class="task-counts"><text>未提交 <text class="strong">{{ counts(a).missing }}</text></text><text>待批阅 <text class="strong">{{ counts(a).pending }}</text></text><text>已完成 <text class="strong">{{ counts(a).completed }}</text></text></view>
            <view v-else class="dual-tags"><text>书写 / 100 分</text><text>写作 / 100 分</text></view>
            <view class="card-bottom"><view class="small subtle">{{ isTeacher ? counts(a).total + ' 位学生' : '陈老师布置 · ' + a.className }}</view><button class="compact-button" @click="isTeacher ? openAssignment(a) : assignmentAction(a)">{{ !isTeacher && latest(a.id,'student-1')?.status==='published' ? '查看反馈' : isTeacher ? counts(a).pending ? '查看与批阅' : '查看作业' : '查看任务' }} <text>↗</text></button></view>
          </view>
          <view v-if="!visibleAssignments.length" class="empty-state card">{{ isTeacher ? assignmentPeriod==='ongoing' ? '本班暂时没有进行中的作业。' : '本班暂无已截止的作业。' : '老师还没有布置作业。' }}</view>
          <view class="home-footer">写字有章法 · 写作有温度</view>
        </view>

        <view v-else-if="screen==='statistics' && isTeacher" class="statistics-view">
          <ClassSelector :classes="state.classes" :model-value="currentClass.id" :disabled="busy" @update:model-value="switchClass" />
          <ClassStatistics :state="state" :class-id="currentClass.id" :now="now" v-model:panel="statisticsPanel" @assignment="openAssignment" @students="go('statisticsStudents')" />
        </view>

        <view v-else-if="screen==='statisticsStudents' && isTeacher" class="statistics-students-view">
          <StudentRanking :state="state" :class-id="currentClass.id" v-model:category="rankingCategory" v-model:query="analyticsSearch" @student="openStudentAnalytics" />
        </view>
        <view v-else-if="screen==='statisticsStudent' && isTeacher" class="statistics-student-view">
          <StudentGrowth :state="state" :class-id="currentClass.id" :student-id="analyticsStudentId" :category="rankingCategory" />
        </view>

        <view v-else-if="screen==='assignment'">
          <view class="card task-detail"><view class="eyebrow">作文双评 · {{ selectedAssignment.className }}</view><view class="detail-title">{{ selectedAssignment.title }}</view><view class="small subtle">{{ date(selectedAssignment.dueAt) }} 截止</view><view class="divider" /><view class="strong">这次写什么</view><view class="paragraph">{{ selectedAssignment.requirements }}</view><view class="dual-tags"><text>书写 100 分</text><text>写作 100 分</text><text>完整五维评价</text></view></view>
          <template v-if="isTeacher">
            <view class="section-heading"><view class="section-title">提交名单</view><text class="small subtle">{{ counts(selectedAssignment).total }} 位学生</text></view><view class="filter-row"><button v-for="f in ['全部', ...taskStatuses]" :key="f" :class="['filter-button',{active:filter===f}]" @click="filter=f">{{ f }}</button></view>
            <view v-for="st in studentsInAssignment" :key="st.id" class="student-row card"><view class="avatar pale">{{ st.initial }}</view><view class="grow"><view class="strong">{{ st.name }}</view><view class="small subtle">{{ st.submission ? '第 ' + st.submission.version + ' 版 · ' + st.submission.photos.length + ' 页' + (st.submission.version>1 ? ' · 订正' : '') : '还没有提交作品' }}<view v-if="st.submission?.status==='processing' || st.submission?.status==='failed'" class="small subtle">{{ st.submission.status==='processing' ? '作品处理中' : '处理失败，可人工批阅' }}</view></view></view><view class="row-actions"><text :class="['badge',statusClass(st.submission)]">{{ statusLabel(st.submission) }}</text><button v-if="st.submission" class="text-button" @click="st.submission.status==='published' ? openFeedback(st.submission) : openReview(st.submission)">{{ st.submission.status==='published' ? '查看反馈' : '进入批阅' }} ›</button></view></view>
            <view v-if="!studentsInAssignment.length" class="empty-state">这个状态下还没有作品。</view>
          </template>
          <template v-else>
            <view class="section-heading"><view class="section-title">我的提交</view><text class="small subtle">{{ role==='parent' ? '关联孩子：小禾' : '小禾' }}</text></view>
            <view v-if="mine" class="card"><view class="card-top"><view class="strong">第 {{ mine.version }} 版 · {{ mine.photos.length }} 页</view><text :class="['badge',statusClass(mine)]">{{ statusLabel(mine) }}</text></view><view class="small subtle">{{ date(mine.submittedAt) }} · {{ mine.actor==='parent' ? '家长代交' : '学生提交' }}</view><view class="paragraph small">{{ mine.status==='published' ? '老师已发布反馈，读完建议后可以提交订正。' : mine.status==='failed' ? '处理失败，作品已保留。请重试，或联系老师进行人工批阅。' : mine.status==='processing' ? '作品已接收，正在处理。你可以稍后回来查看。' : '作品已提交，等待老师复核。老师发布后，你才能看到评分和建议。' }}</view><button v-if="mine.status==='published'" class="primary" @click="openFeedback(mine)">阅读老师的反馈</button><button v-else-if="mine.status==='failed' || mine.status==='processing'" class="secondary" :disabled="busy" @click="retry(mine)">{{ mine.status==='failed' ? '重新处理' : '刷新处理状态' }}</button></view>
            <view v-else class="empty-state card"><view class="empty-symbol">✎</view><view class="strong">等你写下自己的故事</view><view class="small subtle">作品还没有提交，先读要求，再检查照片。</view></view>
            <button v-if="canSubmit" class="primary spaced" @click="openSubmit(selectedAssignment)">{{ mine ? '按建议提交订正' : '选择照片并提交' }}</button><view v-else-if="expired(selectedAssignment)" class="notice">作业已经截止，暂不能提交或订正。</view>
            <button class="text-button full-width spaced" @click="go('records')">查看历次作品与反馈 ›</button>
          </template>
        </view>

        <view v-else-if="screen==='review' && selectedSubmission">
          <view class="review-top"><view class="avatar pale">{{ studentFor(selectedSubmission).initial }}</view><view class="grow"><view class="strong">{{ studentFor(selectedSubmission).name }}的作品</view><view class="small subtle">第 {{ selectedSubmission.version }} 版 · {{ selectedSubmission.photos.length }} 页</view></view><text :class="['badge',statusClass(selectedSubmission)]">{{ statusLabel(selectedSubmission) }}</text></view>
          <view v-if="selectedSubmission.status==='processing' || selectedSubmission.status==='failed'" class="card"><view class="empty-state"><view class="empty-symbol">{{ selectedSubmission.status==='failed' ? '!' : '◌' }}</view><view class="strong">{{ selectedSubmission.status==='failed' ? '作品处理失败' : '作品正在处理' }}</view><view class="paragraph small">作品已保留。可以重新处理，或直接进行人工批阅。</view><button class="primary" :disabled="busy" @click="retry(selectedSubmission)">重新处理</button><button class="secondary spaced" :disabled="busy" @click="manual(selectedSubmission)">转入人工批阅</button></view></view>
          <template v-else>
            <view class="segmented"><button :class="{active:panel==='evaluation'}" @click="panel='evaluation'">双写评价</button><button :class="{active:panel==='photos'}" @click="panel='photos'">查看原作品</button></view>
            <view v-if="panel==='photos'" class="card photo-reader"><view class="small subtle">第 {{ photoIndex+1 }} 页 · {{ assignmentFor(selectedSubmission).title }}</view><image class="essay-image" :src="selectedSubmission.photos[photoIndex].url" mode="widthFix" /><view class="photo-pagination"><button class="secondary" :disabled="photoIndex===0" @click="photoIndex--">上一页</button><text>{{ photoIndex+1 }} / {{ selectedSubmission.photos.length }}</text><button class="secondary" :disabled="photoIndex===selectedSubmission.photos.length-1" @click="photoIndex++">下一页</button></view><view v-if="selectedSubmission.note" class="paragraph small">提交说明：{{ selectedSubmission.note }}</view></view>
            <template v-else><view class="notice">{{ total(review.handwriting)===null || total(review.composition)===null ? '评分待填写，请查看原作品后完成批阅。' : '请结合原作品复核评分和评语，确认后发布给学生与家长。' }}</view><ReviewEditor :review="review" :category="category" :open-dimension="openDimension" :readonly="selectedSubmission.status==='published'" @category="category=$event;openDimension=null" @dimension="openDimension=$event" @score="editScore" /></template>
            <view v-if="selectedSubmission.status==='pending'" class="action-bar"><button class="secondary" :disabled="busy" @click="saveDraft">{{ busy ? '保存中…' : '保存草稿' }}</button><button class="primary" :disabled="busy" @click="publish">发布反馈 ↗</button></view>
          </template>
        </view>

        <view v-else-if="screen==='submit'">
          <view class="submit-intro"><view class="eyebrow">{{ selectedAssignment.title }}</view><view class="detail-title">{{ mine ? '下一次，写得更好' : '让老师看见你的作品' }}</view><view class="paragraph small subtle">整页拍清楚，按阅读顺序排列。提交前检查是否有缺页或模糊的照片。</view></view>
          <view class="upload-area"><view class="upload-icon">＋</view><view class="strong">添加作品照片</view><view class="small subtle">JPG / PNG / WebP · 最多 6 页</view><button class="primary" :disabled="busy" @click="choosePhotos">选择作品照片</button></view>
          <view v-if="photos.length" class="section-heading"><view class="section-title">检查页序</view><text class="small subtle">{{ photos.length }} 页</text></view><view v-for="(p,i) in photos" :key="p.id" class="upload-row card"><image :src="p.url" mode="aspectFill" class="photo-thumb" /><view class="grow"><view class="strong">第 {{ i+1 }} 页</view><view class="small subtle filename">{{ p.sample ? p.name.replace('作文排版示例', '作文') : p.name }}</view><view class="photo-controls"><button :disabled="i===0 || busy" @click="movePhoto(i,-1)">上移</button><button :disabled="i===photos.length-1 || busy" @click="movePhoto(i,1)">下移</button><button :disabled="busy" class="delete-link" @click="photos.splice(i,1)">移除</button></view></view></view>
          <view class="card form-card"><view class="section-title">给老师的话 <text class="small subtle">选填</text></view><textarea v-model="note" placeholder="有什么想请老师特别看一看？" auto-height maxlength="400" /></view>
          <view class="evidence-note">每张照片不超过 800 KB，最多提交 6 页。</view><button class="primary spaced" :disabled="busy || !photos.length" @click="submit">{{ busy ? '提交中…' : `确认页序并提交${mine ? '订正' : '作品'}` }}</button>
        </view>

        <view v-else-if="screen==='feedback' && selectedSubmission">
          <template v-if="feedback">
            <view class="feedback-intro"><view class="eyebrow">第 {{ selectedSubmission.version }} 版 · 老师已发布</view><view class="detail-title">你的努力，被看见了</view><view class="small subtle">{{ assignmentFor(selectedSubmission).title }}</view></view>
            <view class="dual-scores"><view class="score-tile"><view class="small">书写评价</view><view class="score-value">{{ total(feedback.handwriting) }}<text>/ 100</text></view><view class="small subtle">把每一个字写清楚</view></view><view class="score-tile warm"><view class="small">写作评价</view><view class="score-value">{{ total(feedback.composition) }}<text>/ 100</text></view><view class="small subtle">把自己的感受写具体</view></view></view>
            <view class="teacher-note card"><view class="teacher-note-header"><view class="avatar tiny-avatar">陈</view><view class="strong">陈老师想对你说</view><text class="small subtle">已发布</text></view><view class="paragraph">{{ feedback.composition.summary }}</view></view>
            <view class="next-steps card"><view class="eyebrow">下一步 / 小小的进步</view><view class="section-title">先做好这两件事</view><view class="paragraph preserve-lines">{{ feedback.nextSteps }}</view></view>
            <view class="section-heading"><view class="section-title">完整五维评价</view><text class="small subtle">书写与写作分别查看</text></view><view class="category-switch"><button :class="{active:category==='handwriting'}" @click="category='handwriting';openDimension=null">书写</button><button :class="{active:category==='composition'}" @click="category='composition';openDimension=null">写作</button></view>
            <view class="card"><view class="paragraph">{{ feedback[category].summary }}</view><view v-for="d in rubric[category]" :key="d.id" class="feedback-dimension"><button class="feedback-dimension-head" @click="openDimension=openDimension===d.id ? null : d.id"><text>{{ d.name }}</text><text class="grow" /><text class="strong">{{ feedback[category].scores[d.id] }}<text class="subtle"> / {{ d.max }}</text></text><text class="subtle">{{ openDimension===d.id ? '−' : '＋' }}</text></button><view v-if="openDimension===d.id" class="paragraph small">{{ feedback[category].comments[d.id] || '本维度暂无单独评语。' }}<view class="small subtle spaced-small">评价规则：{{ d.description }}</view></view></view></view>
            <button v-if="!isTeacher && canSubmit" class="primary spaced" @click="openSubmit(selectedAssignment)">按建议，再写一次 ↗</button><button class="text-button full-width spaced" @click="go('records')">查看历次作品与反馈 ›</button>
          </template><view v-else class="empty-state card"><view class="empty-symbol">◌</view><view class="strong">老师还没有发布反馈</view><view class="paragraph small">老师完成批阅并发布后，你就能看到评分和订正建议。</view><button class="secondary" @click="go('assignment')">返回作业详情</button></view>
        </view>

        <view v-else-if="screen==='records'">
          <view class="section-heading"><view class="section-title">每一次，都是进步的足迹</view></view><view class="small subtle">{{ historyStudent.name }} · {{ myHistory.length }} 次提交</view><view v-for="s in myHistory" :key="s.id" class="history-card card"><view class="card-top"><view class="strong">{{ assignmentFor(s).title }}</view><text :class="['badge',statusClass(s)]">{{ statusLabel(s) }}</text></view><view class="small subtle">第 {{ s.version }} 版 · {{ date(s.submittedAt) }} · {{ s.photos.length }} 页</view><view class="history-thumbs"><image v-for="p in s.photos" :key="p.id" :src="p.url" mode="aspectFill" /></view><view v-if="s.published" class="history-score small">书写 {{ total(s.published.handwriting) }} / 100 <text>·</text> 写作 {{ total(s.published.composition) }} / 100</view><button v-if="s.published" class="text-button" @click="openFeedback(s)">查看这一版反馈 ›</button><view v-else class="small subtle spaced-small">反馈尚未发布，本轮暂不显示评分。</view></view><view v-if="!myHistory.length" class="empty-state">还没有提交记录。写好后，来这里看看自己的进步。</view>
        </view>


        <view v-else-if="screen==='profile'">
          <view class="card profile-card"><view class="avatar">{{ isTeacher ? '陈' : '禾' }}</view><view class="detail-title">{{ identity }}</view><view class="small subtle">{{ isTeacher ? '语文教师 · 任教 ' + state.classes.length + ' 个班级' : (role==='parent' ? '关联孩子：小禾' : '学生') + ' · ' + boundStudent.className }}</view></view>
          <view v-if="isTeacher" class="card profile-information">
            <view class="section-title">任教班级</view>
            <view v-for="c in state.classes" :key="c.id" class="profile-information-row"><text>{{ c.name }}</text><text class="subtle">{{ state.students.filter(st => st.classId===c.id).length }} 位学生</text></view>
            <view class="profile-information-row"><text class="subtle">已布置作业</text><text>{{ state.assignments.length }} 项</text></view>
          </view>
          <view v-else class="card profile-information"><view class="section-title">学习档案</view><view class="profile-information-row"><text class="subtle">班级</text><text>{{ boundStudent.className }}</text></view><view class="profile-information-row"><text class="subtle">学生</text><text>{{ boundStudent.name }}</text></view><view class="profile-information-row"><text class="subtle">作品记录</text><button class="text-button" @click="go('records')">{{ myHistory.length }} 次提交 ›</button></view></view>
          <view class="card"><view class="section-title">双写评价</view><view class="paragraph small">同一份作品，分别获得书写和写作两份反馈。每类按五个维度评价，各计 100 分。</view><view class="dual-tags"><text>书写 / 100 分</text><text>写作 / 100 分</text></view><view class="small subtle spaced-small">老师复核并发布后，学生和家长可查看反馈。</view></view>
        </view>

        <view v-else-if="screen==='create'">
          <view class="card form-card"><view class="field-label">作业标题</view><input v-model="newTitle" placeholder="例如：我想感谢的一个人" maxlength="50" class="form-input" /><view class="field-label">写作要求</view><textarea v-model="newRequirements" placeholder="告诉孩子写什么、怎样写，以及拍照要求" maxlength="1500" auto-height /><view class="field-label">截止日期</view><picker mode="date" :value="newDue" @change="newDue=$event.detail.value"><view class="date-picker">{{ newDue }} <text>20:00 截止 ›</text></view></picker><view class="field-label">发布班级</view><ClassSelector :classes="state.classes" v-model="newClassId" :disabled="busy" /><view class="small subtle">{{ state.students.filter(st => st.classId===newClassId).length }} 位学生将收到这份作业</view><view class="dual-tags"><text>书写 100 分</text><text>写作 100 分</text><text>五大思维量表</text></view></view><view class="notice">发布后，班级学生与家长即可在任务中查看这份作业。</view><button class="primary spaced" :disabled="busy" @click="createAssignment">发布作业 ↗</button>
        </view>
        <view v-if="error" class="error-message" role="alert">{{ error }}</view>
      </view>
      <view class="bottom-nav"><button :class="{active:activeTab==='home'}" :disabled="busy" @click="go('home')"><text class="nav-glyph">⌂</text><text>{{ isTeacher ? '工作台' : '任务' }}</text></button><button :class="{active:activeTab==='statistics' || activeTab==='records'}" :disabled="busy" @click="go(isTeacher ? 'statistics' : 'records')"><text class="nav-glyph">▤</text><text>{{ isTeacher ? '学情' : '记录' }}</text></button><button :class="{active:activeTab==='profile'}" :disabled="busy" @click="go('profile')"><text class="nav-glyph">○</text><text>我的</text></button></view>
    </view>
    <view class="desktop-guide"><view class="eyebrow">体验路径</view><view class="guide-title">一份作文<br />两份成长建议</view><view class="guide-step"><text>01</text><view><view class="strong">教师修改与发布</view><view class="small subtle">选择班级和进行中的作业，<br />进入名单完成批阅。</view></view></view><view class="guide-step"><text>02</text><view><view class="strong">切换家长或学生</view><view class="small subtle">查看老师刚发布的建议，<br />按建议提交订正。</view></view></view><view class="guide-step"><text>03</text><view><view class="strong">查看学情与记录</view><view class="small subtle">按班级查看学生与作业统计，<br />订正记录持续保留。</view></view></view><!-- #ifdef H5 --><PrototypeTools :screen="screen" :busy="busy" v-model:fail-submit="failSubmit" v-model:fail-analysis="failAnalysis" @samples="addSamples" @reset="reset" /><!-- #endif --></view>
    <view v-if="toast" class="toast" role="status">{{ toast }}</view>
    <view v-if="modal" class="modal-overlay"><view class="modal-card"><view class="section-title">{{ modal.title }}</view><view class="paragraph">{{ modal.body }}</view><view class="modal-actions"><button class="secondary" @click="modal=null">取消</button><button class="primary" @click="confirmModal">{{ modal.confirm }}</button></view></view></view>
  </view>
</template>

