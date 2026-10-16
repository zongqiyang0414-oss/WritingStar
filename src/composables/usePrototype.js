import { pickPhotos } from "../platform/photos.js";
import {
  DEFAULT_TEACHER,
  getBoundStudent,
  getBoundTeacher,
  getTeacherClasses,
  organizationForClass,
} from "../services/identity.js";
import { STORAGE_KEY, createPrototypeService } from "../services/index.js";
import {
  activeStudents,
  assignmentCounts,
  classAssignments,
  formerAssignmentStudents,
  latestSubmission,
  taskStatus,
  taskStatuses,
} from "../services/school.js";
import { clone } from "../services/mock.js";
import { computed, onUnmounted, ref } from "vue";
import { createSeed, samplePhotos } from "../services/seed.js";
import {
  emptyReview,
  rubric,
  total,
  validateReview,
} from "../services/rubric.js";
import { onHide, onShow } from "@dcloudio/uni-app";
import { presentReview } from "../services/presentation.js";
import { studentSummary } from "../services/analytics.js";
import { getBoundAdministrator } from "../services/administration.js";
import { AI_LABELS, aiAssignmentRows, aiAssignmentSummary } from "../services/aiReview.js";

export function usePrototype() {
  let service = null;
  const startupError = ref("");
  try {
    service = createPrototypeService();
  } catch (ra) {
    startupError.value = ra.message;
  }
  const state = ref(service?.read() || createSeed()),
    role = ref("teacher"),
    adminDirty = ref(false),
    screen = ref("home"),
    selectedClassId = ref("class-1"),
    newClassId = ref("class-1"),
    rosterClassId = ref("class-1"),
    memberSearch = ref(""),
    organizationId = ref("organization-1"),
    rosterClass = computed(() =>
      teachingClassOptions.value.find((e) => e.id === rosterClassId.value),
    ),
    statisticsPanel = ref("students"),
    analyticsSearch = ref(""),
    rankingCategory = ref("handwriting"),
    analyticsStudentId = ref(""),
    assignmentPeriod = ref("ongoing"),
    detailReturn = ref("home"),
    feedbackReturn = ref("assignment"),
    aiReviewReturn = ref("assignment"),
    reviewReturn = ref("assignment"),
    now = ref(Date.now());
  let clockTimer, aiTimer;
  onShow(() => {
    now.value = Date.now();
    try {
      refresh();
    } catch (ra) {
      error.value = ra.message;
    }
    clockTimer ||
      (clockTimer = setInterval(() => {
        now.value = Date.now();
      }, 6e4));
    advanceAiQueue();
    aiTimer || (aiTimer = setInterval(advanceAiQueue, 600));
  });
  onHide(() => {
    clearInterval(clockTimer);
    clockTimer = undefined;
    clearInterval(aiTimer);
    aiTimer = undefined;
  });
  const assignmentId = ref("assignment-1"),
    submissionId = ref("submission-1"),
    category = ref("handwriting"),
    review = ref(emptyReview()),
    reviewBaseline = ref(""),
    panel = ref("evaluation"),
    photoIndex = ref(0),
    openDimension = ref(null),
    filter = ref("全部"),
    busy = ref(false),
    error = ref(""),
    toast = ref("");
  let toastTimer;
  const photos = ref([]),
    note = ref(""),
    failSubmit = ref(false),
    failAnalysis = ref(false),
    newTitle = ref(""),
    newRequirements = ref(""),
    dueDate = new Date(Date.now() + 6048e5),
    newDue = ref(
      `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`,
    ),
    modal = ref(null),
    inviteCode = ref(""),
    bindingCandidate = ref(null),
    boundStudent = computed(() => getBoundStudent(state.value, role.value)),
    teacherIdentity = computed(() => getBoundTeacher(state.value)),
    adminIdentity = computed(() => getBoundAdministrator(state.value)),
    isAdmin = computed(() => role.value === "admin"),
    accountSignedIn = computed(() =>
      isAdmin.value
        ? !!state.value.adminAccount?.signedIn
        : "teacher" === role.value
        ? state.value.teacherAccount.signedIn
        : state.value.accounts[role.value].signedIn,
    ),
    growthSummary = computed(() =>
      role.value !== "student"
        ? null
        : (function (e, a) {
            const t = getBoundStudent(e, a);
            return t ? studentSummary(e, t.classId, t.id) : null;
          })(state.value, role.value),
    ),
    needsBinding = computed(() =>
      isAdmin.value ? !adminIdentity.value : isTeacher.value ? !teacherIdentity.value : !boundStudent.value,
    ),
    organizationOptions = computed(() =>
      isAdmin.value
        ? state.value.organizations.filter((item) => adminIdentity.value?.organizationIds.includes(item.id))
        : isTeacher.value
        ? (function (e) {
            const a = getBoundTeacher(e);
            return e.organizations.filter((e) =>
              a?.organizationIds.includes(e.id),
            );
          })(state.value)
        : state.value.organizations.filter((e) => {
            var a, s;
            return (
              e.id ===
              organizationForClass(
                state.value,
                boundStudent.value?.classId || "",
              )?.id
            );
          }),
    ),
    currentOrganization = computed(
      () =>
        ((isTeacher.value || isAdmin.value) &&
          organizationOptions.value.find(
            (e) => e.id === organizationId.value,
          )) ||
        organizationOptions.value[0],
    ),
    teachingClassOptions = computed(() => {
      var e;
      return getTeacherClasses(
        state.value,
        currentOrganization.value?.id || "",
      );
    }),
    currentClass = computed(
      () =>
        (isTeacher.value
          ? teachingClassOptions.value.find(
              (e) => e.id === selectedClassId.value,
            ) || teachingClassOptions.value[0]
          : state.value.classes.find((e) => {
              var a;
              return e.id === boundStudent.value?.classId;
            })) || {
          id: "",
          name: isTeacher.value ? "暂无任教班级" : "尚未绑定班级",
          organizationId: "",
        },
    ),
    organizationAssignmentCount = computed(
      () =>
        state.value.assignments.filter((e) =>
          teachingClassOptions.value.some((a) => a.id === e.classId),
        ).length,
    ),
    scopedAssignments = computed(() =>
      classAssignments(state.value, currentClass.value.id),
    ),
    classStudents = computed(() =>
      activeStudents(state.value, currentClass.value.id),
    ),
    ongoingAssignments = computed(() =>
      scopedAssignments.value.filter((e) => !expired(e)),
    ),
    closedAssignments = computed(() =>
      scopedAssignments.value.filter((e) => expired(e)),
    ),
    visibleAssignments = computed(() =>
      isTeacher.value
        ? "ongoing" === assignmentPeriod.value
          ? ongoingAssignments.value
          : closedAssignments.value
        : [...ongoingAssignments.value, ...closedAssignments.value],
    ),
    workCounts = computed(() =>
      (function (e, a, t = Date.now()) {
        return classAssignments(e, a)
          .filter((e) => Date.parse(e.dueAt) > t)
          .reduce(
            (a, t) => {
              const s = assignmentCounts(e, t);
              return {
                missing: a.missing + s.missing,
                pending: a.pending + s.pending,
                completed: a.completed + s.completed,
                total: a.total + s.total,
              };
            },
            {
              missing: 0,
              pending: 0,
              completed: 0,
              total: 0,
            },
          );
      })(state.value, currentClass.value.id, now.value),
    ),
    selectedAssignment = computed(
      () =>
        (["feedback", "aiReview"].includes(screen.value) && role.value === "student" &&
          selectedSubmission.value?.studentId === boundStudent.value?.id &&
          state.value.assignments.find((item) => item.id === selectedSubmission.value.assignmentId)) ||
        scopedAssignments.value.find((e) => e.id === assignmentId.value) ||
        scopedAssignments.value[0],
    ),
    selectedSubmission = computed(() =>
      state.value.submissions.find((e) => e.id === submissionId.value),
    ),
    aiTask = computed(() => {
      if (!service || !selectedSubmission.value || role.value === "admin") return null;
      try { return service.aiResult(selectedSubmission.value.id, role.value); }
      catch { return null; }
    }),
    aiRows = computed(() => isTeacher.value ? aiAssignmentRows(state.value, selectedAssignment.value?.id || "") : []),
    aiSummary = computed(() => aiAssignmentSummary(aiRows.value)),
    mine = computed(() => {
      var e;
      return boundStudent.value
        ? latest(selectedAssignment.value?.id || "", boundStudent.value.id)
        : null;
    }),
    isTeacher = computed(() => "teacher" === role.value),
    identity = computed(() => {
      var e;
      return isAdmin.value
        ? adminIdentity.value?.name || "管理员"
        : isTeacher.value
        ? teacherIdentity.value?.name || "老师"
        : boundStudent.value
          ? boundStudent.value.name + "同学"
          : "同学";
    }),
    historyStudent = computed(() =>
      isTeacher.value && selectedSubmission.value
        ? studentFor(selectedSubmission.value)
        : boundStudent.value,
    ),
    myHistory = computed(() =>
      state.value.submissions
        .filter((e) => {
          var a;
          return e.studentId === historyStudent.value?.id;
        })
        .sort((e, a) => a.submittedAt.localeCompare(e.submittedAt)),
    ),
    feedback = computed(() => {
      var e, a;
      return selectedSubmission.value?.published &&
        (isTeacher.value ||
          selectedSubmission.value.studentId === boundStudent.value?.id)
        ? presentReview(selectedSubmission.value.published)
        : null;
    }),
    dirty = computed(() => {
      var e;
      return (
        adminDirty.value || ("review" === screen.value &&
        "pending" === selectedSubmission.value?.status &&
        JSON.stringify(review.value) !== reviewBaseline.value)
      );
    }),
    canSubmit = computed(
      () =>
        !(
          !boundStudent.value ||
          boundStudent.value.archived ||
          !selectedAssignment.value ||
          (mine.value && "published" !== mine.value.status) ||
          expired(selectedAssignment.value)
        ),
    ),
    title = computed(
      () =>
        ({
          home: isAdmin.value ? "管理工作台" : isTeacher.value ? "工作台" : "我的任务",
          adminClasses: "班级管理",
          adminStudents: "学生管理",
          statistics: "学情",
          statisticsStudents: "全班学生学情",
          statisticsStudent: "学生成长",
          assignment: "作业详情",
          review: "双写批阅",
          aiReview: "AI双写批阅",
          aiBatch: "全班AI批阅",
          submit: mine.value ? "提交订正" : "提交作品",
          feedback: "老师的反馈",
          records: "作品记录",
          profile: "我的",
          create: "布置双写作业",
          classes: "任教班级",
          classMembers: "班级成员",
          growth: "我的成长",
        })[screen.value],
    ),
    rosterScreens = ["classes", "classMembers"],
    rootScreens = ["home", "statistics", "profile", "records", "growth"],
    isRoot = computed(
      () =>
        rootScreens.includes(screen.value) &&
        ("records" !== screen.value || !isTeacher.value),
    ),
    activeTab = computed(() =>
      "growth" === screen.value
        ? "growth"
        : screen.value.startsWith("statistics")
          ? "statistics"
          : "profile" === screen.value || rosterScreens.includes(screen.value)
            ? "profile"
            : "records" !== screen.value || isTeacher.value
              ? "home"
              : "records",
    ),
    formerStudentsInAssignment = computed(() =>
      formerAssignmentStudents(state.value, selectedAssignment.value?.id || "")
        .filter((student) => filter.value === "全部" || taskStatus(student.submission) === filter.value),
    ),
    studentsInAssignment = computed(() => {
      var e;
      return activeStudents(
        state.value,
        selectedAssignment.value?.classId || "",
      )
        .map((e) => ({
          ...e,
          submission: latest(assignmentId.value, e.id),
        }))
        .filter(
          (e) =>
            "全部" === filter.value ||
            taskStatus(e.submission) === filter.value,
        );
    });
  function latest(e, a) {
    return latestSubmission(state.value, e, a);
  }
  function expired(e) {
    return !!e && Date.parse(e.dueAt) <= now.value;
  }
  function studentFor(e) {
    return state.value.students.find((a) => a.id === e.studentId);
  }
  function refresh() {
    service && (state.value = service.read());
  }
  function advanceAiQueue() {
    try { if (service?.advanceAiReviews()) refresh(); }
    catch (failure) { error.value = failure.message; }
  }
  function notify(e) {
    toast.value = e;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = "";
    }, 3200);
  }
  function navigate(e) {
    screen.value = e;
    error.value = "";
    filter.value = "全部";
    uni.pageScrollTo({
      scrollTop: 0,
      duration: 0,
    });
  }
  function guard(e) {
    busy.value ||
      (dirty.value
        ? (modal.value = {
            title: "还有未保存的修改",
            body: adminDirty.value ? "离开后，未保存的管理信息会丢失。你可以取消并先保存。" : "离开后，未保存的评分和评语会丢失。你可以取消并先保存草稿。",
            confirm: "放弃修改",
            action: e,
          })
        : e());
  }
  function go(e) {
    if (isAdmin.value) {
      if (["home", "adminClasses", "adminStudents", "profile"].includes(e) && screen.value !== e)
        guard(() => { adminDirty.value = false; navigate(e); });
      return;
    }
    if (e.startsWith("admin")) return;
    if (e === "aiBatch" && !isTeacher.value) return;
    (isTeacher.value && "growth" === e) ||
      (!isTeacher.value && rosterScreens.includes(e)) ||
      (("create" !== e || teachingClassOptions.value.length) &&
        guard(() => {
          "create" === e && (newClassId.value = currentClass.value.id);
          navigate(e);
        }));
  }
  function switchClass(e) {
    isTeacher.value &&
      teachingClassOptions.value.some((a) => a.id === e) &&
      guard(() => {
        selectedClassId.value = e;
        assignmentPeriod.value = "ongoing";
        analyticsSearch.value = "";
        analyticsStudentId.value = "";
        const a = classAssignments(state.value, e)[0];
        a && (assignmentId.value = a.id);
        error.value = "";
        uni.pageScrollTo({
          scrollTop: 0,
          duration: 0,
        });
      });
  }
  function openAssignment(e) {
    scopedAssignments.value.some((a) => a.id === e.id) &&
      guard(() => {
        detailReturn.value =
          "statistics" === screen.value ? "statistics" : "home";
        assignmentId.value = e.id;
        navigate("assignment");
      });
  }
  function openReview(e) {
    guard(() => {
      reviewReturn.value = screen.value === "aiReview" ? "aiReview" : "assignment";
      submissionId.value = e.id;
      assignmentId.value = e.assignmentId;
      review.value = presentReview(e.draft);
      reviewBaseline.value = JSON.stringify(review.value);
      category.value = "handwriting";
      panel.value = "evaluation";
      photoIndex.value = 0;
      openDimension.value = null;
      navigate("review");
    });
  }
  function openFeedback(e) {
    var a;
    (isTeacher.value || e.studentId === boundStudent.value?.id) &&
      guard(() => {
        feedbackReturn.value =
          ["aiReview", "aiBatch"].includes(screen.value) ? screen.value : "growth" === screen.value
            ? "growth"
            : "records" === screen.value
              ? "records"
              : "home" === screen.value
                ? "home"
                : "assignment";
        submissionId.value = e.id;
        assignmentId.value = e.assignmentId;
        category.value = "handwriting";
        openDimension.value = null;
        photoIndex.value = 0;
        navigate("feedback");
      });
  }
  async function runAction(t) {
    if (!busy.value) {
      busy.value = true;
      error.value = "";
      try {
        if (!service)
          throw new Error(startupError.value || "保存暂不可用，请稍后重试。");
        await t();
        refresh();
      } catch (ra) {
        error.value = ra.message;
      } finally {
        busy.value = false;
      }
    }
  }
  function clearBindingDraft() {
    inviteCode.value = "";
    bindingCandidate.value = null;
    error.value = "";
  }
  function openAiReview(submission) {
    if (!service || !submission || role.value === "admin") return;
    try { service.aiResult(submission.id, role.value); }
    catch (failure) { error.value = failure.message; return; }
    guard(() => {
      aiReviewReturn.value = screen.value === "aiBatch" ? "aiBatch" : screen.value === "records" ? "records" : "assignment";
      submissionId.value = submission.id;
      assignmentId.value = submission.assignmentId;
      navigate("aiReview");
    });
  }
  async function beginAiBatch(retryOnly = false) {
    if (!isTeacher.value || !selectedAssignment.value) return;
    await runAction(async () => {
      const result = await service.startAiBatch(selectedAssignment.value.id, role.value, retryOnly, failAnalysis.value);
      navigate("aiBatch");
      if (!result.queued.length) notify("已有结果和正在批阅的作品已保留");
    });
  }
  onUnmounted(() => {
    clearTimeout(toastTimer);
    clearInterval(clockTimer);
    clearInterval(aiTimer);
  });
  return {
    state,
    role,
    screen,
    category,
    review,
    panel,
    photoIndex,
    openDimension,
    filter,
    busy,
    error,
    toast,
    photos,
    note,
    failSubmit,
    failAnalysis,
    newTitle,
    newRequirements,
    newDue,
    newClassId,
    modal,
    roles: [
      {
        id: "teacher",
        label: "教师",
      },
      {
        id: "student",
        label: "学生",
      },
      { id: "admin", label: "管理员" },
    ],
    startupError,
    selectedAssignment,
    selectedSubmission,
    aiTask,
    aiRows,
    aiSummary,
    aiStateLabel: (submission) => AI_LABELS[submission?.aiReview?.state || "notStarted"],
    openAiReview,
    beginAiBatch,
    openAiBatch: () => {
      if (isTeacher.value && selectedAssignment.value) guard(() => navigate("aiBatch"));
    },
    startSingleAi: async () => {
      if (!selectedSubmission.value) return;
      await runAction(async () => {
        await service.startAiReview(submissionId.value, role.value, failAnalysis.value);
      });
    },
    refreshAi: advanceAiQueue,
    applyAiSuggestions: () => {
      if (!isTeacher.value || !selectedSubmission.value) return;
      modal.value = {
        title: "用AI建议作为本轮草稿？",
        body: "当前教师草稿将替换为这份AI建议。AI原始结果保留，确认后请逐项复核，再发布老师的正式反馈。",
        confirm: "应用并复核",
        action: async () => {
          await runAction(async () => { await service.applyAiReview(submissionId.value, role.value); });
          if (!error.value) openReview(state.value.submissions.find(item => item.id === submissionId.value));
        },
      };
    },
    reviewAiSubmission: async () => {
      const item = selectedSubmission.value;
      if (!isTeacher.value || !item) return;
      if (["failed", "processing"].includes(item.status)) {
        await runAction(async () => { await service.manualReview(item.id, role.value); });
      }
      if (!error.value) openReview(state.value.submissions.find(row => row.id === item.id));
    },
    mine,
    isTeacher,
    isAdmin,
    adminIdentity,
    adminDirty,
    adminAction: async function ({ kind, data, success, message }) {
      const handlers = {
        saveClass: service?.saveClass,
        setClassTeachers: service?.setClassTeachers,
        saveStudent: service?.saveStudent,
        transferStudents: service?.transferStudents,
        setStudentArchived: service?.setStudentArchived,
      };
      await runAction(async () => {
        if (!Object.prototype.hasOwnProperty.call(handlers, kind) || !handlers[kind]) throw new Error("管理操作暂不可用。");
        const result = await handlers[kind].call(service, data, role.value);
        refresh();
        adminDirty.value = false;
        success?.(result);
        notify(message || "管理信息已保存");
      });
    },
    identity,
    myHistory,
    feedback,
    canSubmit,
    title,
    studentsInAssignment,
    formerStudentsInAssignment,
    rubric,
    total,
    latest,
    expired,
    assignmentFor: function (e) {
      return state.value.assignments.find((a) => a.id === e.assignmentId);
    },
    studentFor,
    statusLabel: function (e) {
      return isTeacher.value
        ? taskStatus(e)
        : e
          ? {
              processing: "处理中",
              failed: "处理失败",
              pending: "待批阅",
              published: "已完成",
            }[e.status]
          : "未提交";
    },
    statusClass: function (e) {
      return e
        ? "published" === e.status
          ? "green"
          : "failed" === e.status
            ? "red"
            : "amber"
        : "neutral";
    },
    date: function (e) {
      const a = new Date(e);
      return `${a.getMonth() + 1}月${a.getDate()}日 ${String(a.getHours()).padStart(2, "0")}:${String(a.getMinutes()).padStart(2, "0")}`;
    },
    go,
    switchRole: function (e) {
      if (e !== "teacher" && e !== "student" && e !== "admin") return;
      e !== role.value &&
        guard(() => {
          var a;
          role.value = e;
          adminDirty.value = false;
          clearBindingDraft();
          photos.value = [];
          note.value = "";
          submissionId.value = "";
          assignmentId.value = scopedAssignments.value[0]?.id || "";
          navigate("home");
        });
    },
    openAssignment,
    openReview,
    openFeedback,
    openSubmit: function (e) {
      boundStudent.value &&
        scopedAssignments.value.some((a) => a.id === e.id) &&
        guard(() => {
          assignmentId.value = e.id;
          photos.value = [];
          note.value = "";
          failSubmit.value = false;
          failAnalysis.value = false;
          navigate("submit");
        });
    },
    editScore: function (e, a) {
      const t = a.detail.value.trim();
      review.value[category.value].scores[e] = "" === t ? null : Number(t);
    },
    saveDraft: async function () {
      await runAction(async () => {
        await service.saveDraft(submissionId.value, review.value, role.value);
        reviewBaseline.value = JSON.stringify(review.value);
        notify("草稿已保存，发布后学生可见");
      });
    },
    publish: function () {
      const a = validateReview(review.value);
      a
        ? (error.value = a)
        : (modal.value = {
            title: "发布这份反馈？",
            body: "发布后，学生可查看这份书写与写作评分、评语及订正建议。",
            confirm: "确认发布",
            action: async () => {
              await runAction(async () => {
                await service.publish(
                  submissionId.value,
                  review.value,
                  role.value,
                );
                reviewBaseline.value = JSON.stringify(review.value);
                notify("反馈已发布");
                navigate(reviewReturn.value);
              });
            },
          });
    },
    confirmModal: async function () {
      var e;
      const a = modal.value?.action;
      modal.value = null;
      a && (await a());
    },
    addSamples: function () {
      photos.value.some((e) => !e.sample)
        ? (error.value = "请先移除已选图片，再装载练习作品。")
        : ((photos.value = clone(samplePhotos)), (error.value = ""));
    },
    movePhoto: function (e, a) {
      const t = e + a;
      if (t < 0 || t >= photos.value.length) return;
      const s = [...photos.value];
      [s[e], s[t]] = [s[t], s[e]];
      photos.value = s;
    },
    choosePhotos: async function () {
      error.value = "";
      try {
        const added = await pickPhotos(photos.value.length);
        photos.value.push(...added);
      } catch (failure) {
        error.value = failure.message;
      }
    },
    submit: function () {
      photos.value.length
        ? (modal.value = {
            title: mine.value ? "确认提交订正？" : "确认提交作品？",
            body: `共 ${photos.value.length} 页。请检查页序和清晰度，提交后本轮不可重复提交。原作品和反馈将保留。`,
            confirm: "确认提交",
            action: async () => {
              await runAction(async () => {
                let a;
                var t;
                a = await ((t = photos.value),
                service.submit(
                  assignmentId.value,
                  t,
                  note.value,
                  role.value,
                  failSubmit.value,
                  failAnalysis.value,
                ));
                refresh();
                submissionId.value = a.id;
                aiReviewReturn.value = "assignment";
                navigate("aiReview");
              });
            },
          })
        : (error.value = "请先选择作品照片。");
    },
    retry: async function (a) {
      await runAction(async () => { await service.startAiReview(a.id, role.value); });
      if (!error.value) openAiReview(a);
    },
    manual: async function (a) {
      await runAction(async () => {
        await service.manualReview(a.id, role.value);
      });
      error.value ||
        openReview(state.value.submissions.find((e) => e.id === a.id));
    },
    createAssignment: async function () {
      await runAction(async () => {
        const a = new Date(`${newDue.value}T20:00:00`);
        if (!Number.isFinite(a.getTime()))
          throw new Error("请选择有效的截止日期。");
        const t = await service.createAssignment(
          {
            title: newTitle.value,
            requirements: newRequirements.value,
            dueAt: a.toISOString(),
            classId: newClassId.value,
          },
          role.value,
        );
        selectedClassId.value = t.classId;
        assignmentPeriod.value = "ongoing";
        detailReturn.value = "home";
        assignmentId.value = t.id;
        refresh();
        navigate("assignment");
        newTitle.value = "";
        newRequirements.value = "";
        notify("作业已发布到" + t.className);
      });
    },
    reset: function () {
      modal.value = {
        title: "重置原型数据？",
        body: "这会清除当前浏览器中的作业、提交、评分和订正记录，恢复初始原型。此操作不能撤销。",
        confirm: "确认重置",
        action: () => {
          try {
            uni.removeStorageSync(STORAGE_KEY);
            service = createPrototypeService();
            startupError.value = "";
            refresh();
            clearBindingDraft();
            role.value = "teacher";
            selectedClassId.value = "class-1";
            newClassId.value = "class-1";
            rosterClassId.value = "class-1";
            memberSearch.value = "";
            organizationId.value = "organization-1";
            assignmentPeriod.value = "ongoing";
            statisticsPanel.value = "students";
            analyticsSearch.value = "";
            analyticsStudentId.value = "";
            rankingCategory.value = "handwriting";
            assignmentId.value = "assignment-1";
            submissionId.value = "submission-1";
            navigate("home");
            notify("已恢复初始原型");
          } catch (ra) {
            startupError.value = ra.message;
          }
        },
      };
    },
    assignmentAction: function (e) {
      var a;
      const t = latest(e.id, boundStudent.value?.id || "");
      "published" === t?.status ? openFeedback(t) : openAssignment(e);
    },
    currentClass,
    classStudents,
    scopedAssignments,
    visibleAssignments,
    ongoingAssignments,
    closedAssignments,
    workCounts,
    assignmentPeriod,
    switchClass,
    counts: function (e) {
      return assignmentCounts(state.value, e);
    },
    taskStatuses,
    isRoot,
    activeTab,
    back: function () {
      go(
        screen.value === "aiReview" ? aiReviewReturn.value
          : screen.value === "aiBatch" ? "assignment"
          : screen.value === "review" ? reviewReturn.value
          : "classMembers" === screen.value
          ? "classes"
          : "classes" === screen.value
            ? "profile"
            : "statisticsStudent" === screen.value
              ? "statisticsStudents"
              : "statisticsStudents" === screen.value
                ? "statistics"
                : "review" === screen.value || "submit" === screen.value
                  ? "assignment"
                  : "feedback" === screen.value
                    ? feedbackReturn.value
                    : "records" === screen.value && isTeacher.value
                      ? "feedback"
                      : "assignment" === screen.value
                        ? detailReturn.value
                        : "home",
      );
    },
    boundStudent,
    now,
    statisticsPanel,
    historyStudent,
    analyticsSearch,
    rankingCategory,
    analyticsStudentId,
    openStudentAnalytics: function (e) {
      isTeacher.value &&
        !e.archived &&
        e.classId === currentClass.value.id &&
        guard(() => {
          analyticsStudentId.value = e.id;
          navigate("statisticsStudent");
        });
    },
    activeStudents,
    rosterClassId,
    rosterClass,
    memberSearch,
    openClassMembers: function (e) {
      isTeacher.value &&
        teachingClassOptions.value.some((a) => a.id === e.id) &&
        guard(() => {
          rosterClassId.value = e.id;
          memberSearch.value = "";
          navigate("classMembers");
        });
    },
    visitRosterClass: function (e) {
      isTeacher.value &&
        rosterClass.value &&
        !busy.value &&
        (switchClass(rosterClassId.value), go(e));
    },
    organizationOptions,
    currentOrganization,
    teachingClassOptions,
    organizationAssignmentCount,
    organizationNameForClass: (e) => {
      var a;
      return (
        organizationForClass(state.value, e)?.name || "所属学校／机构待确认"
      );
    },
    switchOrganization: function (e) {
      var a;
      (isTeacher.value || isAdmin.value) &&
        e !== currentOrganization.value?.id &&
        organizationOptions.value.some((a) => a.id === e) &&
        guard(() => {
          if (isAdmin.value) {
            organizationId.value = e;
            adminDirty.value = false;
            navigate("home");
            return;
          }
          var a;
          const s = screen.value.startsWith("statistics")
            ? "statistics"
            : rosterScreens.includes(screen.value)
              ? "classes"
              : "profile" === screen.value
                ? "profile"
                : "home";
          organizationId.value = e;
          const c = getTeacherClasses(state.value, e)[0];
          selectedClassId.value = c?.id || "";
          newClassId.value = selectedClassId.value;
          rosterClassId.value = selectedClassId.value;
          analyticsSearch.value = "";
          analyticsStudentId.value = "";
          memberSearch.value = "";
          assignmentPeriod.value = "ongoing";
          assignmentId.value =
            (c && classAssignments(state.value, c.id)[0]?.id) || "";
          navigate(s);
        });
    },
    inviteCode,
    bindingCandidate,
    accountSignedIn,
    teacherIdentity,
    growthSummary,
    teacherForAssignment: function (e) {
      return e.teacher || DEFAULT_TEACHER;
    },
    teacherForFeedback: function (e) {
      return e.publishedBy || DEFAULT_TEACHER;
    },
    needsBinding,
    loginForBinding: function () {
      busy.value ||
        (modal.value = {
          title: "微信登录写字星",
          body:
            isAdmin.value
              ? "登录后，使用学校负责人提供的管理员邀请码确认管理范围，维护班级和学生信息。"
              : "teacher" === role.value
              ? "登录后，使用学校提供的教师邀请码确认任教学校与班级，开始布置作业和批阅。"
              : "登录后，使用学校提供的邀请码关联学习档案，查看作业和老师的反馈。",
          confirm: "继续",
          action: async () => {
            await runAction(async () => {
              await service.signIn(role.value);
            });
          },
        });
    },
    previewBinding: function () {
      if (!busy.value && service) {
        error.value = "";
        try {
          bindingCandidate.value = service.previewBinding(
            inviteCode.value,
            role.value,
          );
        } catch (ra) {
          error.value = ra.message;
        }
      }
    },
    editBindingCode: function () {
      bindingCandidate.value = null;
      error.value = "";
    },
    confirmBinding: async function () {
      const a = bindingCandidate.value;
      a &&
        (await runAction(async () => {
          var t, l, c;
          await service.bindInvitation(a.code, role.value);
          refresh();
          clearBindingDraft();
          if (isAdmin.value) organizationId.value = organizationOptions.value[0]?.id || "";
          "teacher" === role.value &&
            ((organizationId.value = organizationOptions.value[0]?.id || ""),
            (selectedClassId.value = teachingClassOptions.value[0]?.id || ""),
            (newClassId.value = selectedClassId.value),
            (rosterClassId.value = selectedClassId.value),
            (memberSearch.value = ""),
            (analyticsSearch.value = ""),
            (analyticsStudentId.value = ""));
          assignmentId.value = scopedAssignments.value[0]?.id || "";
          submissionId.value = "";
          photos.value = [];
          note.value = "";
          navigate("home");
          notify(
            isAdmin.value
              ? "管理员身份与管理范围已绑定"
              : "teacher" === role.value
              ? "教师身份与任教范围已绑定"
              : "学习档案已绑定",
          );
        }));
    },
    restartBinding: function () {
      busy.value ||
        guard(() => {
          modal.value = {
            title: "重新体验当前身份的绑定？",
            body: "只清除当前模拟身份的登录和关联信息。管理分配、学生档案、作业、照片、反馈和其他身份的绑定都会保留。",
            confirm: "重新体验",
            action: async () => {
              await runAction(async () => {
                await service.restartBinding(role.value);
                refresh();
                clearBindingDraft();
                photos.value = [];
                note.value = "";
                submissionId.value = "";
                assignmentId.value = "";
                navigate("home");
              });
            },
          };
        });
    },
    bindingHelp: function () {
      modal.value = {
        title: "联系学校管理员",
        body:
          isAdmin.value
            ? "管理员权限由学校负责人授权。请联系负责人核对管理员姓名及学校／机构，不能通过普通教师或学生邀请码获取管理权限。"
            : "teacher" === role.value
            ? "请向学校管理员核对教师姓名、所属学校和任教班级。任教分配由管理员维护，小程序仅展示已分配的范围。"
            : "请向学校管理员核对学生姓名、学校和班级。邀请码由学校提供；信息有误时请由管理员处理。",
        confirm: "知道了",
        action: () => {},
      };
    },
  };
}
