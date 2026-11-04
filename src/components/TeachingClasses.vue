<script setup>
const props = defineProps({
  model: {},
  organization: {},
  mode: {},
  query: {},
  busy: { type: Boolean },
});
const emit = defineEmits(["open", "visit", "update:query"]);
function updateQuery(e) {
  emit("update:query", e.detail.value);
}
</script>

<template>
  <template v-if="'classes' === mode">
    <view class="teaching-intro">
      <view class="eyebrow">
        {{ organization?.name || "学校／机构" }}
      </view>
      <view class="detail-title"> 我的任教班级 </view>
      <view class="small subtle">
        {{ model.classes.length }} 个班级 · {{ model.totalStudents }} 位在班学生
      </view>
    </view>
    <template v-for="(item1, index1) in model.classes" :key="item1.id">
      <button
        class="teaching-class card"
        :disabled="busy"
        @click="(e) => emit('open', item1)"
      >
        <view class="teaching-class-heading">
          <view class="teaching-class-mark">
            {{ index1 + 1 }}
          </view>
          <view class="grow">
            <view class="section-title">
              {{ item1.name }}
            </view>
            <view class="small subtle">
              {{ organization?.name }}
            </view>
          </view>
          <text class="entry-arrow"> › </text>
        </view>
        <view class="teaching-class-counts">
          <view>
            <text class="strong">
              {{ item1.studentCount }}
            </text>
            <text class="small subtle"> 在班学生 </text>
          </view>
          <view>
            <text class="strong">
              {{ item1.assignmentCount }}
            </text>
            <text class="small subtle"> 已布置作业 </text>
          </view>
        </view>
      </button>
    </template>
    <template v-if="model.classes.length" />
    <template v-else>
      <view :key="0" class="empty-state card">
        还没有班级，可在“班级管理”中新建。
      </view>
    </template>
  </template>
  <template v-else>
    <template v-if="model.currentClass">
      <view class="card teaching-summary">
        <view class="eyebrow">
          {{ organization?.name }}
        </view>
        <view class="detail-title">
          {{ model.currentClass.name }}
        </view>
        <view class="small subtle">
          {{ model.members.length }} 位在班学生 ·
          {{ model.currentClass.assignmentCount }} 项作业
        </view>
        <view class="teaching-shortcuts">
          <button
            class="secondary"
            :disabled="busy"
            @click="(e) => emit('visit', 'home')"
          >
            查看班级作业
          </button>
          <button
            class="secondary"
            :disabled="busy"
            @click="(e) => emit('visit', 'statistics')"
          >
            查看班级学情
          </button>
        </view>
      </view>
      <view class="section-heading">
        <view class="section-title"> 学生名单 </view>
        <text class="small subtle"> {{ model.members.length }} 人 </text>
      </view>
      <view class="student-search">
        <text class="search-symbol"> ⌕ </text>
        <input
          :value="query"
          :disabled="busy"
          placeholder="搜索姓名或学号"
          maxlength="40"
          @input="updateQuery"
        />
        <template v-if="query">
          <button
            :key="0"
            class="search-clear"
            :disabled="busy"
            @click="(e) => emit('update:query', '')"
          >
            清除
          </button>
        </template>
      </view>
      <view class="small subtle teaching-result">
        {{
          query.trim()
            ? "找到 " + model.filteredMembers.length + " 位学生"
            : "当前班级的在班学生"
        }}
      </view>
      <template v-for="item2 in model.filteredMembers" :key="item2.id">
        <view class="card teaching-student">
          <view class="avatar pale">
            {{ item2.initial }}
          </view>
          <view class="grow teaching-member-info">
            <view class="strong">
              {{ item2.name }}
            </view>
            <template v-if="item2.studentNumber">
              <view :key="0" class="tiny subtle">
                学号 {{ item2.studentNumber }}
              </view>
            </template>
            <view class="tiny subtle">
              {{
                item2.submissionCount
                  ? item2.submissionCount + " 次作品记录"
                  : "暂无作品记录"
              }}
            </view>
          </view>
          <text class="badge green"> 在班 </text>
        </view>
      </template>
      <template v-if="model.filteredMembers.length" />
      <template v-else>
        <view :key="0" class="empty-state card">
          {{
            query.trim()
              ? "没有找到对应学生，试试其他关键词。"
              : "本班暂时没有学生，可在“学生管理与导入”中添加。"
          }}
        </view>
      </template>
    </template>
    <template v-else>
      <view :key="2" class="empty-state card">
        未找到这个任教班级，请返回重新选择。
      </view>
    </template>
  </template>
  <view class="small subtle statistics-note">
    在“我的”中进入班级或学生管理，可建班、导入学生和导出登录账号。
  </view>
</template>
