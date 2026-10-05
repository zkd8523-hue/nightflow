"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trackEvent } from "@/lib/analytics/events";
import { isInAppBrowser } from "@/lib/utils/browser";
import { WEEKLY_ISSUES } from "@/lib/weekly/issues";

/** 호마다 한 번만 뜬다 — 키에 호 슬러그가 들어간다 */
const seenKey = (slug: string) => `nightflow_weekly_promo_${slug}`;
/** 이미 구독한 사람은 영영 안 띄운다(NewsletterSignup 이 심는 값) */
const SUBSCRIBED_KEY = "nightflow_weekly_subscribed";

/**
 * 클러빙 뉴스 홍보 팝업 (중앙 다이얼로그).
 *
 * DjCupPromoSheet 를 대체한다. 규격(330px·히어로 5:3·라운드 24px·CTA 48px)은
 * 그대로 두고 내용만 바꿨다.
 *
 * ⚠️ 노출 주기가 DJ컵과 다르다. DJ컵은 "기기당 1회"가 맞았다 — 한 번 해보면
 * 끝나는 콘텐츠다. 뉴스레터는 매주 새 호가 나오므로 1호를 안 봤다고 2호까지
 * 영영 안 보여주면 손해다. 그래서 **호마다 1회**로 둔다.
 *
 * 대신 두 가지로 성가심을 막는다:
 *  - 이미 구독한 사람에게는 안 띄운다(메일로 받을 사람에게 또 권할 이유가 없다)
 *  - 한 호당 한 번뿐이라 주 1회를 넘지 않는다
 *
 * 구독을 팝업에서 바로 묻지 않는 이유: 첫 방문자는 우리가 뭘 주는 곳인지
 * 모른다. 한 호를 읽히고 /weekly 본문 하단에서 묻는 쪽이 전환이 높다.
 */
export function WeeklyPromoSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // 최신 호. 발행 전이면 컴포넌트 자체가 렌더되지 않는다.
  const issue = WEEKLY_ISSUES[0];

  useEffect(() => {
    if (!issue) return;
    if (isInAppBrowser()) return;   // InAppBrowserBanner 와 메시지가 겹친다
    try {
      if (localStorage.getItem(SUBSCRIBED_KEY) === "1") return;
      if (localStorage.getItem(seenKey(issue.slug)) === "1") return;
    } catch {
      // 프라이빗 모드 등 localStorage 차단 — 1회 보장이 불가능하므로 띄우지 않는다
      return;
    }
    setOpen(true);
    trackEvent("weekly_promo_view", { slug: issue.slug });
  }, [issue]);

  if (!issue) return null;

  const markSeen = () => {
    try {
      localStorage.setItem(seenKey(issue.slug), "1");
    } catch {}
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) markSeen();   // CTA·닫기·× 어느 경로든 본 것으로 기록한다
  };

  const handleGo = () => {
    trackEvent("weekly_promo_cta", { slug: issue.slug });
    markSeen();
    setOpen(false);
    router.push(`/weekly/${issue.slug}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[330px] rounded-3xl bg-card border-border p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">클러빙 뉴스</DialogTitle>
        <DialogDescription className="sr-only">
          이번 주 클럽·공연·DJ를 정리한 클러빙 뉴스 안내
        </DialogDescription>

        {/* 이번 호 표지 — /weekly 목록·홈 캐러셀과 같은 그림이라 흐름이 이어진다 */}
        <div className="relative w-full aspect-[5/3] bg-[#121214]">
          {issue.coverUrl && (
            <Image
              src={issue.coverUrl}
              alt=""
              fill
              sizes="330px"
              className="object-cover"
              priority
            />
          )}
          <span
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(transparent 36%, rgba(10,10,10,.92) 100%)",
            }}
          />
          <span className="absolute left-[14px] right-[14px] bottom-[11px]">
            <span className="block font-mono text-[8px] font-bold tracking-[0.14em] text-[#DFFF00]">
              {issue.volume}
              {issue.period ? ` · ${issue.period}` : ""}
            </span>
            <span className="block text-[17px] font-black leading-[1.24] tracking-[-0.028em] text-[#FAF9F7] mt-1 whitespace-pre-line">
              {issue.title}
            </span>
          </span>
        </div>

        <div className="px-5 pt-4 pb-5">
          <p className="text-[19px] font-black text-[#DFFF00] tracking-[-0.03em] leading-[1.3]">
            이번 주말,
            <br />
            어디 갈지 정했나요?
          </p>

          <button
            type="button"
            onClick={handleGo}
            className="mt-4 flex items-center justify-center w-full h-12 bg-inverse text-inverse-foreground rounded-2xl font-black text-[15px] active:scale-[0.98] transition-transform"
          >
            이번 주 뉴스 보기
          </button>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="mt-1.5 w-full py-2 text-[13px] font-semibold text-muted-foreground"
          >
            다음에 볼게요
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
