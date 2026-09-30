"use client";

import { useEffect, useState } from "react";

/**
 * Capacitor 네이티브 앱(안드로이드/iOS) 여부.
 * `@capacitor/core`는 동적 import라 초기 렌더에서 값을 못 읽으므로 effect로 세팅한다.
 * (useAppDownloadCta.ts:66-70의 판정 로직을 공용 훅으로 추출)
 *
 * @returns isNative — 네이티브 앱이면 true
 * @returns resolved — 판정이 끝났는지 (false 동안은 아직 미확정)
 */
export function useIsNativeApp() {
  const [isNative, setIsNative] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      let native = true; // 판정 실패 시 보수적으로 네이티브로 간주 — 아래 catch 참고
      try {
        const { Capacitor } = await import("@capacitor/core");
        native = Capacitor.isNativePlatform();
      } catch {
        // Capacitor 로드 자체가 실패한 경우. 예전엔 여기서 false(웹)로 폴백했는데,
        // 그러면 iOS 앱 안에서 이 판정이 실패할 때 "Google Play 받기" 같은 iOS
        // 앱스토어 심사 반려 사유(Guideline 2.3.10, 2026-09-08)로 이어지는 배너들이
        // 그대로 노출될 수 있었다. 실패 시엔 반대로 "네이티브"로 간주해 다운로드
        // CTA를 숨기는 쪽이 안전하다 — 최악의 경우도 "이미 앱 안인데 배너가 안
        // 뜨는" 정도지, "iOS 앱에 타 스토어 링크가 뜨는" 사고보다는 낫다.
        native = true;
      }
      if (!active) return;
      setIsNative(native);
      setResolved(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { isNative, resolved };
}
