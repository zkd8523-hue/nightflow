export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Instagram|FBAN|FBAV|Line|KAKAOTALK/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
