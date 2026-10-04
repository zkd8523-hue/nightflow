import { BottomNav } from "@/components/layout/BottomNav";
import { GuestSignPromoGate } from "@/components/md/GuestSignPromoGate";
import { CouponOnboardingSheet } from "@/components/md/CouponOnboardingSheet";

// 대시보드(/md/*, /admin/*)에도 하단 네비 노출 — 채팅·홈 등으로 빠르게 이동.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="pb-16">{children}</div>
      <BottomNav />
      <GuestSignPromoGate />
      {/* 파티 가이드 자동 팝업은 2026-10-04 운영자 결정으로 뺐다(직접 여는 ⓘ이용방법만 남김) */}
      <CouponOnboardingSheet />
    </>
  );
}
