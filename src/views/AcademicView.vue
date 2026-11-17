<template>
  <AppLayout :title="t('academic.title')"
    ><section class="card narrow">
      <h1>{{ t('academic.title') }}</h1>
      <label for="academic-kind">{{ t('academic.kind') }}</label>
      <select
        id="academic-kind"
        v-model="kind"
        :disabled="busy"
        @change="reset"
      >
        <option v-for="value in kinds" :key="value" :value="value">
          {{ t(`academic.${value}`) }}
        </option>
      </select>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('academic.error') }}</p>
      <button v-if="error" :disabled="busy" @click="load">
        {{ t('account.retry') }}
      </button>
      <p v-if="success" role="status">{{ t('academic.saved') }}</p>
      <form v-if="!loading" @submit.prevent="submit">
        <h2>{{ t(editing ? 'academic.edit' : 'academic.create') }}</h2>
        <label for="academic-name">{{ t('academic.name') }}</label><input
          id="academic-name"
          v-model="form.name"
          required
          :maxlength="kind === 'subjects' ? 160 : 80"
        />
        <template v-if="kind !== 'academic_years'"
          ><label for="academic-parent">{{ t('academic.parent') }}</label
          ><select id="academic-parent" v-model="form.parent" required>
            <option value="" disabled>{{ t('academic.choose') }}</option>
            <option
              v-for="parent in parents"
              :key="parent.id"
              :value="parent.id"
            >
              {{ parent.name }}
            </option>
          </select></template
        >
        <template v-if="kind === 'subjects'"
          ><label for="academic-code">{{ t('academic.code') }}</label
          ><input
            id="academic-code"
            v-model="form.code"
            required
            maxlength="30"
        /></template>
        <template v-else
          ><label for="academic-start">{{ t('academic.start') }}</label
          ><input
            id="academic-start"
            v-model="form.starts_on"
            type="date"
            required /><label for="academic-end">{{ t('academic.end') }}</label
          ><input id="academic-end" v-model="form.ends_on" type="date" required
        /></template>
        <button :disabled="busy || !online">
          {{ t('module.save') }}</button><button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="reset"
        >
          {{ t('academic.cancel') }}
        </button>
      </form>
      <p v-if="!loading && !rows.length">{{ t('academic.empty') }}</p>
      <ul>
        <li v-for="row in rows" :key="row.id">
          <h2>{{ row.code }} {{ row.name }}</h2>
          <p>{{ row.starts_on }} {{ row.ends_on }}</p>
          <p v-if="!writable(row)">{{ t('academic.archived') }}</p>
          <template v-else
            ><button :disabled="busy || !online" @click="edit(row)">
              {{ t('academic.edit') }}</button
            ><button
              class="secondary"
              :disabled="busy || !online"
              @click="confirmArchive(row)"
            >
              {{ t('academic.archive') }}
            </button></template
          >
        </li>
      </ul>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onIonViewWillEnter, alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useConnectivityStore } from '@/stores/app';
import AppLayout from '@/layouts/AppLayout.vue';
import {
  listAcademic,
  saveAcademic,
  archiveAcademic,
  type AcademicKind,
  type AcademicRecord,
} from '@/services/modules/academics';
const { t } = useI18n();
const route = useRoute();
const kinds: AcademicKind[] = ['academic_years', 'semesters', 'subjects'];
const kind = ref<AcademicKind>('academic_years');
const records = reactive<Record<AcademicKind, AcademicRecord[]>>({
  academic_years: [],
  semesters: [],
  subjects: [],
});
const loading = ref(true),
  busy = ref(false),
  error = ref(false),
  success = ref(false),
  editing = ref<string | null>(null);
const { online } = storeToRefs(useConnectivityStore());
const form = reactive({
  name: '',
  code: '',
  starts_on: '',
  ends_on: '',
  parent: '',
});
const rows = computed(() => records[kind.value]);
const yearActive = (id?: string) =>
  records.academic_years.some((r) => r.id === id && !r.archived_at);
const termActive = (id?: string) =>
  records.semesters.some(
    (r) => r.id === id && !r.archived_at && yearActive(r.academic_year_id),
  );
const parents = computed(() =>
  kind.value === 'semesters'
    ? records.academic_years.filter((r) => !r.archived_at)
    : records.semesters.filter(
        (r) => !r.archived_at && yearActive(r.academic_year_id),
      ),
);
const writable = (r: AcademicRecord) =>
  !r.archived_at &&
  (kind.value === 'academic_years' ||
    (kind.value === 'semesters'
      ? yearActive(r.academic_year_id)
      : termActive(r.semester_id)));
function reset() {
  editing.value = null;
  Object.assign(form, {
    name: '',
    code: '',
    starts_on: '',
    ends_on: '',
    parent: '',
  });
}
function edit(row: AcademicRecord) {
  editing.value = row.id;
  Object.assign(form, {
    name: row.name,
    code: row.code ?? '',
    starts_on: row.starts_on ?? '',
    ends_on: row.ends_on ?? '',
    parent: row.academic_year_id ?? row.semester_id ?? '',
  });
}
async function load() {
  loading.value = true;
  error.value = false;
  try {
    for (const k of kinds) records[k] = await listAcademic(k);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
const { setValues, validate } = useForm({
  validationSchema: {
    name: (value: unknown) =>
      z
        .string()
        .trim()
        .min(1)
        .max(kind.value === 'subjects' ? 160 : 80)
        .safeParse(value).success || 'invalid',
    starts_on: (value: unknown) =>
      kind.value === 'subjects' ||
      z.iso.date().safeParse(value).success ||
      'invalid',
    ends_on: (value: unknown) =>
      kind.value === 'subjects' ||
      (z.iso.date().safeParse(value).success &&
        String(value) > form.starts_on) ||
      'invalid',
    parent: (value: unknown) =>
      kind.value === 'academic_years' ||
      z.uuid().safeParse(value).success ||
      'invalid',
    code: (value: unknown) =>
      kind.value !== 'subjects' ||
      z.string().trim().min(1).max(30).safeParse(value).success ||
      'invalid',
  },
});
async function submit() {
  setValues(form);
  if (!(await validate()).valid) {
    error.value = true;
    return;
  }
  busy.value = true;
  error.value = false;
  success.value = false;
  try {
    await saveAcademic(kind.value, editing.value, form);
    reset();
    await load();
    success.value = !error.value;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
async function confirmArchive(row: AcademicRecord) {
  const targetKind = kind.value;
  const alert = await alertController.create({
    header: t('academic.archive'),
    message: t('academic.archiveHelp'),
    buttons: [
      { text: t('academic.cancel'), role: 'cancel' },
      { text: t('academic.archive'), role: 'confirm' },
    ],
  });
  await alert.present();
  if ((await alert.onDidDismiss()).role !== 'confirm') return;
  busy.value = true;
  error.value = false;
  success.value = false;
  try {
    await archiveAcademic(targetKind, row.id);
    reset();
    await load();
    success.value = !error.value;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
onIonViewWillEnter(() => {
  kind.value = route.path.endsWith('/subjects') ? 'subjects' : 'academic_years';
  reset();
  void load();
});
</script>
