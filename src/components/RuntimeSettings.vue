<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '../services/i18n'
import { getRuntimeSettings, saveRuntimeSettings } from '../services/system'
import type { RuntimeSettingsSnapshot } from '../services/system'
const snapshot = ref<RuntimeSettingsSnapshot>()
const mode = ref('single'), parallel = ref(1), loading = ref(true), saving = ref(false), error = ref(''), saved = ref(false)
const names: Record<string, string> = { single: '单实例自动分配', spread: '多卡分担同一模型', 'per-gpu': '每卡一个实例' }
onMounted(async () => {
  try {
    snapshot.value = await getRuntimeSettings()
    mode.value = snapshot.value.configured.mode
    parallel.value = snapshot.value.configured.parallelPerInstance
  } catch { error.value = '无法读取运行设置' }
  finally { loading.value = false }
})
async function save() {
  saving.value = true; error.value = ''; saved.value = false
  try { snapshot.value = await saveRuntimeSettings(mode.value, parallel.value); saved.value = true }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '运行设置保存失败' }
  finally { saving.value = false }
}
function selectMode(event: Event) {
  mode.value = (event.target as HTMLSelectElement).value
  if (mode.value === 'per-gpu') parallel.value = 1
  saved.value = false
}
</script>
<template>
  <section class="runtime-settings" :aria-label="t('模型运行方式')">
    <strong>{{ t('模型运行方式') }}</strong>
    <small>{{ t('根据单人分析或多人使用选择显卡分配方式') }}</small>
    <p v-if="loading">{{ t('正在读取运行设置') }}</p>
    <template v-if="snapshot">
      <small>{{ t('当前运行') }} · {{ t(names[snapshot.active.mode] || '单实例自动分配') }} · {{ snapshot.gpuCount }} GPU</small>
      <p v-if="!snapshot.supported">{{ t('外部运行服务请在服务所在主机配置') }}</p>
      <template v-else>
        <label for="runtime-mode">{{ t('显卡分配') }}</label>
        <select id="runtime-mode" :value="mode" :disabled="saving" @change="selectMode">
          <option value="single">{{ t('单实例自动分配') }}</option>
          <option value="spread" :disabled="snapshot.gpuCount < 2">{{ t('多卡分担同一模型') }}</option>
          <option value="per-gpu" :disabled="snapshot.gpuCount < 2">{{ t('每卡一个实例') }}</option>
        </select>
        <small v-if="mode === 'single'">{{ t('由运行时选择显卡，模型单卡可容纳时通常使用一张卡。') }}</small>
        <small v-else-if="mode === 'spread'">{{ t('让同一模型使用多张可见显卡，单次回答是否提速需要实测。') }}</small>
        <small v-else>{{ t('不同请求分配到不同显卡，适合多人使用；每卡分别占用模型显存。') }}</small>
        <label for="runtime-parallel">{{ t('每实例并行上限') }}</label>
        <select id="runtime-parallel" v-model.number="parallel" :disabled="saving" @change="saved = false">
          <option v-for="value in 5" :key="value" :value="value">{{ value }}</option>
        </select>
        <small>{{ t('逐卡模式建议先用1；实际并发仍受模型、上下文和资源限制。') }}</small>
        <button type="button" :disabled="saving" @click="save">{{ saving ? t('正在保存') : t('保存运行设置') }}</button>
        <small v-if="snapshot.restartRequired && mode === snapshot.configured.mode && parallel === snapshot.configured.parallelPerInstance" role="status">{{ t('设置已保存。从系统托盘完全退出并重启 ShotAI 后生效，当前任务不会被中断。') }}</small>
        <small v-else-if="saved" role="status">{{ t('当前运行设置已保存') }}</small>
      </template>
    </template>
    <p v-if="error" role="alert">{{ t(error) }}</p>
  </section>
</template>
<style scoped>
.runtime-settings { display: grid; gap: 10px; padding: 18px 0; border-top: 1px solid var(--border); }
strong { font-size: 14px; color: var(--text-primary); }
small, label, p { font-size: 12px; color: var(--text-secondary); line-height: 1.7; margin: 0; }
select, button { width: 100%; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text-primary); font: inherit; }
button { cursor: pointer; margin-top: 4px; }
select:focus-visible, button:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
:disabled { opacity: .5; cursor: default; }
</style>
