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
  // ios overscroll bounce 방지는 globals.css의 overscroll-behavior + PullToRefresh JS 처리로 제어
  // (Capacitor config에 native overscroll 직접 옵션 없음 — overScrollEnabled는 Android 전용)
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
