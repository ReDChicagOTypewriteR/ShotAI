<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../services/i18n'
const props = defineProps<{ status?: string; startedAt?: number; stopping?: boolean }>()
defineEmits<{ stop: [] }>()
const now = ref(Date.now())
const mountedAt = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
const elapsed = computed(() => Math.max(0, Math.floor((now.value - (props.startedAt || mountedAt)) / 1000)))
const label = computed(() => props.stopping ? t('正在结束本次请求') : t(props.status || '正在准备请求'))
</script>
<template>
  <div class="task-status" :class="{ 'is-stopping': stopping }" role="status" aria-live="polite" aria-atomic="true">
    <span class="task-status-indicator" aria-hidden="true"></span>
    <span class="task-status-label">{{ label }}</span>
    <span class="task-status-elapsed" aria-hidden="true">{{ elapsed }}s</span>
    <button type="button" :disabled="stopping" :aria-label="t('停止本次任务')" @click="$emit('stop')">{{ t('停止') }}</button>
  </div>
</template>
