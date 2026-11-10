"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trackEvent } from "@/lib/analytics/events";
import { isInAppBrowser } from "@/lib/utils/browser";

/**
 * 임박한 공연 홍보 팝업 (전역).
 *
 * 홈에만 달면 검색·블로그로 상세페이지에 바로 떨어진 손님을 놓친다. 그래서
 * providers 에 달아 한국어 경로 어디서든 뜨게 한다. 대신 "어디서든"을 그대로
 * 두면 MD·관리자 작업 화면과 예약 폼까지 가려서, 아래 EXCLUDE 로 막는다.
 *
 * 홈 팝업 자리는 하나뿐이라 노출 기간에는 클러빙 뉴스(WeeklyPromoSheet)가 양보한다.
 * HomeContent 에서 주석 처리해 뒀다 — 이 팝업이 끝나면 되살린다.
 *
 * 수명: endAt 이 지나면 컴포넌트가 스스로 null 을 반환한다. 공연 다음 날
 * 아무도 손대지 않아도 저절로 사라진다.
 */

type Promo = {
  /** localStorage 키에 들어간다. 새 공연은 새 슬러그로 — 안 그러면 전에 본 사람에게 안 뜬다. */
  slug: string;
  image: string;
  alt: string;
  /** 팝업 본문 문구 */
  headline: string;
  sub: string;
  ctaLabel: string;
  /**
   * 누르면 갈 곳. ?book=1 이면 클럽 상세에서 예약 폼이 바로 열린다.
   * ?date= 만 주면 폼은 닫힌 채로 두고, 손님이 예약 버튼을 누를 때 날짜만 채운다.
   */
  href: string;
  /** 이 시각(KST)이 지나면 영영 안 뜬다 */
  endAt: string;
};

const PROMO: Promo = {
  slug: "enter-hanyohan-1114",
  image: "/promo-enter-1114-v4.png",
  alt: "2026년 11월 14일 토요일 수원 클럽 엔터 한요한 공연",
  headline: "한요한이 수원에 온다",
  sub: "11/14(토) 클럽 엔터 · 테이블 예약 문의 받습니다",
  ctaLabel: "예약 문의하기",
  // 예약 폼 직행(?book=1)은 뺐다 (2026-11-10). 첫날 클릭 6명이 모두 폼까지 갔지만
  // 5명이 아무것도 안 고르고 나갔다 — 공연이 궁금해서 누른 사람에게 폼부터 들이밀면 샌다.
  // 클럽 상세에서 정보를 보고 스스로 예약 버튼을 누르게 하고, 날짜만 미리 채워 둔다.
  href: "/clubs/7248ece2-8b58-446c-929d-f51f2528a387?date=2026-11-14",
  // 공연 당일 영업이 끝나는 11/15 새벽 6시(KST = UTC+9)까지
  endAt: "2026-11-14T21:00:00Z",
};

const seenKey = (slug: string) => `nightflow_event_promo_${slug}`;

/**
 * 안 띄울 경로.
 * - 외국어 트랙: 수원 공연은 외국인 대상이 아니다
 * - MD·관리자: 작업 화면을 가린다
 * - 예약/문의 흐름: 도착한 사람에게 또 권하는 꼴
 */
const EXCLUDE = [
  "/en", "/ja", "/zh", "/zh-tw",
  "/md", "/admin", "/booking",
  "/login", "/signup", "/auth",
];

function isExcluded(pathname: string): boolean {
  return EXCLUDE.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function EventPromoSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const expired = Date.now() > new Date(PROMO.endAt).getTime();

  useEffect(() => {
    if (expired) return;
    if (!pathname || isExcluded(pathname)) return;
    if (isInAppBrowser()) return;   // InAppBrowserBanner 와 메시지가 겹친다
    try {
      if (localStorage.getItem(seenKey(PROMO.slug)) === "1") return;
    } catch {
      // 프라이빗 모드 등 — 1회 보장이 불가능하므로 띄우지 않는다
      return;
    }
    setOpen(true);
    trackEvent("event_promo_view", { slug: PROMO.slug, path: pathname });
  }, [expired, pathname]);

  if (expired) return null;

  const markSeen = () => {
    try {
      localStorage.setItem(seenKey(PROMO.slug), "1");
    } catch {}
  };

  /**
   * 닫기. via 로 "다음에 볼게요" 버튼(later)과 ×·바깥 탭·뒤로가기(dismiss)를 나눈다.
   * 이게 없으면 "보고 닫음"과 "그냥 페이지를 떠남"이 구분되지 않는다.
   * CTA 는 handleGo 에서 open 을 직접 내려서 여기를 거치지 않는다 — 닫기로 안 잡힌다.
   */
  const handleOpenChange = (v: boolean, via: "later" | "dismiss" = "dismiss") => {
    setOpen(v);
    if (!v) {
      trackEvent("event_promo_dismiss", { slug: PROMO.slug, path: pathname, via });
      markSeen();   // CTA·닫기·× 어느 경로든 본 것으로 기록한다
    }
  };

  const handleGo = () => {
    trackEvent("event_promo_cta", { slug: PROMO.slug, path: pathname });
    markSeen();
    setOpen(false);
    router.push(PROMO.href);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => handleOpenChange(v)}>
      <DialogContent className="max-w-[330px] rounded-3xl bg-card border-border p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">{PROMO.headline}</DialogTitle>
        <DialogDescription className="sr-only">{PROMO.alt}</DialogDescription>

        <div className="relative w-full aspect-[4/5] bg-[#121214]">
          <Image
            src={PROMO.image}
            alt=""
            fill
            sizes="330px"
            className="object-cover"
            priority
          />
        </div>

        {/* 포스터에 공연명·날짜·장소가 다 적혀 있다. 그걸 아래에 또 쓰면 같은 말을 두 번 읽힌다. */}
        <div className="px-5 pt-4 pb-5">
          <button
            type="button"
            onClick={handleGo}
            className="mt-4 flex items-center justify-center w-full h-12 bg-inverse text-inverse-foreground rounded-2xl font-black text-[15px] active:scale-[0.98] transition-transform"
          >
            {PROMO.ctaLabel}
          </button>
          <button
            type="button"
            onClick={() => handleOpenChange(false, "later")}
            className="mt-1.5 w-full py-2 text-[13px] font-semibold text-muted-foreground"
          >
            다음에 볼게요
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
