<template>
  <div class="rich-content">
    <template v-for="(group, index) in groups" :key="index"
      ><p v-if="group.type === 'paragraph'">
        <span
          :class="{
            strong: group.blocks[0]?.bold,
            italic: group.blocks[0]?.italic,
          }"
          ><a
            v-if="safeLink(group.blocks[0]?.url)"
            :href="safeLink(group.blocks[0]?.url)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ group.blocks[0]?.text }}</a
          ><span v-else>{{ group.blocks[0]?.text }}</span></span
        >
      </p>
      <component :is="group.type === 'bullet' ? 'ul' : 'ol'" v-else
        ><li
          v-for="(block, item) in group.blocks"
          :key="item"
          :class="{ strong: block.bold, italic: block.italic }"
        >
          <a
            v-if="safeLink(block.url)"
            :href="safeLink(block.url)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ block.text }}</a><span v-else>{{ block.text }}</span>
        </li></component
      ></template
    >
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import {
  richTextSchema,
  safeLink,
  type RichBlock,
} from '@/schemas/communication';
const props = defineProps<{ body: unknown }>();
const groups = computed(() => {
  const parsed = richTextSchema.safeParse(props.body);
  const result: { type: RichBlock['type']; blocks: RichBlock[] }[] = [];
  if (!parsed.success) return result;
  for (const block of parsed.data) {
    const last = result.at(-1);
    if (block.type !== 'paragraph' && last?.type === block.type)
      last.blocks.push(block);
    else result.push({ type: block.type, blocks: [block] });
  }
  return result;
});
</script>
<style scoped>
.rich-content {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.strong {
  font-weight: 800;
}
.italic {
  font-style: italic;
}
</style>
