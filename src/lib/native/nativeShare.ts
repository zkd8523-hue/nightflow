/**
 * Capacitor 네이티브 앱에서 OS 공유 시트(카톡·메시지·인스타 등) 호출.
 * 웹(브라우저)에서는 지원하지 않으므로 handled:false 반환 → 호출부가 웹용 카카오 JS SDK로 폴백.
 *
 * ⚠️ 이 앱은 server.url로 원격 웹을 로드하는 구조라, @capacitor/share의 JS를 직접 import하면
 *    웹 빌드(Vercel)가 네이티브 전용 패키지를 resolve하려다 실패한다.
 *    → @capacitor/core의 registerPlugin으로 런타임 브릿지(Capacitor.Plugins.Share)만 호출.
 *    (네이티브 앱엔 @capacitor/share가 cap sync로 링크돼 있어 브릿지가 주입됨)
 */
interface SharePlugin {
  share(opts: { title?: string; text?: string; url?: string; dialogTitle?: string }): Promise<unknown>;
}

export async function shareViaNative(opts: {
  title: string;
  text: string;
  url: string;
}): Promise<{ handled: boolean; cancelled: boolean }> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      return { handled: false, cancelled: false };
    }
    const Share = registerPlugin<SharePlugin>("Share");
    await Share.share({
      title: opts.title,
      text: opts.text,
      url: opts.url,
      dialogTitle: "공유하기",
    });
    return { handled: true, cancelled: false };
  } catch (e) {
    // 사용자가 시트를 닫음(취소) → handled:true로 처리해 폴백(링크복사) 안 타게
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel|abort|dismiss/i.test(msg)) {
      return { handled: true, cancelled: true };
    }
    // 그 외 실패(플러그인 미탑재 등) → 폴백 유도
    return { handled: false, cancelled: false };
  }
}
