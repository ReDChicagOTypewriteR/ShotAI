<script setup lang="ts">
import { t } from '../services/i18n'
import { Document, CloseBold } from '@element-plus/icons-vue'
import { formatFileSize } from '../services/knowledge'
defineProps<{ attachment: { id: string; name: string; extension: string; size: number; characterCount?: number } }>()
defineEmits<{ remove: [id: string] }>()
</script>
<template>
  <article class="pending-document">
    <span class="pending-document-icon"><el-icon><Document /></el-icon>{{ attachment.extension }}</span>
    <div>
      <strong>{{ attachment.name }}</strong>
      <span>{{ formatFileSize(attachment.size) }}<template v-if="attachment.characterCount"> · {{ attachment.characterCount.toLocaleString() }} {{ t("字") }}</template></span>
    </div>
    <button type="button" :aria-label="t('移除 {0}', [attachment.name])" @click="$emit('remove', attachment.id)"><el-icon><CloseBold /></el-icon></button>
  </article>
</template>
