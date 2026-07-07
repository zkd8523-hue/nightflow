"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppDownloadCta, PLAY_STORE_URL } from "@/hooks/useAppDownloadCta";
import { trackAppDownloadClick } from "@/lib/analytics/events";

const SEEN_KEY = "naflFlagInstallPromptSeen";

/**
 * 깃발 꽂은 직후 1회성 앱설치 팝업.
 * PuzzleForm 생성 성공 시 dispatch되는 "flag-created" 이벤트를 받아 노출.
 * - 안드로이드 웹에서만(인앱·iOS·PC 제외) — useAppDownloadCta.eligible 재사용
 * - 한 번 보면 어디서든(테스트/프로덕션) 다시 안 뜸(localStorage)
 */
export function FlagCreatedInstallSheet() {
  const { eligible } = useAppDownloadCta();
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;
  const [open, setOpen] = useState(false);
  const [isShare, setIsShare] = useState(false); // 조각 등록 여부 (깃발과 문구 분기)

  useEffect(() => {
    const onFlagCreated = (e: Event) => {
      if (!eligibleRef.current) return; // 안드로이드 웹에서만
      // 한 번 보면 어디서든(테스트/프로덕션) 다시 안 뜸.
      if (localStorage.getItem(SEEN_KEY) === "1") return;
      localStorage.setItem(SEEN_KEY, "1");
      const shareMode = !!(e as CustomEvent<{ shareMode?: boolean }>).detail?.shareMode;
      setIsShare(shareMode);
      setOpen(true);
    };
    window.addEventListener("flag-created", onFlagCreated);
    return () => window.removeEventListener("flag-created", onFlagCreated);
  }, []);

  return (
    <Sheet open={open} onOpenChange={(v) => setOpen(v)}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-neutral-800 bg-[#1C1C1E] pb-10"
      >
        <SheetHeader>
          <SheetTitle className="sr-only">앱 설치 안내</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <Image
            src="/app-icon.png"
            alt="나플"
            width={72}
            height={72}
            className="rounded-2xl"
          />
          <div className="space-y-1.5">
            <p className="text-lg font-bold text-white">
              {isShare ? "조각 등록 완료! 🧩" : "깃발이 꽂혔어요! 🚩"}
            </p>
            <p className="text-sm leading-relaxed text-neutral-400">
              {isShare
                ? "파티원·오퍼가 오면 바로 알림으로 받아보세요."
                : "오퍼가 오면 바로 알림으로 받아보세요."}
              <br />
              앱에서 놓치지 않고 확인할 수 있어요.
            </p>
          </div>
          <div className="w-full space-y-2 pt-2">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackAppDownloadClick("flag_created_sheet");
                setOpen(false);
              }}
              className="block w-full rounded-full bg-green-600 py-3.5 text-center text-base font-bold text-white transition-transform active:scale-[0.98]"
            >
              앱 설치하고 알림 받기
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full py-2 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
            >
              다음에
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
