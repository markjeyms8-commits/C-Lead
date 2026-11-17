<template>
  <AppLayout :title="t('polls.title')"
    ><section v-if="route.path === viewPath" class="card">
      <h1>{{ t('polls.title') }}</h1>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="success" role="status">{{ t('feed.saved') }}</p>
      <RouterLink to="/polls">{{ t('polls.list') }}</RouterLink><RouterLink
        v-if="admin && !creating"
        to="/polls/new"
        >{{ t('polls.create') }}</RouterLink
      >
      <form v-if="creating && admin" @submit="submit">
        <label :for="'poll-question-' + formId">{{
          t('polls.question')
        }}</label><textarea
          :id="'poll-question-' + formId"
          v-model="question"
          v-bind="questionAttrs"
          maxlength="500"
        /><label :for="'poll-term-' + formId">{{ t('feed.term') }}</label
        ><select :id="'poll-term-' + formId" v-model="term" v-bind="termAttrs">
          <option value="" disabled>{{ t('academic.choose') }}</option>
          <option v-for="s in terms" :key="s.id" :value="s.id">
            {{ s.name }}
          </option></select
        ><label :for="'poll-options-' + formId">{{ t('polls.options') }}</label
        ><textarea :id="'poll-options-' + formId" v-model="labels" />
        <p>{{ t('polls.optionHelp') }}</p>
        <label
          ><input v-model="multiple" type="checkbox" />{{
            t('polls.multiple')
          }}</label
        ><label
          ><input v-model="anonymous" type="checkbox" />{{
            t('polls.anonymous')
          }}</label
        ><label
          ><input v-model="changes" type="checkbox" />{{
            t('polls.changes')
          }}</label
        ><label :for="'poll-deadline-' + formId">{{
          t('polls.deadline')
        }}</label
        ><input
          :id="'poll-deadline-' + formId"
          v-model="deadline"
          type="datetime-local"
        />
        <p>{{ t('feed.timezone') }}</p>
        <label :for="'poll-visibility-' + formId">{{
          t('polls.visibility')
        }}</label><select
          :id="'poll-visibility-' + formId"
          v-model="visibility"
        >
          <option
            v-for="v in ['always', 'after_vote', 'after_close']"
            :key="v"
            :value="v"
          >
            {{ t(`polls.${v}`) }}
          </option>
        </select>
        <p v-if="invalid || Object.keys(errors).length" role="alert">
          {{ t('feed.invalid') }}
        </p>
        <button :disabled="isSubmitting || !online">
          {{ t('module.save') }}
        </button>
      </form>
      <template v-else-if="poll && !loading"
        ><h2>{{ poll.question }}</h2>
        <p>
          <strong>{{
            t(poll.anonymous ? 'polls.anonymousNotice' : 'polls.namedNotice')
          }}</strong>
        </p>
        <p>
          {{ t('polls.deadline') }}: {{ dateManila(poll.deadline, locale) }}
        </p>
        <p>
          {{ t(`polls.${poll.result_visibility}`) }} ·
          {{ t(poll.allow_changes ? 'polls.changes' : 'polls.noChanges') }}
        </p>
        <p>{{ t(poll.multiple_choice ? 'polls.multiple' : 'polls.single') }}</p>
        <p v-if="closed">{{ t('polls.closed') }}</p>
        <fieldset
          :disabled="
            busy ||
            !online ||
            closed ||
            (!poll.allow_changes && savedVote.length > 0)
          "
        >
          <legend>{{ t('polls.choose') }}</legend>
          <label v-for="option in options" :key="option.id"
            ><input
              v-if="poll.multiple_choice"
              v-model="selected"
              type="checkbox"
              :value="option.id"
            /><input
              v-else
              type="radio"
              name="poll-vote"
              :checked="selected.includes(option.id)"
              @change="selected = [option.id]"
            />{{ option.label }}</label
          ><button :disabled="!selected.length" @click="cast">
            {{ t('polls.vote') }}
          </button>
        </fieldset>
        <button :disabled="busy || !online" @click="results">
          {{ t('polls.results') }}
        </button>
        <p v-if="resultError" role="status">
          {{ t('polls.resultUnavailable') }}
        </p>
        <section v-if="result">
          <h3>{{ t('polls.results') }}</h3>
          <p>{{ t('polls.participants') }}: {{ result.participants }}</p>
          <ul>
            <li v-for="o in result.options" :key="o.id">
              {{ o.label }}: {{ o.votes }}
              <ul v-if="o.voters">
                <li v-for="person in o.voters" :key="person.id">
                  {{ person.name }}
                </li>
              </ul>
            </li>
          </ul>
        </section>
        <ReasonForm
          v-if="admin && !closed"
          :actions="['archive']"
          :disabled="busy || !online"
          @submit="close"
        />
        <p v-if="admin && !closed">{{ t('polls.closeHelp') }}</p></template
      >
      <template v-else-if="!creating"
        ><p v-if="!loading && !rows.length">{{ t('polls.empty') }}</p>
        <article v-for="p in rows" :key="p.id">
          <h2>
            <RouterLink :to="`/polls/${p.id}`">{{ p.question }}</RouterLink>
          </h2>
          <p>
            {{ dateManila(p.deadline, locale) }} ·
            {{ t(p.anonymous ? 'polls.anonymous' : 'polls.named') }}
          </p>
        </article>
        <button :disabled="page === 0 || loading" @click="page--">
          {{ t('feed.previous') }}</button><button
          :disabled="rows.length < 20 || loading"
          @click="page++"
        >
          {{ t('feed.next') }}
        </button></template
      >
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import {
  onIonViewWillEnter,
  onIonViewDidLeave,
  alertController,
} from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import AppLayout from '@/layouts/AppLayout.vue';
import ReasonForm from '@/components/feed/ReasonForm.vue';
import { useAuthStore } from '@/stores/auth';
import { useConnectivityStore } from '@/stores/app';
import {
  pollSchema,
  type Poll,
  type PollOption,
  type PollResults,
} from '@/schemas/polls';
import {
  listPolls,
  getPoll,
  pollOptions,
  myVote,
  pollResults,
  vote,
  createPoll,
} from '@/services/modules/polls';
import {
  listAcademic,
  type AcademicRecord,
} from '@/services/modules/academics';
import { dateManila, fromManila, rpc } from '@/services/modules/communication';
const formId = crypto.randomUUID();
const { t, locale } = useI18n(),
  route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const { online } = storeToRefs(useConnectivityStore());
