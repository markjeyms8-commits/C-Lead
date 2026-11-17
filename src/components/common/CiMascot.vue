<template>
  <svg class="ci" viewBox="0 0 180 180" role="img" :aria-label="t('ci')">
    <ellipse
      cx="90"
      cy="158"
      rx="58"
      ry="9"
      fill="currentColor"
      opacity=".08"
    />
    <path
      d="M43 111 40 65 70 79Q90 69 111 79l29-14-4 46q14 45-46 47-60-2-47-47"
      fill="#f9fff4"
      stroke="#28624b"
      stroke-width="4"
    />
    <path d="m52 78 35-65 35 68" fill="#123f32" />
    <path
      d="M42 82q45-21 94 0"
      fill="none"
      stroke="#123f32"
      stroke-width="14"
      stroke-linecap="round"
    />
    <path d="m89 35 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1" fill="#e7bd65" />
    <ellipse cx="70" cy="111" rx="4" ry="6" fill="#123f32" />
    <ellipse cx="111" cy="111" rx="4" ry="6" fill="#123f32" />
    <path
      d="m85 123 5 4 5-4m-5 4q-6 10-12 2m12-2q6 10 12 2"
      fill="none"
      stroke="#28624b"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path
      d="m52 121-17-3m18 10-17 3m92-10 17-3m-18 10 17 3"
      stroke="#79a58a"
      stroke-width="2"
    />
  </svg>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>
