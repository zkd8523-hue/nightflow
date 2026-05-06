"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";

interface KakaoUrlInputSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
}

export function KakaoUrlInputSheet({ open, onClose, onSubmit }: KakaoUrlInputSheetProps) {
  const [kakaoUrl, setKakaoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!kakaoUrl.startsWith("https://open.kakao.com/o/")) {
      toast.error("올바른 오픈채팅 링크가 아닙니다. (https://open.kakao.com/o/... 형식)");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(kakaoUrl);
      setKakaoUrl("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl bg-[#1C1C1E] border-t border-neutral-800 px-5 pb-10">
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <SheetTitle className="text-white font-black text-[18px]">제안 수락 - 오픈채팅 링크</SheetTitle>
            <SheetDescription className="text-neutral-400 text-[13px] mt-1">
              MD가 연락할 오픈채팅 방 링크를 입력해야 수락이 완료됩니다.
              닫으면 수락이 취소됩니다. (수락한 MD에게만 공개)
            </SheetDescription>
          </div>

          <Input
            type="url"
            value={kakaoUrl}
            onChange={(e) => setKakaoUrl(e.target.value)}
            placeholder="https://open.kakao.com/o/..."
            className="bg-neutral-900 border-neutral-700 h-12 text-white placeholder-neutral-500 focus:border-white"
          />

          <KakaoOpenChatGuide />

          <Button
            onClick={handleSubmit}
            disabled={submitting || !kakaoUrl}
            className="w-full h-14 bg-white text-black font-black text-base rounded-2xl hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            {submitting ? "수락 중..." : "수락 완료"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
