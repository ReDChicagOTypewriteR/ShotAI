<script setup lang="ts">
import { t } from '../services/i18n'
import { ref } from 'vue'
defineProps<{
  detail: string
  saving: boolean
  diagnosticError: string
  diagnostic?: { path: string; downloadUrl?: string } | null
  isHost: boolean
}>()
defineEmits<{ retry: []; openLogs: [] }>()
const expanded = ref(false)
</script>

<template>
  <section class="import-failure-panel" role="alert" :aria-label="t('模型导入失败详情')">
    <h3>{{ t("导入失败") }}</h3>
    <p>{{ t("所选文件仍保留。可查看原因后重试，或导出诊断文件协助排查。") }}</p>
    <el-button @click="expanded = !expanded" :aria-expanded="expanded">{{ expanded ? t("收起错误详情") : t("查看错误详情") }}</el-button>
    <pre v-if="expanded">{{ detail }}</pre>
    <p v-if="saving">{{ t("正在保存诊断文件…") }}</p>
    <p v-if="diagnosticError">{{ t("诊断保存失败：") }}{{ diagnosticError }}{{ t("。请保留上面的错误详情。") }}</p>
    <p v-if="diagnostic">{{ t("诊断文件：") }}{{ diagnostic.path }}</p>
    <div class="import-failure-actions">
      <el-button type="primary" :disabled="saving" @click="$emit('retry')">{{ t("重试导入") }}</el-button>
      <a v-if="diagnostic?.downloadUrl" :href="diagnostic.downloadUrl" download>{{ t("导出诊断文件") }}</a>
      <el-button v-if="isHost" @click="$emit('openLogs')">{{ t("打开日志目录") }}</el-button>
    </div>
  </section>
</template>
