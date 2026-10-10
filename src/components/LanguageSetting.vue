<script setup lang="ts">
import { languagePreference, setLanguage, t } from '../services/i18n'
</script>
<template>
  <div class="language-setting-row">
    <label id="language-setting-label" for="shotai-language">
      <strong>{{ t('界面语言') }} / Language</strong>
      <small>{{ t('只改变界面，不翻译你的消息、文件或模型回答') }}</small>
    </label>
    <select id="shotai-language" :value="languagePreference" @change="setLanguage(($event.target as HTMLSelectElement).value)">
      <option value="auto">{{ t('跟随系统') }} / Auto</option>
      <option value="zh-CN">简体中文</option>
      <option value="en">English</option>
    </select>
  </div>
</template>
<style scoped>
.language-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; }
label { display: grid; gap: 6px; min-width: 0; }
strong { font-size: 14px; color: var(--text-primary); }
small { font-size: 12px; line-height: 1.6; color: var(--text-secondary); }
select { min-height: 44px; min-width: 154px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text-primary); font: inherit; cursor: pointer; }
select:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 3px; }
@media (max-width: 520px) { .language-setting-row { align-items: stretch; flex-direction: column; } select { width: 100%; } }
</style>
