<template>
  <div class="empty-state">
    <span aria-hidden="true" class="empty-symbol">✧</span>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>
<script setup lang="ts">
defineProps<{ title: string; description: string }>();
</script>
