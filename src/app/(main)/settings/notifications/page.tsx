"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Phone,
  Info,
  MapPin,
  Moon,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { getErrorMessage, logError } from "@/lib/utils/error";

// 푸시 카테고리 정의 (역할별)
type PushCategory =
  | "notify_offer_arrived"
  | "notify_new_puzzle"
  | "notify_offer_response"
  | "notify_marketing";

const USER_CATEGORIES: { key: PushCategory; label: string; desc: string }[] = [
  {
    key: "notify_offer_arrived",
    label: "오퍼 도착",
    desc: "내가 꽂은 깃발에 MD가 오퍼를 보냈을 때",
  },
  {
    key: "notify_marketing",
    label: "마케팅·이벤트",
    desc: "신규 클럽 오픈, 프로모션 등",
  },
];

const MD_CATEGORIES: { key: PushCategory; label: string; desc: string }[] = [
  {
    key: "notify_new_puzzle",
    label: "새 깃발 (구독 지역)",
    desc: "선택한 지역에 새 깃발이 꽂혔을 때",
  },
  {
    key: "notify_offer_response",
    label: "오퍼 응답",
    desc: "내가 보낸 오퍼를 유저가 수락/거절했을 때",
  },
  {
    key: "notify_marketing",
    label: "마케팅·이벤트",
    desc: "신규 정책, 프로모션 등",
  },
];

