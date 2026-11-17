<template>
  <span class="avatar" :aria-label="name">{{ initials(name) }}</span>
</template>
<script setup lang="ts">
import { initials } from '@/utils/permissions';
defineProps<{ name: string }>();
</script>
