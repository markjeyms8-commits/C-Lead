import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';
import { assertPublicEnvironment } from './src/config/publicEnvironment.ts';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode }) => {
  assertPublicEnvironment(loadEnv(mode, process.cwd(), 'VITE_'));
  return {
    plugins: [
      vue(),
      VitePWA({
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'src/workers',
        filename: 'sw.ts',
        manifest: {
          name: 'C-LEAD',
          short_name: 'C-LEAD',
          description: 'Lahat ng ganap, nandito na.',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          theme_color: '#123f32',
          background_color: '#f6f8f4',
          icons: [
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  };
});
