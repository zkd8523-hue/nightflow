"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, PartyPopper } from "lucide-react";
import { MDContactCard } from "./MDContactCard";
import { CopyAcceptedMessageButton } from "./CopyAcceptedMessageButton";
import type { PublicUserProfile } from "@/types/database";
import { type Lang, makeT } from "@/lib/i18n";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";

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
  /** RPC accept_offer 호출. 성공 시 true, 실패 시 false. */
  onAccept: () => Promise<boolean>;
  lang?: Lang;
}

type Step = "confirm" | "success";

export function OfferAcceptSheet({ open, onClose, md, puzzle, offer, onAccept, lang = "ko" }: OfferAcceptSheetProps) {
  const isForeigner = lang !== "ko";
  const t = makeT(lang);
  const offerChatOn = useOfferChatFlag();
  const [step, setStep] = useState<Step>("confirm");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("confirm");
      setSubmitting(false);
    }
  }, [open]);

  if (!md) return null;

  const handleAccept = async () => {
    const confirmMsg = isForeigner
      ? "Accepting closes and removes all other offers & chats. Match with this offer?"
      : "수락하면 나머지 오퍼와 대화는 모두 사라집니다.\n이 오퍼로 매치할까요?";
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
    setSubmitting(true);
    try {
      const success = await onAccept();
      if (success) setStep("success");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v && !submitting) onClose(); }}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl bg-[#1C1C1E] border-t border-neutral-800 px-5 pb-10 max-h-[90vh] overflow-y-auto"
      >
        {step === "confirm" ? (
          <div className="flex flex-col gap-5 pt-2">
            <div>
              <SheetTitle className="text-white font-black text-[18px] flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                {offerChatOn
                  ? t("즉시 수락하시겠어요?", "Accept now?")
                  : t("제안을 수락하시겠어요?", "Accept this offer?")}
              </SheetTitle>
              <SheetDescription className="text-neutral-400 text-[13px] mt-1.5 leading-relaxed">
                {isForeigner ? (
                  <>Accepting reveals the <strong className="text-white">club host&apos;s name and contact</strong>.</>
                ) : offerChatOn ? (
                  <>채팅으로 먼저 상담해볼 수도 있어요.<br />수락하면 <strong className="text-white">MD의 연락처</strong>를 안내해드려요.</>
                ) : (
                  <>수락하면 <strong className="text-white">MD의 닉네임과 연락처</strong>가 공개됩니다.</>
                )}
              </SheetDescription>
            </div>

            <Button
              onClick={handleAccept}
              disabled={submitting}
              className="w-full h-14 bg-white text-black font-black text-base rounded-2xl hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-600"
            >
              {submitting ? t("수락 중...", "Accepting...") : t("수락하기", "Accept")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            <div>
              <SheetTitle className="text-white font-black text-[20px] flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-amber-400" />
                {t("수락 완료!", "Accepted!")}
              </SheetTitle>
              <SheetDescription className="text-neutral-400 text-[13px] mt-1.5 leading-relaxed whitespace-pre-line">
                {t("아래 버튼으로 메세지 복사하고\n원하는 연락수단에 붙여넣으면 끝!", "Copy the message below and paste it into your preferred contact method.")}
              </SheetDescription>
            </div>

            {/* 복사 버튼 — MD에게 보낼 메시지 원클릭 복사 */}
            {puzzle && (
              <CopyAcceptedMessageButton puzzle={puzzle} offer={offer} lang={lang} />
            )}

            {/* MD 연락 수단 카드 — 수락 직후 공개 */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
                {isForeigner ? `${md.display_name} — contact` : `${md.display_name} MD 연락 수단`}
              </p>
              <MDContactCard md={md} lang={lang} />
            </div>

            <Button
              onClick={onClose}
              className="w-full h-14 bg-white text-black font-black text-base rounded-2xl hover:bg-neutral-200"
            >
              {t("닫기", "Close")}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
