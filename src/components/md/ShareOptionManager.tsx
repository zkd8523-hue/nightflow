"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, Check, Loader2, Pencil, Trash2, Copy, Map, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LiquorSelector } from "@/components/md/LiquorSelector";
import { FloorPlanViewer } from "@/components/auctions/FloorPlanViewer";
import { EXTRAS_OPTIONS, LIQUOR_KEYWORDS } from "@/lib/constants/liquor";
import type { ShareOption } from "@/types/database";

const MAX_OPTIONS = 6;
const MIN_SEATS = 2;
const MAX_SEATS = 6; // 조각 한 테이블 최대 정원

interface Props {
  clubId: string;
  options: ShareOption[];
  /** 클럽 대표 테이블맵 1장 (자리 정보 입력 시 참고용). 없으면 미노출. */
  floorPlanUrl?: string | null;
}

interface FormState {
  id: string | null;
  label: string;
  table_info: string;
  total_seats: number;
  price_man: string; // 만원 단위 문자열 입력
  includes: string[];
  md_message: string;
  deadline_hour: number; // 익일 마감 시각(0=당일자정, 1~8=익일 N시)
}

const emptyForm = (): FormState => ({
  id: null,
  label: "",
  table_info: "",
  total_seats: 6,
  price_man: "",
  includes: [],
  md_message: "",
  deadline_hour: 3, // 기본: 익일 새벽 3시
});

