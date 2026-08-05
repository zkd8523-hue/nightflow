"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Minus, Loader2, ChevronRight, Trash2, FolderCog } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EXTRAS_OPTIONS } from "@/lib/constants/liquor";
import { isRedDay } from "@/lib/utils/holidays";
import type { AuctionTemplate, Club } from "@/types/database";

const MAX_TEMPLATES = 9;
// 1인 가격 상한(만원). total_budget이 integer 컬럼이라 정원까지 곱하면 21억을 넘길 수 있다
// (예: 인당 123123만원 × 6명 → "integer out of range"). 현실 상한 겸 오버플로 방어.
const MAX_PRICE_MAN = 1000; // DB 트리거 check_auction_template_limit(513)와 동일 기준
// 분류는 평일/주말 둘로 고정 — MD가 실제로 나누는 축이 이 두 개다.
// 분류는 자유 텍스트 — 평일/주말이 기본 제안이지만 MD가 원하는 축으로 만들 수 있다.
// (주말이 금토인지 토일인지는 각 템플릿의 요일 칩이 정하므로 폴더 이름은 라벨일 뿐이다)
const CATEGORY_PRESETS = ["평일", "주말"];
const UNCATEGORIZED = "__none__";

const DOWS: { key: string; label: string }[] = [
  { key: "mon", label: "월" },
  { key: "tue", label: "화" },
  { key: "wed", label: "수" },
  { key: "thu", label: "목" },
  { key: "fri", label: "금" },
  { key: "sat", label: "토" },
  { key: "sun", label: "일" },
];

interface Props {
  mdId: string;
  clubs: Club[];
}

type TemplateFormState = { club_id: string; category: string; name: string; total_seats: number; price_man: string; includes: string[]; md_comment: string };
/**
 * DB 제약 위반 메시지를 사람이 읽을 수 있는 문장으로. 원문(new row for relation ...)이
 * 그대로 토스트에 뜨면 MD는 무엇을 고쳐야 하는지 알 수 없다.
 */
function readableDbError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (message.includes("chk_auction_templates_price"))
    return `1인 가격은 ${MAX_PRICE_MAN}만원까지예요 — 가격을 먼저 낮춰주세요`;
  if (message.includes("최대")) return message;          // 개수 상한 트리거는 이미 한글
  if (/^new row for relation|violates|constraint/i.test(message)) return fallback;
  return message;
}

const emptyTemplateForm = (): TemplateFormState => ({ club_id: "", category: "", name: "", total_seats: 6, price_man: "", includes: [], md_comment: "" });

function todayKst(): Date {
  const now = new Date();
  const kstMs = now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000;
  return new Date(kstMs);
}

function fmtDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 복제 이름 생성: "복제"가 중첩되지 않게 원본 이름을 뽑고 뒤에 번호를 붙인다.
 * 예) "메인" → "메인 복제1" → "메인 복제2"
 * (ShareOptionManager.nextCopyLabel과 같은 규약 — 표기만 "복제N")
 */
