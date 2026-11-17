<template>
  <AppLayout :title="t(`pages.${page.key}.title`)"
    ><section class="page-heading">
      <div>
        <p class="eyebrow">{{ t('brand.section') }}</p>
        <h1>{{ t(`pages.${page.key}.title`) }}</h1>
        <p>{{ t(`pages.${page.key}.description`) }}</p>
      </div>
    </section>
    <template v-if="page.kind === 'policy'"
      ><article class="card narrow">
        <p class="policy-copy">
          {{
            t(
              page.key === 'privacy'
                ? 'module.privacyCopy'
                : 'module.communityCopy',
            )
          }}
        </p>
        <RouterLink to="/home">{{ t('module.home') }} →</RouterLink>
      </article></template
    ><template v-else-if="page.kind === 'install'"
      ><section class="card narrow">
        <CiMascot style="width: 140px" />
        <p>
          {{ t(pwa.installed ? 'module.installed' : 'module.installRequired') }}
        </p>
        <h2>Android</h2>
        <p>{{ t('module.android') }}</p>
        <h2>iPhone / iPad</h2>
        <p>{{ t('module.iphone') }}</p>
        <RouterLink v-if="!pwa.needsInstall" to="/home" class="button">{{
          t('module.home')
        }}</RouterLink>
      </section></template
    ><template v-else-if="page.kind === 'splash'"
      ><section class="card narrow">
        <CiMascot style="width: 180px" />
        <h2>{{ t('home.hero') }}</h2>
        <RouterLink class="button" to="/home"
          >{{ t('module.home') }} →</RouterLink
        >
      </section></template
    ><template v-else
      ><section class="card">
        <p>
          {{
            t(page.key === 'forbidden' ? 'module.forbidden' : 'module.notFound')
          }}
        </p>
        <RouterLink to="/home">{{ t('module.home') }}</RouterLink>
      </section></template
    ></AppLayout
  >
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PageDefinition } from '@/router/pages';
import AppLayout from '@/layouts/AppLayout.vue';
import CiMascot from '@/components/common/CiMascot.vue';
import { usePwaStore } from '@/stores/app';
defineProps<{ page: PageDefinition }>();
const { t } = useI18n();
const pwa = usePwaStore();
</script>
