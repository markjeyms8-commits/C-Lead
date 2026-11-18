<template>
  <header class="page-hero">
    <div>
      <p class="hero-kicker">{{ t('brand.section') }}</p>
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <CiMascot />
  </header>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import CiMascot from './CiMascot.vue';
defineProps<{ title: string; subtitle?: string }>();
const { t } = useI18n();
</script>
