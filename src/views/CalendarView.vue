<template>
  <AppLayout :title="t('calendar.title')"
    ><section class="card">
      <h1>{{ t('calendar.title') }}</h1>
      <RouterLink v-if="admin" to="/calendar/events/new">{{
        t('calendar.create')
      }}</RouterLink>
      <div class="controls">
        <button @click="move(-1)">{{ t('feed.previous') }}</button><label
          for="calendar-month"
          >{{ t('calendar.month') }}</label
        ><input id="calendar-month" v-model="month" type="month" /><button
          @click="move(1)"
        >
          {{ t('feed.next') }}</button
        ><label for="calendar-view">{{ t('feed.view') }}</label
        ><select id="calendar-view" v-model="view">
          <option value="month">{{ t('calendar.monthly') }}</option>
          <option value="agenda">{{ t('calendar.agenda') }}</option>
        </select>
      </div>
      <p>{{ t('feed.timezone') }}</p>
      <p v-if="loading" role="status">{{ t('account.loading') }}</p>
      <p v-if="error" role="alert">{{ t('feed.error') }}</p>
      <button v-if="error" @click="load">{{ t('account.retry') }}</button>
      <p v-if="!loading && !rows.length">{{ t('calendar.empty') }}</p>
      <div v-if="view === 'month'" class="month-grid">
        <div v-for="weekday in weekdays" :key="weekday" class="weekday">
          {{ weekday }}
        </div>
        <div
          v-for="blank in blanks"
          :key="`blank-${blank}`"
          aria-hidden="true"
        />
        <section
          v-for="day in days"
          :key="day"
          class="day"
          :aria-label="`${month}-${String(day).padStart(2, '0')}`"
        >
          <h2>{{ day }}</h2>
          <ul>
            <li v-for="item in forDay(day)" :key="item.kind + item.id">
              <RouterLink :to="item.path">{{ item.title }}</RouterLink><small>{{
                t(`calendar.${item.kind}`)
              }}</small>
            </li>
          </ul>
        </section>
      </div>
      <ol v-else class="agenda">
        <li v-for="item in rows" :key="item.kind + item.id">
          <RouterLink :to="item.path">{{ item.title }}</RouterLink>
          <p>
            {{ t(`calendar.${item.kind}`) }} ·
            {{ dateManila(item.starts_at, locale) }}
          </p>
        </li>
      </ol>
    </section></AppLayout
  >
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { onIonViewWillEnter } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth';
import { calendarFeed } from '@/services/modules/calendar';
import { manilaDay, type CalendarItem } from '@/schemas/calendar';
import { dateManila } from '@/services/modules/communication';
const { t, locale } = useI18n(),
  auth = useAuthStore(),
  month = ref(manilaDay(Date.now()).slice(0, 7)),
  view = ref(
    window.matchMedia('(max-width: 600px)').matches ? 'agenda' : 'month',
  ),
  rows = ref<CalendarItem[]>([]),
  loading = ref(true),
  error = ref(false);
const admin = computed(() =>
  ['president', 'vice_president'].includes(auth.profile?.role ?? ''),
);
let revision = 0;
const compactViewport = window.matchMedia('(max-width: 600px)');
function adaptCalendarView(event: MediaQueryListEvent) {
  if (event.matches) view.value = 'agenda';
}
const monthParts = computed(() =>
    (month.value || manilaDay(Date.now()).slice(0, 7)).split('-').map(Number),
  ),
  days = computed(() =>
    new Date(
      Date.UTC(monthParts.value[0]!, monthParts.value[1]!, 0),
    ).getUTCDate(),
  ),
  blanks = computed(() =>
    new Date(
      Date.UTC(monthParts.value[0]!, monthParts.value[1]! - 1, 1),
    ).getUTCDay(),
  ),
  weekdays = computed(() =>
    Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale.value, {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(2026, 10, 1 + i))),
    ),
  );
const forDay = (day: number) => {
  const date = `${month.value}-${String(day).padStart(2, '0')}`;
  return rows.value.filter(
    (r) => manilaDay(r.starts_at) <= date && manilaDay(r.ends_at) >= date,
  );
};
function move(delta: number) {
  month.value = new Date(
    Date.UTC(monthParts.value[0]!, monthParts.value[1]! - 1 + delta, 1),
  )
    .toISOString()
    .slice(0, 7);
}
async function load() {
  const version = ++revision;
  loading.value = true;
  error.value = false;
  try {
    const result = await calendarFeed(month.value);
    if (version === revision) rows.value = result;
  } catch {
    if (version === revision) {
      error.value = true;
      rows.value = [];
    }
  } finally {
    if (version === revision) loading.value = false;
  }
}
onIonViewWillEnter(load);
watch(month, load);
onMounted(() => compactViewport.addEventListener('change', adaptCalendarView));
onBeforeUnmount(() =>
  compactViewport.removeEventListener('change', adaptCalendarView),
);
</script>
<style scoped>
.controls {
  display: grid;
  grid-template-columns: auto auto minmax(10rem, 1fr) auto auto minmax(
      9rem,
      1fr
    );
  gap: 0.5rem;
  align-items: center;
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.25rem;
}
.day {
  min-height: 6rem;
  border: 1px solid var(--border);
  padding: 0.3rem;
  overflow-wrap: anywhere;
}
.day h2 {
  font-size: 1rem;
  margin: 0;
}
.day ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.day li {
  margin-bottom: 0.6rem;
  font-size: 0.8rem;
}
.day small {
  display: block;
}
.weekday {
  text-align: center;
  font-size: 0.8rem;
}
.agenda li {
  margin-block: 1rem;
}
@media (max-width: 800px) {
  .controls {
    grid-template-columns: 1fr 1fr;
  }
  .controls label[for='calendar-month'] {
    order: 0;
    grid-column: 1/-1;
  }
  .controls button:first-child {
    order: 2;
  }
  .controls input {
    order: 1;
    grid-column: 1 / -1;
    min-width: 0;
  }
  .controls button:nth-of-type(2) {
    order: 3;
  }
  .controls label[for='calendar-view'] {
    order: 4;
    grid-column: 1/-1;
  }
  .controls select {
    order: 5;
    grid-column: 1/-1;
  }
}
@media (max-width: 600px) {
  .day {
    min-height: 5rem;
    padding: 0.15rem;
  }
  .day li {
    font-size: 0.7rem;
  }
  .weekday {
    font-size: 0.65rem;
  }
}
</style>
