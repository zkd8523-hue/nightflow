import type { CapacitorConfig } from '@capacitor/cli';

// 개발용 로컬 서버 토글: CAP_DEV_URL 환경변수가 있으면 그 주소(PC 로컬 dev)를 로드한다.
//   예) CAP_DEV_URL=http://172.30.1.46:3000 npx cap sync android
// 환경변수 없으면(기본) 프로덕션 nightflow.kr. → 출시 빌드는 절대 로컬로 안 나감.
const DEV_URL = process.env.CAP_DEV_URL;

const config: CapacitorConfig = {
  appId: 'kr.nightflow.app',
  appName: 'NightFlow',
  webDir: 'out',
  server: DEV_URL
    ? {
        url: DEV_URL,
        cleartext: true, // 로컬 http 허용 (개발 전용)
      }
    : {
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
