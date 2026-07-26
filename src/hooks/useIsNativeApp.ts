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
      let native = false;
      try {
        const { Capacitor } = await import("@capacitor/core");
        native = Capacitor.isNativePlatform();
      } catch {
        native = false;
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
