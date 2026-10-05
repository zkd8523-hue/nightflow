"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Link2, Check } from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";

/**
 * 호 공유 줄.
 *
 * 패턴은 ShareSuccessSheet 와 같다 — navigator.share 가 있으면 OS 공유 시트를
 * 띄우고(안드로이드/iOS에서 카카오톡이 거기 들어 있다), 없으면 링크를 복사한다.
 * 웹에서 카카오 SDK 를 직접 부르지 않는 이유는 그쪽이 이미 이 방식이기 때문이다.
 *
 * 카카오는 링크 미리보기를 URL 단위로 캐싱한다. 호마다 주소가 다르므로
 * (/weekly/2026-10-06) 새 호가 옛 미리보기를 물려받는 일은 없다.
 */
export function WeeklyShareRow({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("링크가 복사됐어요");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("링크 복사에 실패했어요");
    }
  };

  const share = async () => {
    trackEvent("weekly_share_click", { url });
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // 사용자가 취소한 경우 — 복사로 떨어뜨리지 않는다
        return;
      }
    }
    await copy();
  };

  return (
    <div className="mt-4 pt-[15px] border-t border-border text-center">
      <p className="text-[12px] text-muted-foreground mb-2.5">
        이 정보를 좋아할만한 친구에게 공유해요
      </p>
      <div className="flex gap-2 justify-center flex-wrap">
        <button
          type="button"
          onClick={share}
          className="font-mono text-[10px] font-bold bg-[#FEE500] text-[#191600] px-3.5 py-2
                     rounded-full inline-flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          카카오톡
        </button>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[10px] font-bold border border-border text-muted-foreground
                     px-3.5 py-2 rounded-full inline-flex items-center gap-1.5
                     active:scale-95 transition-transform"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
          {copied ? "복사됨" : "링크 복사"}
        </button>
      </div>
    </div>
  );
}
