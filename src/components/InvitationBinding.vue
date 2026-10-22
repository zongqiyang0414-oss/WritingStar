<script setup>
import { computed } from "vue";
import { growthIllustration } from "../services/assets.js";

const props = defineProps({
  role: {},
  signedIn: {
    type: Boolean,
  },
  code: {},
  candidate: {},
  busy: {
    type: Boolean,
  },
});
const emit = defineEmits([
  "update:code",
  "login",
  "preview",
  "edit",
  "confirm",
  "help",
]);
const roleLabel = computed(() => ({ teacher: "教师", student: "学生", admin: "管理员" })[props.role]);
function updateCode(e) {
  emit("update:code", e.detail.value);
}
</script>

<template>
  <view class="binding-view">
    <template v-if="signedIn">
      <template v-if="candidate">
        <button
          class="text-button binding-back"
          :disabled="busy"
          @click="(e) => emit('edit')"
        >
          ‹ 返回修改邀请码
        </button>
        <template v-if="candidate.role === 'admin'">
          <view class="binding-intro"><view class="detail-title">绑定身份</view></view>
          <view class="card binding-confirm-card">
            <view class="binding-person"><view class="avatar pale">{{ candidate.administrator.initial }}</view><view class="grow"><view class="section-title">{{ candidate.administrator.name }}</view><view class="small subtle">学校管理员</view></view><text class="badge green">管理员</text></view>
            <view v-for="organization in candidate.organizations" :key="organization.id" class="profile-information-row"><text class="subtle">授权管理</text><text>{{ organization.name }}</text></view>
          </view>
        </template>
        <template v-else-if="'teacher' === candidate.role">
          <view class="binding-intro">
            <view class="detail-title"> 绑定身份 </view>
          </view>
          <view class="card binding-confirm-card teacher-binding-card">
            <view class="binding-person">
              <view class="avatar pale">
                {{ candidate.teacher.initial }}
              </view>
              <view>
                <view class="section-title">
                  {{ candidate.teacher.name }}
                </view>
                <view class="small subtle">
                  {{ candidate.teacher.subject }}教师
                </view>
              </view>
              <text class="badge green"> 教师 </text>
            </view>
            <template v-for="item1 in candidate.organizations" :key="item1.id">
              <view class="teacher-binding-school">
                <view class="strong">
                  {{ item1.name }}
                </view>
                <view class="teacher-binding-classes">
                  <template
                    v-for="item2 in candidate.classes.filter(
                      (e) => e.organizationId === item1.id,
                    )"
                    :key="item2.id"
                  >
                    <text class="badge neutral">
                      {{ item2.name }}
                    </text>
                  </template>
                </view>
                <template
                  v-if="
                    candidate.classes.some((e) => e.organizationId === item1.id)
                  "
                />
                <template v-else>
                  <view :key="0" class="small subtle">
                    学校已关联，班级待管理员分配。
                  </view>
                </template>
              </view>
            </template>
            <view class="small subtle spaced-small">
              共 {{ candidate.organizations.length }} 所学校，{{
                candidate.classes.length
              }}
              个任教班级
            </view>
          </view>
        </template>
        <template v-else>
          <view class="binding-intro">
            <view class="detail-title"> 绑定身份 </view>
          </view>
          <view class="card binding-confirm-card">
            <view class="binding-person">
              <view class="avatar pale">
                {{ candidate.student.initial }}
              </view>
              <view>
                <view class="section-title">
                  {{ candidate.student.name }}
                </view>
                <view class="small subtle">
                  {{ "即将绑定的学生档案" }}
                </view>
              </view>
              <text class="badge green">
                {{ roleLabel }}
              </text>
            </view>
            <view class="profile-information-row">
              <text class="subtle"> 学校 </text>
              <text>
                {{ candidate.organization.name }}
              </text>
            </view>
            <view class="profile-information-row">
              <text class="subtle"> 班级 </text>
              <text>
                {{ candidate.schoolClass.name }}
              </text>
            </view>
            <template v-if="candidate.student.studentNumber">
              <view :key="0" class="profile-information-row">
                <text class="subtle"> 学号 </text>
                <text>
                  {{ candidate.student.studentNumber }}
                </text>
              </view>
            </template>
          </view>
        </template>
        <button
          class="primary spaced"
          :disabled="busy"
          @click="(e) => emit('confirm')"
        >
          {{ busy ? "绑定中…" : "确认" }}
        </button>
        <button
          class="text-button full-width spaced"
          :disabled="busy"
          @click="(e) => emit('help')"
        >
          信息有误，联系学校管理员
        </button>
      </template>
      <template v-else>
        <view class="binding-intro">
          <view class="detail-title"> 绑定身份 </view>
        </view>
        <view class="card binding-code-card">
          <view class="field-label"> 邀请码 </view>
          <input
            class="form-input binding-code"
            :value="code"
            placeholder="请输入邀请码"
            maxlength="20"
            :cursor-spacing="100"
            :disabled="busy"
            confirm-type="next"
            @input="updateCode"
            @confirm="(e) => emit('preview')"
          />
        </view>
        <button
          class="primary spaced"
          :disabled="busy"
          @click="(e) => emit('preview')"
        >
          查看绑定信息 ›
        </button>
        <view class="binding-help-note"> 没有邀请码，或邀请码无法使用？ </view>
        <button
          class="text-button full-width"
          :disabled="busy"
          @click="(e) => emit('help')"
        >
          联系学校管理员
        </button>
      </template>
    </template>
    <template v-else>
      <view class="binding-welcome">
        <view class="binding-title">
          把每一次努力
          <br />
          连成成长的轨迹
        </view>
        <image class="binding-art" :src="growthIllustration" mode="aspectFit" />
      </view>
      <button
        class="primary binding-login"
        :disabled="busy"
        @click="(e) => emit('login')"
      >
        <text class="binding-wechat-mark"> ● </text>
        微信登录并继续
      </button>
    </template>
  </view>
</template>
