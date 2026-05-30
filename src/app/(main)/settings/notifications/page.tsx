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
  Moon,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
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
    label: "새 깃발 알람",
    desc: "지역 선택",
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

  // 전화번호 편집
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
  const [quietInitialized, setQuietInitialized] = useState(false);

  // MD 깃발 구독 지역
  const SEOUL_AREAS = ["강남", "홍대", "이태원"] as const;
  const [puzzleAreas, setPuzzleAreas] = useState<string[]>([]);
  const [savedAreas, setSavedAreas] = useState<string[]>([]);
  const [savingAreas, setSavingAreas] = useState(false);
  const allSelected = SEOUL_AREAS.every((a) => puzzleAreas.includes(a));
  const areasDirty =
    puzzleAreas.length !== savedAreas.length ||
    puzzleAreas.some((a) => !savedAreas.includes(a));

  // 야간알림 baseline (dirty 체크용)
  const [savedNightState, setSavedNightState] = useState<{
    enabled: boolean;
    scope: 'everyday' | 'weekends';
  }>({ enabled: true, scope: 'everyday' });
  const quietDirty =
    savedNightState.enabled !== nightEnabled ||
    (nightEnabled && savedNightState.scope !== quietScope);

  // user 로드 시 초기값 설정
  useEffect(() => {
    if (!user) return;
    setPushPrefs({
      notify_offer_arrived: user.notify_offer_arrived ?? true,
      notify_new_puzzle: user.notify_new_puzzle ?? true,
      notify_offer_response: user.notify_offer_response ?? true,
      notify_marketing: user.notify_marketing ?? true,
    });
    // 야간알림은 최초 1회만 초기화 (refetch 후 사용자 편집 내용 덮어쓰기 방지)
    if (!quietInitialized) {
      // 옵트인 UI 매핑:
      //   quiet_enabled=false → 받기 ON, scope=everyday (24시간 받기)
      //   quiet_enabled=true + scope=weekdays → 받기 ON, scope=weekends (주말만 받기)
      //   quiet_enabled=true + scope=everyday → 받기 OFF (매일 야간 차단)
      const dbEnabled = user.quiet_hours_enabled ?? false;
      const dbScope = user.quiet_hours_scope ?? 'everyday';
      let uiEnabled: boolean;
      let uiScope: 'everyday' | 'weekends';
      if (!dbEnabled) {
        uiEnabled = true;
        uiScope = 'everyday';
      } else if (dbScope === 'weekdays') {
        uiEnabled = true;
        uiScope = 'weekends';
      } else {
        uiEnabled = false;
        uiScope = 'everyday';
      }
      setNightEnabled(uiEnabled);
      setQuietScope(uiScope);
      setSavedNightState({ enabled: uiEnabled, scope: uiScope });
      setQuietStart(user.quiet_hours_start ?? 22);
      setQuietEnd(user.quiet_hours_end ?? 4);
      setQuietInitialized(true);
    }
  }, [user, quietInitialized]);

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
        const areas = data.map((r: { area: string }) => r.area);
        setPuzzleAreas(areas);
        setSavedAreas(areas);
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

  const toggleAll = () => {
    setPuzzleAreas((prev) => {
      const isAll = SEOUL_AREAS.every((a) => prev.includes(a));
      if (isAll) {
        return prev.filter((a) => !SEOUL_AREAS.includes(a as typeof SEOUL_AREAS[number]));
      }
      const merged = new Set([...prev, ...SEOUL_AREAS]);
      return Array.from(merged);
    });
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
      setSavedAreas(puzzleAreas);
      toast.success("깃발 알림 지역이 저장되었습니다");
    } catch (error: unknown) {
      logError(error, "Save MD puzzle areas");
      toast.error(getErrorMessage(error));
    } finally {
      setSavingAreas(false);
    }
  };

  // 마스터 토글: 모든 카테고리가 ON이면 ON, 하나라도 OFF면 OFF
  const masterPushOn = categories.every((c) => pushPrefs[c.key]);
  const [savingMaster, setSavingMaster] = useState(false);

  const handleToggleMasterPush = async () => {
    if (!user) return;
    const newValue = !masterPushOn;
    setSavingMaster(true);
    try {
      const updates: Record<string, boolean> = {};
      categories.forEach((c) => {
        updates[c.key] = newValue;
      });
      const { error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", user.id);
      if (error) throw error;
      setPushPrefs((prev) => {
        const next = { ...prev };
        categories.forEach((c) => {
          next[c.key] = newValue;
        });
        return next;
      });
      refetch();
    } catch (error: unknown) {
      logError(error, "Toggle master push");
      toast.error(getErrorMessage(error));
    } finally {
      setSavingMaster(false);
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
    // 옵트인 → DB 매핑
    //   받기 ON, scope=everyday  → quiet_enabled=false (24시간 받기)
    //   받기 ON, scope=weekends  → quiet_enabled=true, scope='weekdays' (평일 차단=주말만 받기)
    //   받기 OFF                 → quiet_enabled=true, scope='everyday' (매일 야간 차단)
    let dbEnabled: boolean;
    let dbScope: 'everyday' | 'weekends' | 'weekdays';
    if (!nightEnabled) {
      dbEnabled = true;
      dbScope = 'everyday';
    } else if (quietScope === 'weekends') {
      dbEnabled = true;
      dbScope = 'weekdays';
    } else {
      dbEnabled = false;
      dbScope = 'everyday';
    }
    setSavingQuiet(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          quiet_hours_enabled: dbEnabled,
          quiet_hours_start: dbEnabled ? 22 : null,
          quiet_hours_end: dbEnabled ? 4 : null,
          quiet_hours_scope: dbScope,
        })
        .eq("id", user.id);
      if (error) throw error;
      setSavedNightState({ enabled: nightEnabled, scope: quietScope });
      refetch();
      toast.success(
        nightEnabled
          ? quietScope === 'weekends'
            ? "주말만 야간 알림을 받아요"
            : "매일 야간 알림을 받아요"
          : "야간 알림이 꺼졌어요"
      );
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

        {/* Section: 앱 푸시 알림 (카테고리 토글 + 마스터 토글) */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-white shrink-0" />
              <h2 className="text-[15px] font-bold text-white">앱 푸시 알림</h2>
            </div>
            <button
              onClick={handleToggleMasterPush}
              disabled={savingMaster}
              className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${
                masterPushOn ? "bg-green-500" : "bg-neutral-700"
              } ${savingMaster ? "opacity-50" : ""}`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                  masterPushOn ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] text-neutral-500 mb-4 ml-6">
            카카오톡 알림톡과 별도예요
          </p>

          <div className="space-y-1">
            {categories.map((cat) => {
              const enabled = pushPrefs[cat.key];
              const saving = savingCategory === cat.key;
              return (
                <div key={cat.key}>
                  <div className="flex items-start justify-between py-2.5">
                    <div className={`flex-1 pr-3 ${enabled ? "" : "opacity-60"}`}>
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

                  {/* '새 깃발' 카테고리 하위: 구독 지역 선택 (MD 전용) */}
                  {cat.key === "notify_new_puzzle" && isMD && (
                    <div
                      className={`pb-3 pl-1 ${
                        enabled ? "" : "opacity-40 pointer-events-none"
                      }`}
                    >
                      <div className="flex flex-wrap gap-2 mb-2">
                        <button
                          type="button"
                          onClick={toggleAll}
                          className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
                            allSelected
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500"
                          }`}
                        >
                          전체
                        </button>
                        {SEOUL_AREAS.map((area) => {
                          const selected = puzzleAreas.includes(area);
                          return (
                            <button
                              key={area}
                              type="button"
                              onClick={() => toggleArea(area)}
                              className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
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
                      {areasDirty && (
                        <button
                          onClick={handleSaveAreas}
                          disabled={savingAreas}
                          className="w-full bg-white text-black font-black py-2.5 rounded-lg text-[13px] disabled:opacity-50"
                        >
                          {savingAreas ? "저장 중..." : "지역 저장"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section: 야간알림 수신 (옵트인) */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-blue-400 shrink-0" />
              <h2 className="text-[15px] font-bold text-white">야간 알림 받기</h2>
            </div>
            <button
              onClick={() => {
                const next = !nightEnabled;
                if (next) {
                  setQuietStart(22);
                  setQuietEnd(4);
                }
                setNightEnabled(next);
              }}
              className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${
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
          <p className="text-[11px] text-neutral-500 mb-4 ml-6">
            켜두면 지정한 시간대 야간 핫딜 알림을 받아요 (알림톡은 영향 없음)
          </p>

          {nightEnabled ? (
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-[12px] text-neutral-500 mb-2">받을 요일</p>
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
              </div>

              <p className="text-[11px] text-amber-300/90 leading-snug">
                🔥 {quietScope === 'weekends' ? '금/토' : '매일'} 밤 10시 ~ 새벽 4시 야간 핫딜 알림을 받아요
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-neutral-800/60 border border-neutral-700 p-3 mb-4">
              <p className="text-[12px] text-neutral-300 font-bold leading-relaxed">
                야간 시간대 알림이 꺼져있어요
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed mt-1">
                클럽 테이블 특가는 보통 밤 10시 ~ 새벽 4시에 풀려요. 켜두면 핫딜을 놓치지 않아요.
              </p>
            </div>
          )}

          {quietDirty && (
            <button
              onClick={handleSaveQuietHours}
              disabled={savingQuiet}
              className="w-full bg-white text-black font-black py-3 rounded-xl text-[14px] disabled:opacity-50"
            >
              {savingQuiet ? "저장 중..." : "야간알림 설정 저장"}
            </button>
          )}
        </div>

        {/* Section: 카카오 알림톡 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <h2 className="text-[15px] font-bold text-white mb-1">카카오 알림톡</h2>
          <p className="text-[11px] text-neutral-500 mb-4">
            낙찰·노쇼 등 거래 안내가 알림톡으로 발송돼요. 정보성이라 별도 수신 거부는 없어요.
          </p>

          <div className="space-y-4">
            {/* 전화번호 (본인인증된 값 읽기 전용) */}
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-neutral-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] text-neutral-500">전화번호</p>
                <div className="flex items-center justify-between">
                  <p className="text-[14px] text-white font-bold">
                    {user.phone || "—"}
                  </p>
                  <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    본인인증 완료
                  </span>
                </div>
              </div>
            </div>

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
