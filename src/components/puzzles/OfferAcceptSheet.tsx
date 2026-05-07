"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, PartyPopper, Check } from "lucide-react";
import { toast } from "sonner";
import { MDContactCard } from "./MDContactCard";
import { CopyAcceptedMessageButton } from "./CopyAcceptedMessageButton";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
import type { PublicUserProfile } from "@/types/database";

type MDInfo = Pick<PublicUserProfile,
  "id" | "display_name" | "profile_image" |
  "instagram" | "phone" | "kakao_open_chat_url" | "preferred_contact_methods"
>;

type PuzzleForCopy = {
  id: string;
  event_date: string;
  area: string;
  target_count: number;
  current_count: number;
  is_recruiting_party: boolean;
};

type OfferForCopy = {
  proposed_price: number;
  includes: string[];
  club?: { name: string } | null;
} | null;

interface OfferAcceptSheetProps {
  open: boolean;
  onClose: () => void;
  md: MDInfo | null;
  puzzle: PuzzleForCopy | null;
  offer: OfferForCopy;
  /** RPC accept_offer 호출. 성공 시 true, 실패 시 false. URL은 항상 null로 호출됨. */
  onAccept: () => Promise<boolean>;
  /** RPC set_puzzle_kakao_url 호출. 성공 시 true, 실패 시 false. */
  onSetKakaoUrl: (url: string) => Promise<boolean>;
}

const KAKAO_URL_PREFIX = "https://open.kakao.com/o/";

type Step = "confirm" | "success";

export function OfferAcceptSheet({ open, onClose, md, puzzle, offer, onAccept, onSetKakaoUrl }: OfferAcceptSheetProps) {
  const [step, setStep] = useState<Step>("confirm");
  const [confirmedNoUndo, setConfirmedNoUndo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // step 2 내부 — 오픈채팅 fallback
  const [showFallback, setShowFallback] = useState(false);
  const [kakaoUrl, setKakaoUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("confirm");
      setConfirmedNoUndo(false);
      setSubmitting(false);
      setShowFallback(false);
      setKakaoUrl("");
      setSavingUrl(false);
      setUrlSaved(false);
    }
  }, [open]);

  if (!md) return null;

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const success = await onAccept();
      if (success) setStep("success");
    } finally {
      setSubmitting(false);
    }
  };

  const isValidKakaoUrl = kakaoUrl.startsWith(KAKAO_URL_PREFIX);

  const handleSaveKakaoUrl = async () => {
    if (!isValidKakaoUrl) {
      toast.error("올바른 오픈채팅 링크를 입력해주세요");
      return;
    }
    setSavingUrl(true);
    try {
      const success = await onSetKakaoUrl(kakaoUrl);
      if (success) setUrlSaved(true);
    } finally {
      setSavingUrl(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v && !submitting && !savingUrl) onClose(); }}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl bg-[#1C1C1E] border-t border-neutral-800 px-5 pb-10 max-h-[90vh] overflow-y-auto"
      >
        {step === "confirm" ? (
          <div className="flex flex-col gap-5 pt-2">
            <div>
              <SheetTitle className="text-white font-black text-[18px] flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                제안을 수락하시겠어요?
              </SheetTitle>
              <SheetDescription className="text-neutral-400 text-[13px] mt-1.5 leading-relaxed">
                수락하면 <strong className="text-white">{md.display_name}</strong> MD의 연락처가 공개되고,
                다른 MD 제안은 자동으로 미선택 처리됩니다.
              </SheetDescription>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <input
                type="checkbox"
                checked={confirmedNoUndo}
                onChange={(e) => setConfirmedNoUndo(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-white"
              />
              <p className="text-[13px] text-neutral-200 leading-relaxed">
                수락 후에는 <strong className="text-white">취소할 수 없음</strong>을 확인했습니다.
              </p>
            </label>

            <Button
              onClick={handleAccept}
              disabled={submitting || !confirmedNoUndo}
              className="w-full h-14 bg-white text-black font-black text-base rounded-2xl hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-600"
            >
              {submitting ? "수락 중..." : "수락하기"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            <div>
              <SheetTitle className="text-white font-black text-[20px] flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-amber-400" />
                수락 완료!
              </SheetTitle>
              <SheetDescription className="text-neutral-400 text-[13px] mt-1.5 leading-relaxed">
                아래 연락 수단 중 편한 것으로 MD에게 직접 연락하세요. 선입금/테이블 배정은 MD와 직접 협의합니다.
              </SheetDescription>
            </div>

            {/* 복사 버튼 — MD에게 보낼 메시지 원클릭 복사 */}
            {puzzle && (
              <CopyAcceptedMessageButton puzzle={puzzle} offer={offer} />
            )}

            {/* MD 연락 수단 카드 — 수락 직후 공개 */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
                {md.display_name} MD 연락 수단
              </p>
              <MDContactCard md={md} />
            </div>

            {/* 오픈채팅 fallback — 수락 후 부가 옵션 */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
              {urlSaved ? (
                <div className="flex items-center gap-2 text-[13px] text-green-400 font-bold">
                  <Check className="w-4 h-4" />
                  오픈채팅 링크가 MD에게 전달되었습니다
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showFallback}
                      onChange={(e) => {
                        setShowFallback(e.target.checked);
                        if (!e.target.checked) setKakaoUrl("");
                      }}
                      className="mt-0.5 w-4 h-4 accent-white"
                    />
                    <div className="flex-1">
                      <p className="text-[13px] font-bold text-white leading-snug">
                        내가 먼저 오픈채팅으로 받을게요
                      </p>
                      <p className="text-[12px] text-neutral-400 mt-0.5 leading-relaxed">
                        내 연락처 노출이 부담스럽다면, 익명 오픈채팅 링크로 MD를 초대하세요.
                      </p>
                    </div>
                  </label>

                  {showFallback && (
                    <div className="space-y-2 pl-7">
                      <Input
                        type="url"
                        value={kakaoUrl}
                        onChange={(e) => setKakaoUrl(e.target.value)}
                        placeholder="https://open.kakao.com/o/..."
                        className="bg-neutral-900 border-neutral-700 h-11 text-white placeholder-neutral-500 focus:border-white text-[13px]"
                      />
                      <KakaoOpenChatGuide />
                      <Button
                        onClick={handleSaveKakaoUrl}
                        disabled={savingUrl || !isValidKakaoUrl}
                        className="w-full h-11 bg-amber-500 text-black font-bold text-[13px] rounded-xl hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-600 mt-1"
                      >
                        {savingUrl ? "전송 중..." : "MD에게 오픈채팅 링크 전달"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            <Button
              onClick={onClose}
              className="w-full h-14 bg-white text-black font-black text-base rounded-2xl hover:bg-neutral-200"
            >
              닫기
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
