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
import { Check, ChevronDown, X, Lock } from "lucide-react";
import type { Puzzle, Club, PuzzleOffer } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { LiquorSelector } from "@/components/md/LiquorSelector";
import { EXTRAS_OPTIONS, LIQUOR_KEYWORDS } from "@/lib/constants/liquor";

interface OfferSheetProps {
  puzzle: Puzzle;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  /** 수정 모드. 지정 시 update_offer 호출 + 상태 prefill */
  editingOffer?: PuzzleOffer | null;
}

export function OfferSheet({ puzzle, open, onClose, onSubmitted, editingOffer }: OfferSheetProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [activeOffers, setActiveOffers] = useState<number>(0);
  const [activeOfferList, setActiveOfferList] = useState<{ id: string; puzzle_title: string; table_type: string; proposed_price: number }[]>([]);
  const [showSlotDropdown, setShowSlotDropdown] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [myClubs, setMyClubs] = useState<Pick<Club, "id" | "name" | "area">[]>([]);

  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [proposedPrice, setProposedPrice] = useState<string>("");
  const [selectedIncludes, setSelectedIncludes] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [customExtra, setCustomExtra] = useState<string>("");
  const [showCustomExtraInput, setShowCustomExtraInput] = useState(false);

  const baseBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  const perPersonBudget = puzzle.total_budget
    ? Math.floor(puzzle.total_budget / puzzle.target_count)
    : puzzle.budget_per_person;
  const currentBudget = perPersonBudget * puzzle.current_count;
  const maxPrice = Math.ceil(currentBudget * 1.2);
  const priceNum = Number(proposedPrice.replace(/,/g, ""));
  const isPremium = priceNum > currentBudget;
  const isPriceValid = priceNum >= currentBudget && priceNum <= maxPrice;

  useEffect(() => {
    if (open) {
      loadMdInfo();
    }
  }, [open]);

  useEffect(() => {
    if (open && currentBudget > 0 && !proposedPrice) {
      setProposedPrice(currentBudget.toLocaleString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentBudget]);

  // 수정 모드 prefill
  useEffect(() => {
    if (open && editingOffer) {
      setSelectedClubId(editingOffer.club_id || "");
      setProposedPrice(editingOffer.proposed_price.toLocaleString());
      setSelectedIncludes(editingOffer.includes || []);
      setComment(editingOffer.comment || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingOffer?.id]);

  const loadMdInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: userData }, { data: clubs }] = await Promise.all([
      supabase.from("users").select("md_credits, md_active_offers_count").eq("id", user.id).single(),
      supabase.from("clubs").select("id, name, area").eq("md_id", user.id).is("deleted_at", null),
    ]);

    setCredits(userData?.md_credits ?? null);
    setMyClubs(clubs ?? []);
    if (clubs && clubs.length === 1) {
      setSelectedClubId(clubs[0].id);
    }

    const { data: offerData, error: offerError } = await supabase
      .from("puzzle_offers")
      .select("id, table_type, proposed_price, puzzle_id")
      .eq("md_id", user.id)
      .eq("status", "pending");

    if (offerError) {
      console.error("offer load error:", offerError);
      return;
    }

    if (!offerData || offerData.length === 0) {
      setActiveOfferList([]);
      setActiveOffers(0);
      return;
    }

    const puzzleIds = offerData.map((o) => o.puzzle_id);
    const { data: puzzleData } = await supabase
      .from("puzzles")
      .select("id, notes, area")
      .in("id", puzzleIds);

    const puzzleMap = Object.fromEntries((puzzleData ?? []).map((p) => [p.id, p]));

    const list = offerData.map((o) => ({
      id: o.id,
      table_type: o.table_type,
      proposed_price: o.proposed_price,
      puzzle_title: puzzleMap[o.puzzle_id]?.notes || puzzleMap[o.puzzle_id]?.area || "깃발",
    }));

    setActiveOfferList(list);
    setActiveOffers(list.length); // 실제 pending 오퍼 수 기준으로 동기화
  };

  const handleWithdraw = async (offerId: string) => {
    setWithdrawingId(offerId);
    try {
      const { data, error } = await supabase.rpc("withdraw_offer", { p_offer_id: offerId });
      if (error) throw error;
      if (!data?.success) { toast.error(data?.error || "철회에 실패했습니다"); return; }
      toast.success("오퍼가 철회됐습니다. 슬롯이 회복됐습니다.");
      await loadMdInfo();
      setShowSlotDropdown(false);
    } catch {
      toast.error("철회에 실패했습니다");
    } finally {
      setWithdrawingId(null);
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
    if (priceNum < currentBudget) {
      toast.error(`예산 이상으로 제안해주세요 (예산: ${currentBudget.toLocaleString()}원)`);
      return;
    }
    if (priceNum > maxPrice) {
      toast.error(`예산의 120%를 초과할 수 없습니다 (최대 ${maxPrice.toLocaleString()}원)`);
      return;
    }
    if (selectedIncludes.length === 0) {
      toast.error("포함 내역을 최소 1개 이상 선택해주세요");
      return;
    }
    // 수정 모드는 슬롯 카운트 검증 스킵 (이미 차지하고 있는 슬롯)
    if (!editingOffer && activeOffers >= 5) {
      toast.error("동시 활성 오퍼는 최대 5건입니다");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = editingOffer
        ? await supabase.rpc("update_offer", {
            p_offer_id: editingOffer.id,
            p_club_id: selectedClubId,
            p_proposed_price: priceNum,
            p_includes: selectedIncludes,
            p_comment: comment.trim() || null,
          })
        : await supabase.rpc("submit_offer", {
            p_puzzle_id: puzzle.id,
            p_club_id: selectedClubId,
            p_table_type: "일반석",
            p_proposed_price: priceNum,
            p_includes: selectedIncludes,
            p_comment: comment.trim() || null,
          });

      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error || (editingOffer ? "수정에 실패했습니다" : "제안에 실패했습니다"));
        return;
      }

      trackEvent(editingOffer ? 'puzzle_offer_updated' : 'puzzle_offer_submitted', {
        puzzle_id: puzzle.id,
        proposed_price: priceNum,
      });

      toast.success(editingOffer ? "제안이 수정되었습니다." : "제안서가 전송되었습니다! 방장의 수락을 기다려주세요.");
      onSubmitted?.();
      onClose();
    } catch (err: unknown) {
      console.error("submit_offer error:", JSON.stringify(err));
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      toast.error(`제안 실패: ${msg}`);
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

  const initialPrice = currentBudget.toLocaleString();
  const isDirty =
    selectedIncludes.length > 0 ||
    comment.trim().length > 0 ||
    (proposedPrice !== "" && proposedPrice !== initialPrice);

  const confirmClose = () => {
    if (!isDirty) return true;
    return window.confirm("작성 중인 내용이 사라집니다. 닫으시겠습니까?");
  };

  const handleCloseAttempt = () => {
    if (confirmClose()) onClose();
  };

  // 탭 닫기/새로고침 시 네이티브 경고
  useEffect(() => {
    if (!open || !isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [open, isDirty]);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCloseAttempt(); }}>
      <SheetContent
        side="bottom"
        className="bg-[#1C1C1E] border-t border-neutral-800 rounded-t-3xl px-5 pb-10 max-h-[92vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <SheetHeader className="p-0 mb-3">
          <div className="flex items-center gap-2 pr-8">
            <SheetTitle className="text-white text-[17px] font-black text-left">
              {editingOffer ? "시크릿 오퍼 수정" : "시크릿 오퍼"}
            </SheetTitle>
            <span className="flex items-center gap-1 text-[10px] text-neutral-400 font-bold flex-shrink-0">
              <Lock className="w-3 h-3" />
              방장에게만 공개돼요
            </span>
          </div>
          <div className="text-left space-y-0">
            <p className="text-[13px] text-neutral-400">
              {formatDate(puzzle.event_date)} {puzzle.area}
            </p>
            {puzzle.is_recruiting_party ? (
              <p className="text-[13px] text-neutral-500">
                현재 {(perPersonBudget * puzzle.current_count).toLocaleString()}원 / 목표 {baseBudget.toLocaleString()}원 · {puzzle.current_count}/{puzzle.target_count}명
              </p>
            ) : (
              <p className="text-[14px] text-neutral-300 font-bold">
                {baseBudget.toLocaleString()}원 <span className="text-[13px] text-neutral-500 font-normal ml-1">· {puzzle.target_count}명</span>
              </p>
            )}
          </div>
        </SheetHeader>

        {/* 슬롯 & 크레딧 상태 */}
        <div className="mb-4">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-2.5 flex justify-between items-center">
            <button
              type="button"
              onClick={() => activeOffers > 0 && setShowSlotDropdown((v) => !v)}
              className="flex items-center gap-1.5 text-left"
            >
              <div>
                <p className="text-[11px] text-neutral-500">활성 오퍼</p>
                <p className={`text-[14px] font-black ${activeOffers >= 5 ? "text-red-400" : "text-white"}`}>
                  {activeOffers}/5 슬롯 사용 중
                </p>
              </div>
              {activeOffers > 0 && (
                <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${showSlotDropdown ? "rotate-180" : ""}`} />
              )}
            </button>
            <div className="text-right">
              <p className="text-[11px] text-neutral-500">크레딧 잔액</p>
              <p className={`text-[14px] font-black ${credits !== null && credits < 30 ? "text-red-400" : "text-amber-400"}`}>
                {credits !== null ? `${credits} 크레딧` : "..."}
              </p>
            </div>
          </div>

          {/* 활성 오퍼 드롭다운 */}
          {showSlotDropdown && (
            <div className="mt-1 border border-neutral-800 rounded-xl overflow-hidden">
              {activeOfferList.length === 0 && (
                <p className="px-4 py-3 text-[12px] text-neutral-500">활성 오퍼가 없습니다.</p>
              )}
              {activeOfferList.map((offer) => (
                <div key={offer.id} className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/60 last:border-0 bg-neutral-900/40">
                  <div>
                    <p className="text-[13px] font-bold text-white">{offer.puzzle_title}</p>
                    <p className="text-[11px] text-neutral-500">{offer.table_type} · {offer.proposed_price.toLocaleString()}원</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleWithdraw(offer.id)}
                    disabled={withdrawingId === offer.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-bold hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                    {withdrawingId === offer.id ? "철회 중" : "철회"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* 클럽 선택 */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-neutral-500 tracking-wide">클럽 선택</p>
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


          {/* 제안 금액 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-neutral-500 tracking-wide">제안 금액</p>
              {isPremium && isPriceValid && (
                <span className="text-[11px] text-amber-400 font-bold">프리미엄 오퍼 👑</span>
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
              placeholder={`${currentBudget.toLocaleString()}원 (예산)`}
              className={`bg-neutral-900 border-neutral-800 h-11 text-white font-bold focus:ring-amber-500 ${
                priceNum > maxPrice ? "border-red-500" : ""
              }`}
            />
            <p className="text-[11px] text-neutral-500">
              최대 {maxPrice.toLocaleString()}원까지 제안 가능 (프리미엄 오퍼)
            </p>
            {priceNum > 0 && priceNum < currentBudget && (
              <p className="text-[12px] text-red-400">예산 이하로는 제안할 수 없습니다</p>
            )}
            {priceNum > maxPrice && (
              <p className="text-[12px] text-red-400">예산의 120%를 초과했습니다</p>
            )}
          </div>

          {/* 주류 선택 */}
          <LiquorSelector
            selected={liquorItems}
            onSelect={(liquors) => {
              setSelectedIncludes([...liquors, ...extraItems]);
            }}
          />

          {/* 테이블 구성 */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-neutral-500 tracking-wide">테이블 구성</p>
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
              {/* 커스텀 항목 태그 */}
              {extraItems.filter(i => !EXTRAS_OPTIONS.includes(i as typeof EXTRAS_OPTIONS[number])).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleExtra(item)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-bold flex items-center gap-1 bg-green-500 text-black transition-all"
                >
                  <Check className="w-3 h-3" />
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomExtraInput((v) => !v)}
                className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-neutral-800 text-neutral-500 border border-neutral-700 hover:border-neutral-500 hover:text-white transition-all"
              >
                + 직접 입력
              </button>
            </div>
            {showCustomExtraInput && (
              <div className="flex gap-2">
                <Input
                  placeholder="서비스를 직접 입력해보세요"
                  value={customExtra}
                  onChange={(e) => setCustomExtra(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && customExtra.trim()) {
                      e.preventDefault();
                      toggleExtra(customExtra.trim());
                      setCustomExtra("");
                      setShowCustomExtraInput(false);
                    }
                  }}
                  className="bg-neutral-900 border-neutral-700 text-white text-[13px] h-9"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customExtra.trim()) {
                      toggleExtra(customExtra.trim());
                      setCustomExtra("");
                      setShowCustomExtraInput(false);
                    }
                  }}
                  className="px-3 h-9 rounded-xl bg-white text-black text-[12px] font-bold flex-shrink-0"
                >
                  추가
                </button>
              </div>
            )}
          </div>

          {/* MD 코멘트 */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-neutral-500 tracking-wide">
              MD 코멘트 <span className="font-normal">(선택)</span>
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

          {credits !== null && credits < 30 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-[12px] text-red-400 leading-relaxed">
                크레딧이 부족합니다 ({credits}/30). 매일 오전 6시에 자동 충전됩니다.
              </p>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={loading || myClubs.length === 0 || !isPriceValid || selectedIncludes.length === 0 || (!editingOffer && activeOffers >= 5) || (!editingOffer && credits !== null && credits < 30)}
            className="w-full h-13 bg-white hover:bg-neutral-200 text-black font-black text-[15px] rounded-2xl transition-all active:scale-[0.98]"
          >
            {loading ? (editingOffer ? "수정 중..." : "전송 중...") : (editingOffer ? "수정 저장" : "제안서 보내기")}
          </Button>

          {!editingOffer && activeOffers >= 5 && (
            <p className="text-center text-[12px] text-red-400">
              슬롯이 가득 찼습니다. 위에서 오퍼를 철회하고 새로 제안하세요.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
