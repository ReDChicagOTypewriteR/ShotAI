<script setup lang="ts">
import { t } from '../services/i18n'
import { ref, onBeforeUnmount } from 'vue'
import { clientHeaders } from '../services/clientIdentity'
const props = defineProps<{ models: Array<{ fullName: string }>; canManage: boolean }>()
const selected = ref('')
const busy = ref(false)
const report = ref<any>(null)
let controller: AbortController | undefined
async function inspect(probe: boolean) {
  if (!selected.value) return
  busy.value = true; report.value = null; controller = new AbortController()
  try {
    const response = await fetch('/shotai/models/health', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...clientHeaders() },
      body: JSON.stringify({ model: selected.value, probe }), signal: controller.signal })
    const result = await response.json()
    report.value = response.ok ? result : { status: 'failed', error: result.error || `HTTP ${response.status}` }
  } catch (error) {
    report.value = { status: 'failed', error: controller?.signal.aborted ? '体检已取消' : String(error) }
  } finally { busy.value = false }
}
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section class="model-health-panel" :aria-label="t('模型体检')">
    <strong>{{ t("模型体检与实际加载检测") }}</strong>
    <p>{{ t("检查读取信息、短推理与实际内存驻留。短推理与聊天共享队列；结果不代表回答质量评分。") }}</p>
    <div class="model-health-controls">
      <el-select v-model="selected" :placeholder="t('选择体检模型')" :aria-label="t('选择体检模型')" :disabled="busy">
        <el-option v-for="model in props.models" :key="model.fullName" :label="model.fullName" :value="model.fullName" />
      </el-select>
      <el-button :disabled="!selected || busy || !canManage" @click="inspect(false)">{{ t("检测加载") }}</el-button>
      <el-button :disabled="!selected || busy || !canManage" @click="inspect(true)">{{ t("运行体检") }}</el-button>
      <el-button v-if="busy" @click="controller?.abort()">{{ t("取消") }}</el-button>
    </div>
    <p v-if="busy" role="status">{{ t("正在排队或体检，首次加载较大模型可能需要等待……") }}</p>
    <div v-if="report" role="status" class="model-health-result">
      <strong>{{ report.status === 'passed' ? t("体检通过") : report.status === 'warning' ? t("检查完成，有提醒") : t("体检失败") }}</strong>
      <p v-if="report.loading">{{ t("实际加载：") }}{{ report.loading.loaded ? ({ gpu: t("GPU 驻留"), mixed: t("CPU / GPU 混合"), cpu: t("CPU 驻留") } as Record<string, string>)[report.loading.backend] : t("未加载") }}<span v-if="report.loading.loaded"> {{ t("· 显存") }} {{ (report.loading.vramBytes / 1024 ** 3).toFixed(2) }} GiB</span></p>
      <p v-for="warning in report.warnings || []" :key="warning">{{ t(warning) }}</p>
      <p v-if="report.error">{{ t(report.error) }}</p>
      <small>{{ t("依据：运行服务 /api/ps 与短推理结果；GPU 驻留不等于每一层都在 GPU 执行。体检记录保存于运行日志目录的 model-health.jsonl；Ubuntu 无写入权限时会使用桌面或数据目录。") }}</small>
    </div>
  </section>
</template>

<style scoped>
.model-health-panel { padding: 18px; margin: 0 0 20px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
.model-health-panel p, small { color: var(--text-secondary); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.model-health-controls { display: flex; gap: 8px; flex-wrap: wrap; }
.model-health-controls .el-select { flex: 1 1 220px; min-width: 0; }
.model-health-result { margin-top: 14px; }
</style>
