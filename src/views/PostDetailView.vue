<template>
  <AppLayout :title="t('feed.post')"
    ><section v-if="route.path === viewPath" class="card">
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('feed.saved') }}</p>
      <template v-if="post"
        ><h1>{{ post.title }}</h1>
        <p>
          {{ authorName(post.author_id) }} · {{ t(`feed.${post.kind}`) }} ·
          {{ t(`feed.${post.state}`)
          }}<span v-if="post.edited_at"> · {{ t('feed.edited') }}</span>
        </p>
        <p v-if="post.publish_at">{{ dateManila(post.publish_at, locale) }}</p>
        <p v-if="post.hidden_at">{{ t('feed.hidden') }}</p>
        <RichText :body="post.body" />
        <nav class="link-grid">
          <RouterLink
            v-if="permissions.editable"
            :to="`/announcements/${post.id}/edit`"
            >{{ t('academic.edit') }}</RouterLink><button
            v-if="permissions.editable"
            :disabled="busy || !online"
            @click="archive"
          >
            {{ t('academic.archive') }}</button
          ><button
            :disabled="busy || !online"
            @click="
              reportTarget = null;
              reporting = true;
            "
          >
            {{ t('feed.report') }}</button
          ><RouterLink to="/announcements">{{ t('feed.back') }}</RouterLink>
        </nav>
        <AttachmentsPanel :post-id="post.id" :editable="permissions.editable" />
        <ReasonForm
          v-if="deleting"
          :actions="['delete']"
          :disabled="busy || !online"
          cancelable
          @cancel="deleting = false"
          @submit="deletePost"
        />
        <button
          v-if="permissions.editable || post.deletion_requested_at"
          :disabled="busy || !online"
          @click="deleting = true"
        >
          {{
            t(
              post.deletion_requested_at
                ? 'feed.retryDelete'
                : 'feed.deletePost',
            )
          }}
        </button>
        <ReactionBar
          :items="reactions.filter((r) => !r.comment_id)"
          :disabled="!permissions.interactable || busy || !online"
          @choose="(value) => changeReaction(null, value)"
        />
        <section v-if="decisions.length">
          <h2>{{ t('feed.decisions') }}</h2>
          <ul>
            <li v-for="decision in decisions" :key="decision.id">
              {{ t(`feed.${decision.decision}`) }} · {{ decision.reason }} ·
              {{ dateManila(decision.created_at, locale) }}
            </li>
          </ul>
        </section>
        <ReasonForm
          v-if="reporting"
          :actions="['report']"
          :disabled="busy || !online"
          cancelable
          @cancel="reporting = false"
          @submit="sendReport"
        />
        <h2>{{ t('feed.comments') }}</h2>
        <p v-if="!comments.length">{{ t('feed.noComments') }}</p>
        <CommentItem
          v-for="comment in displayComments"
          :key="comment.id"
          :comment="comment"
          :author="authorName(comment.author_id)"
          :reactions="reactions.filter((r) => r.comment_id === comment.id)"
          :own="comment.author_id === auth.profile?.id"
          :disabled="!permissions.interactable || busy || !online"
          @react="(value) => changeReaction(comment.id, value)"
          @reply="replyTo(comment)"
          @edit="editComment(comment)"
          @remove="removeComment(comment)"
          @report="
            reportTarget = comment.id;
            reporting = true;
          "
        />
        <form v-if="permissions.interactable" @submit="submitComment">
          <h3>
            {{
              t(
                editing
                  ? 'feed.editComment'
                  : parent
                    ? 'feed.reply'
                    : 'feed.addComment',
              )
            }}
          </h3>
          <label :for="fieldPrefix + '-comment-body'">{{
            t('feed.commentText')
          }}</label><textarea
            :id="fieldPrefix + '-comment-body'"
            ref="commentInput"
            v-model="commentBody"
            v-bind="commentAttrs"
            maxlength="3000"
            :aria-invalid="!!errors.body"
            :aria-describedby="fieldPrefix + '-comment-error'"
          />
          <p :id="fieldPrefix + '-comment-error'" class="field-error">
            {{ errors.body ? t('feed.invalid') : '' }}
          </p>
          <p>{{ t('feed.mentionHelp') }}</p>
          <MentionPicker
            @pick="(value) => (commentBody += ' ' + value + ' ')"
          /><button :disabled="busy || isSubmitting || !online">
            {{ t('module.save') }}</button
          ><button
            v-if="editing || parent"
            type="button"
            class="secondary"
            @click="clearComment"
          >
            {{ t('academic.cancel') }}
          </button>
        </form>
        <p v-else>{{ t('feed.readOnly') }}</p>
      </template>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  onIonViewWillEnter,
  onIonViewDidLeave,
  alertController,
} from '@ionic/vue';
import { useForm } from 'vee-validate';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import AppLayout from '@/layouts/AppLayout.vue';
import AttachmentsPanel from '@/components/feed/AttachmentsPanel.vue';
import { removePost } from '@/services/modules/attachments';
import MentionPicker from '@/components/feed/MentionPicker.vue';
import RichText from '@/components/feed/RichText.vue';
import ReactionBar from '@/components/feed/ReactionBar.vue';
import CommentItem from '@/components/feed/CommentItem.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import { useAuthStore } from '@/stores/auth';
import { useConnectivityStore } from '@/stores/app';
import {
  postDetail,
  postComments,
  postReactions,
  postDecisions,
  saveComment,
  react,
  report,
  rpc,
  dateManila,
  watchCommunication,
} from '@/services/modules/communication';
import { fetchRoster } from '@/services/modules/foundation';
import { commentSchema } from '@/schemas/communication';
import type {
  Post,
  Comment,
  Reaction,
  Decision,
  ReactionName,
} from '@/types/communication';
const { t, locale } = useI18n();
const route = useRoute();
const viewPath = route.path,
  viewId = route.params.id,
  fieldPrefix = crypto.randomUUID();
