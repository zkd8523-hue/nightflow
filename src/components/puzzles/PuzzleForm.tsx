"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAIN_AREAS, OTHER_CITIES } from "@/lib/constants/areas";
import { toast } from "sonner";
import { Minus, Plus, MessageCircle, Calendar, MapPin, Coins, Users, Sparkles, ArrowRight, Flag, Check, Puzzle, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeSheet } from "@/components/ui/datetime-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { GenderPref, AgePref, VibePref, MusicPref, Puzzle as PuzzleType } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { useLeaveConfirm } from "@/hooks/useLeaveConfirm";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";

// 빠른 추가 (만원 단위) — 모드별로 다름
const BUDGET_PRESETS_RECRUIT = [100000, 50000, 10000]; // 퍼즐(인당) +10만/+5만/+1만
const BUDGET_PRESETS_FIXED = [500000, 100000, 50000]; // 깃발(총액) +50만/+10만/+5만

// 모집 OFF (인원 확정 깃발): 본인 일행 구성 명세 - 혼성 제거 (남/녀만)
const GENDER_OPTIONS_FIXED: { value: GenderPref; label: string }[] = [
  { value: "male_only", label: "남" },
  { value: "female_only", label: "녀" },
];

// 모집 ON (파티원 모집): 원하는 상대 - 상관없음 포함
const GENDER_OPTIONS_RECRUIT: { value: GenderPref; label: string }[] = [
  { value: "male_only", label: "남" },
  { value: "female_only", label: "녀" },
  { value: "any", label: "상관없음" },
];

const AGE_OPTIONS: { value: AgePref; label: string }[] = [
  { value: "early_20s", label: "20초" },
  { value: "late_20s", label: "20후" },
  { value: "30s", label: "30대" },
  { value: "any", label: "상관없음" },
];

// Phase 1: 바이브 라벨 정정 (조용히 → 편하게, 상관없음 → 누구나 환영)
const VIBE_OPTIONS: { value: VibePref; label: string }[] = [
  { value: "chill", label: "편하게" },
  { value: "active", label: "신나게" },
  { value: "any", label: "누구나 환영" },
];

// Phase 1 신규: 음악 선호 (한국 클럽씬 1차 분기 - 힙합/EDM)
const MUSIC_OPTIONS: { value: MusicPref; label: string }[] = [
  { value: "hiphop", label: "힙합" },
  { value: "edm", label: "EDM" },
  { value: "any", label: "상관없음" },
];

