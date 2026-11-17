<template>
  <AppLayout :title="t('members.title')"
    ><section class="card">
      <h1>{{ t('members.title') }}</h1>
      <RouterLink v-if="admin" to="/administration">{{
        t('members.manage')
      }}</RouterLink>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('members.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <label for="member-search">{{ t('members.search') }}</label><input
        id="member-search"
        v-model="search"
        type="search"
      />
      <label for="member-role">{{ t('account.role') }}</label><select
        id="member-role"
        v-model="role"
      >
        <option value="">{{ t('members.all') }}</option>
        <option v-for="r in roles" :key="r" :value="r">
          {{ t(`roles.${r}`) }}
        </option>
      </select>
      <template v-if="admin"
        ><label for="member-status">{{ t('members.status') }}</label
        ><select id="member-status" v-model="status">
          <option value="">{{ t('members.all') }}</option>
          <option value="active">{{ t('members.active') }}</option>
          <option value="inactive">{{ t('members.inactive') }}</option>
        </select></template
      >
      <p v-if="!loading && !filtered.length">{{ t('members.empty') }}</p>
      <section v-for="group in ['officers', 'students']" :key="group">
        <h2>{{ t(`members.${group}`) }}</h2>
        <ul>
          <li
            v-for="member in filtered.filter((m) =>
              group === 'officers'
                ? m.role !== 'student'
                : m.role === 'student',
            )"
            :key="member.id"
          >
            <InitialsAvatar :name="member.full_name" /><strong>{{
              member.full_name
            }}</strong>
            <p>@{{ member.username }} · {{ t(`roles.${member.role}`) }}</p>
            <p>{{ t('account.studentNumber') }}: {{ member.student_number }}</p>
            <p v-if="admin">
              {{ t(member.active ? 'members.active' : 'members.inactive') }}
            </p>
          </li>
        </ul>
      </section>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { onIonViewWillEnter } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import AppLayout from '@/layouts/AppLayout.vue';
import InitialsAvatar from '@/components/common/InitialsAvatar.vue';
import { memberRoster } from '@/services/modules/administration';
import type { Member } from '@/types/administration';
import { useAuthStore } from '@/stores/auth';
import { can } from '@/utils/permissions';
const { t } = useI18n();
const auth = useAuthStore();
const admin = computed(() => can(auth.profile?.role, 'accounts'));
const roles = [
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'student',
];
const rows = ref<Member[]>([]),
  loading = ref(true),
  error = ref(false),
  search = ref(
    typeof useRoute().query.search === 'string'
      ? String(useRoute().query.search)
      : '',
  ),
  role = ref(''),
  status = ref('');
const filtered = computed(() =>
  rows.value.filter(
    (m) =>
      (!role.value || m.role === role.value) &&
      (!status.value || m.active === (status.value === 'active')) &&
      `${m.full_name} ${m.username}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
async function load() {
  loading.value = true;
  error.value = false;
  try {
    rows.value = await memberRoster();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(load);
</script>
