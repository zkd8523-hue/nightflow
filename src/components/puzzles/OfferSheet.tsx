"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Check } from "lucide-react";
import type { Puzzle, Club } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { LiquorSelector } from "@/components/md/LiquorSelector";
import { EXTRAS_OPTIONS, LIQUOR_KEYWORDS } from "@/lib/constants/liquor";

interface OfferSheetProps {
  puzzle: Puzzle;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

const TABLE_TYPES = ["Standard", "VIP", "Premium"] as const;

export function OfferSheet({ puzzle, open, onClose, onSubmitted }: OfferSheetProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [activeOffers, setActiveOffers] = useState<number>(0);
  const [myClubs, setMyClubs] = useState<Pick<Club, "id" | "name" | "area">[]>([]);

  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [tableType, setTableType] = useState<"Standard" | "VIP" | "Premium">("Standard");
  const [proposedPrice, setProposedPrice] = useState<string>("");
  const [selectedIncludes, setSelectedIncludes] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  const baseBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  const maxPrice = Math.ceil(baseBudget * 1.3);
  const priceNum = Number(proposedPrice.replace(/,/g, ""));
  const isPremium = priceNum > baseBudget;
  const isPriceValid = priceNum > 0 && priceNum <= maxPrice;

  useEffect(() => {
    if (open) {
      loadMdInfo();
    }
  }, [open]);

  const loadMdInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: userData }, { data: clubs }] = await Promise.all([
      supabase.from("users").select("md_credits, md_active_offers_count").eq("id", user.id).single(),
      supabase.from("clubs").select("id, name, area").eq("md_id", user.id).eq("status", "approved"),
    ]);

    setCredits(userData?.md_credits ?? null);
    setActiveOffers(userData?.md_active_offers_count ?? 0);
    setMyClubs(clubs ?? []);
    if (clubs && clubs.length === 1) {
      setSelectedClubId(clubs[0].id);
    }
  };

  const toggleExtra = (item: string) => {
    setSelectedIncludes((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const liquorItems = selectedIncludes.filter((item) =>
    LIQUOR_KEYWORDS.some((kw) => item.includes(kw))
  );
  const extraItems = selectedIncludes.filter(
    (item) => !LIQUOR_KEYWORDS.some((kw) => item.includes(kw))
  );

  const handleSubmit = async () => {
    if (!selectedClubId) {
      toast.error("클럽을 선택해주세요");
      return;
    }
    if (!priceNum || priceNum <= 0) {
      toast.error("제안 금액을 입력해주세요");
      return;
    }
    if (priceNum > maxPrice) {
      toast.error(`예산의 130%를 초과할 수 없습니다 (최대 ${maxPrice.toLocaleString()}원)`);
      return;
    }
    if (selectedIncludes.length === 0) {
      toast.error("포함 내역을 최소 1개 이상 선택해주세요");
      return;
    }
    if (activeOffers >= 3) {
      toast.error("동시 활성 오퍼는 최대 3건입니다");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("submit_offer", {
        p_puzzle_id: puzzle.id,
        p_club_id: selectedClubId,
        p_table_type: tableType,
        p_proposed_price: priceNum,
        p_includes: selectedIncludes,
        p_comment: comment.trim() || null,
      });

      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error || "제안에 실패했습니다");
        return;
      }

      trackEvent('puzzle_offer_submitted', {
        puzzle_id: puzzle.id,
        proposed_price: priceNum,
        table_type: tableType,
      });

      toast.success("제안서가 전송되었습니다! 방장의 수락을 기다려주세요.");
      onSubmitted?.();
      onClose();
    } catch {
      toast.error("제안에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${m}/${day} ${days[d.getDay()]}`;
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="bottom"
        className="bg-[#1C1C1E] border-t border-neutral-800 rounded-t-3xl px-5 pb-10 max-h-[92vh] overflow-y-auto"
      >
        <SheetHeader className="mb-5">
          <SheetTitle className="text-white text-[17px] font-black text-left">
            MD 제안서 보내기
          </SheetTitle>
          <div className="text-left space-y-0.5">
            <p className="text-[13px] text-neutral-400">
              {formatDate(puzzle.event_date)} {puzzle.area}
            </p>
            <p className="text-[13px] text-neutral-500">
              총 예산 {baseBudget.toLocaleString()}원 · {puzzle.current_count}/{puzzle.target_count}명
            </p>
          </div>
        </SheetHeader>

        {/* 슬롯 & 크레딧 상태 */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3 mb-5 flex justify-between items-center">
          <div>
            <p className="text-[11px] text-neutral-500">활성 오퍼</p>
            <p className="text-[14px] font-black text-white">{activeOffers}/3 슬롯 사용 중</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-neutral-500">크레딧 잔액</p>
            <p className="text-[14px] font-black text-amber-400">
              {credits !== null ? `${credits} 크레딧` : "..."}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* 클럽 선택 */}
          <div className="space-y-2">
            <p className="text-[13px] font-bold text-white">클럽 선택</p>
            {myClubs.length === 0 ? (
              <p className="text-[12px] text-red-400">등록된 클럽이 없습니다. 관리자에게 클럽 등록을 요청해주세요.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {myClubs.map((club) => (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => setSelectedClubId(club.id)}
                    className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${
                      selectedClubId === club.id
                        ? "bg-white text-black"
                        : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-500 hover:text-white"
                    }`}
                  >
                    {club.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 테이블 타입 */}
          <div className="space-y-2">
            <p className="text-[13px] font-bold text-white">테이블 타입</p>
            <div className="flex gap-2">
              {TABLE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTableType(type)}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
                    tableType === type
                      ? "bg-white text-black"
                      : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-500 hover:text-white"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* 제안 금액 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-white">제안 금액 (방장에게만 공개)</p>
              {isPremium && isPriceValid && (
                <span className="text-[11px] text-amber-400 font-bold">+30% 프리미엄</span>
              )}
            </div>
            <Input
              type="text"
              inputMode="numeric"
              value={proposedPrice}
              onChange={(e) => {
                const raw = e.target.value.replace(/,/g, "");
                if (raw === "" || /^\d+$/.test(raw)) {
                  setProposedPrice(raw ? Number(raw).toLocaleString() : "");
                }
              }}
              placeholder={`${baseBudget.toLocaleString()}원`}
              className={`bg-neutral-900 border-neutral-800 h-11 text-white font-bold focus:ring-amber-500 ${
                priceNum > maxPrice ? "border-red-500" : ""
              }`}
            />
            <p className="text-[11px] text-neutral-500">
              프리미엄 한도: {maxPrice.toLocaleString()}원 (+30%)
            </p>
            {priceNum > maxPrice && (
              <p className="text-[12px] text-red-400">예산의 130%를 초과했습니다</p>
            )}
          </div>

          {/* 포함 내역 */}
          <div className="space-y-3">
            <p className="text-[13px] font-bold text-white">포함 내역 <span className="text-neutral-500 font-normal">(방장에게만 공개)</span></p>

            {/* 주류 선택 */}
            <LiquorSelector
              selected={liquorItems}
              onSelect={(liquors) => {
                setSelectedIncludes([...liquors, ...extraItems]);
              }}
            />

            {/* 테이블 구성 */}
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-neutral-400">테이블 구성</p>
              <div className="flex flex-wrap gap-1.5">
                {EXTRAS_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleExtra(item)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold flex items-center gap-1 transition-all ${
                      extraItems.includes(item)
                        ? "bg-green-500 text-black"
                        : "bg-neutral-800 text-neutral-500 border border-neutral-800 hover:border-neutral-600 hover:text-white"
                    }`}
                  >
                    {extraItems.includes(item) && <Check className="w-3 h-3" />}
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* MD 코멘트 */}
          <div className="space-y-2">
            <p className="text-[13px] font-bold text-white">
              MD 코멘트{" "}
              <span className="text-[12px] text-neutral-500 font-normal">(선택, 방장에게만 공개)</span>
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="방장에게 전달할 특별한 메시지를 남겨보세요"
              rows={3}
              maxLength={200}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>

          {/* 수락 시 크레딧 안내 */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <p className="text-[12px] text-amber-400/80 leading-relaxed">
              ✓ 제안 전송은 무료입니다.<br />
              ✓ 방장이 수락하면 <strong className="text-amber-400">30 크레딧</strong>이 차감됩니다.<br />
              ✓ 거절/미선택 시 슬롯이 회복됩니다.
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || myClubs.length === 0 || !isPriceValid || selectedIncludes.length === 0 || activeOffers >= 3}
            className="w-full h-13 bg-white hover:bg-neutral-200 text-black font-black text-[15px] rounded-2xl transition-all active:scale-[0.98]"
          >
            {loading ? "전송 중..." : "제안서 보내기"}
          </Button>

          {activeOffers >= 3 && (
            <p className="text-center text-[12px] text-red-400">
              동시 활성 오퍼가 3건입니다. 기존 오퍼를 철회해야 새로 제안할 수 있습니다.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
