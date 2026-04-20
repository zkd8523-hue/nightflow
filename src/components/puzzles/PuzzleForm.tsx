"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAIN_AREAS, OTHER_CITIES } from "@/lib/constants/areas";
import { toast } from "sonner";
import { Minus, Plus, MessageCircle, Calendar, MapPin, Coins, Users, Sparkles, ArrowRight } from "lucide-react";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeSheet } from "@/components/ui/datetime-sheet";
import type { GenderPref, AgePref, VibePref } from "@/types/database";
import { trackEvent } from "@/lib/analytics/events";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIdentityGuard } from "@/hooks/useIdentityGuard";

// 총 예산 빠른 추가 (만원 단위)
const BUDGET_PRESETS = [50000, 100000];

const GENDER_OPTIONS: { value: GenderPref; label: string }[] = [
  { value: "male_only", label: "남성만" },
  { value: "female_only", label: "여성만" },
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
  const { user, refetch: refetchUser } = useCurrentUser();
  const { requireIdentity } = useIdentityGuard(user);

  const [kakaoUrl, setKakaoUrl] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [area, setArea] = useState("");
  const [perPersonBudget, setPerPersonBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [targetCount, setTargetCount] = useState(4);
  const [hasGuest, setHasGuest] = useState(false);
  const [guestCount, setGuestCount] = useState(1);
  const [genderPref, setGenderPref] = useState<GenderPref>("any");
  const [agePref, setAgePref] = useState<AgePref>("any");
  const [vibePref, setVibePref] = useState<VibePref>("any");
  const [submitting, setSubmitting] = useState(false);
  const [showOtherCities, setShowOtherCities] = useState(false);
  const [notes, setNotes] = useState("");

  const todayObj = new Date();
  const today = todayObj.toISOString().split("T")[0];
  const maxObj = new Date();
  maxObj.setDate(todayObj.getDate() + 14);
  const maxDateStr = maxObj.toISOString().split("T")[0];
  const effectiveGuestCount = hasGuest ? guestCount : 0;
  const initialCount = 1 + effectiveGuestCount;
  const totalBudget = perPersonBudget * targetCount;
  const maxOfferPrice = Math.ceil(totalBudget * 1.3);

  // expires_at: event_date 당일 21:00 KST = 12:00 UTC
  const getExpiresAt = (date: string) => {
    return `${date}T12:00:00.000Z`;
  };

  const suggestedChatTitle = (() => {
    const mmdd = eventDate ? eventDate.split("-").slice(1).join("/") : "";
    return `[NightFlow] ${area || "지역미상"} ${mmdd} 모임`;
  })();

  const handleSubmit = async () => {
    if (!kakaoUrl.startsWith("https://open.kakao.com/o/")) {
      toast.error("올바른 오픈채팅 링크가 아닙니다. (https://open.kakao.com/o/... 형식)");
      return;
    }
    const verified = await requireIdentity({
      reason: "퍼즐 생성 전 휴대폰 본인인증이 필요합니다.",
    });
    if (!verified) return;
    await refetchUser();
    if (!notes.trim()) {
      toast.error("어떤 모임인지 한 줄로 표현해주세요");
      return;
    }
    if (!eventDate) {
      toast.error("날짜를 선택해주세요");
      return;
    }
    if (!area) {
      toast.error("지역을 선택해주세요");
      return;
    }
    if (perPersonBudget < 10000) {
      toast.error("인당 예산은 최소 1만원 이상이어야 합니다");
      return;
    }
    if (initialCount > targetCount) {
      toast.error("동행 인원이 모집 인원을 초과합니다");
      return;
    }

    setSubmitting(true);
    try {
      const { data: puzzle, error: puzzleError } = await supabase
        .from("puzzles")
        .insert({
          leader_id: userId,
          area,
          event_date: eventDate,
          kakao_open_chat_url: kakaoUrl,
          gender_pref: genderPref,
          age_pref: agePref,
          vibe_pref: vibePref,
          total_budget: totalBudget,
          budget_per_person: perPersonBudget, // 하위 호환용
          target_count: targetCount,
          current_count: initialCount,
          notes: notes.trim() || null,
          expires_at: getExpiresAt(eventDate),
        })
        .select("id")
        .single();

      if (puzzleError) {
        console.error("puzzles insert error:", puzzleError);
        toast.error(puzzleError.message || "퍼즐 등록에 실패했습니다");
        return;
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
        target_count: targetCount,
      });

      toast.success("퍼즐이 등록되었습니다!");
      router.push(`/puzzles/${puzzle.id}`);
    } catch (err) {
      console.error("puzzle submit error:", err);
      toast.error(err instanceof Error ? err.message : "등록에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* 방 제목 (한 줄 메모) */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <MessageCircle className="w-4 h-4 text-purple-500" />
          <span>퍼즐 제목</span>
          <span className="text-[11px] text-neutral-500 font-normal ml-1">카드에 제목으로 표시돼요</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4">
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="예) 오늘 강남에서 생파할 텐션 높은 분 모여요🔥 (최대 25자)"
            className="bg-neutral-900 border-neutral-800 h-12 text-[14px] font-bold text-white focus:ring-purple-500 placeholder:text-neutral-600 placeholder:font-normal"
            maxLength={25}
          />
        </div>
      </section>

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
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5">
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

      {/* 인당 예산 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Coins className="w-4 h-4 text-amber-500" />
          <span>인당 예산</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
          <Input
            type="text"
            inputMode="numeric"
            value={budgetInput}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, "");
              setBudgetInput(e.target.value);
              if (raw === "") { setPerPersonBudget(0); return; }
              const num = Number(raw);
              if (!isNaN(num)) setPerPersonBudget(num);
            }}
            onBlur={() => {
              if (perPersonBudget > 0) {
                setBudgetInput(perPersonBudget.toLocaleString());
              }
            }}
            placeholder="예: 250,000"
            className="bg-neutral-900 border-neutral-800 h-11 text-white font-bold focus:ring-amber-500"
          />
          <div className="flex gap-2">
            {BUDGET_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = (perPersonBudget || 0) + preset;
                  setPerPersonBudget(next);
                  setBudgetInput(next.toLocaleString());
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
              onClick={() => {
                setPerPersonBudget(0);
                setBudgetInput("");
              }}
              className="h-9 px-3 bg-neutral-900 border-neutral-700 text-neutral-500 hover:bg-neutral-800 hover:text-white hover:border-red-500/50 font-bold text-xs"
            >
              초기화
            </Button>
          </div>
          {/* 총 예산 계산 표시 */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3">
            <p className="text-[12px] text-neutral-400 leading-relaxed">
              인당 <span className="text-amber-400 font-bold">{perPersonBudget.toLocaleString()}원</span>
              {" "}× {targetCount}명 = 총{" "}
              <span className="text-white font-bold">{totalBudget.toLocaleString()}원</span>
            </p>
            <p className="text-[11px] text-neutral-600 mt-1">
              * 프리미엄 제안(최대 +30%)이 올 수 있습니다. (최대 {maxOfferPrice.toLocaleString()}원)
            </p>
          </div>
        </div>
      </section>

      {/* 모집 인원 + 동행 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold mb-2">
          <Users className="w-4 h-4 text-green-500" />
          <span>인원 설정</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4">
          {/* 모집 인원 */}
          <div className="space-y-2">
            <p className="text-[11px] text-neutral-400">모집 인원 (본인 포함)</p>
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

          {/* 동행 */}
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
              <span className="text-[13px] font-bold text-white">동행이 있으신가요?</span>
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
      </section>

      {/* 취향 태그 */}
      <section className="space-y-4">
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
              {GENDER_OPTIONS.map((opt) => (
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
      </section>

      {/* 카카오 오픈채팅 URL */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-white font-bold">
          <MessageCircle className="w-4 h-4 text-green-500" />
          <span>카카오 오픈채팅 URL</span>
        </div>
        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-3">
          <Input
            type="url"
            value={kakaoUrl}
            onChange={(e) => setKakaoUrl(e.target.value)}
            placeholder="https://open.kakao.com/o/..."
            className="bg-neutral-900 border-neutral-800 h-11 text-white focus:ring-green-500"
          />
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            방 만든 후 URL을 붙여넣어 주세요.
            <br />
            오퍼를 수락한 MD에게만 공개됩니다.
          </p>
          <KakaoOpenChatGuide suggestedTitle={suggestedChatTitle} />
        </div>
      </section>

      {/* 총 예산 미리보기 */}
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-1">
        <p className="text-[11px] text-green-500/70">예산 요약</p>
        <p className="text-[18px] font-black text-green-500 leading-snug break-keep">
          총 {totalBudget.toLocaleString()}원 / {targetCount}명<br />
          = 인당 {perPersonBudget.toLocaleString()}원
        </p>
        {hasGuest && (
          <p className="text-[11px] text-green-500/60">
            본인 + 동행 {guestCount}명으로 시작 ({initialCount}명 확정)
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
          {submitting ? "등록 중..." : "퍼즐 올리기"}
          {!submitting && <ArrowRight className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}
