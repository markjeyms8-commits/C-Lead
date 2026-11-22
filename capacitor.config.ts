import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clead.sectionc',
  appName: 'C-LEAD',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
};

export default config;