const router = useRouter();
const deleting = ref(false);
const auth = useAuthStore();
const { online } = storeToRefs(useConnectivityStore());
const id = computed(() => String(viewId));
const post = ref<Post | null>(null),
  comments = ref<Comment[]>([]),
  reactions = ref<Reaction[]>([]),
  decisions = ref<Decision[]>([]),
  names = ref<Record<string, string>>({}),
  permissions = ref({ editable: false, interactable: false });
const loading = ref(true),
  error = ref(false),
  success = ref(false),
  busy = ref(false),
  reporting = ref(false),
  reportTarget = ref<string | null>(null),
  editing = ref<string | null>(null),
  parent = ref<string | null>(null),
  commentInput = ref<HTMLTextAreaElement | null>(null);
let stop: (() => void) | undefined;
let revision = 0;
const { defineField, errors, handleSubmit, isSubmitting, resetForm } = useForm<{
  body: string;
}>({
  initialValues: { body: '' },
  validationSchema: {
    body: (v: unknown) => commentSchema.safeParse(v).success || 'invalid',
  },
});
const [commentBody, commentAttrs] = defineField('body');
const displayComments = computed(() => {
  const roots = comments.value.filter((c) => !c.parent_id);
  const ids = new Set(roots.map((c) => c.id));
  return [
    ...roots.flatMap((root) => [
      root,
      ...comments.value.filter((c) => c.parent_id === root.id),
    ]),
    ...comments.value.filter((c) => c.parent_id && !ids.has(c.parent_id)),
  ];
});
const authorName = (user: string) =>
  names.value[user] ?? t('feed.formerMember');
async function load() {
  const version = ++revision;
  loading.value = true;
  error.value = false;
  try {
    const current = await postDetail(id.value);
    const rights = await rpc('post_permissions', { target_post: id.value });
    const replies = await postComments(id.value);
    const votes = await postReactions(id.value);
    const reviews = await postDecisions(id.value);
    const roster = await fetchRoster();
    if (version !== revision) return;
    post.value = current;
    permissions.value = rights;
    comments.value = replies;
    reactions.value = votes;
    decisions.value = reviews;
    names.value = Object.fromEntries(roster.map((r) => [r.id, r.full_name]));
  } catch {
    if (version === revision) {
      error.value = true;
      post.value = null;
    }
  } finally {
    if (version === revision) loading.value = false;
  }
}
async function action(work: () => Promise<void>) {
  busy.value = true;
  success.value = false;
  error.value = false;
  try {
    await work();
    await load();
    success.value = !error.value;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
async function confirm(message: string) {
  const alert = await alertController.create({
    header: t('feed.confirm'),
    message,
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('feed.confirm'), role: 'confirm' },
    ],
  });
  await alert.present();
  return (await alert.onDidDismiss()).role === 'confirm';
}
async function archive() {
  if (await confirm(t('feed.archiveConfirm')))
    await action(async () => {
      await rpc('archive_post', { target_post: id.value });
    });
}
function clearComment() {
  editing.value = null;
  parent.value = null;
  resetForm({ values: { body: '' } });
}
function replyTo(comment: Comment) {
  clearComment();
  parent.value = comment.id;
  void nextTick(() => commentInput.value?.focus());
}
function editComment(comment: Comment) {
  editing.value = comment.id;
  parent.value = comment.parent_id;
  resetForm({ values: { body: comment.body } });
  void nextTick(() => commentInput.value?.focus());
}
const submitComment = handleSubmit(async (values) => {
  await action(async () => {
    await saveComment(id.value, editing.value, parent.value, values.body);
    clearComment();
  });
});
async function removeComment(comment: Comment) {
  if (await confirm(t('feed.deleteCommentConfirm')))
    await action(async () => {
      await rpc('delete_comment', { target_comment: comment.id });
    });
}
async function changeReaction(
  comment: string | null,
  value: ReactionName | null,
) {
  await action(async () => {
    await react(id.value, comment, value);
  });
}
async function sendReport(value: { action: string; reason: string }) {
  await action(async () => {
    await report(id.value, reportTarget.value, value.reason);
    reporting.value = false;
  });
}
async function deletePost(value: { action: string; reason: string }) {
  if (!(await confirm(t('feed.deleteWarning')))) return;
  busy.value = true;
  error.value = false;
  try {
    await removePost(id.value, value.reason);
    await router.replace('/announcements');
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
function end() {
  revision++;
  stop?.();
  stop = undefined;
}
onIonViewWillEnter(() => {
  clearComment();
  deleting.value = false;
  reporting.value = false;
  success.value = false;
  void load().then(() => {
    if (post.value?.kind === 'announcement')
      void rpc('record_announcement_view', { target_post: id.value }).catch(
        () => {},
      );
  });
  stop?.();
  stop = watchCommunication(() => {
    if (!busy.value) void load();
  });
});
onIonViewDidLeave(end);
onUnmounted(end);
</script>