export default function NotificationSettingsPage() {
  const { user, isLoading, refetch } = useCurrentUser();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const isMD = user?.role === "md" || user?.role === "admin";
  const categories = isMD ? MD_CATEGORIES : USER_CATEGORIES;

  // 알림톡 상태
  const [alimtalkConsent, setAlimtalkConsent] = useState(false);
  const [toggling, setToggling] = useState(false);

  // 전화번호 편집
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  // 푸시 카테고리 토글 (역할별 다름)
  const [pushPrefs, setPushPrefs] = useState<Record<PushCategory, boolean>>({
    notify_offer_arrived: true,
    notify_new_puzzle: true,
    notify_offer_response: true,
    notify_marketing: true,
  });
  const [savingCategory, setSavingCategory] = useState<PushCategory | null>(null);

  // 야간알림 수신 (내부적으로는 quiet_hours, 토글 의미 반전: ON=수신, OFF=차단)
  const [nightEnabled, setNightEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState<number>(0);
  const [quietEnd, setQuietEnd] = useState<number>(8);
  const [quietScope, setQuietScope] = useState<'everyday' | 'weekends'>('everyday');
  const [savingQuiet, setSavingQuiet] = useState(false);

  // MD 깃발 구독 지역
  const SEOUL_AREAS = ["강남", "홍대", "이태원", "건대"] as const;
  const REGIONAL_AREAS = ["부산", "대구", "인천", "광주", "대전", "울산", "세종"] as const;
  const [puzzleAreas, setPuzzleAreas] = useState<string[]>([]);
  const [savingAreas, setSavingAreas] = useState(false);

  // user 로드 시 초기값 설정
  useEffect(() => {
    if (!user) return;
    setAlimtalkConsent(user.alimtalk_consent || false);
    setPushPrefs({
      notify_offer_arrived: user.notify_offer_arrived ?? true,
      notify_new_puzzle: user.notify_new_puzzle ?? true,
      notify_offer_response: user.notify_offer_response ?? true,
      notify_marketing: user.notify_marketing ?? true,
    });
    setNightEnabled(!(user.quiet_hours_enabled ?? false));
    setQuietScope(user.quiet_hours_scope ?? 'everyday');
    setQuietStart(user.quiet_hours_start ?? 0);
    setQuietEnd(user.quiet_hours_end ?? 8);
  }, [user]);

  // MD 구독 지역 로드
  useEffect(() => {
    if (!isMD || !user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("md_puzzle_area_subs")
        .select("area")
        .eq("md_id", user.id);
      if (error) {
        logError(error, "Load MD puzzle area subs");
        return;
      }
      if (!cancelled && data) {
        setPuzzleAreas(data.map((r: { area: string }) => r.area));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMD, user, supabase]);

  const toggleArea = (area: string) => {
    setPuzzleAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const handleSaveAreas = async () => {
    setSavingAreas(true);
    try {
      const { data, error } = await supabase.rpc("set_md_puzzle_areas", {
        p_areas: puzzleAreas,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || "저장 실패");
      toast.success("깃발 알림 지역이 저장되었습니다");
    } catch (error: unknown) {
      logError(error, "Save MD puzzle areas");
      toast.error(getErrorMessage(error));
    } finally {
      setSavingAreas(false);
    }
  };

  const handleTogglePushCategory = useCallback(
    async (category: PushCategory) => {
      if (!user) return;
      const newValue = !pushPrefs[category];
      setSavingCategory(category);
      try {
        const { error } = await supabase
          .from("users")
          .update({ [category]: newValue })
          .eq("id", user.id);
        if (error) throw error;
        setPushPrefs((prev) => ({ ...prev, [category]: newValue }));
        refetch();
      } catch (error: unknown) {
        logError(error, `Toggle ${category}`);
        toast.error(getErrorMessage(error));
      } finally {
        setSavingCategory(null);
      }
    },
    [user, pushPrefs, supabase, refetch]
  );

  const handleSaveQuietHours = async () => {
    if (!user) return;
    const quietEnabled = !nightEnabled;
    if (quietEnabled && quietStart === quietEnd) {
      toast.error("시작 시각과 종료 시각이 같을 수 없어요");
      return;
    }
    setSavingQuiet(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          quiet_hours_enabled: quietEnabled,
          quiet_hours_start: quietEnabled ? quietStart : null,
          quiet_hours_end: quietEnabled ? quietEnd : null,
          quiet_hours_scope: quietEnabled ? quietScope : 'everyday',
        })
        .eq("id", user.id);
      if (error) throw error;
      refetch();
      toast.success(nightEnabled ? "야간알림 수신이 켜졌어요" : "야간 시간대 알림이 꺼졌어요");
    } catch (error: unknown) {
      logError(error, "Save quiet hours");
      toast.error(getErrorMessage(error));
    } finally {
      setSavingQuiet(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/settings/notifications");
    return null;
  }

  // ── 알림톡 동의 토글 ──
  const handleToggleConsent = async () => {
    const newValue = !alimtalkConsent;

    // OFF→ON: 전화번호 필수
    if (newValue && !user.phone) {
      toast.error("전화번호를 먼저 등록해주세요");
      setEditingPhone(true);
      setPhoneInput("");
      return;
    }

    setToggling(true);
    try {
      const updateData: Record<string, unknown> = {
        alimtalk_consent: newValue,
      };
      if (newValue) {
        updateData.alimtalk_consent_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", user.id);

      if (error) throw error;

      setAlimtalkConsent(newValue);
      refetch();
      toast.success(newValue ? "알림톡 수신이 활성화되었습니다" : "알림톡 수신이 해제되었습니다");
    } catch (error: unknown) {
      logError(error, "Toggle Alimtalk Consent");
      toast.error(getErrorMessage(error));
    } finally {
      setToggling(false);
    }
  };

  // ── 전화번호 저장 ──
  const handleSavePhone = async () => {
    const cleanPhone = phoneInput.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      toast.error("올바른 전화번호를 입력해주세요");
      return;
    }

    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ phone: cleanPhone })
        .eq("id", user.id);

      if (error) throw error;

      setEditingPhone(false);
      refetch();
      toast.success("전화번호가 저장되었습니다");
    } catch (error: unknown) {
      logError(error, "Save Phone");
      toast.error(getErrorMessage(error));
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <h1 className="text-xl font-black text-white">알림 설정</h1>
        </div>

        {/* Section: 앱 푸시 알림 (카테고리 토글) */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-white shrink-0" />
            <h2 className="text-[15px] font-bold text-white">앱 푸시 알림</h2>
          </div>
          <p className="text-[11px] text-neutral-500 mb-4 ml-6">
            카카오톡 알림톡과 별도예요
          </p>

          <div className="space-y-1">
            {categories.map((cat) => {
              const enabled = pushPrefs[cat.key];
              const saving = savingCategory === cat.key;
              return (
                <div key={cat.key} className="flex items-start justify-between py-2.5">
                  <div className="flex-1 pr-3">
                    <p className="text-[14px] text-white font-bold">{cat.label}</p>
                    <p className="text-[11px] text-neutral-500 leading-snug">
                      {cat.desc}
                    </p>
                  </div>
                  <button
                    onClick={() => handleTogglePushCategory(cat.key)}
                    disabled={saving}
                    className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${
                      enabled ? "bg-green-500" : "bg-neutral-700"
                    } ${saving ? "opacity-50" : ""}`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                        enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section: MD 깃발 알림 지역 (마스터 ON일 때만 활성) — MD/Admin 전용 */}
        {isMD && (
          <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-[15px] font-bold text-white">깃발 알림 지역</h2>
            </div>
            <p className="text-[12px] text-neutral-400 leading-relaxed mb-4">
              선택한 지역에 새 깃발이 꽂히면 푸시 알림을 받아요.
              <br />
              <span className="text-amber-400/80">
                ※ &lsquo;서울 어디든&rsquo; 깃발은 서울권(강남/홍대/이태원/건대) 1개라도 선택하면 자동 수신됩니다.
              </span>
              {!pushPrefs.notify_new_puzzle && (
                <>
                  <br />
                  <span className="text-red-400/80">
                    ※ &lsquo;새 깃발 (구독 지역)&rsquo; 토글이 꺼져있어 푸시가 발송되지 않습니다.
                  </span>
                </>
              )}
            </p>

            <div className={pushPrefs.notify_new_puzzle ? "" : "opacity-40 pointer-events-none"}>
              <div className="mb-3">
                <p className="text-[11px] text-neutral-500 mb-2">서울권</p>
                <div className="flex flex-wrap gap-2">
                  {SEOUL_AREAS.map((area) => {
                    const selected = puzzleAreas.includes(area);
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => toggleArea(area)}
                        className={`px-3 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${
                          selected
                            ? "bg-white text-black border-white"
                            : "bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500"
                        }`}
                      >
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-4">
                <p className="text-[11px] text-neutral-500 mb-2">광역시·기타</p>
                <div className="flex flex-wrap gap-2">
                  {REGIONAL_AREAS.map((area) => {
                    const selected = puzzleAreas.includes(area);
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => toggleArea(area)}
                        className={`px-3 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${
                          selected
                            ? "bg-white text-black border-white"
                            : "bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500"
                        }`}
                      >
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleSaveAreas}
                disabled={savingAreas}
                className="w-full bg-white text-black font-black py-3 rounded-xl text-[14px] disabled:opacity-50"
              >
                {savingAreas ? "저장 중..." : "지역 저장"}
              </button>
            </div>
          </div>
        )}

        {/* Section: 야간알림 수신 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-blue-400 shrink-0" />
              <h2 className="text-[15px] font-bold text-white">야간알림 수신</h2>
            </div>
            <button
              onClick={() => setNightEnabled(!nightEnabled)}
              className={`w-12 h-7 rounded-full relative transition-colors ${
                nightEnabled ? "bg-green-500" : "bg-neutral-700"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                  nightEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {nightEnabled ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 mb-4">
              <p className="text-[12px] text-amber-300 font-bold leading-relaxed">
                🔥 야간 특가 알림을 받고 있어요
              </p>
              <p className="text-[11px] text-amber-200/80 leading-relaxed mt-1">
                클럽 테이블 특가는 보통 밤 10시 ~ 새벽 4시에 풀려요. 깃발·조각 핫딜을 놓치지 마세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3 mb-4">
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                지정한 시간대에는 푸시 알림을 받지 않아요. (알림톡은 영향 없음)
              </p>

              <div>
                <p className="text-[12px] text-neutral-500 mb-2">적용 요일</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'everyday', label: '매일' },
                    { key: 'weekends', label: '주말만 (금/토)' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setQuietScope(opt.key)}
                      className={`py-2 rounded-lg text-[13px] font-bold transition-colors ${
                        quietScope === opt.key
                          ? 'bg-white text-black'
                          : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-600 leading-snug mt-2">
                  {quietScope === 'weekends'
                    ? '금/토요일 밤에만 차단돼요. 일~목은 알림을 받아요'
                    : '매일 같은 시간대에 알림이 차단돼요'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[12px] text-neutral-500 w-12">시작</label>
                <select
                  value={quietStart}
                  onChange={(e) => setQuietStart(Number(e.target.value))}
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-[14px] text-white focus:outline-none focus:border-blue-500"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-[12px] text-neutral-500 w-12">종료</label>
                <select
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(Number(e.target.value))}
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-[14px] text-white focus:outline-none focus:border-blue-500"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-neutral-600 leading-snug">
                {quietStart < quietEnd
                  ? `매일 ${String(quietStart).padStart(2, "0")}:00 ~ ${String(quietEnd).padStart(2, "0")}:00 동안 알림이 차단돼요`
                  : quietStart > quietEnd
                  ? `매일 ${String(quietStart).padStart(2, "0")}:00 ~ 다음날 ${String(quietEnd).padStart(2, "0")}:00 동안 알림이 차단돼요`
                  : "시작과 종료가 같으면 적용되지 않아요"}
              </p>
              <p className="text-[11px] text-red-400/80 leading-snug">
                ⚠️ 클럽 특가는 대부분 밤 10시 ~ 새벽 4시에 풀려요. 차단 시 핫딜을 놓칠 수 있어요.
              </p>
            </div>
          )}

          <button
            onClick={handleSaveQuietHours}
            disabled={savingQuiet}
            className="w-full bg-white text-black font-black py-3 rounded-xl text-[14px] disabled:opacity-50"
          >
            {savingQuiet ? "저장 중..." : "야간알림 설정 저장"}
          </button>
        </div>

        {/* Section: 카카오 알림톡 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <h2 className="text-[15px] font-bold text-white mb-1">카카오 알림톡</h2>
          <p className="text-[11px] text-neutral-500 mb-4">
            푸시를 받지 못할 때의 백업 채널이에요
          </p>

          <div className="space-y-4">
            {/* 알림톡 수신 토글 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-neutral-500 shrink-0" />
                <div>
                  <p className="text-[14px] text-white font-bold">알림톡 수신</p>
                  <p className="text-[11px] text-neutral-500">마케팅·이벤트 알림</p>
                </div>
              </div>
              <button
                onClick={handleToggleConsent}
                disabled={toggling}
                className={`w-12 h-7 rounded-full relative transition-colors ${
                  alimtalkConsent ? "bg-green-500" : "bg-neutral-700"
                } ${toggling ? "opacity-50" : ""}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                    alimtalkConsent ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* 전화번호 */}
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-neutral-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] text-neutral-500">전화번호</p>
                {editingPhone ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="01012345678"
                      className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-[14px] text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => setEditingPhone(false)}
                      className="text-[13px] text-neutral-500 font-bold px-2"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSavePhone}
                      disabled={savingPhone}
                      className="text-[13px] text-blue-400 font-bold px-2 disabled:opacity-50"
                    >
                      {savingPhone ? "..." : "저장"}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] text-white font-bold">
                      {user.phone || "미등록"}
                    </p>
                    <button
                      onClick={() => {
                        setPhoneInput(user.phone || "");
                        setEditingPhone(true);
                      }}
                      className="text-[13px] text-blue-400 hover:text-blue-300 font-bold"
                    >
                      수정
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 동의 일시 */}
            {user.alimtalk_consent_at && (
              <p className="text-[11px] text-neutral-600 ml-7">
                동의 일시: {dayjs(user.alimtalk_consent_at).format("YYYY.MM.DD HH:mm")}
              </p>
            )}
          </div>
        </div>

        {/* Section: 거래·법적 통지 안내 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] text-white font-bold mb-1">거래·법적 안내</p>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                낙찰 확정, 노쇼 통지, 본인인증 등 거래·법적 안내는
                수신 동의 및 방해금지 설정과 무관하게 발송됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* Section: 경매 알림 안내 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] text-white font-bold mb-1">개별 경매 알림</p>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                개별 경매 알림은 경매 상세 페이지에서 🔔 아이콘을 눌러 설정할 수 있습니다
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