export function PuzzleForm({ userId, puzzle }: { userId: string; puzzle?: PuzzleType }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const isEditMode = !!puzzle;

  // 자동저장 draft 로드 (신규 등록 시에만)
  const DRAFT_KEY = `puzzle_form_draft_${userId}`;
  const draft = (() => {
    if (typeof window === "undefined" || isEditMode) return null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  })();

  // 편집 모드: puzzle에서 초기값 추출. 신규 등록 모드: draft → 기본값 순.
  const initialEventDate = puzzle?.event_date ?? (draft?.eventDate as string) ?? searchParams.get("date") ?? "";
  // 디폴트 모드 = 인원 확정(깃발). 모집(퍼즐/조각) 모드는 매 진입 시 OFF로 시작 (draft 미복원).
  // 지역은 draft 복원 제외 — 매 진입 시 "서울 어디든"으로 리셋해 사용자가 의식적으로 좁히도록 유도.
  const initialArea = puzzle?.area ?? "서울 어디든";
  // budgetAmount 의미: 퍼즐(모집 ON)=인당가 / 깃발(모집 OFF)=총액
  // edit 모드: puzzle에서 모드에 맞춰 변환 / 신규: draft 또는 0
  const initialBudget = puzzle
    ? (puzzle.is_recruiting_party
        ? (puzzle.total_budget && puzzle.target_count > 0
            ? Math.round(puzzle.total_budget / puzzle.target_count)
            : (puzzle.budget_per_person ?? 0))
        : (puzzle.total_budget ?? puzzle.budget_per_person * puzzle.target_count))
    : ((draft?.budgetAmount as number) ?? 0);
  // notes는 draft에 저장하지 않음 — 다시 들어오면 자동 채움이 새로 추천하도록.
  const initialNotes = puzzle?.notes ?? "";
  const initialTotalPeople = puzzle?.target_count ?? (draft?.totalPeople as number) ?? 2;

  const [eventDate, setEventDate] = useState(initialEventDate);
  const [area, setArea] = useState(initialArea);
  // OFF: 총액 직접 입력 / ON: 인당 입력
  const [budgetAmount, setBudgetAmount] = useState(initialBudget);
  const [budgetInputStr, setBudgetInputStr] = useState(initialBudget ? initialBudget.toLocaleString() : "");
  const [isRecruitingParty, setIsRecruitingParty] = useState<boolean>(
    puzzle?.is_recruiting_party ?? false
  );
  // OFF 모드(인원 확정): 본인 포함 총 일행 수
  const [totalPeople, setTotalPeople] = useState(initialTotalPeople);
  // ON 모드(파티원 모집): 목표 인원 + 본인 동행
  const [targetCount, setTargetCount] = useState<number>(
    (puzzle?.is_recruiting_party ? puzzle?.target_count : undefined) ?? (draft?.targetCount as number) ?? 4
  );
  // edit 모드에서 추가 멤버 없으므로 current_count - 1 = 방장 본인의 일행 수
  const initialGuest = puzzle?.is_recruiting_party ? Math.max(0, (puzzle?.current_count ?? 1) - 1) : 0;
  const [hasGuest, setHasGuest] = useState<boolean>(
    puzzle ? initialGuest > 0 : ((draft?.hasGuest as boolean) ?? false)
  );
  const [guestCount, setGuestCount] = useState<number>(
    initialGuest > 0 ? initialGuest : ((draft?.guestCount as number) ?? 1)
  );
  const [genderPref, setGenderPref] = useState<GenderPref>(
    puzzle?.gender_pref ?? (draft?.genderPref as GenderPref) ?? "male_only"
  );
  const [agePref, setAgePref] = useState<AgePref>(
    puzzle?.age_pref ?? (draft?.agePref as AgePref) ?? "any"
  );
  const [vibePref, setVibePref] = useState<VibePref>(
    puzzle?.vibe_pref ?? (draft?.vibePref as VibePref) ?? "any"
  );
  // Phase 1: 음악 선호 (DB nullable, 기본값 'any')
  const [musicPref, setMusicPref] = useState<MusicPref>(
    puzzle?.music_preference ?? (draft?.musicPref as MusicPref) ?? "any"
  );
  // 여성 파티원 모집 시 방장도 여성임을 확인하는 체크박스
  const [leaderFemaleConfirmed, setLeaderFemaleConfirmed] = useState<boolean>(
    (draft?.leaderFemaleConfirmed as boolean) ?? false
  );
  // 오픈채팅 URL — edit 모드면 puzzle에서 복원, 신규 등록은 항상 빈 값으로 시작
  const [kakaoUrl, setKakaoUrl] = useState(puzzle?.kakao_open_chat_url ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [showOtherCities, setShowOtherCities] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  // 퍼즐 소개: 비어 있으면 자동 채움. 사용자가 수동 입력 시 자동 채움 중단.
  // draft에는 저장하지 않으므로 신규 진입 시에는 항상 false에서 시작.
  const [notesEverEdited, setNotesEverEdited] = useState(!!puzzle?.notes);
  const [submitted, setSubmitted] = useState(false);
  // "조각이란?" 용어 풀이 모달
  const [helpOpen, setHelpOpen] = useState(false);

  // 신규: default 대비 변경 / 편집: 초기값 대비 변경
  const isDirty = !submitted && (isEditMode
    ? (
        eventDate !== initialEventDate ||
        area !== initialArea ||
        budgetAmount !== initialBudget ||
        notes.trim() !== initialNotes.trim() ||
        totalPeople !== initialTotalPeople ||
        isRecruitingParty !== (puzzle?.is_recruiting_party ?? false) ||
        targetCount !== (puzzle?.target_count ?? 4) ||
        hasGuest !== (initialGuest > 0) ||
        (hasGuest && guestCount !== initialGuest) ||
        genderPref !== (puzzle?.gender_pref ?? "male_only") ||
        agePref !== (puzzle?.age_pref ?? "any") ||
        vibePref !== (puzzle?.vibe_pref ?? "any") ||
        (musicPref === "any" ? null : musicPref) !== (puzzle?.music_preference ?? null)
        // 카톡 URL은 edit 모드에서 수정 불가 (dirty 체크 제외)
      )
    : (
        eventDate !== "" ||
        area !== "" ||
        budgetAmount !== 0 ||
        notes.trim() !== "" ||
        isRecruitingParty !== false ||
        totalPeople !== 2 ||
        targetCount !== 4 ||
        hasGuest !== false
      ));

  const { showConfirm, setShowConfirm, confirmLeave, cancelLeave } = useLeaveConfirm(isDirty);

  useEffect(() => {
    trackEvent(isEditMode ? 'puzzle_edit_view' : 'puzzle_form_view');
  }, [isEditMode]);

  // 자동 저장 (신규 등록 시에만, 500ms debounce)
  useEffect(() => {
    if (isEditMode || typeof window === "undefined") return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            eventDate,
            area,
            budgetAmount,
            isRecruitingParty,
            totalPeople,
            targetCount,
            hasGuest,
            guestCount,
            genderPref,
            agePref,
            vibePref,
            musicPref,
            leaderFemaleConfirmed,
            // notes, notesEverEdited 제외 — 자동 채움이 매번 새로 추천하도록
            // kakaoUrl 제외 — 매번 새 채팅방을 만들도록 유도
          })
        );
      } catch {
        // localStorage full or disabled — silently ignore
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    isEditMode,
    DRAFT_KEY,
    eventDate,
    area,
    budgetAmount,
    isRecruitingParty,
    totalPeople,
    targetCount,
    hasGuest,
    guestCount,
    genderPref,
    agePref,
    vibePref,
    musicPref,
    leaderFemaleConfirmed,
  ]);

  // 등록 성공 시 draft 삭제
  const clearDraft = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  // 퍼즐 소개 자동 채움: 사용자가 수동 입력하지 않았을 때만
  useEffect(() => {
    if (notesEverEdited) return;
    if (!eventDate || !area) return;
    const d = new Date(eventDate + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const datePart = `${m}/${day}(${days[d.getDay()]})`;
    const headcount = isRecruitingParty ? targetCount : totalPeople;
    // 퍼즐(모집 ON): 인당가 N표기 / 깃발(모집 OFF): 총액 만원 표기
    let pricePart = "";
    if (isRecruitingParty && budgetAmount > 0) {
      pricePart = `, N${Math.round(budgetAmount / 10000)}`;
    } else if (!isRecruitingParty && budgetAmount > 0) {
      pricePart = `, ${Math.round(budgetAmount / 10000)}만`;
    }
    setNotes(`${datePart} ${area} ${headcount}명${pricePart}`);
  }, [eventDate, area, isRecruitingParty, targetCount, totalPeople, budgetAmount, notesEverEdited]);

  // "서울 어디든" 선택 시 파티원 모집 강제 OFF (지역 미정 상태에서 합류 결정 불가)
  const handleAreaChange = (newArea: string) => {
    setArea(newArea);
    if (newArea === "서울 어디든" && isRecruitingParty) {
      setIsRecruitingParty(false);
      toast.info('"서울 어디든"은 파티원 모집을 사용할 수 없어요');
    }
  };

  const fail = (error_type: string, error_message: string) => {
    trackEvent('puzzle_validation_error', { error_type, error_message });
    toast.error(error_message);
  };

  const todayObj = new Date();
  const today = todayObj.toISOString().split("T")[0];
  const maxObj = new Date();
  maxObj.setDate(todayObj.getDate() + 30);
  const maxDateStr = maxObj.toISOString().split("T")[0];

  // 모드별 인원/예산 파생값
  const effectiveTargetCount = isRecruitingParty ? targetCount : totalPeople;
  const effectiveGuestCount = isRecruitingParty ? (hasGuest ? guestCount : 0) : Math.max(0, totalPeople - 1);
  const effectiveCurrentCount = isRecruitingParty ? 1 + effectiveGuestCount : totalPeople;
  // OFF: budgetAmount = 총액, ON: budgetAmount = 인당
  const totalBudget = isRecruitingParty ? budgetAmount * effectiveTargetCount : budgetAmount;

  // offer_deadline: 오퍼 마감 오후 3시 KST (06:00 UTC)
  // expires_at: 유저 검토 마감 오후 4시 30분 KST (07:30 UTC)
  const getOfferDeadline = (date: string) => `${date}T06:00:00.000Z`;
  const getExpiresAt = (date: string) => `${date}T07:30:00.000Z`;

  const formatWon = (n: number) =>
    n >= 10000 ? `${Math.round(n / 10000)}만원` : `${n.toLocaleString()}원`;

  const suggestedChatTitle = (() => {
    const mmdd = eventDate ? eventDate.split("-").slice(1).join("/") : "";
    const base = `[NF] ${area || "지역미상"} ${mmdd}`;
    if (!isRecruitingParty) {
      const budget = totalBudget > 0 ? `·${formatWon(totalBudget)}` : "";
      return `${base} | ${totalPeople}인${budget}`;
    } else {
      const perPerson = budgetAmount > 0 ? `·인당${formatWon(budgetAmount)}` : "";
      return `${base} | 파티원 ${targetCount}인${perPerson}`;
    }
  })();

  const handleSubmit = async () => {
    // "서울 어디든"은 파티원 모집 불가 — UI에서 막지만 안전망으로 한 번 더 강제
    const effectiveIsRecruiting = area === "서울 어디든" ? false : isRecruitingParty;

    trackEvent('puzzle_submit_attempt', {
      is_recruiting_party: effectiveIsRecruiting,
      area: area || null,
      total_budget: totalBudget,
    });

    if (!notes.trim()) {
      return fail('title', '어떤 모임인지 한 줄로 표현해주세요');
    }
    if (!eventDate) {
      return fail('date', '날짜를 선택해주세요');
    }
    if (!area) {
      return fail('area', '지역을 선택해주세요');
    }
    if (effectiveIsRecruiting && budgetAmount < 10000) {
      return fail('budget_per_person', '인당 예산은 최소 1만원 이상이어야 합니다');
    }
    // 카톡 오픈채팅 검증은 신규 등록 + 파티원 모집 모드일 때만 적용.
    // 인원 확정 깃발(effectiveIsRecruiting=false)은 카톡 URL을 사용하지 않으므로 검증 생략.
    if (!isEditMode && effectiveIsRecruiting) {
      if (!kakaoUrl.trim()) {
        return fail('kakao_url_required', '파티원 모집은 카톡 오픈채팅 링크가 필수예요');
      }
      if (!kakaoUrl.trim().startsWith('https://open.kakao.com/')) {
        return fail('kakao_url', '카톡 오픈채팅 링크는 https://open.kakao.com/ 로 시작해야 합니다');
      }
    }
    if (!effectiveIsRecruiting && budgetAmount < 10000 * totalPeople) {
      return fail('budget_total', `${totalPeople}명 기준 최소 ${(10000 * totalPeople).toLocaleString()}원 이상이어야 합니다`);
    }
    if (effectiveIsRecruiting && effectiveCurrentCount > effectiveTargetCount) {
      return fail('headcount_overflow', '일행 인원이 모집 인원을 초과합니다');
    }
    if (!effectiveIsRecruiting && totalPeople < 2) {
      return fail('headcount_min', '인원 확정 깃발은 2명 이상이어야 합니다');
    }

    setSubmitting(true);
    try {
      if (isEditMode && puzzle) {
        const isEventDateChanged = eventDate !== puzzle.event_date;
        const { error: updateError } = await supabase
          .from("puzzles")
          .update({
            area,
            event_date: eventDate,
            is_recruiting_party: effectiveIsRecruiting,
            gender_pref: effectiveIsRecruiting ? genderPref : 'any',
            age_pref: effectiveIsRecruiting ? agePref : 'any',
            vibe_pref: effectiveIsRecruiting ? vibePref : 'any',
            music_preference: musicPref === 'any' ? null : musicPref,
            // 카톡 오픈채팅: edit 모드에선 직접 수정 X. 단, 깃발(파티원 모집 OFF)로 전환되면
            // 카톡 URL은 더 이상 사용되지 않으므로 null로 정리 (데이터 정합성).
            ...(effectiveIsRecruiting ? {} : { kakao_open_chat_url: null }),
            total_budget: totalBudget,
            budget_per_person: effectiveIsRecruiting
              ? budgetAmount
              : Math.round(budgetAmount / totalPeople),
            target_count: effectiveTargetCount,
            current_count: effectiveCurrentCount,
            notes: notes.trim() || null,
            // 날짜 변경 시에만 마감 시각 갱신. 미변경 시 기존 깃발(자정 마감 등) 보호.
            ...(isEventDateChanged ? {
              offer_deadline: getOfferDeadline(eventDate),
              expires_at: getExpiresAt(eventDate),
            } : {}),
          })
          .eq("id", puzzle.id)
          .eq("leader_id", userId);

        if (updateError) {
          console.error("puzzles update error:", updateError);
          return fail('db_error', updateError.message || '수정에 실패했습니다');
        }

        // 대표자의 puzzle_members.guest_count를 새 인원에 맞춰 동기화
        await supabase
          .from("puzzle_members")
          .update({ guest_count: effectiveGuestCount })
          .eq("puzzle_id", puzzle.id)
          .eq("user_id", userId);

        trackEvent('puzzle_updated', {
          puzzle_id: puzzle.id,
          area,
          total_budget: totalBudget,
          target_count: effectiveTargetCount,
        });

        toast.success("퍼즐이 수정되었어요");
        clearDraft();
        setSubmitted(true);
        router.push(`/flags/${puzzle.id}`);
        router.refresh();
        return;
      }

      const { data: created, error: puzzleError } = await supabase
        .from("puzzles")
        .insert({
          leader_id: userId,
          area,
          event_date: eventDate,
          gender_pref: effectiveIsRecruiting ? genderPref : 'any',
          age_pref: effectiveIsRecruiting ? agePref : 'any',
          vibe_pref: effectiveIsRecruiting ? vibePref : 'any',
          music_preference: musicPref === 'any' ? null : musicPref,
          kakao_open_chat_url: effectiveIsRecruiting ? (kakaoUrl.trim() || null) : null,
          total_budget: totalBudget,
          budget_per_person: effectiveIsRecruiting
            ? budgetAmount
            : Math.round(budgetAmount / totalPeople), // 하위 호환용
          target_count: effectiveTargetCount,
          current_count: effectiveCurrentCount,
          is_recruiting_party: effectiveIsRecruiting,
          notes: notes.trim() || null,
          offer_deadline: getOfferDeadline(eventDate),
          expires_at: getExpiresAt(eventDate),
        })
        .select("id")
        .single();

      if (puzzleError) {
        console.error("puzzles insert error:", puzzleError);
        return fail('db_error', puzzleError.message || '퍼즐 등록에 실패했습니다');
      }

      // 대표자를 puzzle_members에도 추가 (fire-and-forget — 네비게이션 블로킹 X)
      supabase
        .from("puzzle_members")
        .insert({
          puzzle_id: created.id,
          user_id: userId,
          guest_count: effectiveGuestCount,
        })
        .then(({ error: memberError }) => {
          if (memberError) console.error("puzzle_members insert error:", memberError);
        });

      trackEvent('puzzle_created', {
        puzzle_id: created.id,
        area,
        total_budget: totalBudget,
        target_count: effectiveTargetCount,
      });

      toast.success(
        effectiveIsRecruiting
          ? "퍼즐이 올라갔어요! 당일 오후 3시까지 파티원·MD 모집, 이후 90분간 검토할 수 있어요 🧩"
          : "깃발이 올라갔어요! 당일 오후 3시까지 오퍼 받고, 이후 90분간 검토할 수 있어요 🚩"
      );
      clearDraft();
      setSubmitted(true); // 이탈 가드 해제
      router.push(`/flags/${created.id}`);
    } catch (err) {
      console.error("puzzle submit error:", err);
      toast.error(err instanceof Error ? err.message : (isEditMode ? "수정에 실패했습니다" : "등록에 실패했습니다"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Phase 1: 파티원 모집 옵트인 (디폴트: OFF=깃발 / ON=퍼즐) */}
      {!isEditMode && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-white font-bold mb-2">
            <Puzzle className="w-4 h-4 text-green-500" />
            <span>조각을 모으시겠어요?</span>
            <button
              type="button"
              role="switch"
              aria-checked={isRecruitingParty}
              aria-label="파티원 모집 토글"
              onClick={() => {
                const next = !isRecruitingParty;
                if (next) {
                  // 깃발 → 퍼즐: 예산 의미 변경(총액→인당)으로 값 초기화
                  setBudgetAmount(0);
                  setBudgetInputStr("");
                  // 퍼즐 모드에선 "서울 어디든" 불가
                  if (area === "서울 어디든") setArea("");
                } else {
                  // 퍼즐 → 깃발: 예산 의미 변경(인당→총액)으로 값 초기화
                  setBudgetAmount(0);
                  setBudgetInputStr("");
                  // 깃발 모드에선 카톡 오픈채팅 미사용
                  setKakaoUrl("");
                  // 깃발 모드 디폴트 지역
                  if (!area) setArea("서울 어디든");
                }
                setIsRecruitingParty(next);
              }}
              className={`relative ml-1 w-11 h-6 rounded-full p-0 transition-colors flex-shrink-0 ${
                isRecruitingParty ? "bg-green-500" : "bg-neutral-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  isRecruitingParty ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="ml-auto flex items-center gap-1 text-[11px] text-neutral-400 font-medium underline underline-offset-2 hover:text-white transition-colors"
            >
              <HelpCircle className="w-3 h-3" />
              조각이란?
            </button>
          </div>
          {isRecruitingParty && (
            <div className="p-4 rounded-2xl bg-[#1C1C1E] border border-neutral-800">
              <p className="text-[13px] text-neutral-300 leading-snug">
                파티원이 다 모이면 자동으로 오퍼가 들어오기 시작해요.
              </p>
            </div>
          )}

          {helpOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setHelpOpen(false)}
            >
              <div className="absolute inset-0 bg-black/70" />
              <div
                className="relative w-full max-w-sm bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4 text-[13px] text-neutral-300 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-white text-[15px]">🧩 조각이란?</p>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="text-neutral-500 hover:text-white transition-colors"
                    aria-label="닫기"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="font-bold text-white leading-relaxed">
                  조각 = 일행의 빈 자리
                </p>
                <p className="leading-relaxed">
                  예) 친구랑 둘이서 4명 테이블에 가고 싶을 때,
                  <br />
                  빈 자리 2개가 &quot;조각&quot;이에요.
                </p>
                <div className="pt-3 border-t border-neutral-800 space-y-2">
                  <p className="leading-relaxed">
                    체크하면 다른 유저가 그룹에 참여해요.
                    <br />
                    총 금액을 더 모아, <span className="text-amber-400 font-bold">더 멋진 테이블</span>을 노려볼 수 있어요.
                  </p>
                  <p className="leading-relaxed">
                    인원이 다 차면 자동으로 깃발이 되어,
                    <br />
                    오퍼를 받기 시작해요.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 방문희망날짜 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Calendar className="w-4 h-4 text-green-500" />
          <span>방문희망날짜</span>
        </div>
        <DateTimeSheet
          mode="date-only"
          value={eventDate}
          min={today}
          max={maxDateStr}
          onChange={(val) => setEventDate(val)}
          label="날짜 선택"
          placeholder="최대 30일 뒤까지 선택 가능"
        />
      </section>

      {/* 지역 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <MapPin className="w-4 h-4 text-green-500" />
          <span>지역</span>
        </div>
        <div>
          <div className="flex flex-wrap gap-2">
            {!isRecruitingParty && (
              <button
                type="button"
                onClick={() => handleAreaChange("서울 어디든")}
                className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all ${
                  area === "서울 어디든"
                    ? "bg-white text-black"
                    : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                서울 어디든 🔥
              </button>
            )}
            {MAIN_AREAS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => handleAreaChange(a)}
                className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all ${
                  area === a
                    ? "bg-white text-black"
                    : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                {a}
              </button>
            ))}
            {OTHER_CITIES.includes(area as typeof OTHER_CITIES[number]) && (
              <button
                type="button"
                onClick={() => setShowOtherCities(true)}
                className="px-4 py-2 rounded-full text-[13px] font-bold bg-white text-black"
              >
                {area}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowOtherCities((v) => !v)}
              className={`px-4 py-2 rounded-full text-[13px] font-bold transition-colors ${
                showOtherCities
                  ? "bg-neutral-600 text-white"
                  : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              {showOtherCities ? "접기" : "+ 다른 지역"}
            </button>
          </div>
          {showOtherCities && (
            <div className="flex flex-wrap gap-2 pt-3 mt-3 border-t border-neutral-800">
              {OTHER_CITIES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => { handleAreaChange(a); setShowOtherCities(false); }}
                  className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all ${
                    area === a
                      ? "bg-white text-black"
                      : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        {area === "서울 어디든" && (
          <p className="text-[12px] text-amber-400/80 leading-relaxed px-1">
            어떤 장소에서, 어떤 사람들을 만날까요?
            <br />
            알 수 없어서 더 설레요.
          </p>
        )}
        </div>
      </section>

      {/* 인원 설정 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Users className="w-4 h-4 text-green-500" />
          <span>인원 설정</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
          {!isRecruitingParty ? (
            <div className="space-y-2">
              <p className="text-[11px] text-neutral-400">총 일행 수 (본인 포함)</p>
              <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 h-11 rounded-lg px-4">
                <button
                  type="button"
                  onClick={() => setTotalPeople(Math.max(2, totalPeople - 1))}
                  className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5 text-white" />
                </button>
                <span className="text-[15px] font-black text-white">{totalPeople}명</span>
                <button
                  type="button"
                  onClick={() => setTotalPeople(Math.min(6, totalPeople + 1))}
                  className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 파티원 성별 */}
              <div className="space-y-2">
                <p className="text-[11px] text-neutral-400">파티원 성별</p>
                <div className="flex gap-2">
                  {GENDER_OPTIONS_RECRUIT.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGenderPref(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                        genderPref === opt.value
                          ? "bg-white text-black"
                          : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {genderPref === "female_only" && (
                  <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                    <span className="text-[12px] font-bold text-white">
                      💜 방장님도 여성이신가요?
                    </span>
                    <input
                      type="checkbox"
                      checked={leaderFemaleConfirmed}
                      onChange={(e) => setLeaderFemaleConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded accent-pink-400"
                    />
                  </label>
                )}
              </div>

              {/* 목표 인원 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-neutral-400">목표 인원 (본인 포함)</p>
                  <p className="text-[11px] text-neutral-500">최소 2명, 최대 6명</p>
                </div>
                <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 h-11 rounded-lg px-4">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(2, targetCount - 1);
                      setTargetCount(next);
                      if (hasGuest) setGuestCount((g) => Math.min(g, next - 1));
                    }}
                    className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5 text-white" />
                  </button>
                  <span className="text-[15px] font-black text-white">{targetCount}명</span>
                  <button
                    type="button"
                    onClick={() => setTargetCount(Math.min(6, targetCount + 1))}
                    className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              </div>

              {/* 동행 일행 */}
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-[13px] font-bold text-white">이미 일행이 있나요?</span>
                  <input
                    type="checkbox"
                    checked={hasGuest}
                    onChange={(e) => {
                      setHasGuest(e.target.checked);
                      if (!e.target.checked) setGuestCount(1);
                    }}
                    className="w-4 h-4 rounded accent-white"
                  />
                </label>
                  {hasGuest && (
                    <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 h-11 rounded-lg px-4">
                      <button
                        type="button"
                        onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                        className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5 text-white" />
                      </button>
                      <span className="text-[15px] font-black text-white">일행 {guestCount}명</span>
                      <button
                        type="button"
                        onClick={() => setGuestCount(Math.min(targetCount - 1, guestCount + 1))}
                        className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  )}
              </div>

              {/* 모집 요약 안내 (일행이 있을 때만 표시) */}
              {hasGuest && effectiveTargetCount - effectiveCurrentCount > 0 && (
                <p className="text-[12px] text-green-400 font-bold">
                  🧩 총 {effectiveTargetCount - effectiveCurrentCount}명의 파티원을 구해요
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* 예산 (모드에 따라 총액 or 인당) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Coins className="w-4 h-4 text-amber-500" />
          <span>{isRecruitingParty ? "인당 예산" : "총 예산"}</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
          <div className="relative">
            <Input
              type="text"
              inputMode="numeric"
              value={budgetInputStr}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                if (raw === "") { setBudgetAmount(0); setBudgetInputStr(""); return; }
                const num = Number(raw);
                if (!isNaN(num)) {
                  setBudgetAmount(num);
                  setBudgetInputStr(num.toLocaleString());
                }
              }}
              onBlur={() => {
                if (budgetAmount > 0) setBudgetInputStr(budgetAmount.toLocaleString());
              }}
              placeholder={isRecruitingParty ? "예) 250,000" : "예) 1,000,000"}
              className="bg-neutral-900 border-neutral-800 h-11 text-white font-bold focus:ring-amber-500 pr-12"
            />
            {isRecruitingParty && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-neutral-500 font-bold pointer-events-none">
                /인
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(isRecruitingParty ? BUDGET_PRESETS_RECRUIT : BUDGET_PRESETS_FIXED).map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = (budgetAmount || 0) + preset;
                  setBudgetAmount(next);
                  setBudgetInputStr(next.toLocaleString());
                }}
                className="h-10 px-0 bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-amber-500/50 font-bold text-[13px]"
              >
                +{(preset / 10000).toFixed(0)}만
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setBudgetAmount(0); setBudgetInputStr(""); }}
              className="h-10 px-0 bg-neutral-900 border-neutral-700 text-neutral-500 hover:bg-neutral-800 hover:text-white hover:border-red-500/50 font-bold text-[13px]"
            >
              초기화
            </Button>
          </div>
          {/* 예산 요약 — 박스 없이 인라인 */}
          {isRecruitingParty && (
            <p className="text-[13px] font-bold text-white">
              인당 <span className="text-amber-400">{budgetAmount.toLocaleString()}원</span>
              {" "}× {effectiveTargetCount}명 = 총{" "}
              <span className="text-green-400">{totalBudget.toLocaleString()}원</span>
            </p>
          )}
          <p className="text-[12px] text-neutral-400">
            MD가 이 예산에 맞춰 보틀·서비스를 구성해요
          </p>
        </div>
      </section>

      {/* 취향 태그 — 파티원 모집 중일 때만 */}
      {isRecruitingParty && <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Sparkles className="w-4 h-4 text-green-500" />
          <span>이런 분들과 함께해요</span>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl px-4 py-3 space-y-2.5">
          <div className="flex items-center gap-3">
            <p className="text-[11px] text-neutral-400 w-8 shrink-0">연령</p>
            <div className="flex gap-1.5 flex-wrap">
              {AGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAgePref(opt.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                    agePref === opt.value
                      ? "bg-white text-black"
                      : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-[11px] text-neutral-400 w-8 shrink-0">음악</p>
            <div className="flex gap-1.5 flex-wrap">
              {MUSIC_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMusicPref(opt.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                    musicPref === opt.value
                      ? "bg-white text-black"
                      : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-[11px] text-neutral-400 w-8 shrink-0">바이브</p>
            <div className="flex gap-1.5 flex-wrap">
              {VIBE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVibePref(opt.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                    vibePref === opt.value
                      ? "bg-white text-black"
                      : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>}

      {/* 팀 소개 (한 줄 메모) */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-2 text-white font-bold mb-2">
          <MessageCircle className="w-4 h-4 text-purple-500 self-center" />
          <span>{isRecruitingParty ? "퍼즐 소개" : "MD에게 한마디"}</span>
          <span className="text-[11px] text-neutral-500 font-normal">
            {isRecruitingParty ? "참여자와 MD가 가장 먼저 읽어요" : "MD가 매물 제안할 때 참고해요"}
          </span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4">
          <Input
            type="text"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              // 한 번이라도 사용자가 손대면 자동 채움 중단 (비워도 재생되지 않음)
              setNotesEverEdited(true);
            }}
            placeholder={isRecruitingParty
              ? "예) 매너 좋으신 분만. 신나게 놀 분."
              : "예) 4명, 메인테이블 원해요"}
            className="bg-neutral-900 border-neutral-800 h-12 text-[14px] font-bold text-white focus:ring-amber-500 placeholder:text-neutral-600 placeholder:font-normal"
            maxLength={25}
          />
        </div>
      </section>

      {/* 카톡 오픈채팅 — 파티원 모집 중일 때만 (edit 모드에선 수정 불가) */}
      {isRecruitingParty && (
        <section className="space-y-4">
          <div className="flex items-baseline gap-2 text-white font-bold mb-2">
            <MessageCircle className="w-4 h-4 text-yellow-400 self-center" />
            <span>카톡 오픈채팅 링크</span>
            {isEditMode && (
              <span className="text-[11px] text-neutral-500 font-normal">수정 불가</span>
            )}
          </div>
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-3">
            <Input
              type="url"
              value={kakaoUrl}
              onChange={(e) => setKakaoUrl(e.target.value)}
              placeholder="https://open.kakao.com/..."
              readOnly={isEditMode}
              disabled={isEditMode}
              className="bg-neutral-900 border-neutral-800 h-11 text-[13px] font-bold text-white focus:ring-amber-500 placeholder:text-neutral-600 placeholder:font-normal disabled:opacity-70 disabled:cursor-not-allowed"
            />
            {!isEditMode && <KakaoOpenChatGuide suggestedTitle={suggestedChatTitle} />}
          </div>
        </section>
      )}

      {/* 총 예산 미리보기 */}
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-1">
        <p className="text-[11px] text-green-500/70">예산 요약</p>
        {isRecruitingParty ? (
          <p className="text-[18px] font-black text-green-500 leading-snug break-keep">
            인당 {budgetAmount.toLocaleString()}원 × {effectiveTargetCount}명<br />
            = 총 {totalBudget.toLocaleString()}원
          </p>
        ) : (
          <p className="text-[18px] font-black text-green-500 leading-snug break-keep">
            총 예산 {totalBudget.toLocaleString()}원
          </p>
        )}
        {!isRecruitingParty ? (
          <p className="text-[11px] text-green-500/60">
            {totalPeople}명 확정 · 파티원 미모집
          </p>
        ) : hasGuest ? (
          <p className="text-[11px] text-green-500/60">
            본인 + 일행 {guestCount}명으로 시작 ({effectiveCurrentCount}/{effectiveTargetCount}명)
          </p>
        ) : (
          <p className="text-[11px] text-green-500/60">
            본인 1명으로 시작 (파티원 {effectiveTargetCount - 1}명 모집 중)
          </p>
        )}
      </div>

      {/* 마감 정책 안내 */}
      {!isEditMode && (
        <p className="text-[12px] text-neutral-400 text-center leading-relaxed px-2">
          🚩 오후 3시에 오퍼가 마감되고, 90분간 받은 오퍼를 검토할 수 있어요
        </p>
      )}

      {/* 제출 버튼 */}
      <div className="mt-4 px-1">
        <Button
          onClick={() => setShowSubmitConfirm(true)}
          disabled={submitting || (isEditMode && !isDirty)}
          className="w-full h-14 rounded-2xl bg-white text-black font-black text-lg hover:bg-neutral-200 shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {submitting ? (isEditMode ? "수정 중..." : "등록 중...") : (
            <>
              {isEditMode ? <Check className="w-5 h-5" /> : (isRecruitingParty ? <Users className="w-5 h-5" /> : <Flag className="w-5 h-5" />)}
              {isEditMode ? "수정 완료" : (isRecruitingParty ? "파티원 모집 시작" : "깃발 올리기")}
            </>
          )}
          {!submitting && !isEditMode && <ArrowRight className="w-5 h-5" />}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={showSubmitConfirm}
        onOpenChange={setShowSubmitConfirm}
        onConfirm={() => {
          setShowSubmitConfirm(false);
          handleSubmit();
        }}
        onCancel={() => setShowSubmitConfirm(false)}
        title={isEditMode
          ? "수정할까요?"
          : (isRecruitingParty
            ? "퍼즐이 완성되면 MD가 오퍼를 보내와요"
            : "MD가 시크릿 오퍼를 보내드려요")}
        description={isEditMode
          ? "변경된 내용으로 갱신됩니다."
          : "오퍼 중 하나를 수락하면 그때 MD 연락처가 공개됩니다."}
        confirmText={isEditMode ? "수정 완료" : (isRecruitingParty ? "파티원 모집 시작" : "깃발 올리기")}
        cancelText="다시 확인"
        variant="default"
      />

      <ConfirmDialog
        isOpen={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
        title="정말요?"
        description="작성 중인 내용이 사라집니다."
        confirmText="나가기"
        cancelText="계속 작성"
        variant="danger"
      />
    </div>
  );
}
