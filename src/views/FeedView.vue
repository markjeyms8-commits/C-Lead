<template>
  <AppLayout :title="t('feed.title')"
    ><h1>{{ t('feed.title') }}</h1>
    <FeedList
  /></AppLayout>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppLayout from '@/layouts/AppLayout.vue';
import FeedList from '@/components/feed/FeedList.vue';
const { t } = useI18n();
</script>
