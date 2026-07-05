export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  // 카카오톡은 카카오 OAuth와 호환되므로 인앱 차단 대상에서 제외
  return /Instagram|FBAN|FBAV|Line/i.test(navigator.userAgent);
}

/**
 * 브라우저 종류 상세 분류. 이탈퍼널 분석용.
 * - instagram: 인스타 인앱 (Kakao OAuth 실패)
 * - facebook: 페북/메신저 인앱
 * - line: 라인 인앱
 * - kakao: 카톡 인앱 (OAuth 호환됨, 정보용)
 * - other: 일반 브라우저
 */
export type BrowserKind = 'instagram' | 'facebook' | 'line' | 'kakao' | 'other';

export function getBrowserKind(): BrowserKind {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/Line/i.test(ua)) return 'line';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  return 'other';
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}
