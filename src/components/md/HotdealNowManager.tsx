"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, Flame, Plus, Clock, X, Building2, MapPin, Wine, CalendarClock, ChevronDown, Upload } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { createClient } from "@/lib/supabase/client";
import { DateTimeSheet } from "@/components/ui/datetime-sheet";
import { LiquorSelector } from "@/components/md/LiquorSelector";
import { TableFeatureSelector } from "@/components/md/TableFeatureSelector";
import { HotdealTemplateSelector } from "@/components/md/HotdealTemplateSelector";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getClubEventDate } from "@/lib/utils/date";
import { uploadImage } from "@/lib/utils/upload";
import type { DailyHotdeal, HotdealTemplate, HotdealTableZone } from "@/types/database";
import { TABLE_ZONE_OPTIONS } from "@/lib/utils/hotdeal";
import { Bookmark } from "lucide-react";
import { HotdealPreviewSheet } from "@/components/home/HotdealPreviewSheet";

dayjs.locale("ko");

interface ClubLite {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  floor_plan_url?: string | null;
}

interface Props {
  clubs: ClubLite[];
  initialMyHotdeals: DailyHotdeal[];
  /** Sheet 등 다른 컨테이너 안에서 띄울 때 자체 헤더/패딩 생략 */
  embedded?: boolean;
}

/**
 * 핫딜 종료시각 선택 옵션 — 얼리버드 today 모드와 동일.
 *  - 저녁: 영업일 18:00 ~ 23:59 (기본 22:00)
 *  - 새벽: 영업일+1 00:00 ~ 05:59 (기본 01:00)
 *
 * 영업일 계산: `getClubEventDate()` (새벽 6시 이전은 어제로 간주)
 * 기본값: 현재 시각이 새벽(< 6시)이면 새벽 옵션, 그 외엔 저녁 옵션
 */
function buildHotdealDateOptions() {
  const eventDate = getClubEventDate();
  const nextDate = dayjs(eventDate).add(1, "day").format("YYYY-MM-DD");
  const eveningOpt = {
    label: `${dayjs(eventDate).format("M/D (ddd)")} 저녁`,
    value: eventDate,
    minTime: "18:00",
    maxTime: "23:59",
    defaultTime: "22:00",
  };
  const dawnOpt = {
    label: `${dayjs(nextDate).format("M/D (ddd)")} 새벽`,
    value: nextDate,
    minTime: "00:00",
    maxTime: "05:59",
    defaultTime: "03:00",
  };
  const defaultValue = `${nextDate}T03:00`;
  return { options: [eveningOpt, dawnOpt], defaultValue };
}

