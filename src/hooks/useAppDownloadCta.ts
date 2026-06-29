"use client";

import { useEffect, useState } from "react";
import { isAndroid, isIOS } from "@/lib/utils/browser";

// 안드로이드 앱 정식 출시 (공유용 pcampaignid는 제외, 한국어 페이지 고정)
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=kr.nightflow.app&hl=ko";

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

/**
 * 앱 다운로드 CTA 노출 조건을 한 곳에서 관리.
 *
 * 노출 = 안드로이드 기기 && 웹 브라우저 && !iOS
 *  - 네이티브 앱(Capacitor) 안에서는 숨김 — 앱 안에서 "앱 받기"는 무의미
 *  - iOS는 아직 미출시 → 숨김 (Play Store만 노출)
 *
 * eligible: 안드로이드 웹 여부 (푸터 상시 버튼용)
 * bannerVisible: eligible && 닫지 않음 (하단 플로팅 배너용)
 */
export function useAppDownloadCta() {
  const [eligible, setEligible] = useState(false);
  // 기본 닫힘으로 시작해 SSR/초기 렌더 깜빡임 방지
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      // 네이티브 앱이면 무조건 숨김
      let isNative = false;
      try {
        const { Capacitor } = await import("@capacitor/core");
        isNative = Capacitor.isNativePlatform();
      } catch {
        isNative = false;
      }
      if (!active) return;

      const androidWeb = isAndroid() && !isIOS() && !isNative;
      setEligible(androidWeb);
      if (androidWeb) {
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

  return { eligible, bannerVisible: eligible && !dismissed, dismiss };
}
