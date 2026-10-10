<script setup lang="ts">
import { computed } from 'vue'
import en from 'element-plus/es/locale/lang/en'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { locale } from './services/i18n'
import App from './App.vue'
const componentLocale = computed(() => locale.value === 'en' ? en : zhCn)
</script>
<template>
  <el-config-provider :locale="componentLocale"><App /></el-config-provider>
</template>
