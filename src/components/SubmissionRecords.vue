<script setup>
defineProps({ records: { default: () => [] }, studentName: String, busy: Boolean });
defineEmits(["feedback", "ai"]);
</script>

<template>
  <view class="submission-records">
    <view class="small subtle records-heading">{{ studentName }} · {{ records.length }} 份作业</view>
    <view v-for="item in records" :key="item.id" class="card submission-record">
      <view class="card-top"><view class="strong">{{ item.title }}</view><text class="badge" :class="item.published ? 'green' : 'amber'">{{ item.published ? '已完成' : '待反馈' }}</text></view>
      <view class="small subtle">{{ item.date }} · {{ item.pageCount }} 页{{ item.submittedBy ? ' · ' + item.submittedBy + '代交' : '' }}</view>
      <view v-if="item.published" class="record-score">书写 {{ item.handwriting }} / 100 · 写作 {{ item.composition }} / 100</view>
      <view v-else class="small subtle record-score">等待老师审核</view>
      <button v-if="item.published" class="text-button" :disabled="busy" @click="$emit('feedback', item)">查看作品与反馈 ›</button>
      <button v-else class="text-button" :disabled="busy" @click="$emit('ai', item)">查看作品与批阅进度 ›</button>
    </view>
    <view v-if="!records.length" class="card empty-state">还没有提交记录。</view>
  </view>
</template>

<style scoped>
.records-heading { margin-bottom: 18px; }
.submission-record { padding: 20px; }
.record-score { margin: 14px 0; color: #63855a; font-size: 14px; }
</style>
