export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  // 카카오톡은 카카오 OAuth와 호환되므로 인앱 차단 대상에서 제외
  return /Instagram|FBAN|FBAV|Line/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
