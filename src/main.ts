import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';
import { createI18n } from 'vue-i18n';
import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@/styles/global.scss';
import App from './App.vue';
import { router } from './router';
import en from './locales/en.json';
import fil from './locales/fil.json';
const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('language') || 'en',
  fallbackLocale: 'en',
  messages: { en, fil },
});
const app = createApp(App)
  .use(IonicVue)
  .use(createPinia())
  .use(i18n)
  .use(router);
void router.isReady().then(() => app.mount('#app'));
