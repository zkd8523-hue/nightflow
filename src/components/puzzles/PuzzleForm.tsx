"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAIN_AREAS, OTHER_CITIES } from "@/lib/constants/areas";
import { toast } from "sonner";
import { Minus, Plus, MessageCircle, Calendar, MapPin, Coins, Users, Sparkles, ArrowRight, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeSheet } from "@/components/ui/datetime-sheet";
import type { GenderPref, AgePref, VibePref } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";

// 총 예산 빠른 추가 (만원 단위)
const BUDGET_PRESETS = [50000, 100000];

// 인원 설정(내 일행 구성): 혼성
const GENDER_OPTIONS_FIXED: { value: GenderPref; label: string }[] = [
  { value: "male_only", label: "남" },
  { value: "female_only", label: "녀" },
  { value: "any", label: "혼성" },
];

// 파티원 모집(원하는 상대): 상관없음
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

const VIBE_OPTIONS: { value: VibePref; label: string }[] = [
  { value: "chill", label: "조용히" },
  { value: "active", label: "신나게" },
  { value: "any", label: "상관없음" },
];

export function PuzzleForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [eventDate, setEventDate] = useState("");
  const [area, setArea] = useState("");
  // OFF: 총액 직접 입력 / ON: 인당 입력
  const [budgetAmount, setBudgetAmount] = useState(0);
  const [budgetInputStr, setBudgetInputStr] = useState("");
  const [isRecruitingParty, setIsRecruitingParty] = useState(false);
  // OFF 모드(인원 확정): 본인 포함 총 일행 수
  const [totalPeople, setTotalPeople] = useState(2);
  // ON 모드(파티원 모집): 목표 인원 + 본인 동행
  const [targetCount, setTargetCount] = useState(4);
  const [hasGuest, setHasGuest] = useState(false);
  const [guestCount, setGuestCount] = useState(1);
  const [genderPref, setGenderPref] = useState<GenderPref>("any");
  const [agePref, setAgePref] = useState<AgePref>("any");
  const [vibePref, setVibePref] = useState<VibePref>("any");
  const [submitting, setSubmitting] = useState(false);
  const [showOtherCities, setShowOtherCities] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    trackEvent('puzzle_form_view');
  }, []);

  const fail = (error_type: string, error_message: string) => {
    trackEvent('puzzle_validation_error', { error_type, error_message });
    toast.error(error_message);
  };

  const todayObj = new Date();
  const today = todayObj.toISOString().split("T")[0];
  const maxObj = new Date();
  maxObj.setDate(todayObj.getDate() + 14);
  const maxDateStr = maxObj.toISOString().split("T")[0];

  // 모드별 인원/예산 파생값
  const effectiveTargetCount = isRecruitingParty ? targetCount : totalPeople;
  const effectiveGuestCount = isRecruitingParty ? (hasGuest ? guestCount : 0) : Math.max(0, totalPeople - 1);
  const effectiveCurrentCount = isRecruitingParty ? 1 + effectiveGuestCount : totalPeople;
  // OFF: budgetAmount = 총액, ON: budgetAmount = 인당
  const totalBudget = isRecruitingParty ? budgetAmount * effectiveTargetCount : budgetAmount;
  const maxOfferPrice = Math.ceil(totalBudget * 1.3);

  // expires_at: event_date 당일 21:00 KST = 12:00 UTC
  const getExpiresAt = (date: string) => {
    return `${date}T12:00:00.000Z`;
  };

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
    trackEvent('puzzle_submit_attempt', {
      is_recruiting_party: isRecruitingParty,
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
    if (isRecruitingParty && budgetAmount < 10000) {
      return fail('budget_per_person', '인당 예산은 최소 1만원 이상이어야 합니다');
    }
    if (!isRecruitingParty && budgetAmount < 10000 * totalPeople) {
      return fail('budget_total', `${totalPeople}명 기준 최소 ${(10000 * totalPeople).toLocaleString()}원 이상이어야 합니다`);
    }
    if (isRecruitingParty && effectiveCurrentCount > effectiveTargetCount) {
      return fail('headcount_overflow', '동행 인원이 모집 인원을 초과합니다');
    }
    if (!isRecruitingParty && totalPeople < 2) {
      return fail('headcount_min', '인원 확정 깃발은 2명 이상이어야 합니다');
    }

    setSubmitting(true);
    try {
      const { data: puzzle, error: puzzleError } = await supabase
        .from("puzzles")
        .insert({
          leader_id: userId,
          area,
          event_date: eventDate,
          gender_pref: genderPref,
          age_pref: agePref,
          vibe_pref: vibePref,
          total_budget: totalBudget,
          budget_per_person: isRecruitingParty
            ? budgetAmount
            : Math.round(budgetAmount / totalPeople), // 하위 호환용
          target_count: effectiveTargetCount,
          current_count: effectiveCurrentCount,
          is_recruiting_party: isRecruitingParty,
          notes: notes.trim() || null,
          expires_at: getExpiresAt(eventDate),
        })
        .select("id")
        .single();

      if (puzzleError) {
        console.error("puzzles insert error:", puzzleError);
        return fail('db_error', puzzleError.message || '깃발 꽂기에 실패했습니다');
      }

      // 대표자를 puzzle_members에도 추가
      const { error: memberError } = await supabase.from("puzzle_members").insert({
        puzzle_id: puzzle.id,
        user_id: userId,
        guest_count: effectiveGuestCount,
      });
      if (memberError) console.error("puzzle_members insert error:", memberError);

      trackEvent('puzzle_created', {
        puzzle_id: puzzle.id,
        area,
        total_budget: totalBudget,
        target_count: effectiveTargetCount,
      });

      toast.success(isRecruitingParty ? "깃발을 꽂았어요! 파티원과 MD를 기다려봐요" : "깃발을 꽂았어요! MD 제안을 기다려봐요");
      router.push(`/flags/${puzzle.id}`);
    } catch (err) {
      console.error("puzzle submit error:", err);
      toast.error(err instanceof Error ? err.message : "등록에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
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
          placeholder="방문 희망 날짜를 선택해주세요"
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
            {MAIN_AREAS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setArea(a)}
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
                  onClick={() => { setArea(a); setShowOtherCities(false); }}
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
        </div>
      </section>

      {/* 파티원 여부 — 텍스트 왼쪽, 체크 오른쪽 */}
      <label className="flex items-center justify-between cursor-pointer px-1">
        <span className="text-[14px] font-bold text-white">파티원 모으기</span>
        <input
          type="checkbox"
          checked={isRecruitingParty}
          onChange={(e) => setIsRecruitingParty(e.target.checked)}
          className="w-4 h-4 rounded accent-green-500 shrink-0"
        />
      </label>
      {isRecruitingParty && (
        <div className="bg-[#1C1C1E] border border-green-500/30 rounded-2xl px-4 py-3">
          <p className="text-[12px] text-green-400 leading-relaxed">
            인원이 모이면 MD에게 더 좋은 조건을 요청할 수 있어요.
          </p>
        </div>
      )}

      {/* 인원 설정 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Users className="w-4 h-4 text-green-500" />
          <span>인원 설정</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
          <div>
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
                    onClick={() => setTotalPeople(Math.min(20, totalPeople + 1))}
                    className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500">
                  MD가 인원에 맞춰 테이블·음료를 세팅해요
                </p>
              </div>
            ) : null}

            {/* 성별 — 내 일행 구성 (혼성) */}
            <div className="pt-3 border-t border-neutral-800 space-y-2">
              <p className="text-[11px] text-neutral-400">{isRecruitingParty ? "파티원 성별" : "성별"}</p>
              <div className="flex gap-2">
                {(isRecruitingParty ? GENDER_OPTIONS_RECRUIT : GENDER_OPTIONS_FIXED).map((opt) => (
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
            </div>

            {isRecruitingParty ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[11px] text-neutral-400">목표 인원 (본인 포함)</p>
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
                      onClick={() => setTargetCount(Math.min(20, targetCount + 1))}
                      className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-500">최소 2명, 최대 20명</p>
                </div>
                <div className="pt-2 border-t border-neutral-800 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasGuest}
                      onChange={(e) => {
                        setHasGuest(e.target.checked);
                        if (!e.target.checked) setGuestCount(1);
                      }}
                      className="w-4 h-4 rounded accent-white"
                    />
                    <span className="text-[13px] font-bold text-white">본인이 이미 데려가는 일행이 있나요?</span>
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
                      <span className="text-[15px] font-black text-white">동행 {guestCount}명</span>
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
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* 예산 (모드에 따라 총액 or 인당) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Coins className="w-4 h-4 text-amber-500" />
          <span>{isRecruitingParty ? "인당 예산" : "예산"}</span>
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
              placeholder={isRecruitingParty ? "예: 250,000" : "총: 1,000,000"}
              className="bg-neutral-900 border-neutral-800 h-11 text-white font-bold focus:ring-amber-500 pr-12"
            />
            {isRecruitingParty && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-neutral-500 font-bold pointer-events-none">
                /인
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {BUDGET_PRESETS.map((preset) => (
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
                className="flex-1 h-9 bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white hover:border-amber-500/50 font-bold text-xs"
              >
                +{(preset / 10000).toFixed(0)}만
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setBudgetAmount(0); setBudgetInputStr(""); }}
              className="h-9 px-3 bg-neutral-900 border-neutral-700 text-neutral-500 hover:bg-neutral-800 hover:text-white hover:border-red-500/50 font-bold text-xs"
            >
              초기화
            </Button>
          </div>
          {/* 예산 요약 */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3">
            {isRecruitingParty && (
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                인당 <span className="text-amber-400 font-bold">{budgetAmount.toLocaleString()}원</span>
                {" "}× {effectiveTargetCount}명 = 총{" "}
                <span className="text-white font-bold">{totalBudget.toLocaleString()}원</span>
              </p>
            )}
            <p className="text-[11px] text-neutral-600 mt-1">
              * 프리미엄 제안(최대 +30%)이 올 수 있습니다. (최대 {maxOfferPrice.toLocaleString()}원)
            </p>
          </div>
        </div>
      </section>

      {/* 취향 태그 — 파티원 모집 중일 때만 */}
      {isRecruitingParty && <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2 text-white font-bold mb-1">
            <Sparkles className="w-4 h-4 text-green-500" />
            <span>이런 분들과 함께해요</span>
          </div>
          <p className="text-[11px] text-neutral-500 ml-6">필수 아님 — 참여자가 스스로 판단할 수 있도록 도와줍니다</p>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-[11px] text-neutral-400 mb-2">성별</p>
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
          </div>

          <div>
            <p className="text-[11px] text-neutral-400 mb-2">연령</p>
            <div className="flex gap-2">
              {AGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAgePref(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
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

          <div>
            <p className="text-[11px] text-neutral-400 mb-2">분위기</p>
            <div className="flex gap-2">
              {VIBE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVibePref(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
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

      {/* 깃발 제목 (한 줄 메모) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <MessageCircle className="w-4 h-4 text-purple-500" />
          <span>깃발 제목</span>
          <span className="text-[11px] text-neutral-500 font-normal ml-1">MD가 가장 먼저 읽는 문구예요</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4">
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isRecruitingParty
              ? "예) 오늘 강남에서 생파할 텐션 높은 분 모여요🔥 (최대 25자)"
              : "예) 강남 토요일 4명, 서비스 넉넉한 MD님 기다려요! (최대 25자)"}
            className="bg-neutral-900 border-neutral-800 h-12 text-[14px] font-bold text-white focus:ring-amber-500 placeholder:text-neutral-600 placeholder:font-normal"
            maxLength={25}
          />
        </div>
      </section>

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
            예산 {totalBudget.toLocaleString()}원 · {totalPeople}명
          </p>
        )}
        {!isRecruitingParty ? (
          <p className="text-[11px] text-green-500/60">
            {totalPeople}명 확정 · 파티원 미모집
          </p>
        ) : hasGuest ? (
          <p className="text-[11px] text-green-500/60">
            본인 + 동행 {guestCount}명으로 시작 ({effectiveCurrentCount}/{effectiveTargetCount}명)
          </p>
        ) : (
          <p className="text-[11px] text-green-500/60">
            본인 1명으로 시작 (파티원 {effectiveTargetCount - 1}명 모집 중)
          </p>
        )}
      </div>

      {/* 제출 버튼 */}
      <div className="mt-12 px-1">
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 rounded-2xl bg-white text-black font-black text-lg hover:bg-neutral-200 shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {submitting ? "꽂는 중..." : (
            <>
              <Flag className="w-5 h-5" />
              깃발 꽂기
            </>
          )}
          {!submitting && <ArrowRight className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}
