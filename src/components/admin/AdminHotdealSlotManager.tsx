"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserCheck, X, ChevronDown, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export interface PartnerMd {
  id: string;
  name: string;
  instagram: string | null;
}

// 검색 가능한 MD 콤보박스 — 닫혀있을 땐 반복 placeholder 없이 깔끔하게,
// 클릭하면 검색 입력 + 필터된 MD 목록이 펼쳐진다.
function MdCombobox({
  partners,
  value,
  onChange,
  disabled,
}: {
  partners: PartnerMd[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = partners.find((p) => p.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.instagram ?? "").toLowerCase().includes(q)
    );
  }, [partners, query]);

  // 바깥 클릭 / Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 열릴 때 검색창 포커스 (외부 DOM 동기화만 effect에서 처리)
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const toggleOpen = () => {
    if (!open) setQuery(""); // 열 때 검색어 초기화 — 이벤트 핸들러에서 처리
    setOpen((v) => !v);
  };

  return (
    <div ref={ref} className="relative flex-1 min-w-0 max-w-md">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className="w-full flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-left disabled:opacity-50"
      >
        <span className={`flex-1 min-w-0 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {selected ? `${selected.name}${selected.instagram ? ` (@${selected.instagram})` : ""}` : "파트너 검색"}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 / 인스타로 검색"
              className="flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-muted-foreground text-sm text-center">검색 결과 없음</div>
            ) : (
              filtered.map((md) => (
                <button
                  key={md.id}
                  type="button"
                  onClick={() => {
                    onChange(md.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                    md.id === value ? "text-brand-amber font-bold" : "text-foreground"
                  }`}
                >
                  {md.name}
                  {md.instagram && (
                    <span className="text-muted-foreground ml-1">@{md.instagram}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ClubRow {
  id: string;
  name: string;
  area: string | null;
  partners: PartnerMd[];
}

export interface SlotRow {
  id: string;
  club_id: string;
  md_id: string | null;
  md_name: string | null;
  md_instagram: string | null;
}

interface WeekOption {
  value: string;
  label: string;
}

interface Props {
  clubs: ClubRow[];
  slotByClub: Record<string, SlotRow>;
  selectedWeek: string;
  weekOptions: WeekOption[];
}

export function AdminHotdealSlotManager({ clubs, slotByClub, selectedWeek, weekOptions }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // 클럽별 드롭다운에서 선택된 MD id
  const [picked, setPicked] = useState<Record<string, string>>({});
  // 진행 중인 클럽 id (배정/해제 로딩)
  const [busy, setBusy] = useState<string | null>(null);

  const onWeekChange = (week: string) => {
    router.push(`/admin/hotdeal-slots?week=${week}`);
  };

  const assign = async (clubId: string) => {
    const mdId = picked[clubId];
    if (!mdId) {
      toast.error("배정할 파트너를 먼저 선택하세요");
      return;
    }
    setBusy(clubId);
    const { data, error } = await supabase.rpc("admin_assign_hotdeal_slot", {
      p_club_id: clubId,
      p_week_start: selectedWeek,
      p_md_id: mdId,
    });
    setBusy(null);
    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      toast.error(result?.error || error?.message || "배정에 실패했어요");
      return;
    }
    toast.success("배정 완료");
    router.refresh();
  };

  const release = async (slotId: string, clubId: string) => {
    setBusy(clubId);
    const { data, error } = await supabase.rpc("admin_release_hotdeal_slot", {
      p_slot_id: slotId,
    });
    setBusy(null);
    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      toast.error(result?.error || error?.message || "해제에 실패했어요");
      return;
    }
    toast.success("해제 완료 — 빈 슬롯으로 돌아갔어요");
    router.refresh();
  };

  const assignedCount = clubs.filter((c) => slotByClub[c.id]).length;

  return (
    <div className="space-y-6">
      {/* 주차 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">주차</label>
        <select
          value={selectedWeek}
          onChange={(e) => onWeekChange(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-foreground text-sm"
        >
          {weekOptions.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground text-sm">
          배정 {assignedCount} / 전체 {clubs.length}
        </span>
      </div>

      {/* 클럽 목록 */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="divide-y divide-neutral-800">
          {clubs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">등록된 클럽이 없습니다.</div>
          ) : (
            clubs.map((club) => {
              const slot = slotByClub[club.id];
              const isBusy = busy === club.id;
              return (
                <div
                  key={club.id}
                  className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3.5"
                >
                  {/* 클럽 정보 */}
                  <div className="min-w-0 md:w-56 shrink-0">
                    <div className="font-bold text-foreground truncate">{club.name}</div>
                    <div className="text-[11px] text-muted-foreground">{club.area ?? "-"}</div>
                  </div>

                  {/* 상태 / 액션 */}
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    {slot ? (
                      // 이미 배정/차지됨
                      <>
                        <span className="inline-flex items-center gap-1.5 bg-green-500/10 text-money text-sm font-bold px-3 py-1.5 rounded-full">
                          <UserCheck className="w-3.5 h-3.5" />
                          {slot.md_name ?? "배정됨"}
                          {slot.md_instagram && (
                            <span className="text-money dark:text-money/60 font-medium">@{slot.md_instagram}</span>
                          )}
                        </span>
                        <button
                          onClick={() => release(slot.id, club.id)}
                          disabled={isBusy}
                          className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-red-400 text-[12px] font-bold px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          해제
                        </button>
                      </>
                    ) : club.partners.length === 0 ? (
                      // 빈 슬롯 + 파트너 MD 없음
                      <span className="text-muted-foreground text-sm italic">파트너 없음 (클럽 관리에서 연결)</span>
                    ) : (
                      // 빈 슬롯 + 배정 가능
                      <>
                        <MdCombobox
                          partners={club.partners}
                          value={picked[club.id] ?? ""}
                          onChange={(id) =>
                            setPicked((prev) => ({ ...prev, [club.id]: id }))
                          }
                          disabled={isBusy}
                        />
                        <button
                          onClick={() => assign(club.id)}
                          disabled={isBusy || !picked[club.id]}
                          className="shrink-0 inline-flex items-center gap-1 bg-inverse text-inverse-foreground font-bold text-[12px] px-3.5 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          배정
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <p className="text-muted-foreground text-[12px] leading-relaxed">
        · 빈 슬롯에만 배정할 수 있어요. 이미 차지된 슬롯은 먼저 <b>해제</b>한 뒤 다시 배정하세요.<br />
        · 배정된 파트너는 그 주에 다른 클럽 슬롯을 가질 수 없어요 (주당 1슬롯).<br />
        · 빈 슬롯을 그대로 두면 월요일 오후 6시 오픈 후 파트너가 선착순으로 차지할 수 있어요.
      </p>
    </div>
  );
}
