"use client";

import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";

/**
 * 기능 펜스 — flag가 꺼져 있으면 children을 렌더하지 않는다.
 * 오퍼 채팅 관련 진입점을 감싸는 데 사용. (grep "FeatureGate" 로 일괄 제거 가능)
 */
export function FeatureGate({
  flag,
  children,
  fallback = null,
}: {
  flag: "offer_chat";
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const offerChat = useOfferChatFlag();
  const enabled = flag === "offer_chat" ? offerChat : false;
  // 확정 전(undefined)엔 fallback을 그리지 않는다 — 로딩 찰나에 레거시 문구가
  // 깜빡이는 것을 막고, 확정되면 true→children / false→fallback 으로 정착.
  if (enabled === undefined) return null;
  return <>{enabled ? children : fallback}</>;
}
