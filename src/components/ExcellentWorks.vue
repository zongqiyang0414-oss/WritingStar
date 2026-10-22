<script setup>
import { computed, ref, watch } from "vue";
import { displayPhoto } from "../services/presentation.js";

const props = defineProps({
  works: { type: Array, default: () => [] },
  work: { type: Object, default: null },
  detail: Boolean,
  teacher: Boolean,
  busy: Boolean,
  className: { type: String, default: "" },
  assignmentTitle: { type: String, default: "" },
});
defineEmits(["view", "remove", "back"]);
const page = ref(0);
watch(() => props.work?.id, () => { page.value = 0; });
const photo = computed(() => props.work?.photos[page.value]);
function preview() {
  if (!photo.value) return;
  uni.previewImage({
    current: displayPhoto(photo.value.url),
    urls: props.work.photos.map((item) => displayPhoto(item.url)),
  });
}
</script>

<template>
  <view class="excellent-workspace">
    <template v-if="detail">
      <template v-if="work">
        <view class="card excellent-detail-intro">
          <text class="badge excellent-badge">★ 优秀作业</text>
          <view class="detail-title">{{ work.title }}</view>
          <view class="small subtle">{{ work.studentName }} · {{ work.className }} · 第 {{ work.version }} 版</view>
          <view class="small subtle spaced-small">{{ work.selectedBy.name }}选出，供全班同学参考</view>
          <button v-if="teacher" class="text-button spaced-small" :disabled="busy" @click="$emit('remove', work)">取消优秀作业</button>
        </view>
        <view v-if="photo" class="card photo-reader">
          <view class="small subtle">第 {{ page + 1 }} 页 · 点击图片放大查看</view>
          <image class="essay-image" :src="displayPhoto(photo.url)" mode="widthFix" @click="preview" />
          <view class="photo-pagination">
            <button class="secondary" :disabled="page === 0" @click="page--">上一页</button>
            <text>{{ page + 1 }} / {{ work.pageCount }}</text>
            <button class="secondary" :disabled="page >= work.pageCount - 1" @click="page++">下一页</button>
          </view>
        </view>
      </template>
      <view v-else class="card empty-state">
        <view class="strong">这份作品已取消展示或当前无法查看</view>
        <button class="text-button spaced-small" @click="$emit('back')">返回优秀作业列表 ›</button>
      </view>
    </template>
    <template v-else>
      <view class="card excellent-intro">
        <view class="eyebrow">{{ className }} · 共同进步</view>
        <view class="detail-title">向好作品学一学</view>
        <view class="small subtle">{{ assignmentTitle || '本班全部作业' }} · {{ works.length }} 份优秀作品</view>
        <view class="paragraph small subtle">看看同学怎样写好字、讲好故事，把学到的方法用在下一次练习中。</view>
      </view>
      <view v-if="!works.length" class="card empty-state">
        <view class="excellent-symbol">★</view>
        <view class="strong">还没有优秀作业</view>
        <view class="paragraph small">{{ teacher ? '在提交名单或批阅页，将值得分享的作品设为优秀作业。' : '老师选出优秀作品后，会展示在这里。' }}</view>
      </view>
      <view v-for="item in works" :key="item.id" class="card excellent-card">
        <view class="card-top">
          <text class="badge excellent-badge">★ 优秀作业</text>
          <text class="tiny subtle">第 {{ item.version }} 版 · {{ item.pageCount }} 页</text>
        </view>
        <view class="strong">{{ item.title }}</view>
        <view class="small subtle spaced-small">{{ item.studentName }} · {{ item.selectedBy.name }}选出</view>
        <image v-if="item.cover" class="excellent-cover" :src="displayPhoto(item.cover)" mode="aspectFill" lazy-load @click="$emit('view', item)" />
        <view class="homework-actions">
          <button class="secondary" :disabled="busy" @click="$emit('view', item)">查看完整作品 ›</button>
          <button v-if="teacher" class="text-button" :disabled="busy" @click="$emit('remove', item)">取消优秀</button>
        </view>
      </view>
    </template>
  </view>
</template>
