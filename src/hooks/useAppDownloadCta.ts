"use client";

import { useEffect, useState } from "react";
import { isAndroid, isIOS } from "@/lib/utils/browser";

// 스토어 주소 상수는 서버(라우트 핸들러)에서도 쓰므로 일반 모듈에 둔다 —
// "use client" 파일에서 가져오면 서버에선 문자열이 아니라 클라이언트 참조가 된다.
import { APP_STORE_URL, PLAY_STORE_URL, APP_SMART_LINK } from "@/lib/appStore";
export { APP_STORE_URL, PLAY_STORE_URL, APP_SMART_LINK };

const DISMISS_KEY = "naflAppBannerDismissed";

// 지난달 누적 접속자 수 (MD 대상 사회적 증거). 실측치 — 주기적으로 갱신 필요.
export const MONTHLY_VISITORS_LABEL = "8,000명";

/**
 * 앱 다운로드 문구. 대상별 3단 분기.
 * - MD: 사회적 증거(접속자 규모) + "새 깃발(예비 손님) 알림".
 * - 깃발 꽂은 유저: 내 깃발에 오퍼가 오면 알림으로 받기.
 * - 일반(로그인/비로그인): 간단한 다운로드 권유.
 */
export function getAppCtaCopy({
  isMd,
  hasActiveFlag,
}: {
  isMd: boolean;
  hasActiveFlag: boolean;
}) {
  if (isMd) {
    return {
      title: `지난달 ${MONTHLY_VISITORS_LABEL} 이상이 접속했어요!`,
      subtitle: "다운하고 새 깃발 알림받기",
    };
  }
  if (hasActiveFlag) {
    return {
      title: "나플 앱",
      subtitle: "오퍼가 오면 알림으로 받아볼 수 있어요",
    };
  }
  return {
    title: "앱을 다운로드하세요",
    subtitle: "가장 쉽고 빠른 이용법",
  };
}

export type AppStorePlatform = "android" | "ios" | null;

/**
 * 앱 다운로드 CTA 노출 조건을 한 곳에서 관리.
 *
 * 노출 = 모바일 웹 브라우저(안드로이드 또는 iOS)
 *  - 네이티브 앱(Capacitor) 안에서는 숨김 — 앱 안에서 "앱 받기"는 무의미
 *  - 기기별로 맞는 스토어 링크(storeUrl)를 함께 반환 (스마트 배너 패턴)
 *
 * eligible: 모바일 웹 여부 (푸터 상시 버튼용)
 * platform / storeUrl: 감지된 기기에 맞는 스토어
 * bannerVisible: eligible && 닫지 않음 (하단 플로팅 배너용)
 */
export function useAppDownloadCta() {
  const [eligible, setEligible] = useState(false);
  const [platform, setPlatform] = useState<AppStorePlatform>(null);
  // PC 웹 — 스토어 버튼 대신 휴대폰으로 찍을 QR(nightflow.kr/app)을 보여줄 때 쓴다.
  // 네이티브 판정 실패 시엔 isNative=true로 보수 처리되므로 앱 안에선 절대 true가 안 된다.
  const [isDesktop, setIsDesktop] = useState(false);
  // 기본 닫힘으로 시작해 SSR/초기 렌더 깜빡임 방지
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      // 네이티브 앱이면 무조건 숨김. 판정 실패 시엔 보수적으로 네이티브로 간주한다 —
      // false(웹)로 폴백하면 iOS 앱 안에서 이 판정이 실패할 때 이 배너(Google Play
      // 링크 포함)가 노출될 수 있고, 그게 App Store 심사 반려 사유였다
      // (Guideline 2.3.10, 2026-09-08 — useIsNativeApp.ts와 같은 판단).
      let isNative = true;
      try {
        const { Capacitor } = await import("@capacitor/core");
        isNative = Capacitor.isNativePlatform();
      } catch {
        isNative = true;
      }
      if (!active) return;

      const detected: AppStorePlatform = isNative
        ? null
        : isIOS()
          ? "ios"
          : isAndroid()
            ? "android"
            : null;
      setPlatform(detected);
      setEligible(detected !== null);
      setIsDesktop(!isNative && detected === null);
      if (detected !== null) {
        // '닫기'를 누르면 어디서든(테스트/프로덕션) 영구히 다시 안 뜸.
        setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* localStorage 접근 불가(시크릿 등) 시 무시 */
    }
    setDismissed(true);
  };

  const storeUrl = platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;

  return { eligible, isDesktop, platform, storeUrl, bannerVisible: eligible && !dismissed, dismiss };
}
