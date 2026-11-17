<template>
  <section>
    <h2>{{ t('feed.attachments') }}</h2>
    <p>{{ t('feed.fileLimits') }}</p>
    <p v-if="error" role="alert">{{ t('feed.fileError') }}</p>
    <p v-if="success" role="status">{{ t('feed.saved') }}</p>
    <p v-if="loading" role="status">{{ t('account.loading') }}</p>
    <p v-if="!loading && !rows.length">{{ t('feed.noFiles') }}</p>
    <ul>
      <li v-for="file in rows" :key="file.id">
        <strong>{{ file.filename }}</strong> ·
        {{ Math.ceil(file.byte_size / 1024) }} KB
        <span v-if="file.state !== 'ready'">{{
          t(`feed.file_${file.state}`)
        }}</span><button
          v-if="file.state === 'ready'"
          :disabled="busy || !connectivity.online"
          @click="link(file)"
        >
          {{ t('feed.getLink') }}</button
        ><a
          v-if="links[file.id]"
          :href="links[file.id]"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('feed.openFile') }}</a
        ><button
          v-if="editable"
          class="secondary"
          :disabled="busy || !connectivity.online"
          @click="remove(file)"
        >
          {{ t('feed.delete') }}
        </button>
      </li>
    </ul>
    <template v-if="editable"
      ><label :for="fieldId">{{ t('feed.upload') }}</label
      ><input
        :id="fieldId"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.pptx,.xlsx"
        multiple
        :disabled="busy || !connectivity.online"
        @change="upload" /></template
    ><button v-if="error" :disabled="busy" @click="load">
      {{ t('account.retry') }}
    </button>
  </section>
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import {
  attachments,
  uploadAttachment,
  attachmentLink,
  deleteAttachment,
  type Attachment,
} from '@/services/modules/attachments';
import { useConnectivityStore } from '@/stores/app';
const props = defineProps<{
  postId: string;
  editable: boolean;
  parentType?: 'post' | 'task';
}>();
const { t } = useI18n();
const fieldId = 'files-' + crypto.randomUUID();
const connectivity = useConnectivityStore();
const rows = ref<Attachment[]>([]),
  links = ref<Record<string, string>>({}),
  loading = ref(true),
  busy = ref(false),
  error = ref(false),
  success = ref(false);
const timers: ReturnType<typeof setTimeout>[] = [];
async function load() {
  loading.value = true;
  error.value = false;
  try {
    rows.value = await attachments(props.postId, props.parentType);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (!files.length) return;
  busy.value = true;
  error.value = false;
  success.value = false;
  try {
    if (rows.value.length + files.length > 5) throw new Error('limit');
    for (const file of files)
      await uploadAttachment(props.postId, file, props.parentType);
    await load();
    success.value = !error.value;
  } catch {
    await load();
    error.value = true;
  } finally {
    busy.value = false;
    input.value = '';
  }
}
async function link(file: Attachment) {
  busy.value = true;
  error.value = false;
  try {
    links.value[file.id] = await attachmentLink(file.id, props.parentType);
    timers.push(setTimeout(() => delete links.value[file.id], 55000));
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
async function remove(file: Attachment) {
  const alert = await alertController.create({
    header: t('feed.delete'),
    message: t('feed.fileDeleteWarning'),
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('feed.delete'), role: 'confirm' },
    ],
  });
  await alert.present();
  if ((await alert.onDidDismiss()).role !== 'confirm') return;
  busy.value = true;
  error.value = false;
  success.value = false;
  try {
    await deleteAttachment(file.id, props.parentType);
    delete links.value[file.id];
    await load();
    success.value = !error.value;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
onMounted(load);
watch(
  () => props.postId,
  () => {
    links.value = {};
    void load();
  },
);
onUnmounted(() => timers.forEach(clearTimeout));
</script>
