<template>
  <AppLayout :title="t('feed.title')"
    ><PageHero :title="t('feed.title')" /> <FeedList
  /></AppLayout>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PageHero from '@/components/common/PageHero.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import FeedList from '@/components/feed/FeedList.vue';
const { t } = useI18n();
</script>
