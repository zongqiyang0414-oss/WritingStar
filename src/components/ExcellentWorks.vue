<script setup>
import { computed, ref, watch } from "vue";
import { displayPhoto } from "../services/presentation.js";
import { rubric, total } from "../services/rubric.js";

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
const category = ref("handwriting");
const collapsedDimensions = ref([]);
watch(() => props.work?.id, () => {
  page.value = 0;
  category.value = "handwriting";
  collapsedDimensions.value = [];
});
const photo = computed(() => props.work?.photos[page.value]);
const evaluation = computed(() => props.work?.published?.[category.value]);
function isExpanded(id) {
  return !collapsedDimensions.value.includes(`${category.value}:${id}`);
}
function toggleDimension(id) {
  const key = `${category.value}:${id}`;
  collapsedDimensions.value = isExpanded(id)
    ? [...collapsedDimensions.value, key]
    : collapsedDimensions.value.filter((item) => item !== key);
}
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
          <view class="small subtle">{{ work.studentName }} · {{ work.className }}</view>
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
        <template v-if="work.published && evaluation">
          <view class="category-switch">
            <button :class="{ active: category === 'handwriting' }" @click="category = 'handwriting'">书写评价</button>
            <button :class="{ active: category === 'composition' }" @click="category = 'composition'">写作评价</button>
          </view>
          <view class="card excellent-evaluation">
            <view class="card-top">
              <view class="section-title">{{ category === 'handwriting' ? '书写' : '写作' }}评价</view>
              <view class="excellent-review-total">{{ total(evaluation) ?? '—' }}<text> / 100</text></view>
            </view>
            <view class="strong">总体评价</view>
            <view class="paragraph small excellent-review-text">{{ evaluation.summary }}</view>
            <view class="section-title">五大思维</view>
            <view v-for="dimension in rubric[category]" :key="dimension.id" class="excellent-review-dimension">
              <button class="excellent-dimension-toggle" :aria-expanded="isExpanded(dimension.id)" @click="toggleDimension(dimension.id)">
                <text class="grow">{{ dimension.name }}</text>
                <text class="strong">{{ evaluation.scores[dimension.id] }} / {{ dimension.max }}</text>
                <text class="excellent-toggle-label">{{ isExpanded(dimension.id) ? '收起' : '展开' }}</text>
                <view :class="['excellent-chevron', { expanded: isExpanded(dimension.id) }]" />
              </button>
              <view v-if="isExpanded(dimension.id)" class="small excellent-review-text excellent-dimension-comment">{{ evaluation.comments[dimension.id] || '暂无分项评语' }}</view>
            </view>
          </view>
          <view class="card">
            <view class="section-title">批阅建议</view>
            <view class="paragraph small excellent-review-text">{{ work.published.nextSteps }}</view>
          </view>
        </template>
      </template>
      <view v-else class="card empty-state">
        <view class="strong">这份作品已取消展示或当前无法查看</view>
        <button class="text-button spaced-small" @click="$emit('back')">返回优秀作业列表 ›</button>
      </view>
    </template>
    <template v-else>
      <view v-if="!works.length" class="card empty-state">
        <view class="excellent-symbol">★</view>
        <view class="strong">还没有优秀作业</view>
        <view class="paragraph small">{{ teacher ? '在已完成批阅的作业详情页，将作品设为优秀作业。' : '老师选出优秀作品后，会展示在这里。' }}</view>
      </view>
      <view v-for="item in works" :key="item.id" class="card excellent-card">
        <view class="card-top">
          <text class="badge excellent-badge">★ 优秀作业</text>
          <text class="tiny subtle">{{ item.pageCount }} 页</text>
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