function nextCopyName(name: string, existing: AuctionTemplate[]): string {
  const base = name.replace(/\s*복제\s*\d*$/, "").trim() || "템플릿";
  const used = new Set(existing.map((t) => (t.name ?? "").trim()).filter(Boolean));
  for (let n = 1; ; n++) {
    const candidate = `${base} 복제${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function ShareLiveToggleList({ mdId, clubs }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [templates, setTemplates] = useState<AuctionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  // 이번 주(월~일) 각 템플릿의 실제 발행분 — key: `${template_id}|${event_date}`
  const [weekPuzzleMap, setWeekPuzzleMap] = useState<Map<string, { id: string; current_count: number; target_count: number }>>(new Map());
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  // 인원 수정(외부 인원 +/-, 누적 후 적용) — MDDashboard "내 조각"과 동일 패턴
  const [seatDeltas, setSeatDeltas] = useState<Record<string, number>>({});
  const [seatSaving, setSeatSaving] = useState<string | null>(null);
  // 분류 필터 — 평일/주말 둘 중 하나가 항상 선택돼 있다
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  // 아직 저장 전인 새 폴더 — 칩으로 즉시 보이게 한다
  const [draftFolders, setDraftFolders] = useState<string[]>([]);

  // 폴더 순서 — 기본은 평일 → 주말 → 나머지. MD가 꾹 눌러 바꾸면 그 순서를 기억한다.
  // 폴더는 템플릿의 category 텍스트에서 파생될 뿐 자체 테이블이 없으므로,
  // 순서는 이 기기에만 저장한다(순서가 틀려도 데이터는 멀쩡하다).
  const orderKey = `nf_share_folder_order_${mdId}`;
  const draftKey = `nf_share_folders_${mdId}`;
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [folderDropKey, setFolderDropKey] = useState<string | null>(null);
  /** 지금 끌고 있는 폴더 이름 — 필터 줄과 폴더 관리가 함께 쓴다 */
  const [folderDrag, setFolderDrag] = useState<string | null>(null);
  const [managerNewFolder, setManagerNewFolder] = useState("");
  /** 폴더 관리에서 지금 편집 중인 폴더 */
  const [managerTarget, setManagerTarget] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(orderKey);
      if (raw) setFolderOrder(JSON.parse(raw));
      // 아직 조각이 없는 빈 폴더 — 템플릿의 category에서 파생되지 않으므로 따로 기억한다.
      // 안 그러면 "추가"한 폴더가 새로고침 한 번에 사라진다.
      const rawDraft = localStorage.getItem(draftKey);
      if (rawDraft) setDraftFolders(JSON.parse(rawDraft));
    } catch { /* 저장소가 막혀 있어도 기본 순서로 동작한다 */ }
  }, [orderKey, draftKey]);

  const persistFolderOrder = (next: string[]) => {
    setFolderOrder(next);
    try { localStorage.setItem(orderKey, JSON.stringify(next)); } catch { /* noop */ }
  };
  const persistDraftFolders = (next: string[]) => {
    setDraftFolders(next);
    try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* noop */ }
  };
  // 순서 변경 — ShareOptionManager의 드래그 패턴 재사용(꾹 눌러 이동)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const today = useMemo(() => todayKst(), []);
  const weekDates = useMemo(() => {
    const monday = new Date(today);
    const backToMon = (today.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - backToMon);
    return DOWS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [today]);

  // 지나간 날 판정 — 클럽은 밤을 넘겨 영업하므로 달력 자정이 아니라 "다음 날 오전 7시"가 경계다.
  // (수요일 조각은 목요일 07시에 끝난 것으로 본다)
  const passedDows = useMemo(() => {
    const now = new Date();
    const past = new Set<string>();
    weekDates.forEach((d, i) => {
      const cutoff = new Date(d);
      cutoff.setDate(cutoff.getDate() + 1);
      const kstCutoff = new Date(`${fmtDateInput(cutoff)}T07:00:00+09:00`);
      if (now >= kstCutoff) past.add(DOWS[i].key);
    });
    return past;
  }, [weekDates]);

  /** silent=true면 스피너를 띄우지 않는다(토글 직후 갱신 등 — 목록이 깜빡이는 걸 막는다) */
  const fetchTemplates = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const { data } = await supabase
      .from("auction_templates")
      .select("*, club:clubs(id, name, area)")
      .eq("md_id", mdId)
      .eq("listing_type", "share")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    const list = (data ?? []) as AuctionTemplate[];
    setTemplates(list);
    if (!opts?.silent) setLoading(false);

    if (list.length > 0) {
      const weekStart = fmtDateInput(weekDates[0]);
      const weekEnd = fmtDateInput(weekDates[6]);
      const { data: pub } = await supabase
        .from("puzzles")
        .select("id, source_template_id, event_date, current_count, target_count")
        .in("source_template_id", list.map((t) => t.id))
        // 취소·만료분까지 담으면 껐는데도 "오늘 인원" 행이 남는다
        .in("status", ["open", "selecting"])
        .gte("event_date", weekStart)
        .lte("event_date", weekEnd);
      const map = new Map<string, { id: string; current_count: number; target_count: number }>();
      (pub ?? []).forEach((p) => {
        map.set(`${p.source_template_id}|${p.event_date}`, { id: p.id, current_count: p.current_count, target_count: p.target_count });
      });
      setWeekPuzzleMap(map);
    } else {
      setWeekPuzzleMap(new Map());
    }
  };

  // ── 이번 주 클럽 운영권(weekly_share_slots) — 게스트 간판과 동일한 주 단위 선점 ──
  // 진입 시점에 미리 조회해 "다른 파트너가 운영 중"을 토글 실패로 알게 하지 않는다.
  type SlotRow = {
    club_id: string; club_name: string;
    holder_id: string | null; holder_name: string | null; is_mine: boolean;
    // 다음 주(Migration 521) — 게스트 간판의 "다음 주도 미리 선점"과 같은 리듬
    next_holder_id: string | null; next_holder_name: string | null;
    next_is_mine: boolean; next_slot_id: string | null; days_set: number;
  };
  const [slotStatus, setSlotStatus] = useState<Map<string, SlotRow>>(new Map());
  const [claiming, setClaiming] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string>("");
  const [nextWeekStart, setNextWeekStart] = useState<string>("");

  // 다음 오픈: weekStart(이번 주 월요일)의 7일 뒤 월요일 18시 KST.
  // 게스트 간판과 같은 리듬이라 같은 문구를 쓴다.
  const nextOpenLabel = useMemo(() => {
    if (!weekStart) return null;
    const next = new Date(`${weekStart}T00:00:00+09:00`);
    next.setDate(next.getDate() + 7);
    return `${next.getMonth() + 1}/${next.getDate()}(월) 18시`;
  }, [weekStart]);

  const fetchSlots = async () => {
    const { data } = await supabase.rpc("get_my_share_slot_status");
    if (data?.success) {
      setWeekStart(data.week_start);
      setNextWeekStart(data.next_week_start ?? "");
      const m = new Map<string, SlotRow>();
      (data.clubs as SlotRow[]).forEach((r) => m.set(r.club_id, r));
      setSlotStatus(m);
    }
  };

  const claimSlot = async (clubId: string) => {
    if (!weekStart) return;
    setClaiming(clubId);
    const { data } = await supabase.rpc("claim_share_slot", { p_club_id: clubId, p_week_start: weekStart });
    setClaiming(null);
    if (!data?.success) {
      toast.error(data?.error || "자리 선점에 실패했어요");
      return;
    }
    toast.success("이번 주 이 클럽 조각 자리를 잡았어요");
    await fetchSlots();
  };

  /** 다음 주 자리 미리 잡기 — 안 잡으면 다음 주 날짜는 발행에서 건너뛴다 */
  const MIN_DOWS_FOR_NEXT_WEEK = 2;
  const claimNextWeek = async (clubId: string) => {
    if (!nextWeekStart) return;
    setClaiming(clubId);
    const { data } = await supabase.rpc("claim_share_slot", { p_club_id: clubId, p_week_start: nextWeekStart });
    if (!data?.success) {
      setClaiming(null);
      toast.error(data?.error || "다음 주 선점에 실패했어요");
      return;
    }
    // 자리를 잡았으니 다음 주 날짜까지 바로 채운다(cron을 기다리면 그날까지 빈다)
    for (const t of templates.filter((x) => x.is_live && x.club_id === clubId)) {
      await supabase.rpc("publish_my_share_template", { p_template_id: t.id });
    }
    setClaiming(null);
    toast.success("다음 주 자리도 잡았어요 · 예정된 조각까지 올렸어요");
    await fetchSlots();
    await fetchTemplates({ silent: true });
  };

  const releaseNextWeek = async (slotId: string, clubId: string) => {
    setClaiming(clubId);
    const { data } = await supabase.rpc("release_share_slot", { p_slot_id: slotId });
    setClaiming(null);
    if (!data?.success) {
      toast.error(data?.error || "해제에 실패했어요");
      return;
    }
    toast.success("다음 주 선점을 해제했어요");
    await fetchSlots();
  };

  useEffect(() => {
    fetchTemplates();
    fetchSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mdId]);

  // ── 요일 반복 규칙 편집 ────────────────────────────────────────────────
  // live_dows는 "매주 이 요일마다"라는 반복 규칙이다. 한 번 정하면 다음 주에 다시
  // 세팅할 필요가 없다(그래서 날짜가 아니라 요일 칩으로 보여준다).
  const [untilPicker, setUntilPicker] = useState<{ template: AuctionTemplate } | null>(null);
  const [untilDraft, setUntilDraft] = useState("");

  /** live_dows를 통째로 교체하고, 늘어난 요일은 즉시 발행 / 줄어든 요일은 예정분 회수 */
  const setDows = async (
    template: AuctionTemplate,
    nextDows: string[],
    opts?: { keepLive?: boolean }
  ) => {
    const prevDows = template.live_dows;
    const added = nextDows.filter((d) => !prevDows.includes(d));
    const removed = prevDows.filter((d) => !nextDows.includes(d));
    if (added.length === 0 && removed.length === 0) return;

    // keepLive: 요일만 비우고 마스터는 켜둔 채로 (요일 칩·프리셋 조작).
    // 끄는 건 오른쪽 마스터 토글만 담당한다(Migration 518).
    const nextIsLive = opts?.keepLive ? template.is_live : nextDows.length > 0;
    setRowBusy(template.id);
    const { error } = await supabase
      .from("auction_templates")
      .update({ live_dows: nextDows, is_live: nextIsLive })
      .eq("id", template.id);
    if (error) {
      setRowBusy(null);
      toast.error(readableDbError(error.message, "저장에 실패했어요"));
      return;
    }
    setTemplates((prev) =>
      prev.map((t) => (t.id === template.id ? { ...t, live_dows: nextDows, is_live: nextIsLive } : t))
    );

    // 뺀 요일의 예정분 회수 — 껐는데 아직 떠 있으면 노쇼로 이어진다(Migration 509).
    if (removed.length > 0) {
      const { data, error: unpubErr } = await supabase.rpc("unpublish_my_share_template", {
        p_template_id: template.id,
        p_dows: removed,
      });
      // 회수 실패를 조용히 삼키면 "껐는데 아직 떠 있는" 상태가 되고 노쇼로 이어진다.
      if (unpubErr || !data?.success) {
        toast.error(unpubErr?.message || data?.error || "예정된 조각을 내리지 못했어요");
      } else if (data.kept > 0) {
        toast.error(`참여자가 있는 ${data.kept}건은 남겨뒀어요 — 직접 확인해주세요`);
      }
    }
    // 더한 요일은 즉시 발행 — cron만 믿으면 오늘 켠 자리가 다음 실행까지 안 생긴다(507).
    if (added.length > 0) {
      const { data } = await supabase.rpc("publish_my_share_template", { p_template_id: template.id });
      if (data?.success && data.published > 0) {
        // 건수는 알리지 않는다 — 화면의 요일 칩은 이번 주만 보여주는데 발행은 앞으로
        // 7일치라, 숫자가 칩 개수와 안 맞아 "왜 7건이지"가 된다.
        toast.success(
          data.skipped > 0
            ? "조각이 등록되었어요! · 일부는 다음 주 자리를 잡아야 올라가요"
            : "조각이 등록되었어요!"
        );
      } else if (data?.success && data.skipped > 0) {
        // 서버가 첫 실패 사유(SQLERRM)를 그대로 보내준다(Migration 512).
        // 이유를 뭉개면 "왜 안 올라가지"를 추적할 수 없다.
        toast.error(data.reason || "발행하지 못했어요 — 설정을 확인해주세요");
      }
    }
    await fetchTemplates({ silent: true });
    setRowBusy(null);
  };

  const toggleDow = (template: AuctionTemplate, dow: string) => {
    const has = template.live_dows.includes(dow);
    return setDows(
      template,
      has ? template.live_dows.filter((d) => d !== dow) : [...template.live_dows, dow],
      { keepLive: true }
    );
  };

  /**
   * 마스터 스위치 — is_live를 직접 쓴다.
   * setDows에 위임하면 "요일이 이미 다 꺼진 상태"에서 바뀐 요일이 없어 early-return되고,
   * 결과적으로 토글이 아무 반응도 하지 않는다(518로 빈 요일 + is_live=true가 허용되면서 생긴 상태).
   * 끄기는 요일을 지우지 않는다 — 다시 켤 때 쓰던 요일이 그대로 돌아와야 한다.
   */
  const toggleMaster = async (template: AuctionTemplate, presetDows?: string[]) => {
    const nextLive = !template.is_live;
    const nextDows = nextLive
      ? (presetDows && presetDows.length > 0
          ? presetDows
          : template.live_dows.length > 0
            ? template.live_dows
            : DOWS.map((d) => d.key))
      : template.live_dows;

    setRowBusy(template.id);
    const { error } = await supabase
      .from("auction_templates")
      .update({ is_live: nextLive, live_dows: nextDows })
      .eq("id", template.id);
    if (error) {
      setRowBusy(null);
      toast.error(readableDbError(error.message, "저장에 실패했어요"));
      return;
    }
    setTemplates((prev) =>
      prev.map((t) => (t.id === template.id ? { ...t, is_live: nextLive, live_dows: nextDows } : t))
    );

    if (nextLive) {
      const { data } = await supabase.rpc("publish_my_share_template", { p_template_id: template.id });
      if (data?.success && data.published > 0) {
        // 다음 주 슬롯을 아직 안 잡았으면 그 날짜들은 발행되지 않는다 — 조용히 넘기면
        // "왜 7일치가 아니라 5건이지"가 된다(운영권은 주 단위, Migration 514).
        // 건수는 알리지 않는다 — 화면의 요일 칩은 이번 주만 보여주는데 발행은 앞으로
        // 7일치라, 숫자가 칩 개수와 안 맞아 "왜 7건이지"가 된다.
        toast.success(
          data.skipped > 0
            ? "조각이 등록되었어요! · 일부는 다음 주 자리를 잡아야 올라가요"
            : "조각이 등록되었어요!"
        );
      } else if (data?.success && data.skipped > 0) {
        toast.error(data.reason || "발행하지 못했어요 — 설정을 확인해주세요");
      }
    } else {
      const { data, error: unpubErr } = await supabase.rpc("unpublish_my_share_template", {
        p_template_id: template.id,
      });
      if (unpubErr || !data?.success) {
        toast.error(unpubErr?.message || data?.error || "예정된 조각을 내리지 못했어요");
      } else if (data.kept > 0) {
        toast.error(`참여자가 있는 ${data.kept}건은 남겨뒀어요 — 직접 확인해주세요`);
      }
    }
    await fetchTemplates({ silent: true });
    setRowBusy(null);
  };

  const confirmUntilPicker = async () => {
    if (!untilPicker) return;
    if (untilDraft && untilDraft < fmtDateInput(today)) {
      toast.error("종료일이 이미 지났어요");
      return;
    }
    const { template } = untilPicker;
    setUntilPicker(null);
    setRowBusy(template.id);
    const nextUntil = untilDraft || null;
    const { error } = await supabase
      .from("auction_templates")
      .update({ live_until: nextUntil })
      .eq("id", template.id);
    setRowBusy(null);
    if (error) {
      toast.error(readableDbError(error.message, "저장에 실패했어요"));
      return;
    }
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, live_until: nextUntil } : t)));
    toast.success(nextUntil ? "운영 기간을 바꿨어요" : "기간 제한을 없앴어요");
  };

  // ── ⋯ 액션 시트: 수정 / 복제 / 삭제 / 전부 끄기 ──────────────────────
  const [actionTarget, setActionTarget] = useState<AuctionTemplate | null>(null);
  const [editTarget, setEditTarget] = useState<AuctionTemplate | null>(null);
  const [editForm, setEditForm] = useState({ name: "", total_seats: 6, price_man: "", includes: [] as string[], md_comment: "" });
  const [editBusy, setEditBusy] = useState(false);

  const openEdit = (t: AuctionTemplate) => {
    setActionTarget(null);
    setEditTarget(t);
    setEditForm({
      name: t.name,
      total_seats: t.total_seats ?? 6,
      price_man: t.price_per_seat ? String(Math.round(t.price_per_seat / 10000)) : "",
      includes: t.includes ?? [],
      md_comment: t.md_comment ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const name = editForm.name.trim();
    if (!name) { toast.error("이름을 입력해주세요"); return; }
    const priceMan = Number(editForm.price_man);
    if (!priceMan || priceMan <= 0) { toast.error("1인 가격을 입력해주세요"); return; }
    if (priceMan > MAX_PRICE_MAN) { toast.error(`1인 가격은 ${MAX_PRICE_MAN}만원까지 입력할 수 있어요`); return; }
    if (editForm.total_seats < 2 || editForm.total_seats > 20) { toast.error("정원은 2~20명이에요"); return; }

    setEditBusy(true);
    const { error } = await supabase
      .from("auction_templates")
      .update({
        name,
        total_seats: editForm.total_seats,
        price_per_seat: priceMan * 10000,
        includes: editForm.includes,
        md_comment: editForm.md_comment.trim() || null,
      })
      .eq("id", editTarget.id);
    setEditBusy(false);
    if (error) { toast.error("수정에 실패했어요"); return; }
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === editTarget.id
          ? { ...t, name, total_seats: editForm.total_seats, price_per_seat: priceMan * 10000, includes: editForm.includes, md_comment: editForm.md_comment.trim() || null }
          : t
      )
    );
    toast.success("수정했어요");
    setEditTarget(null);
  };

  const handleDuplicate = async (t: AuctionTemplate) => {
    setActionTarget(null);
    if (templates.length >= MAX_TEMPLATES) {
      toast.error(`템플릿은 최대 ${MAX_TEMPLATES}개까지예요`);
      return;
    }
    const { data, error } = await supabase
      .from("auction_templates")
      .insert({
        md_id: mdId,
        name: nextCopyName(t.name, templates),
        club_id: t.club_id,
        table_type: t.table_type,
        total_seats: t.total_seats,
        price_per_seat: t.price_per_seat,
        main_alcohol: t.main_alcohol,
        includes: t.includes,
        md_comment: t.md_comment,
        // 복제본은 원본과 같은 폴더로 — 지금 보고 있는 분류에서 만들었는데
        // 미분류로 떨어지면 화면에서 사라진 것처럼 보인다.
        category: t.category,
        listing_type: "share",
      })
      .select("*, club:clubs(id, name, area)")
      .single();
    if (error) {
      toast.error(readableDbError(error.message, "복제에 실패했어요"));
      return;
    }
    setTemplates((prev) => [...prev, data as AuctionTemplate]);
    toast.success("복제했어요. 꺼진 상태로 추가돼서 요일을 다시 골라야 해요");
  };

  const handleDelete = async (t: AuctionTemplate) => {
    setActionTarget(null);
    if (!window.confirm(`"${t.name}" 세팅을 삭제할까요? 이미 발행된 조각은 그대로 남아요.`)) return;
    const { error } = await supabase.from("auction_templates").delete().eq("id", t.id);
    if (error) { toast.error("삭제에 실패했어요"); return; }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    toast.success("삭제했어요");
  };

  const handleTurnOffAll = async (t: AuctionTemplate) => {
    setActionTarget(null);
    const { error } = await supabase
      .from("auction_templates")
      .update({ is_live: false, live_dows: [] })
      .eq("id", t.id);
    if (error) { toast.error("끄기에 실패했어요"); return; }
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_live: false, live_dows: [] } : x)));

    // 미래 발행분도 전부 내린다(참여자 있는 건은 서버가 남김) — Migration 509
    const { data, error: unpubErr } = await supabase.rpc("unpublish_my_share_template", { p_template_id: t.id });
    await fetchTemplates({ silent: true });
    if (unpubErr || !data?.success) {
      toast.error(unpubErr?.message || data?.error || "예정된 조각을 내리지 못했어요");
    } else if (data.kept > 0) {
      toast.error(`껐어요. 참여자가 있는 ${data.kept}건은 남겨뒀어요 — 직접 확인해주세요`);
    } else {
      toast.success(
        data?.cancelled > 0 ? `이 자리를 껐어요 · 예정분 ${data.cancelled}건도 내렸어요` : "이 자리를 전부 껐어요"
      );
    }
  };

  const missingRequired = (t: AuctionTemplate) => !t.club_id || !t.total_seats || !t.price_per_seat;

  const applySeatAdjust = async (puzzleId: string) => {
    const delta = seatDeltas[puzzleId] ?? 0;
    if (seatSaving || delta === 0) return;
    setSeatSaving(puzzleId);
    const { data } = await supabase.rpc("adjust_share_host_external", { p_puzzle_id: puzzleId, p_delta: delta });
    setSeatSaving(null);
    if (data?.success) {
      setWeekPuzzleMap((prev) => {
        const next = new Map(prev);
        for (const [key, v] of next) {
          if (v.id === puzzleId) next.set(key, { ...v, current_count: data.current_count });
        }
        return next;
      });
      setSeatDeltas((m) => ({ ...m, [puzzleId]: 0 }));
    } else if (data?.error) {
      toast.error(data.error);
    }
  };

  // ── + 템플릿: 새 세팅 만들기 ────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TemplateFormState>(emptyTemplateForm());
  const [createBusy, setCreateBusy] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  const openCreate = () => {
    if (templates.length >= MAX_TEMPLATES) {
      toast.error(`템플릿은 최대 ${MAX_TEMPLATES}개까지예요`);
      return;
    }
    setCreateForm({ ...emptyTemplateForm(), club_id: clubs[0]?.id ?? "" });
    setCreateFolderOpen(false);
    setCreateOpen(true);
  };

  const saveCreate = async () => {
    if (!createForm.club_id) { toast.error("클럽을 선택해주세요"); return; }
    const name = createForm.name.trim();
    if (!name) { toast.error("이름을 입력해주세요"); return; }
    const priceMan = Number(createForm.price_man);
    if (!priceMan || priceMan <= 0) { toast.error("1인 가격을 입력해주세요"); return; }
    if (priceMan > MAX_PRICE_MAN) { toast.error(`1인 가격은 ${MAX_PRICE_MAN}만원까지 입력할 수 있어요`); return; }
    if (createForm.total_seats < 2 || createForm.total_seats > 20) { toast.error("정원은 2~20명이에요"); return; }

    setCreateBusy(true);
    const { data, error } = await supabase
      .from("auction_templates")
      .insert({
        md_id: mdId,
        name,
        club_id: createForm.club_id,
        category: createForm.category.trim() || null,
        total_seats: createForm.total_seats,
        price_per_seat: priceMan * 10000,
        includes: createForm.includes,
        md_comment: createForm.md_comment.trim() || null,
        listing_type: "share",
      })
      .select("*, club:clubs(id, name, area)")
      .single();
    setCreateBusy(false);
    if (error) {
      toast.error(readableDbError(error.message, "저장에 실패했어요"));
      return;
    }
    setTemplates((prev) => [...prev, data as AuctionTemplate]);
    toast.success("템플릿을 만들었어요. 요일을 골라 켜주세요");
    setCreateOpen(false);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIndex !== index) setOverIndex(index);
  };

  // 드롭했을 때 실제로 몇 번째로 들어가는지 — 삽입선을 그릴 위치 계산에 쓴다.
  // 위로 끌면 그 행 "위", 아래로 끌면 그 행 "아래"에 꽂힌다.
  const insertAbove = dragIndex !== null && overIndex !== null && dragIndex > overIndex;
  const insertBelow = dragIndex !== null && overIndex !== null && dragIndex < overIndex;
  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };
  const handleDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      handleDragEnd();
      return;
    }
    // 인덱스는 화면(필터 적용된 목록) 기준이다. 보이는 것끼리만 순서를 바꾸고,
    // 안 보이는 줄은 원래 자리에 그대로 둔 채 전체 목록을 다시 조립한다.
    const reordered = [...visibleTemplates];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);

    const visibleIds = new Set(visibleTemplates.map((t) => t.id));
    let cursor = 0;
    const next = templates.map((t) => (visibleIds.has(t.id) ? reordered[cursor++] : t));
    setTemplates(next);
    handleDragEnd();
    try {
      await Promise.all(
        next.map((t, i) => supabase.from("auction_templates").update({ sort_order: i }).eq("id", t.id))
      );
    } catch {
      toast.error("순서 저장에 실패했어요");
      await fetchTemplates({ silent: true });
    }
  };

  // ── 분류하기 ─────────────────────────────────────────────────────────
  const [categoryTarget, setCategoryTarget] = useState<AuctionTemplate | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  /** 새 폴더 이름 확정 — 칩으로 승격시키고 입력칸을 닫는다 */
  const confirmNewFolder = (
    raw: string,
    setValue: (v: string) => void,
    setOpen: (v: boolean) => void
  ) => {
    const name = raw.trim();
    if (!name) { setOpen(false); setValue(""); return; }
    if (!draftFolders.includes(name)) persistDraftFolders([...draftFolders, name]);
    setValue(name);
    setOpen(false);
  };

  const saveCategory = async () => {
    if (!categoryTarget) return;
    const next = categoryDraft.trim() || null;
    const t = categoryTarget;
    setCategoryTarget(null);
    setRowBusy(t.id);
    const { error } = await supabase
      .from("auction_templates")
      .update({ category: next })
      .eq("id", t.id);
    setRowBusy(null);
    if (error) {
      toast.error(readableDbError(error.message, "저장에 실패했어요"));
      return;
    }
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, category: next } : x)));
    toast.success(next ? `"${next}"로 분류했어요` : "분류를 없앴어요");
  };

  /** 끌어다 놓은 자리에 폴더를 꽂는다 — 화면에 보이는 순서를 그대로 저장한다 */
  const moveFolderTo = (name: string, toIndex: number) => {
    const base = [...usedCategories];
    const at = base.indexOf(name);
    if (at === -1 || at === toIndex) return;
    base.splice(at, 1);
    base.splice(toIndex, 0, name);
    persistFolderOrder(base);
  };

  /** 템플릿 하나의 분류를 바꾼다 — 시트와 드래그 앤 드롭이 같이 쓴다 */
  const assignCategory = async (t: AuctionTemplate, next: string | null) => {
    if ((t.category ?? null) === next) return;
    setRowBusy(t.id);
    const { error } = await supabase
      .from("auction_templates")
      .update({ category: next })
      .eq("id", t.id);
    setRowBusy(null);
    if (error) {
      toast.error(readableDbError(error.message, "저장에 실패했어요"));
      return;
    }
    setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, category: next } : x)));
    toast.success(next ? `"${next}"로 옮겼어요` : "분류를 없앴어요");
  };

  /** 폴더 이름 변경 — 그 분류를 쓰는 템플릿 전부를 한 번에 옮긴다 */
  const renameFolder = async (from: string, rawTo: string) => {
    const to = rawTo.trim();
    if (!to || to === from) return;
    if (usedCategories.includes(to)) {
      toast.error(`"${to}" 폴더가 이미 있어요`);
      return;
    }
    if (templates.some((t) => t.category === from)) {
      const { error } = await supabase
        .from("auction_templates")
        .update({ category: to })
        .eq("md_id", mdId)
        .eq("category", from);
      if (error) {
        toast.error(error.message || "이름을 바꾸지 못했어요");
        return;
      }
      setTemplates((prev) => prev.map((t) => (t.category === from ? { ...t, category: to } : t)));
    }
    if (draftFolders.includes(from)) {
      persistDraftFolders(draftFolders.map((c) => (c === from ? to : c)));
    }
    persistFolderOrder((folderOrder.length > 0 ? folderOrder : usedCategories).map((c) => (c === from ? to : c)));
    if (categoryFilter === from) setCategoryFilter(to);
    toast.success(`"${to}"로 바꿨어요`);
  };

  /** 폴더 삭제 — 폴더만 없애고 템플릿은 미분류로 남긴다(설정을 지우면 안 된다) */
  const deleteFolder = async (name: string) => {
    const targets = templates.filter((t) => t.category === name);
    if (targets.length === 0) {
      // 아직 조각이 없는 빈 폴더 — DB에 흔적이 없으니 목록에서만 뺀다
      persistDraftFolders(draftFolders.filter((c) => c !== name));
      persistFolderOrder(folderOrder.filter((c) => c !== name));
      if (categoryFilter === name) setCategoryFilter("");
      toast.success(`"${name}" 폴더를 없앴어요`);
      return;
    }
    const { error } = await supabase
      .from("auction_templates")
      .update({ category: null })
      .eq("md_id", mdId)
      .eq("category", name);
    if (error) {
      toast.error(error.message || "폴더를 없애지 못했어요");
      return;
    }
    setTemplates((prev) => prev.map((t) => (t.category === name ? { ...t, category: null } : t)));
    persistFolderOrder(folderOrder.filter((c) => c !== name));
    persistDraftFolders(draftFolders.filter((c) => c !== name));
    if (categoryFilter === name) setCategoryFilter("");
    toast.success(`"${name}" 폴더를 없앴어요 · 조각 ${targets.length}개는 미분류로 남았어요`);
  };

  // 클럽이 하나뿐이면 줄마다 클럽명을 반복할 이유가 없다(같은 값이 9번 반복됨).
  // 여러 클럽을 운영하는 MD에게만 표기한다.
  const showClubName =
    new Set(templates.map((t) => t.club_id).filter(Boolean)).size > 1;

  // 필터 탭 — 실제 쓰이는 분류만. 미분류가 있으면 마지막에 붙인다.
  // 순서: 저장된 사용자 순서 > 기본 프리셋(평일 → 주말) > 나머지는 등장 순.
  // "평일이 항상 왼쪽"이 기본값 — MD가 꾹 눌러 직접 바꾸면 그 순서가 우선한다.
  // 조각이 아직 없는 빈 폴더도 함께 보여준다 — 폴더를 먼저 만들고 조각을 나중에
  // 넣는 순서가 자연스러운데, 비어 있다고 숨기면 방금 만든 폴더가 사라진 것처럼 보인다.
  const rawCategories = Array.from(
    new Set([
      ...templates.map((t) => t.category).filter((c): c is string => !!c),
      ...draftFolders,
    ])
  );
  const usedCategories = [...rawCategories].sort((a, b) => {
    const ia = folderOrder.indexOf(a);
    const ib = folderOrder.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    const pa = CATEGORY_PRESETS.indexOf(a);
    const pb = CATEGORY_PRESETS.indexOf(b);
    if (pa !== -1 || pb !== -1) {
      if (pa === -1) return 1;
      if (pb === -1) return -1;
      return pa - pb;
    }
    return rawCategories.indexOf(a) - rawCategories.indexOf(b);
  });
  const hasUncategorized = templates.some((t) => !t.category);
  const filterTabs: { key: string; label: string }[] = [
    ...usedCategories.map((c) => ({ key: c, label: c })),
    ...(hasUncategorized ? [{ key: UNCATEGORIZED, label: "미분류" }] : []),
  ];
  // 저장된 필터가 사라졌으면 첫 탭으로 폴백
  const activeTab = filterTabs.some((t) => t.key === categoryFilter)
    ? categoryFilter
    : filterTabs[0]?.key ?? "";
  const visibleTemplates = templates.filter((t) =>
    activeTab === UNCATEGORIZED ? !t.category : t.category === activeTab
  );

  // 운영권을 하나라도 가진 클럽이 있는지 — 1회성 등록 CTA 노출 조건
  const hasAnySlot = Array.from(slotStatus.values()).some((s) => s.is_mine);

  // 일괄 토글 — 켤 수 있는 것(필수값 있고 운영권 보유)만 대상으로 한다
  // 지금 보고 있는 폴더만 대상 — "평일" 탭에서 누른 모두 켜기가 주말 조각까지
  // 켜면 폴더를 나눈 의미가 없다.
  const bulkTargets = visibleTemplates.filter(
    (t) => !missingRequired(t) && !(t.club_id && slotStatus.get(t.club_id) && !slotStatus.get(t.club_id)!.is_mine)
  );
  const allOn = bulkTargets.length > 0 && bulkTargets.every((t) => t.is_live);
  const [bulkBusy, setBulkBusy] = useState(false);


  const toggleAll = async () => {
    if (bulkTargets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    // 한 건씩 순차 처리 — 발행/회수 RPC까지 함께 돌리므로 병렬로 던지면
    // 같은 클럽·날짜 상한에 서로 걸린다.
    for (const t of bulkTargets) {
      // 모두 켜기는 분류와 무관하게 매일 — 빼는 편이 고르는 것보다 빠르다
      if (allOn === t.is_live) await toggleMaster(t, DOWS.map((d) => d.key));
    }
    setBulkBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-black text-foreground">내 조각</span>
        <span className="text-[12px] text-muted-foreground font-semibold">{templates.length}/{MAX_TEMPLATES}</span>
        <button
          type="button"
          onClick={openCreate}
          className="ml-auto h-7 px-3 rounded-full bg-inverse text-inverse-foreground text-[12px] font-black inline-flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> 조각 설정
        </button>
        <button
          type="button"
          onClick={() => setFolderManagerOpen(true)}
          className="h-7 px-3 rounded-full bg-muted text-muted-foreground text-[12px] font-black inline-flex items-center gap-1 hover:text-foreground active:scale-95 transition"
        >
          <FolderCog className="w-3.5 h-3.5" /> 폴더
        </button>
      </div>

      {/* 이번 주 클럽 운영권 — 게스트 간판과 같은 주 단위 선점(월 18시 오픈).
          토글을 눌러 실패로 알게 하지 말고, 들어오자마자 상태를 보여준다. */}
      {Array.from(slotStatus.values()).map((s) => {
        if (s.is_mine) return null;
        return (
          <div
            key={s.club_id}
            className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2 ${
              s.holder_id ? "border-red-500/35 bg-red-500/5" : "border-amber-500/35 bg-amber-500/5"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-black text-foreground truncate">{s.club_name}</p>
              <p className="text-[11px] text-muted-foreground font-semibold">
                {s.holder_id ? (
                  <>
                    이번 주는{" "}
                    <Link
                      href={`/u/${s.holder_id}`}
                      className="text-foreground font-bold underline underline-offset-2 hover:text-brand-amber transition-colors"
                    >
                      {s.holder_name ?? "다른 파트너"}
                    </Link>
                    가 운영 중이에요
                  </>
                ) : (
                  "이번 주 자리가 비어 있어요 — 먼저 잡으면 이 클럽 조각을 올릴 수 있어요"
                )}
              </p>
              {s.holder_id && nextOpenLabel && (
                <p className="text-[10.5px] text-brand-amber font-bold mt-0.5">
                  {nextOpenLabel} 선착순 오픈
                </p>
              )}
            </div>
            {!s.holder_id && (
              <button
                type="button"
                disabled={claiming === s.club_id}
                onClick={() => claimSlot(s.club_id)}
                className="shrink-0 h-8 px-3 rounded-full bg-amber-500 text-black text-[12px] font-black active:scale-95 transition disabled:opacity-40"
              >
                {claiming === s.club_id ? "잡는 중" : "자리 잡기"}
              </button>
            )}
          </div>
        );
      })}

      {/* 다음 주 자리 — 안 잡으면 다음 주 날짜는 발행에서 통째로 건너뛴다.
          게스트 간판의 "다음 주도 미리 선점"과 같은 리듬(월 18시 오픈, 주당 1자리). */}
      {Array.from(slotStatus.values()).map((s) => {
        if (!s.is_mine) return null;
        const canClaim = (s.days_set ?? 0) >= MIN_DOWS_FOR_NEXT_WEEK;
        return (
          <div key={`next-${s.club_id}`} className="rounded-xl border border-border bg-card px-3.5 py-2.5 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              {s.next_is_mine ? (
                <>
                  <p className="text-[12.5px] font-black text-money">✓ 다음 주도 차지함</p>
                  <p className="text-[10.5px] text-muted-foreground font-semibold mt-0.5">
                    {s.club_name} · 다음 주 조각까지 자동으로 올라가요
                  </p>
                </>
              ) : s.next_holder_id ? (
                <>
                  <p className="text-[12.5px] font-black text-foreground">다음 주는 다른 파트너가 잡았어요</p>
                  <p className="text-[10.5px] text-muted-foreground font-semibold mt-0.5">
                    {s.club_name} · {s.next_holder_name ?? "다른 파트너"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[12.5px] font-black text-foreground">{s.club_name} · 다음 주 자리는 아직 비어 있어요</p>
                  <p className="text-[10.5px] text-muted-foreground font-semibold mt-0.5">
                    {MIN_DOWS_FOR_NEXT_WEEK}일 이상 등록하면 다음주도 미리 잡을 수 있어요
                  </p>
                </>
              )}
            </div>
            {s.next_is_mine ? (
              <button
                type="button"
                disabled={claiming === s.club_id || !s.next_slot_id}
                onClick={() => s.next_slot_id && releaseNextWeek(s.next_slot_id, s.club_id)}
                className="shrink-0 h-8 px-3 rounded-full bg-muted text-muted-foreground text-[11.5px] font-bold hover:text-red-400 disabled:opacity-40 transition-colors"
              >
                해제
              </button>
            ) : !s.next_holder_id ? (
              <button
                type="button"
                disabled={claiming === s.club_id || !canClaim}
                onClick={() => claimNextWeek(s.club_id)}
                className="shrink-0 h-8 px-3 rounded-full bg-amber-500 text-black text-[12px] font-black active:scale-95 transition disabled:opacity-40"
              >
                {claiming === s.club_id ? "잡는 중" : "다음 주도 차지하기"}
              </button>
            ) : null}
          </div>
        );
      })}

      {/* 분류 필터 — 개수와 무관하게 한 줄에 균등 분할. 오른쪽 폴더 버튼에서 순서·삭제 */}
      {!loading && filterTabs.length > 1 && (
        <div className="flex gap-2">
          {filterTabs.map((tab) => {
            const count =
              tab.key === UNCATEGORIZED
                ? templates.filter((t) => !t.category).length
                : templates.filter((t) => t.category === tab.key).length;
            return (
              <button
                key={tab.key}
                type="button"
                // 폴더 자체를 끌면 순서 변경 (미분류는 항상 마지막이라 제외)
                draggable={tab.key !== UNCATEGORIZED}
                onDragStart={(e) => {
                  if (tab.key === UNCATEGORIZED) return;
                  // 유령 이미지를 이 칩으로 고정 — 기본값은 줄 전체가 잡혀 "다 움직인다"로 보인다
                  const el = e.currentTarget as HTMLElement;
                  const r = el.getBoundingClientRect();
                  e.dataTransfer.setDragImage(el, r.width / 2, r.height / 2);
                  e.dataTransfer.effectAllowed = "move";
                  setFolderDrag(tab.key);
                }}
                onDragEnd={() => setFolderDrag(null)}
                onClick={() => setCategoryFilter(tab.key)}
                onDragOver={(e) => {
                  // 템플릿을 끌고 오면 분류, 폴더를 끌고 오면 순서 변경
                  if (dragIndex === null && !folderDrag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (folderDropKey !== tab.key) setFolderDropKey(tab.key);
                }}
                onDragLeave={() => setFolderDropKey((k) => (k === tab.key ? null : k))}
                onDrop={(e) => {
                  if (folderDrag) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (tab.key !== UNCATEGORIZED) moveFolderTo(folderDrag, usedCategories.indexOf(tab.key));
                    setFolderDrag(null);
                    setFolderDropKey(null);
                    return;
                  }
                  if (dragIndex === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  // dragIndex는 화면(=필터 적용된 목록) 기준이다. 전체 배열로 읽으면 엉뚱한 줄이 옮겨간다.
                  const t = visibleTemplates[dragIndex];
                  setFolderDropKey(null);
                  handleDragEnd();
                  if (t) assignCategory(t, tab.key === UNCATEGORIZED ? null : tab.key);
                }}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 h-12 bg-card border rounded-xl hover:bg-muted active:scale-95 transition-all ${
                  folderDrag === tab.key ? "opacity-40 " : ""
                }${
                  folderDropKey === tab.key
                    ? "border-amber-500 bg-amber-500/10"
                    : activeTab === tab.key
                      ? "border-green-500"
                      : "border-border"
                }`}
              >
                <span className="text-[12.5px] font-black text-foreground truncate max-w-full px-1">{tab.label}</span>
                <span className="text-[10px] font-bold text-muted-foreground leading-none">{count}개</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 일괄 토글 — 템플릿이 여러 개면 하나씩 켜는 게 번거롭다 */}
      {!loading && bulkTargets.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={bulkBusy}
            onClick={toggleAll}
            className="h-7 px-3 rounded-full bg-muted text-muted-foreground text-[11.5px] font-black hover:text-foreground disabled:opacity-40 transition-colors"
          >
            {bulkBusy ? "적용 중…" : allOn ? "모두 끄기" : "모두 켜기"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <p className="text-center text-muted-foreground text-[12.5px] py-6">
          자주 쓰는 세팅을 만들어두면 요일만 골라 계속 자동으로 올릴 수 있어요.
        </p>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border">
          {visibleTemplates.map((t, idx) => {
            // 그 클럽 운영권이 없으면 켤 수 없다 — 켜도 발행이 전부 막힌다
            const slot = t.club_id ? slotStatus.get(t.club_id) : undefined;
            const noSlot = !!slot && !slot.is_mine;
            const disabled = rowBusy === t.id || missingRequired(t) || noSlot;
            // 오늘 발행분 — 인원 수정용
            const todayStr = fmtDateInput(today);
            const published = weekPuzzleMap.get(`${t.id}|${todayStr}`);
            const seatDelta = published ? seatDeltas[published.id] ?? 0 : 0;
            const seatCount = published ? Math.max(0, Math.min(published.target_count, published.current_count + seatDelta)) : 0;
            return (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`relative bg-card px-3.5 py-3 space-y-2 transition-opacity ${
                  !t.is_live ? "opacity-70" : ""
                } ${dragIndex === idx ? "opacity-30" : ""}`}
              >
                {/* 삽입선 — 어느 행 사이로 들어가는지 명확히 */}
                {overIndex === idx && insertAbove && (
                  <span className="pointer-events-none absolute left-2 right-2 -top-[1px] h-[2px] rounded-full bg-amber-500" />
                )}
                {overIndex === idx && insertBelow && (
                  <span className="pointer-events-none absolute left-2 right-2 -bottom-[1px] h-[2px] rounded-full bg-amber-500" />
                )}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[14px] font-black text-foreground truncate">{t.name}</p>
                      {t.category && (
                        <span className="shrink-0 text-[9.5px] font-black text-muted-foreground bg-muted rounded px-1.5 py-[2px] leading-none">
                          {t.category}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-semibold truncate">
                      {showClubName ? `${t.club?.name ?? "클럽 미지정"} · ` : !t.club_id ? "클럽 미지정 · " : ""}
                      {t.total_seats ?? "-"}명 · 인당{" "}
                      <span className="text-brand-amber font-bold">
                        {t.price_per_seat ? `${Math.round(t.price_per_seat / 10000)}만원` : "-"}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActionTarget(t)}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="더보기"
                  >
                    ⋯
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={t.is_live}
                    disabled={disabled}
                    onClick={() => toggleMaster(t)}
                    className={`w-10 h-[23px] rounded-full relative shrink-0 transition-colors disabled:opacity-40 ${
                      t.is_live ? "bg-amber-500" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-[3px] left-[3px] w-[17px] h-[17px] rounded-full bg-white transition-transform ${
                        t.is_live ? "translate-x-[17px]" : ""
                      }`}
                    />
                  </button>
                </div>

                {missingRequired(t) && (
                  <p className="text-[10.5px] text-red-400 font-bold">클럽·인원·가격을 먼저 채워야 켤 수 있어요 — ⋯ → 세팅 수정에서 채워주세요</p>
                )}
                {/* 운영권 안내는 위 배너에서 클럽별로 한 번만 — 줄마다 반복하면 같은 문장이 도배된다 */}

                {/* 반복 요일 — 한 번 정하면 매주 자동. 다음 주에 다시 세팅할 필요 없다. */}
                {t.is_live && (
                  <>
                    <div className="flex gap-1">
                      {DOWS.map((d, di) => {
                        const on = t.live_dows.includes(d.key);
                        // 이미 지나간 날은 이번 주에 손댈 수 없다(다음 주부터 다시 산다)
                        const passed = passedDows.has(d.key);
                        const red = isRedDay(weekDates[di], fmtDateInput(weekDates[di]));
                        return (
                          <button
                            key={d.key}
                            type="button"
                            disabled={disabled || passed}
                            onClick={() => toggleDow(t, d.key)}
                            className={`flex-1 h-11 rounded-lg flex flex-col items-center justify-center leading-none gap-0.5 transition-colors disabled:opacity-40 ${
                              passed
                                ? "bg-muted/50"
                                : on
                                  ? "bg-amber-500"
                                  : "bg-muted"
                            } ${
                              // 토·일·공휴일은 달력처럼 빨간 글씨 (지나간 날은 회색이 우선)
                              passed
                                ? red ? "text-red-400/40" : "text-muted-foreground/50"
                                : red
                                  ? on ? "text-red-700" : "text-red-400"
                                  : on ? "text-black" : "text-muted-foreground"
                            }`}
                          >
                            <span className="text-[12px] font-black">{d.label}</span>
                            <span className="text-[9.5px] font-bold tabular-nums opacity-70">
                              {weekDates[di].getDate()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      {([
                        { label: "평일", dows: ["mon", "tue", "wed", "thu"] },
                        { label: "주말", dows: ["fri", "sat", "sun"] },
                        { label: "매일", dows: DOWS.map((d) => d.key) },
                      ] as const).map((preset) => {
                        // 프리셋은 "정확히 이 조합일 때만" 켜진 것으로 본다.
                        // 부분 포함으로 판정하면 전 요일이 켜졌을 때 평일·주말까지 같이 켜져
                        // 지금 상태가 무엇인지 읽을 수 없다.
                        // 누르면 그 조합으로 지정하고, 이미 그 조합이면 해제(= 전체 끄기).
                        const active =
                          t.live_dows.length === preset.dows.length &&
                          preset.dows.every((d) => t.live_dows.includes(d));
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            disabled={disabled}
                            onClick={() => setDows(t, active ? [] : [...preset.dows], { keepLive: true })}
                            className={`h-6 px-2.5 rounded-full text-[10.5px] font-bold transition-colors disabled:opacity-40 ${
                              active ? "bg-amber-500 text-black" : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                      {noSlot ? (
                        <span className="ml-auto text-[10.5px] font-bold text-red-400">자리를 잃어 중단됨</span>
                      ) : t.live_until ? (
                        <span className="ml-auto text-[10.5px] font-bold text-muted-foreground">
                          ~{t.live_until.slice(5).replace("-", "/")}까지
                        </span>
                      ) : null}
                    </div>
                  </>
                )}

                {/* 오늘 발행분이 있으면 인원 수정 */}
                {published && (
                  <div className="flex items-center gap-2 pt-1.5 border-t border-border/60">
                    <span className="text-[11px] text-muted-foreground font-bold">오늘 인원</span>
                    <button type="button" disabled={seatSaving === published.id || seatCount <= 0}
                      onClick={() => setSeatDeltas((m) => ({ ...m, [published.id]: (m[published.id] ?? 0) - 1 }))}
                      className="w-6 h-6 rounded-full bg-muted flex items-center justify-center disabled:opacity-30 transition-colors">
                      <Minus className="w-3 h-3 text-foreground" />
                    </button>
                    <span className="text-[13px] font-black text-foreground tabular-nums w-5 text-center">{seatCount}</span>
                    <button type="button" disabled={seatSaving === published.id || seatCount >= published.target_count}
                      onClick={() => setSeatDeltas((m) => ({ ...m, [published.id]: (m[published.id] ?? 0) + 1 }))}
                      className="w-6 h-6 rounded-full bg-muted flex items-center justify-center disabled:opacity-30 transition-colors">
                      <Plus className="w-3 h-3 text-foreground" />
                    </button>
                    {seatDelta !== 0 && (
                      <button type="button" disabled={seatSaving === published.id} onClick={() => applySeatAdjust(published.id)}
                        className="px-3 h-6 rounded-full bg-inverse text-inverse-foreground text-[11px] font-black active:scale-95 transition disabled:opacity-50">
                        {seatSaving === published.id ? "저장중" : "적용"}
                      </button>
                    )}
                    <span className="ml-auto text-[12px] text-muted-foreground font-bold tabular-nums">{seatCount}/{published.target_count}명</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ⋯ 액션 시트 */}
      <Sheet open={!!actionTarget} onOpenChange={(v) => { if (!v) setActionTarget(null); }}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-8">
          <SheetHeader className="text-left pb-1">
            <SheetTitle className="text-foreground text-base">{actionTarget?.name}</SheetTitle>
            <SheetDescription className="sr-only">세팅 관리</SheetDescription>
          </SheetHeader>
          <div className="space-y-1 pt-2">
            <button type="button" onClick={() => actionTarget && openEdit(actionTarget)}
              className="w-full text-left px-2 py-3 text-[14.5px] font-bold text-foreground flex items-center justify-between">
              세팅 수정 <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => {
                const t = actionTarget;
                if (!t) return;
                setActionTarget(null);
                setCategoryDraft(t.category ?? "");
                setNewFolderOpen(false);
                setCategoryTarget(t);
              }}
              className="w-full text-left px-2 py-3 text-[14.5px] font-bold text-foreground flex items-center justify-between"
            >
              분류하기
              <span className="text-[11px] text-muted-foreground font-semibold">
                {actionTarget?.category ?? "미분류"}
              </span>
            </button>
            <button type="button" onClick={() => actionTarget && handleDuplicate(actionTarget)}
              disabled={templates.length >= MAX_TEMPLATES}
              className="w-full text-left px-2 py-3 text-[14.5px] font-bold text-foreground flex items-center justify-between disabled:opacity-40">
              복제 <span className="text-[11px] text-muted-foreground">{templates.length}/{MAX_TEMPLATES}</span>
            </button>
            <button type="button" onClick={() => actionTarget && handleDelete(actionTarget)}
              className="w-full text-left px-2 py-3 text-[14.5px] font-bold text-red-400">
              삭제
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 분류하기 시트 */}
      {/* 폴더 관리 — 순서·이름·삭제. 꾹 누르기는 모바일에서 잘 안 잡혀 버튼으로 뺐다 */}
      <Sheet open={folderManagerOpen} onOpenChange={(v) => { if (!v) { setFolderManagerOpen(false); setManagerNewFolder(""); setManagerTarget(null); } }}>
        <SheetContent side="bottom" className="bg-background border-border rounded-t-3xl max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-foreground text-[17px] font-black">폴더 관리</SheetTitle>
            <SheetDescription className="text-muted-foreground text-[12px]">
              템플릿을 분류해서 편하게 관리해보세요
            </SheetDescription>
          </SheetHeader>

          {/* 실제 필터가 가로줄이므로 여기서도 가로로 늘어놓는다. 순서는 끌어서 바꾼다 —
              화살표는 양 끝에서 항상 하나가 비활성이라 "왜 안 눌리지"가 됐다. */}
          <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-hide pb-1">
            {usedCategories.map((name, i) => {
              const active = managerTarget === name;
              return (
                <button
                  key={name}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    const r = el.getBoundingClientRect();
                    e.dataTransfer.setDragImage(el, r.width / 2, r.height / 2);
                    e.dataTransfer.effectAllowed = "move";
                    setFolderDrag(name);
                  }}
                  onDragOver={(e) => { if (folderDrag) e.preventDefault(); }}
                  onDrop={(e) => {
                    if (!folderDrag) return;
                    e.preventDefault();
                    moveFolderTo(folderDrag, i);
                    setFolderDrag(null);
                  }}
                  onDragEnd={() => setFolderDrag(null)}
                  onClick={() => setManagerTarget(active ? null : name)}
                  className={`shrink-0 min-w-[92px] flex flex-col items-center justify-center gap-0.5 h-12 px-3 bg-card border rounded-xl active:scale-95 transition-all cursor-grab ${
                    folderDrag === name ? "opacity-40" : ""
                  } ${active ? "border-green-500" : "border-border"}`}
                >
                  <span className="text-[12.5px] font-black text-foreground truncate max-w-[120px]">{name}</span>
                  <span className="text-[10px] font-bold text-muted-foreground leading-none">
                    {templates.filter((t) => t.category === name).length}개
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10.5px] text-muted-foreground font-semibold mt-1.5">
            꾹 눌러서 순서 변경 · 탭하면 이름 변경·삭제
          </p>

          {/* 고른 폴더 하나만 편집 — 줄마다 입력칸을 두면 가로줄에 들어가지 않는다 */}
          {managerTarget && (
            <div className="mt-3 bg-card border border-border rounded-xl p-2 flex items-center gap-2">
              <Input
                key={managerTarget}
                defaultValue={managerTarget}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  renameFolder(managerTarget, next);
                  if (next && next !== managerTarget) setManagerTarget(next);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="flex-1 bg-muted border-transparent h-10 text-foreground font-black text-[13.5px]"
              />
              <button type="button"
                onClick={() => { deleteFolder(managerTarget); setManagerTarget(null); }}
                className="shrink-0 w-10 h-10 rounded-lg bg-muted text-red-400 flex items-center justify-center active:scale-95 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <Input
              placeholder="새 폴더 이름"
              value={managerNewFolder}
              onChange={(e) => setManagerNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                confirmNewFolder(managerNewFolder, setManagerNewFolder, () => {});
                setManagerNewFolder("");
              }}
              className="flex-1 bg-card border-border h-11 text-foreground font-bold"
            />
            <button type="button"
              onClick={() => { confirmNewFolder(managerNewFolder, setManagerNewFolder, () => {}); setManagerNewFolder(""); }}
              className="shrink-0 h-11 px-4 rounded-lg bg-inverse text-inverse-foreground text-[13px] font-black active:scale-95 transition">
              추가
            </button>
          </div>

          <Button onClick={() => setFolderManagerOpen(false)} className="w-full h-12 mt-4 bg-inverse text-inverse-foreground font-black rounded-xl">
            완료
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={!!categoryTarget} onOpenChange={(v) => { if (!v) setCategoryTarget(null); }}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-8">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="text-foreground text-base">분류</SheetTitle>
            <SheetDescription className="text-[12px] text-muted-foreground">
              평일·주말처럼 묶어두면 위 필터로 골라 볼 수 있어요
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-wrap gap-2 mb-3">
            {Array.from(new Set([...CATEGORY_PRESETS, ...usedCategories, ...draftFolders])).map((c) => (
              <button key={c} type="button"
                onClick={() => { setNewFolderOpen(false); setCategoryDraft((prev) => (prev === c ? "" : c)); }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                  categoryDraft === c ? "bg-inverse text-inverse-foreground" : "bg-card text-muted-foreground border border-border"
                }`}>
                {c}
              </button>
            ))}
            <button type="button"
              onClick={() => { setNewFolderOpen(true); setCategoryDraft(""); }}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold border border-dashed transition-all ${
                newFolderOpen ? "border-foreground text-foreground" : "border-border text-muted-foreground"
              }`}>
              + 추가하기
            </button>
          </div>
          {newFolderOpen && (
            <div className="flex gap-2 mb-3">
              <Input autoFocus placeholder="폴더 이름 (예: 금요일 전용)"
                value={categoryDraft}
                onChange={(e) => setCategoryDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmNewFolder(categoryDraft, setCategoryDraft, setNewFolderOpen); } }}
                className="bg-card border-border h-11 text-foreground font-bold" />
              <button type="button"
                onClick={() => confirmNewFolder(categoryDraft, setCategoryDraft, setNewFolderOpen)}
                className="shrink-0 h-11 px-4 rounded-lg bg-inverse text-inverse-foreground text-[13px] font-black active:scale-95 transition">
                확인
              </button>
            </div>
          )}
          <button type="button"
            onClick={() => { setNewFolderOpen(false); setCategoryDraft(""); }}
            className="w-full text-center text-[12px] text-muted-foreground font-bold mb-3 underline underline-offset-2">
            분류 없이 두기
          </button>
          <Button onClick={saveCategory} className="w-full h-12 rounded-xl bg-inverse text-inverse-foreground font-black">
            저장
          </Button>
        </SheetContent>
      </Sheet>

      {/* 종료일 시트 — ⋯ → "종료일". 기본은 없음(계속). 특정 날까지만 하고 싶을 때만 지정. */}
      <Sheet open={!!untilPicker} onOpenChange={(v) => { if (!v) setUntilPicker(null); }}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-8">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="text-foreground text-base">종료일</SheetTitle>
            <SheetDescription className="text-[12px] text-muted-foreground">
              비워두면 끌 때까지 계속 올라가요
            </SheetDescription>
          </SheetHeader>
          <input
            type="date"
            value={untilDraft}
            min={fmtDateInput(today)}
            onChange={(e) => setUntilDraft(e.target.value)}
            className="w-full bg-card border border-border h-11 rounded-lg px-4 text-foreground font-bold mb-3"
          />
          {untilDraft && (
            <button
              type="button"
              onClick={() => setUntilDraft("")}
              className="w-full text-center text-[12px] text-muted-foreground font-bold mb-3 underline underline-offset-2"
            >
              종료일 없이 계속하기
            </button>
          )}
          <Button onClick={confirmUntilPicker} className="w-full h-12 rounded-xl bg-inverse text-inverse-foreground font-black">
            저장
          </Button>
        </SheetContent>
      </Sheet>

      {/* 세팅 수정 시트 */}
      <Sheet open={!!editTarget} onOpenChange={(v) => { if (!v) setEditTarget(null); }}>
        <SheetContent side="bottom" showCloseButton={false}
          className="bg-card border-border rounded-t-3xl px-5 pb-8 pt-4 max-h-[92vh] overflow-y-auto">
          <div className="max-w-sm mx-auto w-full space-y-5">
            <SheetHeader className="p-0 mb-1">
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-3" />
              <SheetTitle className="text-foreground text-base font-bold text-center">세팅 수정</SheetTitle>
              <SheetDescription className="sr-only">템플릿 수정</SheetDescription>
            </SheetHeader>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">이름</p>
              <Input placeholder="예) 가성비 / 평일 메인 / 주말 일렉 준메인"
                value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-card border-border h-11 text-foreground font-bold" />
            </div>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">정원 (2~20명)</p>
              <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-4">
                <button type="button" disabled={editForm.total_seats <= 2}
                  onClick={() => setEditForm((f) => ({ ...f, total_seats: Math.max(2, f.total_seats - 1) }))}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center disabled:opacity-30">
                  <Minus className="w-3.5 h-3.5 text-foreground" />
                </button>
                <span className="text-[15px] font-black text-foreground">{editForm.total_seats}명</span>
                <button type="button" disabled={editForm.total_seats >= 20}
                  onClick={() => setEditForm((f) => ({ ...f, total_seats: Math.min(20, f.total_seats + 1) }))}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center disabled:opacity-30">
                  <Plus className="w-3.5 h-3.5 text-foreground" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">1인 가격</p>
              <div className="relative">
                <Input type="text" inputMode="numeric" placeholder="예) 20"
                  value={editForm.price_man}
                  onChange={(e) => setEditForm((f) => ({ ...f, price_man: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) }))}
                  className="bg-card border-border h-11 text-foreground font-bold pr-14" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-bold">만원</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">테이블 구성 (선택)</p>
              <div className="flex flex-wrap gap-2">
                {EXTRAS_OPTIONS.map((item) => (
                  <button key={item} type="button"
                    onClick={() =>
                      setEditForm((f) => ({
                        ...f,
                        includes: f.includes.includes(item) ? f.includes.filter((x) => x !== item) : [...f.includes, item],
                      }))
                    }
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                      editForm.includes.includes(item) ? "bg-green-500 text-black" : "bg-card text-muted-foreground border border-border"
                    }`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <Button type="button" onClick={saveEdit} disabled={editBusy}
              className="w-full h-12 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 disabled:opacity-40">
              {editBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {templates.length > 1 && (
        <p className="text-right text-[10.5px] text-muted-foreground pr-1 -mt-1">꾹 눌러서 순서 변경 · 폴더로 끌면 분류</p>
      )}

      {/* 1회성 등록 — 상시로 안 돌리는 급한 자리.
          운영권이 없으면 등록이 트리거에서 막히므로 버튼 자체를 내린다(비활성 안내도 두지 않음). */}
      {hasAnySlot && (
        <Link
          href="/md/auctions/new"
          className="w-full h-12 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-[15px] rounded-2xl active:scale-[0.98] transition-transform"
        >
          <span className="text-[18px] leading-none">+</span> 새 조각 등록
          <span className="text-[11px] font-bold opacity-70 ml-0.5">1회성</span>
        </Link>
      )}

      {/* + 템플릿: 새 세팅 만들기 */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" showCloseButton={false}
          className="bg-card border-border rounded-t-3xl px-5 pb-8 pt-4 max-h-[92vh] overflow-y-auto">
          <div className="max-w-sm mx-auto w-full space-y-5">
            <SheetHeader className="p-0 mb-1">
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-3" />
              <SheetTitle className="text-foreground text-base font-bold text-center">새 템플릿</SheetTitle>
              <SheetDescription className="sr-only">상시 조각 템플릿 추가</SheetDescription>
            </SheetHeader>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">클럽</p>
              <div className="relative">
                <select
                  value={createForm.club_id}
                  onChange={(e) => setCreateForm((f) => ({ ...f, club_id: e.target.value }))}
                  className="w-full appearance-none bg-card border border-border h-11 rounded-lg px-4 pr-10 text-foreground font-bold text-[14px] focus:outline-none"
                >
                  <option value="">클럽을 선택하세요</option>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id} className="bg-card text-foreground">
                      {c.name} ({c.area})
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">▼</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">분류 (선택)</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...CATEGORY_PRESETS, ...usedCategories, ...draftFolders])).map((c) => (
                  <button key={c} type="button"
                    onClick={() => { setCreateFolderOpen(false); setCreateForm((f) => ({ ...f, category: f.category === c ? "" : c })); }}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                      createForm.category === c ? "bg-inverse text-inverse-foreground" : "bg-card text-muted-foreground border border-border"
                    }`}>
                    {c}
                  </button>
                ))}
                <button type="button"
                  onClick={() => { setCreateFolderOpen(true); setCreateForm((f) => ({ ...f, category: "" })); }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border border-dashed transition-all ${
                    createFolderOpen ? "border-foreground text-foreground" : "border-border text-muted-foreground"
                  }`}>
                  + 추가하기
                </button>
              </div>
              {createFolderOpen && (
                <div className="flex gap-2">
                  <Input autoFocus placeholder="폴더 이름 (예: 금요일 전용)"
                    value={createForm.category}
                    onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmNewFolder(createForm.category, (v) => setCreateForm((f) => ({ ...f, category: v })), setCreateFolderOpen); } }}
                    className="bg-card border-border h-10 text-foreground font-bold text-[13px]" />
                  <button type="button"
                    onClick={() => confirmNewFolder(createForm.category, (v) => setCreateForm((f) => ({ ...f, category: v })), setCreateFolderOpen)}
                    className="shrink-0 h-10 px-4 rounded-lg bg-inverse text-inverse-foreground text-[12.5px] font-black active:scale-95 transition">
                    확인
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">이름</p>
              <Input placeholder="예) 가성비 / 평일 메인 / 주말 일렉 준메인"
                value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-card border-border h-11 text-foreground font-bold" />
            </div>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">정원 (2~20명)</p>
              <div className="flex items-center justify-between bg-card border border-border h-11 rounded-lg px-4">
                <button type="button" disabled={createForm.total_seats <= 2}
                  onClick={() => setCreateForm((f) => ({ ...f, total_seats: Math.max(2, f.total_seats - 1) }))}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center disabled:opacity-30">
                  <Minus className="w-3.5 h-3.5 text-foreground" />
                </button>
                <span className="text-[15px] font-black text-foreground">{createForm.total_seats}명</span>
                <button type="button" disabled={createForm.total_seats >= 20}
                  onClick={() => setCreateForm((f) => ({ ...f, total_seats: Math.min(20, f.total_seats + 1) }))}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center disabled:opacity-30">
                  <Plus className="w-3.5 h-3.5 text-foreground" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">1인 가격</p>
              <div className="relative">
                <Input type="text" inputMode="numeric" placeholder="예) 20"
                  value={createForm.price_man}
                  onChange={(e) => setCreateForm((f) => ({ ...f, price_man: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) }))}
                  className="bg-card border-border h-11 text-foreground font-bold pr-14" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground font-bold">만원</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground font-medium">테이블 구성 (선택)</p>
              <div className="flex flex-wrap gap-2">
                {EXTRAS_OPTIONS.map((item) => (
                  <button key={item} type="button"
                    onClick={() =>
                      setCreateForm((f) => ({
                        ...f,
                        includes: f.includes.includes(item) ? f.includes.filter((x) => x !== item) : [...f.includes, item],
                      }))
                    }
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                      createForm.includes.includes(item) ? "bg-green-500 text-black" : "bg-card text-muted-foreground border border-border"
                    }`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[10.5px] text-muted-foreground leading-snug">
              만들고 나서 요일 탭에서 켜야 실제로 발행돼요.
            </p>

            <Button type="button" onClick={saveCreate} disabled={createBusy}
              className="w-full h-12 rounded-xl bg-inverse text-inverse-foreground font-black text-base hover:opacity-90 disabled:opacity-40">
              {createBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "만들기"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