export function HotdealNowManager({ clubs: initialClubs, initialMyHotdeals, embedded = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [clubs, setClubs] = useState(initialClubs);
  const [myHotdeals, setMyHotdeals] = useState<DailyHotdeal[]>(initialMyHotdeals);
  // ?new=1 또는 핫딜이 0건이면 폼 자동 펼침
  const [showForm, setShowForm] = useState(() => searchParams.get("new") === "1" || !!searchParams.get("edit"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 폼 필드
  const [clubId, setClubId] = useState<string>(clubs[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [price, setPrice] = useState("");
  const [walkMinutes, setWalkMinutes] = useState("");
  const [nearestStation, setNearestStation] = useState("");
  const [tableInfo, setTableInfo] = useState("");
  const [tableZone, setTableZone] = useState<HotdealTableZone | "">("");
  const [tableFeatures, setTableFeatures] = useState<string[]>([]);
  const [includes, setIncludes] = useState<string[]>([]);
  const [floorPlanExpanded, setFloorPlanExpanded] = useState(false);
  const [floorPlanUploading, setFloorPlanUploading] = useState(false);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);

  // 템플릿 관련 state
  const [mdId, setMdId] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showTemplateSavePrompt, setShowTemplateSavePrompt] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [lastCreatedHotdealId, setLastCreatedHotdealId] = useState<string | null>(null);
  // 등록 성공 직후의 폼 스냅샷 (템플릿 저장용)
  const [lastCreatedSnapshot, setLastCreatedSnapshot] = useState<{
    club_id: string;
    description: string | null;
    price: number;
    original_price: number | null;
    walk_minutes: number | null;
    nearest_station: string | null;
    table_info: string | null;
    table_features: string[];
    liquor_includes: string[];
  } | null>(null);

  // 이용방법 가이드 접기/펼치기 (조각·게스트 간판과 동일 패턴)
  const GUIDE_DISMISSED_KEY = "nightflow_hotdeal_guide_dismissed";
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(GUIDE_DISMISSED_KEY) === "1") setShowGuide(false);
  }, []);
  const dismissGuide = () => {
    setShowGuide(false);
    if (typeof window !== "undefined") localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled) setMdId(user?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [supabase]);
  // showForm이 true가 되는 시점마다 옵션 재계산
  const endDateConfig = useMemo(
    () => buildHotdealDateOptions(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showForm]
  );
  const [endsAtLocal, setEndsAtLocal] = useState<string>(endDateConfig.defaultValue);

  // 폼 다시 열 때 기본값 갱신 (단, 수정 모드에선 기존 값 유지)
  useEffect(() => {
    if (showForm && !editingId) setEndsAtLocal(endDateConfig.defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, endDateConfig]);

  // 클럽 선택 변경 시 가까운 역 자동 조회 (MD 수동 입력 X 상태에서만)
  useEffect(() => {
    if (!showForm || !clubId) return;
    if (nearestStation || walkMinutes) return; // 이미 입력됐으면 덮어쓰기 X
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/nearest-station", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clubId }),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { station?: string; walk_minutes?: number };
        if (cancelled) return;
        if (j.station) setNearestStation(j.station);
        if (j.walk_minutes) setWalkMinutes(String(j.walk_minutes));
      } catch {
        // 무시 (수동 입력 가능)
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, showForm]);

  const selectedClub = useMemo(
    () => clubs.find((c) => c.id === clubId) ?? null,
    [clubs, clubId]
  );

  // 현재 선택된 클럽에서 이미 활성 상태인 자리 등급들 (편집 중인 핫딜은 제외)
  const occupiedZones = useMemo(() => {
    return new Set(
      myHotdeals
        .filter((h) =>
          h.club_id === clubId &&
          h.status === "active" &&
          h.id !== editingId &&
          h.table_zone
        )
        .map((h) => h.table_zone as HotdealTableZone)
    );
  }, [myHotdeals, clubId, editingId]);

  // 클럽당 활성 핫딜 카운트 (자리별 1개 = 최대 5개)
  const clubActiveCount = useMemo(
    () =>
      myHotdeals.filter(
        (h) => h.club_id === clubId && h.status === "active" && h.id !== editingId
      ).length,
    [myHotdeals, clubId, editingId]
  );

  // "내 핫딜" 목록에서 만료된 핫딜은 자동으로 숨김 (DB에는 expired로 보존).
  // - status가 expired면 숨김 (cron이 전환한 것)
  // - cron(expire_old_hotdeals)은 20분 주기라 전환 전 공백이 있으므로,
  //   아직 active라도 마감시각(ends_at)이 지났으면 함께 숨겨 즉시 사라지게 한다.
  // cancelled('종료')는 MD가 직접 삭제할 수 있도록 시간과 무관하게 목록에 유지.
  const visibleHotdeals = useMemo(
    () =>
      myHotdeals.filter((h) => {
        if (h.status === "expired") return false;
        if (h.status === "active" && new Date(h.ends_at).getTime() <= Date.now()) return false;
        return true;
      }),
    [myHotdeals]
  );

  const resetForm = () => {
    setEditingId(null);
    setDescription("");
    setOriginalPrice("");
    setPrice("");
    setWalkMinutes("");
    setNearestStation("");
    setTableInfo("");
    setTableZone("");
    setTableFeatures([]);
    setIncludes([]);
    setFloorPlanExpanded(false);
    const fresh = buildHotdealDateOptions();
    setEndsAtLocal(fresh.defaultValue);
  };

  const handleStartEdit = (h: DailyHotdeal) => {
    setEditingId(h.id);
    setClubId(h.club_id ?? (h.club as { id?: string })?.id ?? clubId);
    setDescription(h.description ?? "");
    setPrice(h.price ? String(h.price / 10000) : "");
    setOriginalPrice(h.original_price ? String(h.original_price / 10000) : "");
    setWalkMinutes(h.walk_minutes ? String(h.walk_minutes) : "");
    setNearestStation(h.nearest_station ?? "");
    setTableInfo(h.table_info ?? "");
    setTableZone(h.table_zone ?? "");
    setTableFeatures(h.table_features ?? []);
    setIncludes(h.liquor_includes ?? []);
    setFloorPlanExpanded(false);
    // 종료시각: 기존 값 유지 (KST 변환)
    const existingEnds = dayjs(h.ends_at).format("YYYY-MM-DDTHH:mm");
    setEndsAtLocal(existingEnds);
    setShowForm(true);
  };

  // ?edit=ID 진입 시 자동으로 수정 모드 시작
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || editingId) return;
    const target = initialMyHotdeals.find((h) => h.id === editId);
    if (target) handleStartEdit(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, initialMyHotdeals]);

  const handleCreate = async () => {
    if (!clubId || !selectedClub) { toast.error("클럽을 선택해주세요"); return; }
    if (!selectedClub.name?.trim()) { toast.error("선택한 클럽 정보가 잘못됐어요. 다시 선택해주세요"); return; }
    if (!tableZone) { toast.error("자리 등급을 선택해주세요"); return; }
    // 입력 단위는 만원. DB는 원 단위로 저장. 만원 상한 9999 (99,990,000원, INT 안전 범위)
    const MAX_MAN = 9999;
    const priceMan = price ? Number(price.replace(/[^0-9]/g, "")) : 0;
    if (!priceMan) { toast.error("특가를 입력해주세요"); return; }
    if (priceMan > MAX_MAN) { toast.error(`특가는 ${MAX_MAN}만원 이하로 입력해주세요`); return; }
    const priceNum = priceMan * 10000;
    const originalPriceMan = originalPrice ? Number(originalPrice.replace(/[^0-9]/g, "")) : 0;
    if (originalPriceMan > MAX_MAN) { toast.error(`정가는 ${MAX_MAN}만원 이하로 입력해주세요`); return; }
    const originalPriceNum = originalPriceMan > 0 ? originalPriceMan * 10000 : null;
    if (originalPriceNum && originalPriceNum <= priceNum) {
      toast.error("정가는 특가보다 높아야 해요");
      return;
    }
    // 종료시각이 현재보다 미래인지 검증
    const endsAtMs = dayjs(endsAtLocal + "+09:00").valueOf();
    if (endsAtMs <= Date.now()) {
      toast.error("종료 시각은 현재 시각 이후여야 해요");
      return;
    }
    setBusy(true);
    const rpcArgs = {
      p_club_id: clubId,
      p_title: selectedClub?.name ?? "",
      p_ends_at: dayjs(endsAtLocal + "+09:00").toISOString(),
      p_description: description.trim() || null,
      p_thumbnail_url: null,
      p_price: priceNum,
      p_walk_minutes: walkMinutes ? Number(walkMinutes) : null,
      p_nearest_station: nearestStation.trim() || null,
      p_original_price: originalPriceNum,
      p_table_info: tableInfo.trim() || null,
      p_table_features: tableFeatures,
      p_liquor_includes: includes,
      p_table_zone: tableZone || null,
    };
    try {
      const { data, error } = await supabase.rpc("create_daily_hotdeal", rpcArgs);
      if (error) {
        console.error("[create_daily_hotdeal] RPC error:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        toast.error(`등록 실패: ${error.message || error.code || "RPC 오류"}`);
        return;
      }
      const result = data as { success: boolean; error?: string; id?: string };
      if (!result?.success) {
        toast.error(result?.error || "등록 실패");
        return;
      }
      const newId = result.id ?? null;
      setLastCreatedHotdealId(newId);
      // 새로 등록된 핫딜을 즉시 목록에 반영 (서버 fetch로 정합성 검증)
      if (newId) {
        const { data: fresh } = await supabase
          .from("daily_hotdeals")
          .select("*, club:clubs(id, name, area, thumbnail_url)")
          .eq("id", newId)
          .single();
        if (fresh) {
          setMyHotdeals((prev) => [fresh as unknown as DailyHotdeal, ...prev]);
        }
      }
      // 템플릿 저장 프롬프트가 뜨지 않는 케이스에서만 등록 토스트 표시 (시트 가림 방지)
      if (!mdId) {
        toast.success("핫딜이 등록됐어요");
      }
      // 템플릿 저장 프롬프트용 스냅샷
      if (mdId) {
        setLastCreatedSnapshot({
          club_id: clubId,
          description: description.trim() || null,
          price: priceNum,
          original_price: originalPriceNum,
          walk_minutes: walkMinutes ? Number(walkMinutes) : null,
          nearest_station: nearestStation.trim() || null,
          table_info: tableInfo.trim() || null,
          table_features: tableFeatures,
          liquor_includes: includes,
        });
        setShowTemplateSavePrompt(true);
      }
      setShowForm(false);
      resetForm();
      // embedded(대시보드 인라인)에서는 같은 화면에 머물면서 목록만 갱신.
      // standalone 페이지에서만 상세로 이동.
      if (!embedded && !mdId && newId) {
        router.push(`/hotdeal/${newId}`);
      }
    } catch (err) {
      console.error("[create_daily_hotdeal] thrown:", err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      toast.error(`요청 실패: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (!tableZone) { toast.error("자리 등급을 선택해주세요"); return; }
    const MAX_MAN = 9999;
    const priceMan = price ? Number(price.replace(/[^0-9]/g, "")) : 0;
    if (!priceMan) { toast.error("특가를 입력해주세요"); return; }
    if (priceMan > MAX_MAN) { toast.error(`특가는 ${MAX_MAN}만원 이하로 입력해주세요`); return; }
    const priceNum = priceMan * 10000;
    const originalPriceMan = originalPrice ? Number(originalPrice.replace(/[^0-9]/g, "")) : 0;
    if (originalPriceMan > MAX_MAN) { toast.error(`정가는 ${MAX_MAN}만원 이하로 입력해주세요`); return; }
    const originalPriceNum = originalPriceMan > 0 ? originalPriceMan * 10000 : null;
    if (originalPriceNum && originalPriceNum <= priceNum) { toast.error("정가는 특가보다 높아야 해요"); return; }
    const endsAtMs = dayjs(endsAtLocal + "+09:00").valueOf();
    if (endsAtMs <= Date.now()) { toast.error("종료 시각은 현재 시각 이후여야 해요"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("update_daily_hotdeal", {
        p_id: editingId,
        p_title: selectedClub?.name ?? "",
        p_ends_at: dayjs(endsAtLocal + "+09:00").toISOString(),
        p_description: description.trim() || null,
        p_price: priceNum,
        p_walk_minutes: walkMinutes ? Number(walkMinutes) : null,
        p_nearest_station: nearestStation.trim() || null,
        p_original_price: originalPriceNum,
        p_table_info: tableInfo.trim() || null,
        p_table_features: tableFeatures.length > 0 ? tableFeatures : null,
        p_liquor_includes: includes.length > 0 ? includes : null,
        p_table_zone: tableZone || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) { toast.error(result?.error || "수정 실패"); return; }
      toast.success("수정됐어요");
      const targetId = editingId;
      // 인라인: 같은 목록에서 해당 항목만 다시 가져와 갱신
      if (embedded && targetId) {
        const { data: fresh } = await supabase
          .from("daily_hotdeals")
          .select("*, club:clubs(id, name, area, thumbnail_url)")
          .eq("id", targetId)
          .single();
        if (fresh) {
          setMyHotdeals((prev) =>
            prev.map((h) => (h.id === targetId ? (fresh as unknown as DailyHotdeal) : h))
          );
        }
      }
      setShowForm(false);
      resetForm();
      if (!embedded) {
        router.push(`/hotdeal/${targetId}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm("이 핫딜을 종료할까요?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("update_daily_hotdeal", {
        p_id: id,
        p_status: "cancelled",
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        toast.error(result?.error || "실패");
        return;
      }
      toast.success("종료됐어요");
      setMyHotdeals((prev) =>
        prev.map((h) => (h.id === id ? { ...h, status: "cancelled" } : h))
      );
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string; details?: string };
      console.error("[handleCancel] error:", e?.message, e?.code, e?.details, err);
      toast.error(`종료 실패: ${e?.message || e?.code || JSON.stringify(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("핫딜을 완전히 삭제할까요?")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("delete_daily_hotdeal", { p_id: id });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) { toast.error(result?.error || "삭제 실패"); return; }
      toast.success("삭제됐어요");
      setMyHotdeals((prev) => prev.filter((h) => h.id !== id));
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(`삭제 실패: ${e?.message || JSON.stringify(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleFloorPlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clubId) return;
    setFloorPlanUploading(true);
    try {
      const url = await uploadImage(file, `floor-plans/club/${clubId}`, { maxWidth: 2048 });
      if (!url) return;
      const { error } = await supabase.from("clubs").update({ floor_plan_url: url }).eq("id", clubId);
      if (error) throw error;
      setClubs((prev) => prev.map((c) => c.id === clubId ? { ...c, floor_plan_url: url } : c));
      toast.success("플로어맵이 등록됐어요");
    } catch {
      toast.error("업로드 실패");
    } finally {
      setFloorPlanUploading(false);
      if (floorPlanInputRef.current) floorPlanInputRef.current.value = "";
    }
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-background pb-24"}>
      <div className={embedded ? "" : "max-w-lg mx-auto px-4 py-5"}>
        {!embedded && (
          <Link
            href="/md/dashboard"
            className="inline-flex items-center gap-1 text-muted-foreground text-sm font-bold hover:text-foreground transition-colors mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            대시보드
          </Link>
        )}
        {/* embedded(대시보드 인라인)에서는 상단 탭이 제목 역할을 하므로 제목·부제 숨김. */}
        {!embedded && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-5 h-5 text-brand-amber" />
              <h1 className="text-2xl font-black text-foreground tracking-tight">Hot Deal 등록</h1>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4 leading-relaxed">
              당일 특가 패키지로 매출을 올려보세요!
            </p>
          </>
        )}

        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full h-12 mb-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[14px] inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            새 핫딜 등록
          </button>
        )}

        {/* 이용방법 가이드 (폼 안 열렸을 때만) — 조각·게스트 간판과 동일 패턴 */}
        {!showForm && (
          showGuide ? (
            <div className="relative bg-card border border-border rounded-2xl p-4 mb-5 space-y-3">
              <button
                type="button"
                onClick={dismissGuide}
                aria-label="가이드 닫기"
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <p className="text-[13px] text-foreground font-black">이용방법</p>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">1</div>
                  <div className="flex-1">
                    <p className="text-[12.5px] text-foreground font-bold leading-snug">오늘의 스페셜 패키지 등록</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">우리 클럽만의 구성으로 오늘 밤 손님을 모아요</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">2</div>
                  <div className="flex-1">
                    <p className="text-[12.5px] text-foreground font-bold leading-snug">홈 최상단 노출</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">유저가 앱 열자마자 보는 자리에 강조돼요</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">3</div>
                  <div className="flex-1">
                    <p className="text-[12.5px] text-foreground font-bold leading-snug">상세에서 인스타·연락처로 직접 문의</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">선착순 마감으로 빠르게 채워보세요</p>
                  </div>
                </div>
              </div>
              {/* 실제 노출 화면 미리보기 */}
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="w-full mt-1 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-brand-amber text-[12.5px] font-black hover:bg-amber-500/15 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                👀 미리보기
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-1 mb-5"
            >
              <span className="text-[12px]">ⓘ</span>
              이용방법
            </button>
          )
        )}

        {showForm && (
          <div className="mb-6 space-y-6">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] text-foreground font-bold">{editingId ? "핫딜 수정" : "새 핫딜 등록"}</p>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 등록 모드일 때만 템플릿에서 생성 */}
            {!editingId && mdId && (
              <div className="flex justify-end -mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border text-muted-foreground hover:text-foreground hover:border-amber-500 gap-1.5 text-xs"
                  onClick={() => setShowTemplateSelector(true)}
                >
                  <Bookmark className="w-3.5 h-3.5 text-brand-amber" />
                  템플릿에서 생성
                </Button>
              </div>
            )}

            {/* 1. 클럽 선택 */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                <Building2 className="w-4 h-4 text-money" />
                <span>클럽 선택</span>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="relative h-12">
                  <div className="absolute inset-0 px-4 flex items-center justify-between pointer-events-none">
                    <span className={`text-sm font-medium truncate ${selectedClub ? "text-foreground" : "text-muted-foreground"}`}>
                      {selectedClub ? `${selectedClub.name}${selectedClub.area ? ` (${selectedClub.area})` : ""}` : "클럽을 선택하세요"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                  </div>
                  <select
                    value={clubId}
                    onChange={(e) => setClubId(e.target.value)}
                    disabled={busy || clubs.length === 0}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {clubs.length === 0 && <option value="">소속 클럽 없음</option>}
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.area ? ` (${c.area})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {clubId && (
                <p className="text-[11px] text-muted-foreground">
                  이 클럽의 활성 핫딜 {clubActiveCount}/5 (자리당 1개)
                </p>
              )}
            </section>

            {/* 2. 테이블 위치 */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-money" />
                <span className="text-foreground font-bold">테이블 위치</span>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                {selectedClub?.floor_plan_url && !floorPlanExpanded && (
                  <button
                    type="button"
                    onClick={() => setFloorPlanExpanded(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-money transition-colors py-1"
                  >
                    <span>등록된 플로어맵</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                )}
                {selectedClub?.floor_plan_url && floorPlanExpanded && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setFloorPlanExpanded(false)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-money transition-colors py-1"
                    >
                      <MapPin className="w-3.5 h-3.5 text-money" />
                      <span>플로어맵 닫기</span>
                      <ChevronDown className="w-3 h-3 rotate-180" />
                    </button>
                    <div className="rounded-xl overflow-hidden border border-border bg-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedClub.floor_plan_url}
                        alt="플로어맵"
                        className="w-full object-contain block select-none pointer-events-none"
                        style={{ maxHeight: "260px" }}
                        draggable={false}
                      />
                    </div>
                  </div>
                )}
                {!selectedClub?.floor_plan_url && selectedClub && (
                  <>
                    <input
                      ref={floorPlanInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFloorPlanUpload}
                    />
                    <button
                      type="button"
                      onClick={() => floorPlanInputRef.current?.click()}
                      disabled={floorPlanUploading}
                      className="w-full flex items-center justify-center gap-2 p-4 border border-dashed border-border rounded-xl text-muted-foreground hover:border-green-500/50 hover:text-money transition-colors"
                    >
                      {floorPlanUploading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Upload className="w-4 h-4" />
                      }
                      <span className="text-[12px] font-bold">
                        {floorPlanUploading ? "업로드 중..." : "플로어맵 등록하기"}
                      </span>
                    </button>
                  </>
                )}
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground font-bold">
                    자리 등급 <span className="text-red-400">*</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    같은 클럽에서 자리당 활성 핫딜은 1개만 등록할 수 있어요
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TABLE_ZONE_OPTIONS.map((opt) => {
                      const active = tableZone === opt.value;
                      const occupied = occupiedZones.has(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            if (occupied) {
                              toast.error(`'${opt.label}' 자리는 이미 활성 핫딜이 있어요`);
                              return;
                            }
                            setTableZone(active ? "" : opt.value);
                          }}
                          disabled={busy}
                          className={`h-8 px-3 rounded-full text-[12px] font-bold border transition-colors ${
                            active
                              ? "bg-amber-500 border-amber-500 text-black"
                              : occupied
                              ? "bg-card/50 border-border text-muted-foreground line-through"
                              : "bg-card border-border text-foreground/80 hover:border-amber-500/60"
                          }`}
                        >
                          {opt.label}
                          {occupied && " (사용 중)"}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="text"
                  value={tableInfo}
                  onChange={(e) => setTableInfo(e.target.value)}
                  placeholder="자리 번호 (선택) — 예) A3, B~C열"
                  disabled={busy}
                  className="w-full bg-card border border-border h-11 rounded-lg px-3 text-foreground text-sm placeholder:text-muted-foreground"
                />
              </div>
            </section>

            {/* 3. 주류 + 테이블 구성 */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-bold">
                <Wine className="w-4 h-4 text-money" />
                <span>포함 주류 · 테이블 구성</span>
              </div>
              <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-neutral-800">
                <div className="p-4 space-y-3">
                  <p className="text-[11px] text-muted-foreground font-bold">포함 주류</p>
                  <LiquorSelector
                    selected={includes}
                    onSelect={setIncludes}
                    disabled={busy}
                    compact
                  />
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-[11px] text-muted-foreground font-bold">테이블 구성</p>
                  <TableFeatureSelector
                    selected={tableFeatures}
                    onSelect={setTableFeatures}
                    disabled={busy}
                  />
                </div>
              </div>
            </section>

            {/* 5. 상세 설명 */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-foreground font-bold">
                  <Flame className="w-4 h-4 text-brand-amber" />
                  <span>상세 설명</span>
                  <span className="text-[11px] text-muted-foreground font-medium">선택</span>
                </div>
                <span className={`text-[11px] font-bold ${description.length > 90 ? "text-red-400" : "text-muted-foreground"}`}>
                  {description.length}/100
                </span>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <textarea
                  value={description}
                  onChange={(e) => { if (e.target.value.length <= 100) setDescription(e.target.value); }}
                  rows={1}
                  placeholder="예: 오늘 자리 좋아요, 11시 전 입장 추천"
                  disabled={busy}
                  className="w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground resize-none focus:outline-none"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>
            </section>

            {/* 5. 가격 */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                <span className="text-money font-black text-base leading-none">₩</span>
                <span>가격</span>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground font-bold mb-1.5">정가 (만원)</p>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={originalPrice}
                        onChange={(e) => setOriginalPrice(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="30"
                        disabled={busy}
                        className="w-full bg-card border border-border h-11 rounded-lg px-3 pr-12 text-foreground text-sm placeholder:text-muted-foreground"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-bold">만원</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-brand-amber font-bold mb-1.5">특가 (만원) *</p>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={price}
                        onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="20"
                        disabled={busy}
                        className="w-full bg-card border border-amber-500/50 h-11 rounded-lg px-3 pr-12 text-foreground text-sm placeholder:text-muted-foreground"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-brand-amber font-bold">만원</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  💡 인스타 공식 주대의 <span className="text-brand-amber font-bold">80~90% 수준</span>으로 올려 빠르게 판매해보세요!
                </p>
              </div>
            </section>

            {/* 6. 종료 시각 */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                <CalendarClock className="w-4 h-4 text-money" />
                <span>종료 시각</span>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
                <DateTimeSheet
                  mode="date-2"
                  dateOptions={endDateConfig.options}
                  value={endsAtLocal}
                  onChange={setEndsAtLocal}
                  label="종료 시각"
                  placeholder="종료 시각을 선택하세요"
                />
                <p className="text-[10px] text-muted-foreground">이 시각이 지나면 카드가 자동으로 만료돼요</p>
              </div>
            </section>

            {/* 등록/수정 버튼 */}
            <button
              type="button"
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={busy || clubs.length === 0}
              className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[14px] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "수정 완료" : "핫딜 등록"}
            </button>
          </div>
        )}

        {/* 내 핫딜 목록 (폼 열려있을 땐 숨김) */}
        {!showForm && (
        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground font-bold px-1">내 핫딜</p>
          {visibleHotdeals.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">등록한 핫딜이 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleHotdeals.map((h) => (
                <div key={h.id} className="bg-card rounded-2xl border border-border p-3 flex items-center gap-3">
                  {h.thumbnail_url || h.club?.thumbnail_url ? (
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-card shrink-0">
                      <Image
                        src={h.thumbnail_url || h.club!.thumbnail_url!}
                        alt={h.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-card flex items-center justify-center text-[16px] font-black text-foreground/60 shrink-0">
                      {h.club?.name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-[13px] font-black truncate">{h.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {h.club?.name}
                      {h.nearest_station && <> · {h.nearest_station}역 도보 {h.walk_minutes}분</>}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {h.price != null && (
                        <span className="text-[12px] font-black text-money">
                          {h.price.toLocaleString()}원
                        </span>
                      )}
                      {h.original_price && h.price && h.original_price > h.price && (
                        <span className="text-[10px] text-muted-foreground line-through">
                          {h.original_price.toLocaleString()}원
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5 mt-0.5">
                      <Clock className="w-2.5 h-2.5 text-brand-amber" />
                      <span className="text-brand-amber">
                        {new Date(h.ends_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="ml-1.5 font-bold">
                        {h.status === "active" && <span className="text-money">진행 중</span>}
                        {h.status === "expired" && <span className="text-muted-foreground">만료</span>}
                        {h.status === "cancelled" && <span className="text-red-400">종료</span>}
                      </span>
                    </p>
                  </div>
                  {h.status === "active" && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(h)}
                        disabled={busy}
                        className="px-2.5 py-1.5 rounded-full bg-muted hover:bg-muted text-foreground text-[11px] font-bold"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(h.id)}
                        disabled={busy}
                        className="px-2.5 py-1.5 rounded-full bg-muted hover:bg-muted text-foreground/80 text-[11px] font-bold"
                      >
                        종료
                      </button>
                    </div>
                  )}
                  {(h.status === "cancelled" || h.status === "expired") && (
                    <button
                      type="button"
                      onClick={() => handleDelete(h.id)}
                      disabled={busy}
                      className="px-2.5 py-1.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[11px] font-bold shrink-0"
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* 템플릿 선택 시트 */}
      {mdId && (
        <HotdealTemplateSelector
          mdId={mdId}
          open={showTemplateSelector}
          onOpenChange={setShowTemplateSelector}
          onSelect={(t) => {
            // 폼이 닫혀있으면 열어줌
            setShowForm(true);
            // 템플릿의 클럽이 내 소속 클럽에 있으면 적용, 아니면 첫 번째 클럽 fallback
            if (t.club_id && clubs.some((c) => c.id === t.club_id)) {
              setClubId(t.club_id);
            } else if (clubs[0]) {
              setClubId(clubs[0].id);
            }
            if (t.description !== null) setDescription(t.description ?? "");
            if (t.price !== null) setPrice(String(t.price / 10000));
            if (t.original_price !== null) setOriginalPrice(String(t.original_price / 10000));
            if (t.walk_minutes !== null) setWalkMinutes(String(t.walk_minutes));
            if (t.nearest_station !== null) setNearestStation(t.nearest_station ?? "");
            if (t.table_info !== null) setTableInfo(t.table_info ?? "");
            if (t.table_features?.length) setTableFeatures(t.table_features);
            if (t.liquor_includes?.length) setIncludes(t.liquor_includes);
            // last_used_at 갱신 (실패해도 무시)
            supabase
              .from("hotdeal_templates")
              .update({ last_used_at: new Date().toISOString() })
              .eq("id", t.id)
              .then(() => {});
            toast.success("템플릿이 적용됐어요. 종료 시각만 정해주세요");
          }}
        />
      )}

      {/* 등록 후 템플릿 저장 프롬프트 */}
      {lastCreatedSnapshot && mdId && (
        <Sheet open={showTemplateSavePrompt} onOpenChange={(open) => {
          setShowTemplateSavePrompt(open);
          if (!open) {
            setLastCreatedSnapshot(null);
            const target = lastCreatedHotdealId;
            setLastCreatedHotdealId(null);
            // embedded(대시보드 인라인): 같은 화면 유지. standalone: 상세/대시보드로 이동.
            if (!embedded) {
              router.push(target ? `/hotdeal/${target}` : "/md/dashboard");
            }
          }
        }}>
          <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-10">
            <SheetHeader className="text-left pb-2">
              <div className="inline-flex items-center gap-1.5 text-money text-[12px] font-black mb-1">
                <span>✓</span>
                <span>핫딜이 등록됐어요</span>
              </div>
              <SheetTitle className="text-foreground text-lg">템플릿으로 저장할까요?</SheetTitle>
            </SheetHeader>
            <p className="text-muted-foreground text-sm mb-4">
              다음 등록 시 한 번에 불러올 수 있어요 (최대 5개)
            </p>
            <div className="bg-card rounded-xl border border-border p-3 mb-4">
              <p className="text-brand-amber font-bold text-sm">
                {[
                  lastCreatedSnapshot.price ? `${Math.round(lastCreatedSnapshot.price / 10000)}만원` : "",
                  lastCreatedSnapshot.liquor_includes?.[0] || "",
                  lastCreatedSnapshot.table_info || "",
                ].filter(Boolean).join(" / ") || "핫딜 템플릿"}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-border text-muted-foreground hover:text-foreground"
                onClick={() => { setShowTemplateSavePrompt(false); setLastCreatedSnapshot(null); }}
                disabled={templateSaving}
              >
                건너뛰기
              </Button>
              <Button
                className="flex-1 bg-inverse text-inverse-foreground hover:opacity-90 font-bold"
                disabled={templateSaving}
                onClick={async () => {
                  if (!lastCreatedSnapshot) return;
                  setTemplateSaving(true);
                  try {
                    const name = [
                      lastCreatedSnapshot.price ? `${Math.round(lastCreatedSnapshot.price / 10000)}만원` : "",
                      lastCreatedSnapshot.liquor_includes?.[0] || "",
                      lastCreatedSnapshot.table_info || "",
                    ].filter(Boolean).join("/") || "핫딜 템플릿";
                    const { error } = await supabase.from("hotdeal_templates").insert({
                      md_id: mdId,
                      name,
                      club_id: lastCreatedSnapshot.club_id || null,
                      description: lastCreatedSnapshot.description,
                      price: lastCreatedSnapshot.price,
                      original_price: lastCreatedSnapshot.original_price,
                      walk_minutes: lastCreatedSnapshot.walk_minutes,
                      nearest_station: lastCreatedSnapshot.nearest_station,
                      table_info: lastCreatedSnapshot.table_info,
                      table_features: lastCreatedSnapshot.table_features,
                      liquor_includes: lastCreatedSnapshot.liquor_includes,
                    });
                    if (error) {
                      // 5개 초과 등 트리거 에러
                      toast.error(error.message?.includes("5개")
                        ? "템플릿은 최대 5개까지 저장할 수 있어요"
                        : "템플릿 저장에 실패했어요");
                    } else {
                      toast.success("템플릿이 저장됐어요");
                    }
                  } finally {
                    setTemplateSaving(false);
                    setShowTemplateSavePrompt(false);
                    setLastCreatedSnapshot(null);
                  }
                }}
              >
                {templateSaving ? "저장 중..." : "템플릿 저장"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* 핫딜 실제 노출 미리보기 (이용방법의 '내 핫딜 미리보기'에서 염) */}
      <HotdealPreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}

