<template>
  <AppLayout :title="t('feed.editor')"
    ><section v-if="route.path === viewPath" class="card narrow">
      <PageHero :title="t('feed.editor')" />
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" :disabled="isSubmitting" @click="load">
        {{ t('account.retry') }}
      </button>
      <form v-if="!loading" @submit="submit">
        <label :for="fieldPrefix + '-post-title'">{{
          t('feed.postTitle')
        }}</label><input
          :id="fieldPrefix + '-post-title'"
          v-model="title"
          v-bind="titleAttrs"
          maxlength="160"
          :aria-invalid="!!errors.title"
        /><label :for="fieldPrefix + '-post-term'">{{ t('feed.term') }}</label
        ><select
          :id="fieldPrefix + '-post-term'"
          v-model="term"
          v-bind="termAttrs"
          :disabled="!!id"
          :aria-invalid="!!errors.semester_id"
        >
          <option value="" disabled>{{ t('academic.choose') }}</option>
          <option v-for="record in terms" :key="record.id" :value="record.id">
            {{ record.name }}
          </option></select
        ><RichEditor v-model="body" />
        <p v-if="Object.keys(errors).length || invalidBody" role="alert">
          {{ t('feed.invalid') }}
        </p>
        <label :for="fieldPrefix + '-post-state'">{{
          t('feed.saveAs')
        }}</label><select :id="fieldPrefix + '-post-state'" v-model="state">
          <option value="draft">{{ t('feed.draft') }}</option>
          <option :value="kind === 'announcement' ? 'published' : 'pending'">
            {{
              t(kind === 'announcement' ? 'feed.publish' : 'feed.submitReview')
            }}
          </option>
        </select>
        <template v-if="kind === 'announcement'"
          ><label
            ><input v-model="pinned" type="checkbox" />{{
              t('feed.pinned')
            }}</label
          ><label :for="fieldPrefix + '-publish-at'">{{
            t('feed.publishTime')
          }}</label
          ><input
            :id="fieldPrefix + '-publish-at'"
            v-model="publishAt"
            type="datetime-local"
            :disabled="state === 'draft'"
          /><label :for="fieldPrefix + '-expire-at'">{{
            t('feed.expiryTime')
          }}</label
          ><input
            :id="fieldPrefix + '-expire-at'"
            v-model="expiresAt"
            type="datetime-local"
            :disabled="state === 'draft'"
          />
          <p>{{ t('feed.manila') }}</p></template
        >
        <button :disabled="isSubmitting || !connectivity.online || readOnly">
          {{ t('module.save') }}
        </button>
        <p v-if="readOnly">{{ t('feed.readOnly') }}</p>
        <RouterLink to="/announcements">{{ t('academic.cancel') }}</RouterLink>
      </form>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { onIonViewWillEnter } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import PageHero from '@/components/common/PageHero.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import RichEditor from '@/components/feed/RichEditor.vue';
import {
  postSchema,
  richTextSchema,
  type RichBlock,
} from '@/schemas/communication';
import {
  postDetail,
  savePost,
  rpc,
  toManila,
  fromManila,
} from '@/services/modules/communication';
import {
  listAcademic,
  type AcademicRecord,
} from '@/services/modules/academics';
import { useConnectivityStore } from '@/stores/app';
import type { PostState } from '@/types/communication';
const { t } = useI18n();
const route = useRoute(),
  viewPath = route.path,
  viewId = route.params.id,
  fieldPrefix = crypto.randomUUID(),
  router = useRouter(),
  connectivity = useConnectivityStore();
const id = computed(() => (typeof viewId === 'string' ? viewId : null));
const kind = ref<'announcement' | 'discussion'>('announcement');
const loading = ref(true),
  error = ref(false),
  invalidBody = ref(false),
  readOnly = ref(false),
  terms = ref<AcademicRecord[]>([]),
  body = ref<RichBlock[]>([{ type: 'paragraph', text: '' }]),
  state = ref<PostState>('draft'),
  pinned = ref(false),
  publishAt = ref(''),
  expiresAt = ref('');
const { defineField, errors, handleSubmit, isSubmitting, resetForm } = useForm<{
  title: string;
  semester_id: string;
}>({
  initialValues: { title: '', semester_id: '' },
  validationSchema: {
    title: (v: unknown) =>
      postSchema.shape.title.safeParse(v).success || 'invalid',
    semester_id: (v: unknown) =>
      postSchema.shape.semester_id.safeParse(v).success || 'invalid',
  },
});
const [title, titleAttrs] = defineField('title'),
  [term, termAttrs] = defineField('semester_id');
async function load() {
  loading.value = true;
  error.value = false;
  readOnly.value = false;
  invalidBody.value = false;
  try {
    const years = await listAcademic('academic_years');
    terms.value = (await listAcademic('semesters')).filter(
      (s) =>
        !s.archived_at &&
        years.some((y) => y.id === s.academic_year_id && !y.archived_at),
    );
    if (id.value) {
      const post = await postDetail(id.value);
      kind.value = post.kind;
      resetForm({
        values: { title: post.title, semester_id: post.semester_id },
      });
      body.value = post.body;
      state.value =
        post.kind === 'discussion'
          ? post.state === 'draft'
            ? 'draft'
            : 'pending'
          : post.state === 'draft'
            ? 'draft'
            : 'published';
      pinned.value = post.pinned;
      publishAt.value = toManila(post.publish_at);
      expiresAt.value = toManila(post.expires_at);
      readOnly.value = !(
        await rpc('post_permissions', { target_post: id.value })
      ).editable;
    } else {
      kind.value = viewPath.startsWith('/discussions')
        ? 'discussion'
        : 'announcement';
      resetForm({ values: { title: '', semester_id: '' } });
      body.value = [{ type: 'paragraph', text: '' }];
      state.value = 'draft';
      pinned.value = false;
      publishAt.value = '';
      expiresAt.value = '';
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
const submit = handleSubmit(async (values) => {
  invalidBody.value = !richTextSchema.safeParse(body.value).success;
  if (invalidBody.value || readOnly.value) return;
  error.value = false;
  try {
    const publish =
      kind.value === 'announcement' && state.value === 'published';
    const target = await savePost(
      {
        title: values.title,
        semester_id: values.semester_id,
        body: body.value,
        kind: kind.value,
        state: state.value,
        pinned: kind.value === 'announcement' && pinned.value,
        publish_at: publish ? fromManila(publishAt.value) : null,
        expires_at: publish ? fromManila(expiresAt.value) : null,
      },
      id.value,
    );
    await router.replace(`/announcements/${target}`);
  } catch {
    error.value = true;
  }
});
onIonViewWillEnter(load);
</script>
