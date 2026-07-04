"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getLang, makeT, areaLabel } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { MAIN_AREAS } from "@/lib/constants/areas";
import { toast } from "sonner";
import { Minus, Plus, MessageCircle, Calendar, MapPin, Coins, Users, Sparkles, ArrowRight, Flag, Check, Puzzle, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeSheet } from "@/components/ui/datetime-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import type { GenderPref, AgePref, VibePref, MusicPref, Puzzle as PuzzleType } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { useLeaveConfirm } from "@/hooks/useLeaveConfirm";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
import { validateTitleDateConsistency } from "@/lib/utils/date";
import { krwTo, RATE_AS_OF } from "@/lib/utils/currency";

const CURRENCIES = [
  { code: "USD", symbol: "$" },
  { code: "JPY", symbol: "¥" },
  { code: "CNY", symbol: "CN¥" },
  { code: "TWD", symbol: "NT$" },
] as const;
type CurrencyCode = (typeof CURRENCIES)[number]["code"];

function CurrencyHint({ amount, convertLabel = "환산" }: { amount: number; convertLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CurrencyCode | null>(null);

  const singleConversion = selected ? krwTo(amount, selected) : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setSelected(null); }}
        className="text-[11px] font-bold text-neutral-500 hover:text-neutral-300 bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded-md transition-colors"
      >
        {convertLabel}
      </button>
      {open && !selected && (
        <div className="flex items-center gap-1.5">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setSelected(c.code)}
              className="text-[11px] font-bold text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 px-2 py-0.5 rounded-md transition-colors"
            >
              {c.symbol}
            </button>
          ))}
        </div>
      )}
      {selected && singleConversion && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-bold text-amber-400 tabular-nums">≈ {singleConversion}</span>
          <div className="flex items-center gap-1">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setSelected(c.code)}
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                  c.code === selected
                    ? "bg-neutral-600 text-white"
                    : "bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-white"
                }`}
              >
                {c.symbol}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-neutral-600 w-full">Rates as of {RATE_AS_OF} · approximate</span>
        </div>
      )}
    </div>
  );
}

// 빠른 추가 (만원 단위) — 모드별로 다름
const BUDGET_PRESETS_RECRUIT = [100000, 50000, 10000]; // 퍼즐(인당) +10만/+5만/+1만
const BUDGET_PRESETS_FIXED = [500000, 100000, 50000]; // 깃발(총액) +50만/+10만/+5만

const GENDER_OPTIONS: { value: GenderPref; label: string; en: string }[] = [
  { value: 'any', label: '상관없음', en: 'Any' },
  { value: 'male_only', label: '남자만', en: 'Men only' },
  { value: 'female_only', label: '여자만', en: 'Women only' },
];

const AGE_OPTIONS: { value: AgePref; label: string; en: string }[] = [
  { value: "any", label: "상관없음", en: "Any" },
  { value: "20s", label: "20대", en: "20s" },
  { value: "30s", label: "30대", en: "30s" },
];

// Phase 1: 바이브 라벨 정정 (조용히 → 편하게, 상관없음 → 누구나 환영)
const VIBE_OPTIONS: { value: VibePref; label: string; en: string }[] = [
  { value: "any", label: "누구나 환영", en: "Anyone welcome" },
  { value: "active", label: "외향인 환영", en: "Extroverts" },
  { value: "chill", label: "내향인 환영", en: "Introverts" },
];

// Phase 1 신규: 음악 선호 (한국 클럽씬 1차 분기 - 힙합/EDM)
const MUSIC_OPTIONS: { value: MusicPref; label: string; en: string }[] = [
  { value: "any", label: "상관없음", en: "Any" },
  { value: "hiphop", label: "힙합", en: "Hip-hop" },
  { value: "edm", label: "EDM", en: "EDM" },
];

export function PuzzleForm({ userId, puzzle, shareMode = false }: { userId: string; puzzle?: PuzzleType; shareMode?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = getLang(searchParams.get("lang"));
  const isForeigner = lang !== "ko";
  const supabase = createClient();

  const isEditMode = !!puzzle;
  const t = makeT(lang);
  const AREA_EN_LABEL: Record<string, string> = {
    "강남": "Gangnam", "홍대": "Hongdae", "이태원": "Itaewon",
    "서울 어디든": "Anywhere in Seoul",
    "부산": "Busan", "대구": "Daegu", "인천": "Incheon",
    "광주": "Gwangju", "대전": "Daejeon", "울산": "Ulsan", "세종": "Sejong",
  };
  const aL = (a: string) => areaLabel(a, lang);

  // 자동저장 draft 로드 (신규 등록 시에만)
  const DRAFT_KEY = `${shareMode ? "share" : "puzzle"}_form_draft_${userId}`;
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
  // 지역은 draft 복원 제외 — 매 진입 시 미선택으로 리셋해 사용자가 의식적으로 지역을 고르도록 유도.
  // 단, ?area= 파라미터(외국인 /en 지역 버튼)로 들어오면 프리셋.
  const presetArea = searchParams.get("area");
  // 이태원은 준비중(선택 불가) → preset으로도 자동선택 안 되게 제외
  const initialArea = puzzle?.area ?? (presetArea && ([...MAIN_AREAS.filter((a) => a !== "이태원"), "서울 어디든"] as string[]).includes(presetArea) ? presetArea : "");
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
  // shareMode(조각) 신규 등록은 파티원 모집 배관 재사용 → 기본 ON. 깃발은 기존대로 OFF.
  const [isRecruitingParty, setIsRecruitingParty] = useState<boolean>(
    puzzle?.is_recruiting_party ?? shareMode
  );
  // OFF 모드(인원 확정): 본인 포함 총 일행 수
  const [totalPeople, setTotalPeople] = useState(initialTotalPeople);
  // ON 모드(파티원 모집): 목표 인원 + 본인 동행
  const [targetCount, setTargetCount] = useState<number>(
    (puzzle?.is_recruiting_party ? puzzle?.target_count : undefined) ?? (draft?.targetCount as number) ?? 5
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
  // Migration 184: 성별 슬롯 분리
  const [myGender, setMyGender] = useState<'male' | 'female' | null>(null);
  const [genderLoaded, setGenderLoaded] = useState(false);
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [targetMale, setTargetMale] = useState<number>(
    puzzle?.target_male ?? (draft?.targetMale as number) ?? 0
  );
  const [targetFemale, setTargetFemale] = useState<number>(
    puzzle?.target_female ?? (draft?.targetFemale as number) ?? 0
  );
  // 본인 성별 로드 (1회만)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('gender')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      const g = (data?.gender as 'male' | 'female' | null) ?? null;
      setMyGender(g);
      setGenderLoaded(true);
      // 깃발에서는 성별을 직접 묻지 않음. 조각 참여 시에만 묻도록 정책 변경 (2026-05-19).
      // 기존 유저(gender=null)는 폼 상단 안내 카드로 조각 흐름 유도.
    })();
    return () => { cancelled = true; };
  }, [userId, supabase]);

  // 본인 성별 저장 핸들러
  const handleSaveMyGender = async (g: 'male' | 'female') => {
    const { error } = await supabase
      .from('users')
      .update({ gender: g })
      .eq('id', userId);
    if (error) {
      toast.error(t('성별 저장에 실패했어요. 다시 시도해주세요', 'Failed to save gender. Please try again'));
      return;
    }
    setMyGender(g);
    setGenderModalOpen(false);
    trackEvent('user_gender_set', { source: 'puzzle_form', gender: g });
  };
  // Migration 171: 복수 선택 지원. ['any'] = 전체. 빈 배열은 불가.
  const [agePref, setAgePref] = useState<AgePref[]>(() => {
    if (puzzle?.age_pref && puzzle.age_pref.length > 0) return puzzle.age_pref;
    const draftArr = draft?.agePref;
    if (Array.isArray(draftArr) && draftArr.length > 0) return draftArr as AgePref[];
    if (typeof draftArr === "string") return [draftArr as AgePref];
    return ["any"];
  });

  const toggleAgePref = (value: AgePref) => {
    setAgePref((prev) => {
      // "상관없음" 클릭 → 단독 선택으로 리셋
      if (value === "any") return ["any"];
      // 구체 연령 클릭 시 "any" 자동 제거
      const withoutAny = prev.filter((v) => v !== "any");
      const isSelected = withoutAny.includes(value);
      const next = isSelected
        ? withoutAny.filter((v) => v !== value)
        : [...withoutAny, value];
      // 모두 해제되면 "any"로 폴백
      return next.length === 0 ? ["any"] : next;
    });
  };
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
  // 외국인 여행상태 게이트: 확정/여행중만 깃발 허용, 계획중은 홈으로 회유 (신규 등록만)
  const [tripStatus, setTripStatus] = useState<null | "qualified" | "planning">(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  // 당일 18시 이후 등록 시도 시 안내 다이얼로그
  const [showLateTodayDialog, setShowLateTodayDialog] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  // 퍼즐 소개: 비어 있으면 자동 채움. 사용자가 수동 입력 시 자동 채움 중단.
  // draft에는 저장하지 않으므로 신규 진입 시에는 항상 false에서 시작.
  const [notesEverEdited, setNotesEverEdited] = useState(!!puzzle?.notes);
  const [submitted, setSubmitted] = useState(false);
  // "조각이란?" 용어 풀이 모달
  const [helpOpen, setHelpOpen] = useState(false);
  // 깃발 예산 안내 옆 "예산이 50 언더라면?" 클릭 시 조각 회유 CTA 노출
  const [showShareCta, setShowShareCta] = useState(false);

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
        JSON.stringify([...agePref].sort()) !== JSON.stringify([...(puzzle?.age_pref ?? ["any"])].sort()) ||
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
        targetCount !== 5 ||
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
            targetMale,
            targetFemale,
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
    targetMale,
    targetFemale,
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
    const headcount = isRecruitingParty ? targetCount : totalPeople;
    if (isForeigner) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const datePart = `${months[d.getMonth()]} ${d.getDate()}(${weekdays[d.getDay()]})`;
      const areaEn = AREA_EN_LABEL[area] ?? area;
      let pricePart = "";
      if (isRecruitingParty && budgetAmount > 0) {
        pricePart = `, ₩${Math.round(budgetAmount / 10000)}0k/pp`;
      } else if (!isRecruitingParty && budgetAmount > 0) {
        pricePart = `, ₩${Math.round(budgetAmount / 10000)}0k total`;
      }
      setNotes(`${datePart} ${areaEn} ${headcount}ppl${pricePart}`);
    } else {
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      const datePart = `${m}/${day}(${days[d.getDay()]})`;
      let pricePart = "";
      if (isRecruitingParty && budgetAmount > 0) {
        pricePart = `, N${Math.round(budgetAmount / 10000)}`;
      } else if (!isRecruitingParty && budgetAmount > 0) {
        pricePart = `, ${Math.round(budgetAmount / 10000)}만`;
      }
      setNotes(`${datePart} ${area} ${headcount}명${pricePart}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventDate, area, isRecruitingParty, targetCount, totalPeople, budgetAmount, notesEverEdited, isForeigner]);

  const handleAreaChange = (newArea: string) => {
    setArea(newArea);
  };

  const fail = (error_type: string, error_message: string) => {
    trackEvent('puzzle_validation_error', { error_type, error_message });
    toast.error(error_message);
  };

  const todayObj = new Date();
  const today = todayObj.toISOString().split("T")[0];
  const maxObj = new Date();
  // 조각은 근시일 위주(최대 14일), 깃발은 기존대로 30일.
  maxObj.setDate(todayObj.getDate() + (shareMode ? 14 : 30));
  const maxDateStr = maxObj.toISOString().split("T")[0];

  // 모드별 인원/예산 파생값
  const isHostMale = myGender !== 'female';
  const effectiveTargetCount = isRecruitingParty ? targetCount : totalPeople;
  const effectiveGuestCount = isRecruitingParty ? (hasGuest ? guestCount : 0) : Math.max(0, effectiveTargetCount - 1);
  const effectiveCurrentCount = isRecruitingParty ? 1 + effectiveGuestCount : effectiveTargetCount;
  // OFF: budgetAmount = 총액, ON: budgetAmount = 인당
  const totalBudget = isRecruitingParty ? budgetAmount * effectiveTargetCount : budgetAmount;

  // offer_deadline: 오퍼 마감 오후 8시 KST (11:00 UTC)
  // expires_at: 유저 검토 마감 오후 9시 KST (12:00 UTC) — 오퍼 마감 +60분
  const getOfferDeadline = (date: string) => `${date}T11:00:00.000Z`;
  const getExpiresAt = (date: string) => `${date}T12:00:00.000Z`;

  // 당일 등록인데 오후 8시(오퍼 마감) 이미 지났는지 체크
  const isLateForToday = (): boolean => {
    if (!eventDate || isEditMode) return false;
    const offerDeadline = dayjs(getOfferDeadline(eventDate));
    return dayjs().isAfter(offerDeadline) && dayjs().isSame(offerDeadline, "day");
  };

  // "내일 깃발로 등록" 클릭 시 날짜만 다음날로 변경
  const handleMoveToTomorrow = () => {
    const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");
    setEventDate(tomorrow);
    setShowLateTodayDialog(false);
    toast.success(isForeigner
      ? `Moved to tomorrow (${dayjs(tomorrow).format("MMM D")})`
      : `내일(${dayjs(tomorrow).format("M/D")}) 깃발로 변경했어요`);
  };

  // "얼리버드 보기" 클릭 시 메인 페이지 advance 탭으로 이동
  const handleGoToEarlybird = () => {
    setShowLateTodayDialog(false);
    router.push("/?tab=advance");
  };

  const formatWon = (n: number) =>
    n >= 10000 ? `${Math.round(n / 10000)}만원` : `${n.toLocaleString()}원`;

  const suggestedChatTitle = (() => {
    const mmdd = eventDate ? eventDate.split("-").slice(1).join("/") : "";
    const base = `[나플] ${area || "지역미상"} ${mmdd}`;
    if (!isRecruitingParty) {
      const budget = totalBudget > 0 ? `·${formatWon(totalBudget)}` : "";
      return `${base} | ${totalPeople}인${budget}`;
    } else {
      const perPerson = budgetAmount > 0 ? `·인당${formatWon(budgetAmount)}` : "";
      return `${base} | 파티원 ${targetCount}인${perPerson}`;
    }
  })();

  const handleSubmit = async () => {
    const effectiveIsRecruiting = isRecruitingParty;

    trackEvent('puzzle_submit_attempt', {
      is_recruiting_party: effectiveIsRecruiting,
      area: area || null,
      total_budget: totalBudget,
    });

    if (!notes.trim()) {
      return fail('title', t('어떤 모임인지 한 줄로 표현해주세요', 'Add a one-line description'));
    }
    if (!eventDate) {
      return fail('date', t('날짜를 선택해주세요', 'Please select a date'));
    }
    const titleDateCheck = validateTitleDateConsistency(notes, eventDate);
    if (titleDateCheck.ok === false) {
      return fail(
        'title_date_mismatch',
        isForeigner
          ? `Date in description (${titleDateCheck.titleDate}) doesn't match selected date (${titleDateCheck.expectedDate}). Please fix one of them.`
          : `제목의 날짜(${titleDateCheck.titleDate})와 설정한 모임 날짜(${titleDateCheck.expectedDate})가 다릅니다. 제목 또는 날짜를 수정해주세요.`,
      );
    }
    if (!area) {
      return fail('area', t('지역을 선택해주세요', 'Please select an area'));
    }
    if (effectiveIsRecruiting && budgetAmount < (shareMode ? 70000 : 10000)) {
      return fail('budget_per_person', shareMode
        ? t('인당 예산은 최소 7만원 이상이어야 해요', 'Minimum budget per person is ₩70,000')
        : t('인당 예산은 최소 1만원 이상이어야 합니다', 'Minimum budget per person is ₩10,000'));
    }
    // 조각(shareMode)은 인앱 오퍼 채팅을 쓰므로 카톡 오픈채팅을 받지 않음.
    if (!isEditMode && effectiveIsRecruiting && !shareMode) {
      if (!kakaoUrl.trim()) {
        return fail('kakao_url_required', t('파티원 모집은 카톡 오픈채팅 링크가 필수예요', 'KakaoTalk open chat link is required'));
      }
      if (!kakaoUrl.trim().startsWith('https://open.kakao.com/')) {
        return fail('kakao_url', t('카톡 오픈채팅 링크는 https://open.kakao.com/ 로 시작해야 합니다', 'Link must start with https://open.kakao.com/'));
      }
    }
    if (!effectiveIsRecruiting && budgetAmount < 500000) {
      return fail('budget_total', t('예산은 50만원 이상이어야 해요', 'Minimum budget is ₩500,000'));
    }
    if (effectiveIsRecruiting && effectiveCurrentCount > effectiveTargetCount) {
      return fail('headcount_overflow', t('일행 인원이 모집 인원을 초과합니다', 'Your group exceeds the target headcount'));
    }
    if (!effectiveIsRecruiting && effectiveTargetCount < 2) {
      return fail('headcount_min', t('인원 확정 깃발은 2명 이상이어야 합니다', 'Minimum 2 people required'));
    }
    // 조각(shareMode)은 성별 슬롯을 쓰지 않으므로 성별을 묻지 않음.
    if (effectiveIsRecruiting && !shareMode && !myGender) {
      return fail('gender_required', t('성별을 먼저 입력해주세요', 'Please set your gender first'));
    }
    // 본인 성별 기반으로 슬롯 자동 매핑. 조각은 성별 슬롯을 쓰지 않으므로 0/0(성별 무관).
    const submitMaleSlot   = shareMode ? 0 : (isHostMale  ? effectiveTargetCount : 0);
    const submitFemaleSlot = shareMode ? 0 : (!isHostMale ? effectiveTargetCount : 0);

    setSubmitting(true);
    // 성공 시 router.push 후에도 버튼을 "등록 중..."으로 유지해야
    // 서버 렌더(force-dynamic) 전환 동안 사용자가 멈춘 화면을 안 본다.
    // finally에서 풀어버리면 전환 중에 버튼이 멀쩡해져 "왜 안 넘어가지" 정체감.
    let navigating = false;
    try {
      if (isEditMode && puzzle) {
        const isEventDateChanged = eventDate !== puzzle.event_date;
        const { error: updateError } = await supabase
          .from("puzzles")
          .update({
            area,
            event_date: eventDate,
            is_recruiting_party: effectiveIsRecruiting,
            gender_pref: (effectiveIsRecruiting && !shareMode) ? genderPref : 'any',
            age_pref: effectiveIsRecruiting ? agePref : ['any'],
            vibe_pref: effectiveIsRecruiting ? vibePref : 'any',
            music_preference: musicPref === 'any' ? null : musicPref,
            // 카톡 오픈채팅: edit 모드에선 직접 수정 X. 단, 깃발(파티원 모집 OFF)로 전환되면
            // 카톡 URL은 더 이상 사용되지 않으므로 null로 정리 (데이터 정합성).
            ...((effectiveIsRecruiting && !shareMode) ? {} : { kakao_open_chat_url: null }),
            total_budget: totalBudget,
            budget_per_person: effectiveIsRecruiting
              ? budgetAmount
              : Math.round(budgetAmount / effectiveTargetCount),
            target_count: effectiveTargetCount,
            current_count: effectiveCurrentCount,
            target_male: submitMaleSlot,
            target_female: submitFemaleSlot,
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
          return fail('db_error', updateError.message || t('수정에 실패했습니다', 'Update failed'));
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

        toast.success(effectiveIsRecruiting ? t("퍼즐이 수정되었어요", "Updated!") : t("깃발이 수정되었어요", "Updated!"));
        clearDraft();
        setSubmitted(true);
        navigating = true;
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
          gender_pref: (effectiveIsRecruiting && !shareMode) ? genderPref : 'any',
          age_pref: effectiveIsRecruiting ? agePref : ['any'],
          vibe_pref: effectiveIsRecruiting ? vibePref : 'any',
          music_preference: musicPref === 'any' ? null : musicPref,
          kakao_open_chat_url: (effectiveIsRecruiting && !shareMode) ? (kakaoUrl.trim() || null) : null,
          total_budget: totalBudget,
          budget_per_person: effectiveIsRecruiting
            ? budgetAmount
            : Math.round(budgetAmount / effectiveTargetCount), // 하위 호환용
          target_count: effectiveTargetCount,
          current_count: effectiveCurrentCount,
          target_male: targetMale,
          target_female: targetFemale,
          is_recruiting_party: effectiveIsRecruiting,
          notes: notes.trim() || null,
          offer_deadline: getOfferDeadline(eventDate),
          expires_at: getExpiresAt(eventDate),
        })
        .select("id")
        .single();

      if (puzzleError) {
        console.error("puzzles insert error:", puzzleError);
        return fail('db_error', puzzleError.message || t('퍼즐 등록에 실패했습니다', 'Submission failed'));
      }

      // 대표자를 puzzle_members에도 추가 (fire-and-forget — 네비게이션 블로킹 X)
      // gender는 트리거가 users.gender에서 자동 스냅샷하지만 명시적으로도 전달
      supabase
        .from("puzzle_members")
        .insert({
          puzzle_id: created.id,
          user_id: userId,
          guest_count: effectiveGuestCount,
          gender: myGender,
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
        shareMode
          ? t("조각이 올라갔어요! 파티원과 MD 제안을 받아보세요 🧩", "Your share is up! Get party members and club offers 🧩")
          : effectiveIsRecruiting
          ? t("퍼즐이 올라갔어요! 당일 오후 8시까지 파티원·MD 모집, 이후 60분간 검토할 수 있어요 🧩", "Posted! Offers close at 8pm. You have 60 min to review 🧩")
          : t("깃발이 올라갔어요! 🚩", "Done! Top clubs will send you offers 🎉")
      );
      clearDraft();
      setSubmitted(true); // 이탈 가드 해제
      navigating = true;
      // 깃발 꽂은 직후 1회성 앱설치 팝업 트리거 (안드로이드 웹에서만 실제 노출)
      window.dispatchEvent(new CustomEvent("flag-created"));
      // 조각은 등록 직후 카톡 공유 시트 노출(파티원 모집 동선)
      const createdQuery = shareMode
        ? (isForeigner ? "?created=share&lang=en" : "?created=share")
        : (isForeigner ? "?lang=en" : "");
      router.push(`/flags/${created.id}${createdQuery}`);
    } catch (err) {
      console.error("puzzle submit error:", err);
      toast.error(err instanceof Error ? err.message : t(isEditMode ? "수정에 실패했습니다" : "등록에 실패했습니다", isEditMode ? "Update failed" : "Submission failed"));
    } finally {
      // 성공 후 전환 중에는 버튼을 풀지 않는다 (상세 페이지가 뜰 때까지 "등록 중..." 유지).
      // 에러로 빠졌을 때만 다시 누를 수 있게 해제.
      if (!navigating) setSubmitting(false);
    }
  };

  // ── 외국인 여행상태 게이트 (신규 등록만) ──────────────────────────
  // 계획중인 사람은 깃발 마켓을 오염시키므로(실제 방문 불확실, MD 오퍼 낭비)
  // 차단하고 홈으로 회유. 확정/여행중만 깃발 폼 노출.
  const showTripGate = isForeigner && !isEditMode;

  if (showTripGate && tripStatus === null) {
    return (
      <div className="space-y-6 pb-12">
        <div className="bg-[#1C1C1E] rounded-3xl p-6 space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-[20px] font-black text-white leading-snug tracking-tight">
              Is your Korea trip confirmed,<br />or are you already in Korea?
            </h2>
            <p className="text-[13px] text-neutral-500 leading-relaxed">
              Seoul clubs send real offers — only for confirmed visitors.
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setTripStatus("qualified")}
              className="w-full h-14 rounded-2xl bg-white text-black font-black text-[15px] flex items-center justify-center gap-2 hover:bg-neutral-200 active:scale-[0.99] transition-all"
            >
              ✅ Yes — booked or already in Korea
            </button>
            <button
              type="button"
              onClick={() => setTripStatus("planning")}
              className="w-full h-14 rounded-2xl bg-neutral-800 border border-neutral-700 text-neutral-300 font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-neutral-700/60 active:scale-[0.99] transition-all"
            >
              🗓️ Not yet, just planning
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showTripGate && tripStatus === "planning") {
    return (
      <div className="space-y-6 pb-12">
        <div className="bg-[#1C1C1E] rounded-3xl p-7 space-y-5 text-center">
          <div className="text-[40px]">🗓️</div>
          <div className="space-y-2">
            <h2 className="text-[20px] font-black text-white tracking-tight">
              Trip not locked in yet?
            </h2>
            <p className="text-[14px] text-neutral-400 leading-relaxed">
              No rush — Seoul clubs send offers <span className="text-white font-bold">fast, even same-day.</span> Come back the moment your trip is confirmed and you'll still be right on time. 🎉
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/en")}
            className="w-full h-13 py-3.5 rounded-2xl bg-white text-black font-black text-[15px] hover:bg-neutral-200 active:scale-[0.99] transition-all"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* 성별 안내는 파티원 모집(퍼즐) 모드에서만 표시. 깃발(인원 확정) 모드에서는 불필요 */}
      {isRecruitingParty && !shareMode && genderLoaded && !myGender && (
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-4 space-y-3">
          <p className="text-[13px] font-bold text-white">{t("성별 정보가 필요해요", "We need your gender")}</p>
          <p className="text-[12px] text-neutral-400 leading-relaxed">
            {t(
              "파티원 모집은 성별 슬롯 기반으로 매칭돼요. 성별을 설정하면 바로 올릴 수 있어요.",
              "Recruiting is matched by gender slots. Set your gender to start."
            )}
          </p>
          <button
            type="button"
            onClick={() => setGenderModalOpen(true)}
            className="w-full h-11 rounded-xl bg-white text-black font-black text-[14px] hover:bg-neutral-200 active:scale-[0.99] transition-all"
          >
            {t("성별 설정하기", "Set gender")}
          </button>
        </div>
      )}
      {/* 성별 입력 모달 (수동 트리거 전용) */}
      <Sheet open={genderModalOpen} onOpenChange={() => { /* 닫기 차단 */ }}>
        <SheetContent
          side="bottom"
          className="bg-[#1C1C1E] border-t border-neutral-800 rounded-t-3xl text-white"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle className="text-white text-[18px] font-black">
              {t("퍼즐 매칭을 위해 성별을 알려주세요", "Tell us your gender for matching")}
            </SheetTitle>
            <SheetDescription className="text-neutral-400 text-[12px]">
              {t("한 번 설정하면 변경할 수 없어요", "This can't be changed once set")}
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 pt-6 pb-2">
            {([
              { value: 'male', label: t('남자', 'Male'), emoji: '🧑', color: 'green' },
              { value: 'female', label: t('여자', 'Female'), emoji: '👩', color: 'pink' },
            ] as const).map(({ value, label, emoji, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleSaveMyGender(value)}
                className={`h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all bg-neutral-800 border-neutral-700 hover:${color === 'pink' ? 'border-pink-500 bg-pink-500/10' : 'border-green-500 bg-green-500/10'}`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-[15px] font-bold text-white">{label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* 방문희망날짜 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Calendar className="w-4 h-4 text-green-500" />
          <span>{t("방문희망날짜", "Visit date")}</span>
        </div>
        <DateTimeSheet
          mode="date-only"
          value={eventDate}
          min={today}
          max={maxDateStr}
          onChange={(val) => setEventDate(val)}
          label={t("날짜 선택", "Select date")}
          placeholder={shareMode ? t("최대 14일 뒤까지 선택 가능", "Up to 14 days ahead") : t("최대 30일 뒤까지 선택 가능", "Up to 30 days ahead")}
        />
      </section>

      {/* 지역 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <MapPin className="w-4 h-4 text-green-500" />
          <span>{t("지역", "Area")}</span>
        </div>
        <div>
          <div className="flex flex-wrap items-start gap-2">
            {/* 강남·홍대 = 선택 가능 / 이태원 = 준비중(MD 없음 → 오퍼 못 받을 가능성 높음) — 한중일 동일 */}
            {MAIN_AREAS.map((a) => {
              const comingSoon = a === "이태원";
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() =>
                    comingSoon
                      ? toast(t("이태원은 준비중이에요", "Itaewon is coming soon"))
                      : handleAreaChange(a)
                  }
                  aria-disabled={comingSoon}
                  className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all border ${
                    area === a
                      ? "bg-white text-black border-transparent"
                      : comingSoon
                      ? "bg-neutral-900 text-neutral-600 border-neutral-800 opacity-60"
                      : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {aL(a)}
                  {comingSoon && (
                    <span className="ml-1.5 text-[10px] text-amber-400/80">
                      {t("준비중", "Soon")}
                    </span>
                  )}
                </button>
              );
            })}
            {/* 서울 어디든: 전체 노출 (가장 많은 오퍼). 안내 문구는 흐름에서 빼서(absolute) 버튼 위치 고정 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => handleAreaChange("서울 어디든")}
                className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all border ${
                  area === "서울 어디든"
                    ? "bg-white text-black border-transparent"
                    : "bg-neutral-900 text-neutral-500 border-neutral-800 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                {aL("서울 어디든")}
              </button>
              {area === "서울 어디든" && !shareMode && (
                <p className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 text-[11px] text-amber-400/80 leading-relaxed whitespace-nowrap">
                  {t("* 가장 많은 옵션을 받아봐요 *", "* Most offers *")}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 인원 설정 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Users className="w-4 h-4 text-green-500" />
          <span>{t("인원 설정", "Group size")}</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
          {!isRecruitingParty ? (
            /* OFF 모드 (깃발): 기존 totalPeople 단일 picker */
            <div className="space-y-2">
              <p className="text-[11px] text-neutral-400">{t("총 일행 수 (본인 포함)", "Total in your group (including you)")}</p>
              <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 h-11 rounded-lg px-4">
                <button
                  type="button"
                  onClick={() => setTotalPeople(Math.max(2, totalPeople - 1))}
                  className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5 text-white" />
                </button>
                <span className="text-[15px] font-black text-white">{totalPeople}{t("명", " people")}</span>
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
            /* ON 모드 (퍼즐): 단순 인원 picker */
            <>
              <div className="space-y-2">
                <p className="text-[11px] text-neutral-400">{t("최대 인원 (본인 포함)", "Max headcount (including you)")}</p>
                <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 h-11 rounded-lg px-4">
                  <button
                    type="button"
                    onClick={() => setTargetCount(Math.max(2, targetCount - 1))}
                    className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5 text-white" />
                  </button>
                  <span className="text-[15px] font-black text-white">{targetCount}{t("명", " people")}</span>
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
              <div className="space-y-3 pt-3 border-t border-neutral-800">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-[13px] font-bold text-white">{t("이미 일행이 있나요?", "Already with friends?")}</span>
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
                    <span className="text-[15px] font-black text-white">{t(`일행 ${guestCount}명`, `${guestCount} friend${guestCount > 1 ? "s" : ""}`)}</span>
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

              {/* 모집 요약 */}
              {effectiveTargetCount - effectiveCurrentCount > 0 && (
                <p className="text-[12px] text-green-400 font-bold">
                  🧩 {t(`총 ${effectiveTargetCount - effectiveCurrentCount}명을 구해요`, `Looking for ${effectiveTargetCount - effectiveCurrentCount} more`)}
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
          <span>{isRecruitingParty ? t("인당 예산", "Budget per person") : t("총 예산", "Total budget")}</span>
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
              placeholder={isRecruitingParty ? t("예) 100,000", "e.g. 100,000") : t("예) 500,000", "e.g. 500,000")}
              className="bg-neutral-900 border-neutral-800 h-11 text-white font-bold focus:ring-amber-500 pr-12"
            />
            {isRecruitingParty && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-neutral-500 font-bold pointer-events-none">
                {t("/인", "/pp")}
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
                {isForeigner ? `+₩${(preset / 10000).toFixed(0)}0k` : `+${(preset / 10000).toFixed(0)}만`}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setBudgetAmount(0); setBudgetInputStr(""); }}
              className="h-10 px-0 bg-neutral-900 border-neutral-700 text-neutral-500 hover:bg-neutral-800 hover:text-white hover:border-red-500/50 font-bold text-[13px]"
            >
              {t("초기화", "Clear")}
            </Button>
          </div>
          {/* 예산 요약 — 박스 없이 인라인 */}
          {isRecruitingParty && (
            <p className="text-[13px] font-bold text-white">
              {t("인당", "Per person")} <span className="text-amber-400">{isForeigner ? `₩${budgetAmount.toLocaleString()}` : `${budgetAmount.toLocaleString()}원`}</span>
              {" "}× {effectiveTargetCount}{t("명", "")} = {t("총", "Total")}{" "}
              <span className="text-green-400">{isForeigner ? `₩${totalBudget.toLocaleString()}` : `${totalBudget.toLocaleString()}원`}</span>
            </p>
          )}
          {/* 외국인용 환율 힌트 */}
          {isForeigner && budgetAmount > 0 && (
            <CurrencyHint amount={isRecruitingParty ? totalBudget : budgetAmount} convertLabel="Convert" />
          )}
          <p className="font-medium -my-2">
            <span className="text-[14px] text-amber-500/80">{t("MD가 예산에 맞춰 서비스를 구성해요", "Club offers match your budget")}</span>
            {!isRecruitingParty && (
              <>
                <span className="text-[12px] text-neutral-400"> {t("(최소 금액 50만원)", "(minimum ₩500,000)")}</span>
                {!shareMode && !isForeigner && (
                  <button
                    type="button"
                    onClick={() => setShowShareCta((v) => !v)}
                    className="ml-2 text-[12px] text-green-400 underline underline-offset-2 hover:text-green-300"
                  >
                    예산이 50 언더라면?
                  </button>
                )}
              </>
            )}
          </p>
        </div>

        {/* 50만원 장벽 회유 — "예산이 50 언더라면?" 클릭 시 조각으로 유도. 외국인 제외(조각 미제공) */}
        {!shareMode && !isForeigner && showShareCta && (
          <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-4">
            <p className="text-[13.5px] font-black text-white break-keep">
              조각을 이용하면 파티원을 모아 예약할 수 있어요
            </p>
            <p className="text-[12.5px] text-neutral-300 mt-1 leading-relaxed break-keep">
              인당 7만원부터 시작되며, 깃발과 똑같은 오퍼를 받아요.
            </p>
            <button
              type="button"
              onClick={() => router.push("/shares/new")}
              className="mt-3 w-full h-11 rounded-xl bg-green-500 hover:bg-green-400 text-black font-black text-[14px] active:scale-[0.99] transition-all"
            >
              🧩 조각 바로가기
            </button>
          </div>
        )}
      </section>

      {/* 취향 태그 — 파티원 모집 중일 때만 */}
      {isRecruitingParty && <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Sparkles className="w-4 h-4 text-green-500" />
          <span>{t("이런 분들을 선호해요", "Who you prefer")}</span>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl px-4 py-3 space-y-2.5">
          {/* 성별 선호 — 조각은 성별 슬롯을 쓰지 않으므로 숨김 */}
          {!shareMode && (
          <div className="flex items-center gap-3">
            <p className="text-[11px] text-neutral-400 w-8 shrink-0">{t("성별", "Gender")}</p>
            <div className="flex gap-1.5 flex-wrap">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGenderPref(opt.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                    genderPref === opt.value
                      ? "bg-white text-black"
                      : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {isForeigner ? opt.en : opt.label}
                </button>
              ))}
            </div>
          </div>
          )}

          <div className="flex items-center gap-3">
            <p className="text-[11px] text-neutral-400 w-8 shrink-0">{t("연령", "Age")}</p>
            <div className="flex gap-1.5 flex-wrap">
              {AGE_OPTIONS.map((opt) => {
                const selected = agePref.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleAgePref(opt.value)}
                    aria-pressed={selected}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                      selected
                        ? "bg-white text-black"
                        : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:bg-neutral-800 hover:text-white"
                    }`}
                  >
                    {isForeigner ? opt.en : opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-[11px] text-neutral-400 w-8 shrink-0">{t("음악", "Music")}</p>
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
                  {isForeigner ? opt.en : opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-[11px] text-neutral-400 w-8 shrink-0">{t("바이브", "Vibe")}</p>
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
                  {isForeigner ? opt.en : opt.label}
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
          <span>{isRecruitingParty ? (shareMode ? t("조각 소개", "About your group") : t("퍼즐 소개", "About your group")) : t("MD에게 한마디", "Message to club")}</span>
          {isRecruitingParty && (
            <span className="text-[11px] text-neutral-500 font-normal">
              {t("참여자와 MD가 가장 먼저 읽어요", "First thing clubs see")}
            </span>
          )}
          <span className={`ml-auto text-[11px] font-normal ${notes.length >= 60 ? "text-amber-500" : "text-neutral-500"}`}>
            {notes.length}/60
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
              ? t("예) 매너 좋으신 분만. 신나게 놀 분.", "e.g. Respectful crowd only. Here to party.")
              : t("예) 4명, 메인테이블 원해요", "e.g. 4 people, main table preferred")}
            className="bg-neutral-900 border-neutral-800 h-12 text-[14px] font-bold text-white focus:ring-amber-500 placeholder:text-neutral-600 placeholder:font-normal"
            maxLength={60}
          />
        </div>
      </section>

      {/* 카톡 오픈채팅 — 파티원 모집 중일 때만. 조각(shareMode)은 인앱 채팅 사용으로 숨김 */}
      {isRecruitingParty && !shareMode && (
        <section className="space-y-4">
          <div className="flex items-baseline gap-2 text-white font-bold mb-2">
            <MessageCircle className="w-4 h-4 text-yellow-400 self-center" />
            <span>{t("카톡 오픈채팅 링크", "KakaoTalk open chat link")}</span>
            {isEditMode && (
              <span className="text-[11px] text-neutral-500 font-normal">{t("수정 불가", "Can't edit")}</span>
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

      {/* 요약 미리보기 */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-2 text-white mb-2">
          <Sparkles className="w-4 h-4 text-green-500 self-center" />
          <span className="text-[18px] font-bold">{shareMode ? t("요약", "Summary") : t("깃발 요약", "Summary")}</span>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-3">
          {/* 보조: 날짜 · 지역 (한 줄) — green 톤 통일, 명도로 위계 */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-bold text-green-400/80 truncate">
              {eventDate
                ? (isForeigner
                    ? `${dayjs(eventDate).format("MMM D")} (${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayjs(eventDate).day()]})`
                    : `${dayjs(eventDate).format("M월 D일")} (${["일","월","화","수","목","금","토"][dayjs(eventDate).day()]})`)
                : t("날짜 미정", "Date TBD")}
              {" · "}
              {area ? aL(area) : t("지역 미정", "Area TBD")}
            </span>
          </div>

          {/* 핵심: 총 예산 (+ 인원) */}
          {isRecruitingParty ? (
            <p className="text-[20px] font-black text-green-500 leading-tight break-keep">
              {isForeigner
                ? `₩${budgetAmount.toLocaleString()}/pp × ${effectiveTargetCount}`
                : `인당 ${budgetAmount.toLocaleString()}원 × ${effectiveTargetCount}명`}
              <span className="block text-[13px] font-bold text-green-500/80 mt-0.5">
                {isForeigner
                  ? `= ₩${totalBudget.toLocaleString()} total`
                  : `= 총 ${totalBudget.toLocaleString()}원`}
              </span>
            </p>
          ) : (
            <p className="text-[20px] font-black text-green-500 leading-tight break-keep">
              {isForeigner ? `₩${totalBudget.toLocaleString()}` : `${totalBudget.toLocaleString()}원`}
              <span className="ml-2 text-[13px] font-bold text-green-500/60 align-middle">
                {totalPeople}{t("명", " people")}
              </span>
            </p>
          )}
        </div>
      </section>

      {/* 제출 버튼 */}
      <div className="mt-4 px-1">
        <Button
          onClick={() => {
            // 예산 하한(총 50만원)은 깃발(인원 확정)에만 적용. 조각(파티원 모집)은 인당 하한(7만원)만 적용.
            if (!isEditMode && !isRecruitingParty && totalBudget < 500000) {
              toast.error(t('예산은 50만원 이상이어야 해요', 'Minimum budget is ₩500,000'));
              return;
            }
            if (isLateForToday()) {
              setShowLateTodayDialog(true);
              return;
            }
            setShowSubmitConfirm(true);
          }}
          disabled={submitting || (isEditMode && !isDirty) || (isRecruitingParty && !myGender && !shareMode)}
          className="w-full h-14 rounded-2xl bg-white text-black font-black text-lg hover:bg-neutral-200 shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {submitting ? t(isEditMode ? "수정 중..." : "등록 중...", isEditMode ? "Saving..." : "Submitting...") : (
            <>
              {isEditMode ? <Check className="w-5 h-5" /> : ((isRecruitingParty && !shareMode) ? <Users className="w-5 h-5" /> : null)}
              {isEditMode
                ? t("수정 완료", "Save changes")
                : (shareMode ? t("등록하기", "Post") : (isRecruitingParty ? t("파티원 모집 시작", "Start recruiting") : t("오퍼 받아보기", "Get offers")))}
            </>
          )}
          {!submitting && !isEditMode && <ArrowRight className="w-5 h-5" />}
        </Button>
        {!isEditMode && (
          <p className="text-center text-[12px] text-neutral-500 font-medium mt-2.5">
            {t("🆓 100% 무료 · 결제 없음", "🆓 100% free · no payment")}
          </p>
        )}
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
          ? t("수정할까요?", "Save changes?")
          : (shareMode
            ? t("조각을 올리면 파티원·MD 제안이 바로 시작돼요", "Post your share — party members and club offers start right away")
            : (isRecruitingParty
              ? t("퍼즐이 완성되면 MD가 오퍼를 보내와요", "Clubs will send offers once your group is complete")
              : t("마음에 드는 오퍼만 고르면 끝!", "Just pick the offer you like!")))}
        description={isEditMode
          ? t("변경된 내용으로 갱신됩니다.", "Your request will be updated.")
          : t("오퍼는 당일 8시 마감. 60분간 더 검토할 수 있어요.", "Offers close at 8pm today. You have 60 min to review.")}
        confirmText={isEditMode ? t("수정 완료", "Save") : (shareMode ? t("등록 완료", "Post share") : (isRecruitingParty ? t("파티원 모집 시작", "Start recruiting") : t("계속", "Continue")))}
        cancelText={t("다시 확인", "Go back")}
        variant={!isEditMode && !isRecruitingParty ? "celebrate" : "default"}
      />

      <ConfirmDialog
        isOpen={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
        title={t("정말요?", "Leave?")}
        description={t("작성 중인 내용이 사라집니다.", "Your progress will be lost.")}
        confirmText={t("나가기", "Leave")}
        cancelText={t("계속 작성", "Keep editing")}
        variant="danger"
      />

      {/* 당일 오후 8시(오퍼 마감) 이후 등록 시도 시 안내 */}
      <Sheet open={showLateTodayDialog} onOpenChange={setShowLateTodayDialog}>
        <SheetContent
          side="bottom"
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-[32px] p-6 pb-12 outline-none"
        >
          <SheetHeader className="text-left space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/10">
                <Flag className="w-5 h-5 text-amber-500" />
              </div>
              <SheetTitle className="text-white font-black text-xl tracking-tight">
                {t("오늘 깃발은 오후 8시까지였어요", "Today's request deadline was 8pm")}
              </SheetTitle>
            </div>
            <SheetDescription className="text-neutral-400 font-medium leading-relaxed mt-1">
              {t("지금 당장 가고 싶다면 얼리버드(즉시 매칭)도 확인해보세요.", "Want to go out tonight? Try early bird (instant match).")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 mt-8">
            <Button
              onClick={handleMoveToTomorrow}
              className="h-14 rounded-2xl bg-white hover:bg-neutral-200 text-black font-black text-lg shadow-lg flex items-center justify-center gap-2"
            >
              <Flag className="w-5 h-5" />
              {t("내일 깃발로 등록", "Request for tomorrow")}
            </Button>
            <Button
              variant="outline"
              onClick={handleGoToEarlybird}
              className="h-14 rounded-2xl border-neutral-800 bg-neutral-900/50 text-white font-bold hover:bg-neutral-800"
            >
              {t("얼리버드 보기", "See early bird")}
            </Button>
            <button
              onClick={() => setShowLateTodayDialog(false)}
              className="text-sm text-neutral-500 py-2"
            >
              {t("취소", "Cancel")}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
