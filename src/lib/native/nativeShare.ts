/**
 * Capacitor 네이티브 앱에서 OS 공유 시트(카톡·메시지·인스타 등) 호출.
 * 웹(브라우저)에서는 지원하지 않으므로 false를 반환 → 호출부가 웹용 카카오 JS SDK로 폴백.
 *
 * 네이티브 WebView에서는 Kakao JS SDK의 sendDefault가 kakaolink:// 스킴을 열지 못해
 * 조용히 먹통이 되므로(특히 iOS), 앱에서는 반드시 이 경로로 공유해야 한다.
 */
export async function shareViaNative(opts: {
  title: string;
  text: string;
  url: string;
}): Promise<{ handled: boolean; cancelled: boolean }> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      return { handled: false, cancelled: false };
    }
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: opts.title,
      text: opts.text,
      url: opts.url,
      dialogTitle: "공유하기",
    });
    return { handled: true, cancelled: false };
  } catch (e) {
    // 사용자가 시트를 닫음(취소) → handled=true로 처리해 폴백(링크복사) 안 타게
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel|abort|dismiss/i.test(msg)) {
      return { handled: true, cancelled: true };
    }
    // 그 외 실패(플러그인 미탑재 등) → 폴백 유도
    return { handled: false, cancelled: false };
  }
}
