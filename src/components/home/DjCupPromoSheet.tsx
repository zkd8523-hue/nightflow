"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trackEvent } from "@/lib/analytics/events";
import { isInAppBrowser } from "@/lib/utils/browser";

// 노출 1회 기록 키. 문구/이미지가 바뀌어 재노출하고 싶으면 v2로 올린다.
const DJCUP_PROMO_KEY = "nightflow_djcup_promo_v1";

/**
 * DJ 이상형 월드컵 홍보 팝업 (중앙 다이얼로그, 기기당 1회).
 *
 * 배경: 진입점은 이미 셋(홈 배너 + 헤더 메뉴 2곳)인데 실사용 플레이가 0판이었다.
 * 홈 배너가 라인업·혜택·쿠폰·파티 캐러셀 아래라 스크롤해야 보이고 메뉴는 열어야
 * 보인다 — 진입점이 없어서가 아니라 안 보여서 안 쓰는 상태라 한 번 밀어준다.
 *
 * - 비로그인 포함 전원. 제출 RPC가 session_id 기반이라 로그인 없이도 플레이된다.
 * - 히어로는 /og-djcup-mobile.jpg — 홈 배너·OG·시작화면과 같은 그림이라
 *   팝업에서 본 일러스트가 /dj-cup 시작화면에서 그대로 이어진다.
 * - 인앱 브라우저는 InAppBrowserBanner와 겹쳐 메시지가 두 개가 되므로 스킵.
 * - CTA/닫기/× 어느 경로로 나가든 본 것으로 기록한다(CTA로 나갔는데 또 뜨면 안 된다).
 */
export function DjCupPromoSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isInAppBrowser()) return;
    try {
      if (localStorage.getItem(DJCUP_PROMO_KEY) === "1") return;
    } catch {
      // 프라이빗 모드 등 localStorage 차단 — 1회 보장이 불가능하므로 아예 띄우지 않는다
      return;
    }
    setOpen(true);
    trackEvent("djcup_promo_view");
  }, []);

  const markSeen = () => {
    try {
      localStorage.setItem(DJCUP_PROMO_KEY, "1");
    } catch {}
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) markSeen();
  };

  const handleGo = () => {
    trackEvent("djcup_promo_cta");
    markSeen();
    setOpen(false);
    router.push("/dj-cup");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[330px] rounded-3xl bg-card border-border p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">DJ 이상형 월드컵</DialogTitle>
        <DialogDescription className="sr-only">
          국내외 DJ 254명으로 겨루는 이상형 월드컵 안내
        </DialogDescription>

        {/* 홈 배너·OG·시작화면과 동일한 대결 일러스트 (5:3) */}
        <div
          className="w-full aspect-[5/3] bg-[#121214] bg-cover bg-center"
          style={{ backgroundImage: "url('/og-djcup-mobile.jpg')" }}
          aria-hidden="true"
        />

        <div className="px-5 pt-4 pb-5">
          <p className="text-[19px] font-black text-foreground tracking-[-0.03em] leading-[1.3]">
            나랑 취향 찰떡인
            <br />
            DJ는 누구?
          </p>
          <p className="mt-2 text-[13.5px] text-muted-foreground font-medium leading-relaxed break-keep">
            국내, 국외에서 플레이하는{" "}
            <span className="text-foreground font-bold">254명의 DJ!</span> 음악을 들어보고,
            여러분의 취향을 발견해보세요.
          </p>

          <button
            type="button"
            onClick={handleGo}
            className="mt-4 flex items-center justify-center w-full h-12 bg-inverse text-inverse-foreground rounded-2xl font-black text-[15px] active:scale-[0.98] transition-transform"
          >
            DJ이상형 월드컵 시작
          </button>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="mt-1.5 w-full py-2 text-[13px] font-semibold text-muted-foreground"
          >
            다음에 할게요
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
