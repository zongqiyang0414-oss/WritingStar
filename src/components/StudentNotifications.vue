<script setup>
import { computed } from "vue";
const props = defineProps({ notifications: { default: () => [] }, compact: Boolean, busy: Boolean });
defineEmits(["open", "all"]);
const unread = computed(() => props.notifications.filter(item => !item.read).length);
const visible = computed(() => props.compact ? props.notifications.slice(0, 3) : props.notifications);
function date(value) { const d = new Date(value); return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
</script>

<template>
  <view :class="['student-notifications', { 'card notification-home': compact }]">
    <view class="notification-heading">
      <view class="strong">消息通知 <text v-if="unread" class="notification-count">{{ unread }} 条未读</text></view>
      <button v-if="compact" class="text-button" :disabled="busy" @click="$emit('all')">查看全部 ›</button>
      <text v-else class="tiny subtle">{{ notifications.length }} 条通知</text>
    </view>
    <button v-for="item in visible" :key="item.id" :class="['notification-item', { 'is-unread': !item.read }]" :disabled="busy" @click="$emit('open', item)">
      <view :class="['notification-symbol', item.type]" aria-hidden="true">{{ item.type === 'returned' ? '↻' : item.type === 'reviewed' ? '✓' : '＋' }}</view>
      <view class="notification-content"><view class="notification-type">{{ item.label }}<text v-if="!item.read" class="notification-unread-dot" /></view><view class="notification-title">{{ item.title }}</view><view class="tiny subtle">{{ date(item.createdAt) }}</view></view>
      <text class="notification-arrow">›</text>
    </button>
    <view v-if="!notifications.length" class="small subtle notification-empty">暂无消息。新作业、需重交和教师批阅完成的通知会显示在这里。</view>
  </view>
</template>

<style scoped>
.student-notifications { min-width: 0; }
.notification-home { margin: 20px 0; padding: 18px; }
.notification-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.notification-count { font-size: 11px; color: #aa7739; margin-left: 6px; font-weight: 400; }
.notification-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 14px 0; border-radius: 0; background: transparent; text-align: left; line-height: 1.5; }
.notification-item + .notification-item { border-top: 1px solid #edf1e9; }
.notification-symbol { display: flex; flex: none; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 10px; background: #edf3e8; color: #567d58; font-size: 18px; }
.notification-symbol.returned { background: #fcf0df; color: #a3763c; }
.notification-content { min-width: 0; flex: 1; }
.notification-type { display: flex; align-items: center; gap: 7px; color: #526b59; font-size: 12px; }
.is-unread .notification-type { font-weight: 600; color: #23634c; }
.notification-title { color: #284638; font-size: 14px; overflow-wrap: anywhere; margin: 2px 0; }
.notification-unread-dot { width: 6px; height: 6px; border-radius: 50%; background: #bc8947; flex: none; }
.notification-arrow { color: #5b7f64; font-size: 22px; }
.notification-empty { padding: 14px 0; line-height: 1.8; }
</style>