const admin = computed(() =>
  ['president', 'vice_president'].includes(auth.profile?.role ?? ''),
);
const creating = computed(() => viewPath.value === '/polls/new'),
  id = computed(() =>
    typeof viewRecordId.value === 'string' ? viewRecordId.value : null,
  );
const viewPath = ref(route.path),
  viewRecordId = ref(route.params.id);
const loading = ref(true),
  error = ref(false),
  success = ref(false),
  busy = ref(false),
  invalid = ref(false),
  resultError = ref(false),
  rows = ref<Poll[]>([]),
  poll = ref<Poll | null>(null),
  options = ref<PollOption[]>([]),
  selected = ref<string[]>([]),
  savedVote = ref<string[]>([]),
  result = ref<PollResults | null>(null),
  terms = ref<AcademicRecord[]>([]),
  page = ref(0),
  labels = ref(''),
  multiple = ref(false),
  anonymous = ref(true),
  changes = ref(false),
  deadline = ref(''),
  visibility = ref('after_close'),
  now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
const closed = computed(
  () =>
    !!poll.value &&
    (!!poll.value.closed_at ||
      Date.parse(poll.value.deadline) <= now.value ||
      !terms.value.some((s) => s.id === poll.value!.semester_id)),
);
const { defineField, errors, handleSubmit, isSubmitting } = useForm<{
  question: string;
  semester_id: string;
}>({
  initialValues: { question: '', semester_id: '' },
  validationSchema: {
    question: (v: unknown) =>
      pollSchema.shape.question.safeParse(v).success || 'invalid',
    semester_id: (v: unknown) =>
      pollSchema.shape.semester_id.safeParse(v).success || 'invalid',
  },
});
const [question, questionAttrs] = defineField('question'),
  [term, termAttrs] = defineField('semester_id');
async function load() {
  loading.value = true;
  error.value = false;
  result.value = null;
  resultError.value = false;
  try {
    const years = await listAcademic('academic_years');
    terms.value = (await listAcademic('semesters')).filter(
      (s) =>
        !s.archived_at &&
        years.some((y) => y.id === s.academic_year_id && !y.archived_at),
    );
    if (id.value) {
      poll.value = await getPoll(id.value);
      options.value = await pollOptions(id.value);
      savedVote.value = await myVote(id.value);
      selected.value = [...savedVote.value];
      if (viewPath.value.endsWith('/results')) await results();
    } else {
      poll.value = null;
      rows.value = await listPolls(page.value);
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
const submit = handleSubmit(async (v) => {
  invalid.value = false;
  error.value = false;
  try {
    const input = {
      ...v,
      options: labels.value.split('\n').map((s) => s.trim()),
      multiple_choice: multiple.value,
      anonymous: anonymous.value,
      deadline: fromManila(deadline.value),
      result_visibility: visibility.value,
      allow_changes: changes.value,
    };
    if (
      !pollSchema.safeParse(input).success ||
      !input.deadline ||
      Date.parse(input.deadline) <= Date.now()
    ) {
      invalid.value = true;
      return;
    }
    const created = await createPoll(input);
    await router.push(`/polls/${created}`);
    await load();
    success.value = true;
  } catch {
    error.value = true;
  }
});
async function cast() {
  if (!id.value) return;
  busy.value = true;
  error.value = false;
  try {
    await vote(id.value, selected.value);
    await load();
    success.value = true;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
async function results() {
  if (!id.value) return;
  resultError.value = false;
  busy.value = true;
  try {
    result.value = await pollResults(id.value);
  } catch {
    result.value = null;
    resultError.value = true;
  } finally {
    busy.value = false;
  }
}
async function close(v: { reason: string }) {
  const a = await alertController.create({
    header: t('polls.closeHelp'),
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('feed.confirm'), role: 'confirm' },
    ],
  });
  await a.present();
  if ((await a.onDidDismiss()).role !== 'confirm') return;
  busy.value = true;
  try {
    await rpc('close_poll', { target_poll: id.value, close_reason: v.reason });
    await load();
    success.value = true;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
onIonViewWillEnter(() => {
  void load();
  stop();
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onIonViewDidLeave(stop);
onUnmounted(stop);

watch(page, load);
</script>
<style scoped>
fieldset label {
  display: block;
  padding: 0.5rem;
}
article {
  margin-block: 1rem;
}
</style>
