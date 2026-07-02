"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
import { Check, ChevronDown, X, Lock, ArrowRight, Music } from "lucide-react";
import type { Puzzle, Club, PuzzleOffer } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { LiquorSelector } from "@/components/md/LiquorSelector";
import { EXTRAS_OPTIONS, LIQUOR_KEYWORDS } from "@/lib/constants/liquor";
import { detectContactInfo, describeContactDetection } from "@/lib/utils/contact-detector";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";

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
  const offerChatOn = useOfferChatFlag();
  const [activeOffers, setActiveOffers] = useState<number>(0);
  const [activeOfferList, setActiveOfferList] = useState<{ id: string; puzzle_title: string; table_type: string; proposed_price: number }[]>([]);
  const [showSlotDropdown, setShowSlotDropdown] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [myClubs, setMyClubs] = useState<Pick<Club, "id" | "name" | "area">[]>([]);

  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [selectedIncludes, setSelectedIncludes] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [customExtra, setCustomExtra] = useState<string>("");
  const [showCustomExtraInput, setShowCustomExtraInput] = useState(false);
  // 자주 쓰는 코멘트 프리셋 (계정 단위 DB 저장, 최대 5개) — Migration 347
  const [savedComments, setSavedComments] = useState<{ id: string; content: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("md_comment_presets")
        .select("id, content")
        .order("created_at", { ascending: true });
      const rows = (data as { id: string; content: string }[] | null) ?? [];
      // 빈 content(유령 칩) 제외
      setSavedComments(rows.filter((p) => (p.content ?? "").trim().length > 0));
    })();
    // supabase 인스턴스는 매 렌더 새로 생성될 수 있어 deps에서 제외 (재조회·삭제 레이스 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const saveCurrentComment = async () => {
    const c = comment.trim();
    if (!c) return;
    if (savedComments.some((p) => p.content === c)) { toast("이미 저장된 문장이에요"); return; }
    if (savedComments.length >= 5) { toast.error("최대 5개까지 저장할 수 있어요"); return; }
    const { data, error } = await supabase
      .from("md_comment_presets")
      .insert({ content: c })
      .select("id, content")
      .single();
    if (error || !data) { toast.error("멘트 저장에 실패했어요"); return; }
    setSavedComments((prev) => [...prev, data as { id: string; content: string }]);
    toast.success("자주 쓰는 문장으로 저장했어요");
  };
  const removeSavedComment = async (id: string) => {
    const { error } = await supabase.from("md_comment_presets").delete().eq("id", id);
    if (error) { toast.error("삭제에 실패했어요"); return; }
    setSavedComments((prev) => prev.filter((p) => p.id !== id));
  };

  const baseBudget = puzzle.total_budget ?? (puzzle.budget_per_person * puzzle.target_count);
  const currentBudget = puzzle.current_count === puzzle.target_count
    ? baseBudget
    : Math.round(baseBudget * puzzle.current_count / puzzle.target_count);
  // Migration 358: 조각 매치 크레딧 정액 10, 깃발 15. (DB puzzle_match_credit_cost와 일치)
  const matchCost = puzzle.is_recruiting_party ? 10 : 15;

  useEffect(() => {
    if (open) {
      loadMdInfo();
    }
  }, [open]);

  // 수정 모드 prefill (가격은 항상 currentBudget 고정이라 prefill 불필요)
  useEffect(() => {
    if (open && editingOffer) {
      setSelectedClubId(editingOffer.club_id || "");
      setSelectedIncludes(editingOffer.includes || []);
      setComment(editingOffer.comment || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingOffer?.id]);

  const loadMdInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("md_credits, md_active_offers_count, role")
      .eq("id", user.id)
      .single();

    const isAdminUser = userData?.role === "admin";

    // admin은 모든 활성 클럽 중 선택 가능, MD는 본인 소유 클럽만
    //   Migration 177: MD 분기는 club_partners(N:N) 기반.
    type ClubOption = Pick<Club, "id" | "name" | "area">;
    let clubs: ClubOption[] | null = null;
    if (isAdminUser) {
      const { data } = await supabase
        .from("clubs")
        .select("id, name, area")
        .is("deleted_at", null);
      clubs = data as ClubOption[] | null;
    } else {
      const { data } = await supabase
        .from("clubs")
        .select("id, name, area, club_partners!inner(md_id)")
        .eq("club_partners.md_id", user.id)
        .is("deleted_at", null);
      clubs = data as ClubOption[] | null;
    }

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
      .select("id, notes, area, is_recruiting_party")
      .in("id", puzzleIds);

    const puzzleMap = Object.fromEntries((puzzleData ?? []).map((p) => [p.id, p]));

    const list = offerData.map((o) => ({
      id: o.id,
      table_type: o.table_type,
      proposed_price: o.proposed_price,
      puzzle_title: puzzleMap[o.puzzle_id]?.notes || puzzleMap[o.puzzle_id]?.area || (puzzleMap[o.puzzle_id]?.is_recruiting_party ? "조각" : "깃발"),
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
      toast.success("오퍼가 철회됐습니다.");
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
    if (currentBudget <= 0) {
      toast.error(puzzle.is_recruiting_party ? "예산이 0원인 조각에는 제안할 수 없습니다" : "예산이 0원인 깃발에는 제안할 수 없습니다");
      return;
    }
    if (!puzzle.is_recruiting_party && selectedIncludes.length === 0) {
      toast.error("포함 내역을 최소 1개 이상 선택해주세요");
      return;
    }
    // 조각: 인원·가격 실시간 변동 → 구성 대신 코멘트 필수
    if (puzzle.is_recruiting_party && !comment.trim()) {
      toast.error("코멘트를 입력해주세요");
      return;
    }
    // 식별 정보 검증 (코멘트 + 모든 includes 항목)
    const allInputs = [comment, ...selectedIncludes];
    const allFound = allInputs.flatMap(detectContactInfo);
    if (allFound.length > 0) {
      const label = describeContactDetection(allFound);
      const matches = [...new Set(allFound.map((f) => f.match))].slice(0, 3);
      toast.error(`${label} 입력 불가`, {
        description: matches.map((m) => `'${m}'`).join(", "),
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = editingOffer
        ? await supabase.rpc("update_offer", {
            p_offer_id: editingOffer.id,
            p_club_id: selectedClubId,
            p_proposed_price: currentBudget,
            p_includes: selectedIncludes,
            p_comment: comment.trim() || null,
          })
        : await supabase.rpc("submit_offer", {
            p_puzzle_id: puzzle.id,
            p_club_id: selectedClubId,
            p_table_type: "일반석",
            p_proposed_price: currentBudget,
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
        proposed_price: currentBudget,
      });

      toast.success(editingOffer ? "제안이 수정되었습니다." : "제안서가 전송되었습니다! 방장의 채팅을 기다려주세요!");
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

  const isDirty = selectedIncludes.length > 0 || comment.trim().length > 0;

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
              {editingOffer ? "시크릿오퍼 수정" : "시크릿오퍼"}{puzzle.is_recruiting_party ? " 🧩" : ""}
            </SheetTitle>
            <span className="flex items-center gap-1 text-[10px] text-neutral-400 font-bold flex-shrink-0">
              <Lock className="w-3 h-3" />
              방장에게만 공개돼요
            </span>
          </div>
          {!puzzle.is_recruiting_party && (
            <p className="text-[14px] text-amber-400 font-bold leading-snug mt-0.5 text-left">
              오직 클럽명과 조건만으로 깃발을 따보세요!
            </p>
          )}
          <div className="text-left space-y-0">
            {/* 조각은 인원·가격이 실시간 변동 → 헤더에서 날짜/예산 요약 제거 */}
            {!puzzle.is_recruiting_party && (
              <p className="text-[13px] text-neutral-400">
                {formatDate(puzzle.event_date)} {puzzle.area}
              </p>
            )}
            {!puzzle.is_recruiting_party && (
              <p className="text-[14px] text-neutral-300 font-bold">
                {baseBudget.toLocaleString()}원 <span className="text-[13px] text-neutral-500 font-normal ml-1">· {puzzle.target_count}명</span>
              </p>
            )}
            {(puzzle.music_preference === "hiphop" || puzzle.music_preference === "edm") && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[11px] font-bold">
                <Music className="w-3 h-3" />
                {puzzle.music_preference === "hiphop" ? "힙합" : "EDM"} 선호
              </span>
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
                <p className="text-[14px] font-black text-white">
                  {activeOffers}건 진행 중
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
              <Link
                href="/md/clubs/new"
                onClick={onClose}
                className="inline-flex items-center gap-1 text-[12px] font-bold text-red-400 hover:text-red-300 transition-colors"
              >
                등록된 클럽이 없습니다. 바로 등록하세요
                <ArrowRight className="w-3 h-3" />
              </Link>
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


          {/* 제안 금액 (예산 정가 고정) — 조각(파티원 모집)은 인원에 따라 총액이 변동되므로 숨김 */}
          {!puzzle.is_recruiting_party && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-neutral-500 tracking-wide">제안 금액</p>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl h-11 px-4 flex items-center justify-between">
              <span className="text-white font-bold text-[15px]">
                {currentBudget.toLocaleString()}원
              </span>
              <span className="text-[11px] text-neutral-500 font-bold flex items-center gap-1">
                <Lock className="w-3 h-3" />
                예산 고정
              </span>
            </div>
            <p className="text-[11px] text-neutral-500">
              깃발 예산과 동일한 금액으로만 제안할 수 있어요. 보틀·서비스 구성으로 차별화하세요.
            </p>
          </div>
          )}

          {/* 주류·테이블 구성 — 조각은 인원·가격이 실시간 변동되므로 제거(코멘트만) */}
          {!puzzle.is_recruiting_party && (<>
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
                  placeholder="서비스명만 입력 (전화·SNS 금지)"
                  value={customExtra}
                  onChange={(e) => setCustomExtra(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && customExtra.trim()) {
                      e.preventDefault();
                      const trimmed = customExtra.trim();
                      const found = detectContactInfo(trimmed);
                      if (found.length > 0) {
                        toast.error(`${describeContactDetection(found)} 입력 불가`, {
                          description: `'${found[0].match}'`,
                        });
                        return;
                      }
                      toggleExtra(trimmed);
                      setCustomExtra("");
                      setShowCustomExtraInput(false);
                    }
                  }}
                  className="bg-neutral-900 border-neutral-700 text-white text-[13px] h-9"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = customExtra.trim();
                    if (!trimmed) return;
                    const found = detectContactInfo(trimmed);
                    if (found.length > 0) {
                      toast.error(`${describeContactDetection(found)} 입력 불가`, {
                        description: `'${found[0].match}'`,
                      });
                      return;
                    }
                    toggleExtra(trimmed);
                    setCustomExtra("");
                    setShowCustomExtraInput(false);
                  }}
                  className="px-3 h-9 rounded-xl bg-white text-black text-[12px] font-bold flex-shrink-0"
                >
                  추가
                </button>
              </div>
            )}
          </div>
          </>)}

          {/* MD 코멘트 */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-neutral-500 tracking-wide">
              MD 코멘트 <span className="font-normal">{puzzle.is_recruiting_party ? "(필수)" : "(선택)"}</span>
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="방장에게 전달할 메시지 (전화·카톡·인스타·URL 금지)"
              rows={3}
              maxLength={200}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
            {/* 자주 쓰는 문장 (최대 5개, 기기 저장). 칩 클릭 = 코멘트 채우기 */}
            {(savedComments.length > 0 || comment.trim().length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {savedComments.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-neutral-800 border border-neutral-700 max-w-full">
                    <button
                      type="button"
                      onClick={() => setComment(p.content)}
                      className="text-[12px] text-neutral-300 hover:text-white truncate max-w-[160px] text-left"
                    >
                      {p.content}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSavedComment(p.id)}
                      aria-label="문장 삭제"
                      className="text-neutral-500 hover:text-red-400 shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {comment.trim().length > 0 && !savedComments.some((p) => p.content === comment.trim()) && savedComments.length < 5 && (
                  <button
                    type="button"
                    onClick={saveCurrentComment}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-800 border border-dashed border-neutral-600 text-[12px] font-bold text-neutral-400 hover:text-white hover:border-neutral-400 transition-colors"
                  >
                    + 멘트 저장하기
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 크레딧 안내 */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <p className="text-[12px] text-amber-400/80 leading-relaxed">
              ✓ 제안 전송은 무료입니다.<br />
              {offerChatOn ? (
                <>
                  ✓ 매칭되면 <strong className="text-amber-400">{matchCost} 크레딧</strong> 1회 ({puzzle.is_recruiting_party ? "상담 시작 또는 수락 시" : "대화 첫 답장 또는 수락 시"})<br />
                </>
              ) : (
                <>
                  ✓ 방장이 수락하면 <strong className="text-amber-400">30 크레딧</strong>이 차감됩니다.<br />
                </>
              )}
              ✓ 거절/미선택 시 크레딧은 차감되지 않아요.
            </p>
          </div>

          {credits !== null && credits < (offerChatOn ? matchCost : 30) && (
            <Link
              href="/md/credits"
              className="flex items-center justify-between gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 hover:bg-red-500/15 transition-colors"
            >
              <p className="text-[12px] text-red-400 leading-relaxed">
                {offerChatOn
                  ? `${puzzle.is_recruiting_party ? "상담하려면" : "대화 답장하려면"} 크레딧이 필요해요 (${credits}/${matchCost}). 제안은 지금도 무료로 보낼 수 있어요.`
                  : `크레딧이 부족합니다 (${credits}/30). 충전 후 제안할 수 있어요.`}
              </p>
              <span className="flex items-center gap-0.5 shrink-0 text-[12px] font-black text-amber-400">
                충전 <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          )}

          <Button
            onClick={handleSubmit}
            disabled={loading || myClubs.length === 0 || currentBudget <= 0 || (puzzle.is_recruiting_party ? !comment.trim() : selectedIncludes.length === 0) || (!editingOffer && !offerChatOn && credits !== null && credits < 30)}
            className="w-full h-13 bg-white hover:bg-neutral-200 text-black font-black text-[15px] rounded-2xl transition-all active:scale-[0.98]"
          >
            {loading ? (editingOffer ? "수정 중..." : "전송 중...") : (editingOffer ? "수정 저장" : "제안서 보내기")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
