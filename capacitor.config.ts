import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sealchat.app',
  appName: 'Seal',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#1A1B1E'
  },
  ios: {
    backgroundColor: '#1A1B1E',
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  }
};

export default config;