// 복제 라벨 생성: "복사본"이 중첩되지 않게 base를 뽑고 끝에 숫자(2,3,…)를 붙인다.
// 예) "메인" → "메인 복사본" → "메인 복사본 2" → "메인 복사본 3"
function nextCopyLabel(label: string, existing: ShareOption[]): string {
  // 기존 "… 복사본" 또는 "… 복사본 N" 접미사를 떼어 원본 이름을 구한다.
  const base = label.replace(/\s*복사본(\s*\d+)?$/, "").trim();
  const used = new Set(
    existing.map((o) => (o.label ?? "").trim()).filter(Boolean)
  );
  const first = base ? `${base} 복사본` : "복사본";
  if (!used.has(first)) return first;
  for (let n = 2; ; n++) {
    const candidate = `${first} ${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

// 익일 마감 시각 선택지 (0 = 당일 자정)
const DEADLINE_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const deadlineLabel = (h: number) => (h === 0 ? "당일 자정 (24시)" : `익일 ${h}시`);

// KST 기준 오늘 날짜(YYYY-MM-DD). 동기화 대상을 "오늘 이후 카드"로 한정.
function todayKstISO(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 행사일(eventISO) 익일 deadlineHour시 KST → UTC ISO (cron deadlineKstISO와 동일 규약).
function deadlineKstISO(eventISO: string, deadlineHour: number): string {
  const hh = String(Math.max(0, Math.min(8, deadlineHour | 0))).padStart(2, "0");
  // 행사일 익일 = +1일. 정오(12:00Z) 기준으로 더해야 KST 자정의 UTC 전날 문제를 피함.
  const next = new Date(`${eventISO}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextISO = next.toISOString().slice(0, 10);
  return new Date(`${nextISO}T${hh}:00:00.000+09:00`).toISOString();
}

export function ShareOptionManager({ clubId, options, floorPlanUrl }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<ShareOption[]>(options);

  // 서버 prop이 빈 배열로 내려왔을 때(선점 직후 refresh 전) 클라이언트에서 즉시 패치
  useEffect(() => {
    if (options.length > 0) { setList(options); return; }
    supabase
      .from("share_options")
      .select("*")
      .eq("club_id", clubId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (data && data.length > 0) setList(data as ShareOption[]); });
  }, [clubId, options, supabase]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [expanded, setExpanded] = useState(false); // 세팅 목록 접기/펼치기 (기본 접힘)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIndex !== index) setOverIndex(index);
  };

  const handleDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...list];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setList(next);
    setDragIndex(null);
    setOverIndex(null);

    // DB 저장
    try {
      await Promise.all(
        next.map((o, i) =>
          supabase.from("share_options").update({ sort_order: i }).eq("id", o.id)
        )
      );
      router.refresh();
    } catch (err) {
      console.error("순서 저장 실패:", err);
      toast.error("순서 저장에 실패했어요");
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const openCreate = () => {
    if (list.length >= MAX_OPTIONS) {
      toast.error(`조각 옵션은 클럽당 최대 ${MAX_OPTIONS}개까지예요`);
      return;
    }
    setForm(emptyForm());
    setMapOpen(false);
    setSheetOpen(true);
  };

  const openEdit = (o: ShareOption) => {
    setForm({
      id: o.id,
      label: o.label ?? "",
      table_info: o.table_info,
      // 기존에 6명 초과로 저장된 옵션이 있어도 새 상한(MAX_SEATS)으로 맞춤
      total_seats: Math.min(MAX_SEATS, Math.max(MIN_SEATS, o.total_seats)),
      price_man: o.price_per_seat ? String(Math.round(o.price_per_seat / 10000)) : "",
      includes: o.includes ?? [],
      md_message: o.md_message ?? "",
      deadline_hour: o.deadline_hour ?? 3,
    });
    setMapOpen(false);
    setSheetOpen(true);
  };

  const toggleInclude = (item: string) => {
    setForm((f) => ({
      ...f,
      includes: f.includes.includes(item)
        ? f.includes.filter((x) => x !== item)
        : [...f.includes, item],
    }));
  };

  // 옵션 수정 시, 이미 생성된 카드(auctions)를 같은 값으로 갱신.
  // cron(generate-share-listings)과 title 형식을 일치시키기 위해 클럽명을 조회한다.
  const syncGeneratedCards = async (
    optionId: string,
    payload: {
      table_info: string;
      total_seats: number;
      price_per_seat: number;
      includes: string[];
      md_message: string | null;
      deadline_hour: number;
    }
  ): Promise<number> => {
    try {
      const { data: club } = await supabase
        .from("clubs")
        .select("name")
        .eq("id", clubId)
        .single();
      const clubName = club?.name ?? "";

      // 대상 카드: 이 옵션으로 생성됐고 오늘 이후, 아직 참여 0, 진행/예정.
      // share_deadline은 카드별 event_date 기준으로 익일 deadline_hour시로 재계산해야 하므로
      // 먼저 대상 id+event_date를 가져온 뒤, 공통 필드는 일괄 + deadline만 카드별로 UPDATE.
      const { data: targets, error: selErr } = await supabase
        .from("auctions")
        .select("id, event_date")
        .eq("share_option_id", optionId)
        .eq("listing_type", "share")
        .gte("share_date", todayKstISO())
        .eq("seats_claimed", 0)
        .in("status", ["active", "scheduled"]);
      if (selErr) throw selErr;
      if (!targets || targets.length === 0) return 0;

      const ids = targets.map((t: { id: string }) => t.id);

      // 1) 공통 필드 일괄 UPDATE
      const { error: upErr } = await supabase
        .from("auctions")
        .update({
          table_info: payload.table_info,
          total_seats: payload.total_seats,
          // 정원 변경 시 레거시 인원 컬럼도 함께(cron INSERT와 동일 규약)
          min_people: payload.total_seats,
          max_people: payload.total_seats,
          price_per_seat: payload.price_per_seat,
          start_price: payload.price_per_seat,
          original_price: payload.price_per_seat,
          includes: payload.includes,
          md_message: payload.md_message,
          title: `${clubName} ${payload.table_info}`.trim(),
        })
        .in("id", ids);
      if (upErr) throw upErr;

      // 2) share_deadline은 카드별 event_date 기준 재계산 (마감 시각 변경 반영)
      await Promise.all(
        targets
          .filter((t: { event_date: string | null }) => !!t.event_date)
          .map((t: { id: string; event_date: string | null }) => {
            const dl = deadlineKstISO(t.event_date as string, payload.deadline_hour);
            return supabase
              .from("auctions")
              .update({ share_deadline: dl, auction_end_at: dl })
              .eq("id", t.id);
          })
      );

      return ids.length;
    } catch (err) {
      // 동기화 실패해도 옵션 저장 자체는 성공 처리(다음 cron이 신규분에 반영).
      console.error("카드 동기화 실패:", err);
      return 0;
    }
  };

  const handleSave = async () => {
    const label = form.label.trim();
    if (!label) { toast.error("옵션 이름을 입력해주세요"); return; }
    const table_info = form.table_info.trim();
    if (!table_info) { toast.error("자리 정보를 입력해주세요"); return; }
    const priceMan = Number(form.price_man);
    if (!priceMan || priceMan <= 0) { toast.error("1인 가격을 입력해주세요"); return; }
    if (form.total_seats < MIN_SEATS || form.total_seats > MAX_SEATS) { toast.error(`정원은 ${MIN_SEATS}~${MAX_SEATS}명이에요`); return; }

    const payload = {
      club_id: clubId,
      label,
      table_info,
      total_seats: form.total_seats,
      price_per_seat: priceMan * 10000,
      includes: form.includes,
      md_message: form.md_message.trim() || null,
      deadline_hour: form.deadline_hour,
    };

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("세션이 만료되었어요"); return; }

      if (form.id) {
        const { data, error } = await supabase
          .from("share_options")
          .update(payload)
          .eq("id", form.id)
          .select("*")
          .single();
        if (error) throw error;
        setList((prev) => prev.map((o) => (o.id === form.id ? (data as ShareOption) : o)));

        // 이미 생성된 이번 주치 카드에도 즉시 반영.
        // 대상: 이 옵션으로 생성됐고(share_option_id), 오늘 이후 날짜, 아직 아무도 참여 안 한(seats_claimed=0),
        //       진행/예정 상태인 카드. 참여자가 있으면 가격/구성 변동이 불공정하므로 손대지 않는다.
        const syncedCount = await syncGeneratedCards(form.id, payload);
        toast.success(
          syncedCount > 0 ? `옵션 수정 + 카드 ${syncedCount}건 반영됐어요` : "옵션이 수정되었어요"
        );
      } else {
        const { data, error } = await supabase
          .from("share_options")
          .insert({ ...payload, md_id: user.id })
          .select("*")
          .single();
        if (error) {
          // 6개 제한 트리거 위반 등
          toast.error(error.message?.includes("최대") ? error.message : "저장에 실패했어요");
          return;
        }
        setList((prev) => [...prev, data as ShareOption]);
        toast.success("옵션이 추가되었어요");
      }
      setSheetOpen(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("저장에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  // 옵션 복제: 같은 값으로 새 옵션 생성. 제목(label)에 "복사본" 표기.
  const handleCopy = async (o: ShareOption) => {
    if (list.length >= MAX_OPTIONS) {
      toast.error(`조각 옵션은 클럽당 최대 ${MAX_OPTIONS}개까지예요`);
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("세션이 만료되었어요"); return; }

      const newLabel = nextCopyLabel((o.label ?? "").trim(), list);

      const { data, error } = await supabase
        .from("share_options")
        .insert({
          md_id: user.id,
          club_id: o.club_id,
          label: newLabel,
          table_info: o.table_info,
          total_seats: o.total_seats,
          price_per_seat: o.price_per_seat,
          includes: o.includes ?? [],
          md_message: o.md_message ?? null,
          deadline_hour: o.deadline_hour ?? 3,
        })
        .select("*")
        .single();
      if (error) {
        toast.error(error.message?.includes("최대") ? error.message : "복사에 실패했어요");
        return;
      }
      setList((prev) => [...prev, data as ShareOption]);
      toast.success("옵션을 복사했어요");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("복사에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 옵션을 삭제할까요? 요일표 배정도 함께 해제돼요.")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("share_options").delete().eq("id", id);
      if (error) throw error;
      setList((prev) => prev.filter((o) => o.id !== id));
      toast.success("옵션이 삭제되었어요");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("삭제에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[17px] font-black text-foreground"
        >
          📍 내 조각 세팅 <span className="text-[13px] text-muted-foreground">({list.length}/{MAX_OPTIONS})</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={openCreate}
          disabled={list.length >= MAX_OPTIONS}
          className="h-8 px-3 rounded-full bg-inverse text-inverse-foreground font-black text-[12px] hover:opacity-90 disabled:opacity-30 inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> 세팅 추가
        </button>
      </div>

      {!expanded ? null : list.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-[12.5px]">
          자리 등급별 옵션을 만들어 요일표에 배치하세요.
          <br />예: 메인 6석 200만 / 일반 4석 35만
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((o, i) => (
            <div
              key={o.id}
              ref={dragIndex === i ? dragNodeRef : undefined}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 bg-card border rounded-xl p-3 transition-all ${
                dragIndex === i
                  ? "opacity-40 border-border"
                  : overIndex === i
                  ? "border-green-500/60 bg-muted"
                  : "border-border"
              }`}
            >
              {/* 드래그 핸들 */}
              <div className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0 touch-none">
                <GripVertical className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate flex items-baseline gap-1.5">
                  {o.label && (
                    <span className="text-foreground text-[14.5px] font-black shrink-0">{o.label}</span>
                  )}
                  <span className="text-brand-amber text-[12px] font-bold">{o.table_info}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {o.total_seats}명 · N{(o.price_per_seat / 10000).toLocaleString()}만원
                  {o.includes.length > 0 && ` · ${o.includes.slice(0, 2).join("/")}${o.includes.length > 2 ? "…" : ""}`}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button type="button" onClick={() => openEdit(o)} disabled={busy}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-foreground/80 hover:text-foreground disabled:opacity-40">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <span className="text-[9px] text-muted-foreground leading-none">수정</span>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button type="button" onClick={() => handleCopy(o)} disabled={busy || list.length >= MAX_OPTIONS}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-foreground/80 hover:text-foreground disabled:opacity-40">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <span className="text-[9px] text-muted-foreground leading-none">복사</span>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button type="button" onClick={() => handleDelete(o.id)} disabled={busy}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-red-400 disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <span className="text-[9px] text-muted-foreground leading-none">삭제</span>
              </div>
            </div>
          ))}
          <p className="text-right text-[10.5px] text-muted-foreground pr-1">꾹 눌러서 순서 변경 가능</p>
        </div>
      )}

      {/* 옵션 입력 Sheet (조각 등록창 시각 패턴 복제) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" showCloseButton={false}
          className="bg-card border-border rounded-t-3xl px-5 pb-8 pt-4 max-h-[92vh] overflow-y-auto">
          <div className="max-w-sm mx-auto w-full space-y-5">
            <SheetHeader className="p-0 mb-1">
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-3" />
              <SheetTitle className="text-foreground text-base font-bold text-center">
                {form.id ? "옵션 수정" : "옵션 추가"}
              </SheetTitle>
              <SheetDescription className="sr-only">조각 옵션 입력</SheetDescription>
            </SheetHeader>

            {/* 옵션 이름 (필수) */}
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">옵션 이름</p>
              <Input
                placeholder="예) 메인 / 일반 / 힙존"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="bg-card border-border h-11 text-foreground font-bold"
              />
            </div>

            {/* 자리 정보 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-muted-foreground font-medium">자리 정보</p>
                {floorPlanUrl && (
                  <button
                    type="button"
                    onClick={() => setMapOpen((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-amber hover:text-brand-amber"
                  >
                    <Map className="w-3.5 h-3.5" />
                    {mapOpen ? "테이블맵 닫기" : "테이블맵 보기"}
                  </button>
                )}
              </div>
              {floorPlanUrl && mapOpen && (
                <div className="pb-1">
                  <FloorPlanViewer
                    floorPlanUrl={floorPlanUrl}
                    positions={[]}
                    highlightLabel={null}
                  />
                </div>
              )}
              <Input
                placeholder="예) 초메인 / 빠통 / A3, B1"
                value={form.table_info}
                onChange={(e) => setForm((f) => ({ ...f, table_info: e.target.value }))}
                className="bg-card border-border h-11 text-foreground font-bold"
              />
            </div>

            {/* 정원 스테퍼 (AuctionForm 패턴 복제) */}
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">정원 ({MIN_SEATS}~{MAX_SEATS}명)</p>
              <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-4">
                <button type="button" disabled={form.total_seats <= MIN_SEATS}
                  onClick={() => setForm((f) => ({ ...f, total_seats: Math.max(MIN_SEATS, f.total_seats - 1) }))}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted disabled:opacity-30">
                  <Minus className="w-3.5 h-3.5 text-foreground" />
                </button>
                <span className="text-[15px] font-black text-foreground">{form.total_seats}명</span>
                <button type="button" disabled={form.total_seats >= MAX_SEATS}
                  onClick={() => setForm((f) => ({ ...f, total_seats: Math.min(MAX_SEATS, f.total_seats + 1) }))}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted disabled:opacity-30">
                  <Plus className="w-3.5 h-3.5 text-foreground" />
                </button>
              </div>
            </div>

            {/* 1인 가격 직접 입력 */}
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">1인 가격</p>
              <div className="relative">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="예) 35"
                  value={form.price_man}
                  onChange={(e) => setForm((f) => ({ ...f, price_man: e.target.value.replace(/[^0-9]/g, "") }))}
                  className="bg-card border-border h-11 text-foreground font-bold pr-14"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-bold">만원</span>
              </div>
            </div>

            {/* 주류 (선택) — 조각 등록창 LiquorSelector 재사용. includes에 주류+구성 함께 담음 */}
            <LiquorSelector
              optional
              selected={form.includes.filter((item) => LIQUOR_KEYWORDS.some((kw) => item.includes(kw)))}
              onSelect={(liquors) => {
                setForm((f) => {
                  const extras = f.includes.filter((item) => !LIQUOR_KEYWORDS.some((kw) => item.includes(kw)));
                  return { ...f, includes: [...liquors, ...extras] };
                });
              }}
            />

            {/* 포함사항 토글 칩 (EXTRAS_OPTIONS 재사용) */}
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">테이블 구성 (선택)</p>
              <div className="flex flex-wrap gap-2">
                {EXTRAS_OPTIONS.map((item) => (
                  <button key={item} type="button" onClick={() => toggleInclude(item)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap flex items-center gap-1 transition-all ${
                      form.includes.includes(item)
                        ? "bg-green-500 text-black"
                        : "bg-card text-muted-foreground border border-border"
                    }`}>
                    {form.includes.includes(item) && <Check className="w-3 h-3" />}
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* 마감 시각 (익일 N시) */}
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">마감 시각</p>
              <div className="relative">
                <select
                  value={form.deadline_hour}
                  onChange={(e) => setForm((f) => ({ ...f, deadline_hour: Number(e.target.value) }))}
                  className="w-full appearance-none bg-card border border-border h-11 rounded-lg px-4 pr-10 text-foreground font-bold text-[14px] focus:outline-none focus:border-border"
                >
                  {DEADLINE_HOURS.map((h) => (
                    <option key={h} value={h} className="bg-card text-foreground">
                      {deadlineLabel(h)}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">▼</span>
              </div>
              <p className="text-[10.5px] text-muted-foreground leading-snug">
                새벽까지 모집하려면 익일 시각으로. 행사 날짜는 그대로 표시돼요.
              </p>
            </div>

            {/* 한마디 */}
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">한마디 (선택)</p>
              <Textarea
                placeholder="예) 입구컷 X, 황제케어"
                value={form.md_message}
                maxLength={60}
                onChange={(e) => setForm((f) => ({ ...f, md_message: e.target.value }))}
                className="bg-card border-border text-foreground resize-none"
                rows={2}
              />
            </div>

            <Button type="button" onClick={handleSave} disabled={busy}
              className="w-full h-12 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
