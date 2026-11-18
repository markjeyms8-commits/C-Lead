<template>
  <img
    class="ci"
    :src="artwork"
    :alt="t('ci')"
    width="1536"
    height="1024"
    decoding="async"
  />
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import artwork from '@/assets/mascot/ci-welcome.png';
const { t } = useI18n();
</script>
