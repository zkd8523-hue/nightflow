import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.nightflow.app',
  appName: 'NightFlow',
  webDir: 'out',
  server: {
    url: 'https://nightflow.kr',
    cleartext: false,
    allowNavigation: [
      'nightflow.kr',
      '*.nightflow.kr',
      'kauth.kakao.com',
      'kapi.kakao.com',
      'ihqztsakxczzsxfvdkpq.supabase.co',
    ],
  },
  ios: {
    overScrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0A0A0A',
    },
  },
};

export default config;
