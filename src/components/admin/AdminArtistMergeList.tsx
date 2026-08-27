"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { GitMerge, Search, AlertTriangle, X, Users2 } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";

interface DupeRow {
  keep_id: string;
  keep_name: string;
  keep_count: number;
  drop_id: string;
  drop_name: string;
  drop_count: number;
  reason: string;
}

interface AdminArtistMergeListProps {
  initialDupes: DupeRow[];
}

export function AdminArtistMergeList({ initialDupes }: AdminArtistMergeListProps) {
  const supabase = createClient();
  const [dupes, setDupes] = useState(initialDupes);
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  // 수동 검색 병합 (한글⇄영문 표기 등 자동 탐지 밖의 케이스)
  const [manualSource, setManualSource] = useState<{ id: string; display_name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; display_name: string; instagram: string | null }[]>([]);
  const [manualTarget, setManualTarget] = useState<{ id: string; display_name: string } | null>(null);
  const [manualLoading, setManualLoading] = useState(false);

  const doMerge = async (sourceId: string, targetId: string, key: string) => {
    setMergingKey(key);
    try {
      const res = await fetch("/api/admin/artists/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "병합 실패");
      toast.success(`병합 완료 (출연기록 ${result.moved_performers}건 이관)`);
      return true;
    } catch (e: unknown) {
      logError(e, "AdminArtistMergeList.doMerge");
      toast.error(getErrorMessage(e) || "병합 실패");
      return false;
    } finally {
      setMergingKey(null);
    }
  };

  const handleAutoMerge = async (row: DupeRow) => {
    const key = `${row.keep_id}:${row.drop_id}`;
    const ok = await doMerge(row.drop_id, row.keep_id, key);
    if (ok) {
      setDupes((prev) => prev.filter((d) => !(d.keep_id === row.keep_id && d.drop_id === row.drop_id)));
    }
  };

  const searchArtists = async (q: string) => {
    setSearch(q);
    if (!q.trim() || !manualSource) {
      setResults([]);
      return;
    }
    const { data } = await supabase
      .from("artists")
      .select("id, display_name, instagram")
      .ilike("display_name", `%${q}%`)
      .is("deleted_at", null)
      .neq("id", manualSource.id)
      .limit(10);
    setResults(data ?? []);
  };

  const handleManualMerge = async () => {
    if (!manualSource || !manualTarget) return;
    setManualLoading(true);
    const ok = await doMerge(manualSource.id, manualTarget.id, "manual");
    setManualLoading(false);
    if (ok) {
      setManualSource(null);
      setManualTarget(null);
      setSearch("");
      setResults([]);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-4">
        <h1 className="text-lg font-black text-foreground flex items-center gap-2">
          <Users2 className="w-5 h-5 text-brand-amber" />
          아티스트 중복 병합
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          같은 아티스트가 한글/영문 표기로 쪼개진 레코드를 하나로 합칩니다. 병합해도 두 이름 모두 검색됩니다.
        </p>
      </div>

      <div className="p-4 space-y-6">
        {/* 자동 탐지 — 인스타 핸들 동일 */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">
            자동 탐지 ({dupes.length}건) <span className="text-xs font-normal text-muted-foreground">— 인스타 핸들 동일</span>
          </h2>
          {dupes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center bg-card rounded-xl border border-border">
              자동 탐지된 중복이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {dupes.map((row) => {
                const key = `${row.keep_id}:${row.drop_id}`;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-foreground truncate">{row.keep_name}</span>
                        <span className="text-xs text-muted-foreground">{row.keep_count}회</span>
                        <span className="text-muted-foreground">←</span>
                        <span className="text-muted-foreground truncate">{row.drop_name}</span>
                        <span className="text-xs text-muted-foreground">{row.drop_count}회</span>
                      </div>
                      <p className="text-[11px] text-brand-amber mt-0.5">{row.reason}</p>
                    </div>
                    <Button
                      onClick={() => handleAutoMerge(row)}
                      disabled={mergingKey === key}
                      className="shrink-0 bg-amber-500 hover:bg-amber-600 text-black font-black text-xs px-3 py-2 h-auto"
                    >
                      {mergingKey === key ? "병합 중..." : "병합"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 수동 병합 — 한글⇄영문 등 표기 판단이 필요한 케이스 */}
        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">수동 병합</h2>
          <div className="bg-card border border-border rounded-xl p-3 space-y-3">
            <div className="flex gap-2 items-center flex-wrap">
              <ArtistPicker
                label="합칠 레코드 (사라짐)"
                selected={manualSource}
                onSelect={setManualSource}
                excludeId={manualTarget?.id}
              />
              <span className="text-muted-foreground">→</span>
              <ArtistPicker
                label="남길 레코드"
                selected={manualTarget}
                onSelect={setManualTarget}
                excludeId={manualSource?.id}
              />
            </div>

            {manualSource && manualTarget && (
              <>
                <div className="flex gap-2 bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 leading-relaxed">
                    <b>{manualSource.display_name}</b>의 출연 기록이 <b>{manualTarget.display_name}</b>로 이관되고,
                    이름은 별칭으로 보존됩니다. source 레코드는 삭제됩니다(복구 가능).
                  </p>
                </div>
                <Button
                  onClick={handleManualMerge}
                  disabled={manualLoading}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-black"
                >
                  <GitMerge className="w-4 h-4 mr-1.5" />
                  {manualLoading ? "병합 중..." : "병합 확정"}
                </Button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ArtistPicker({
  label,
  selected,
  onSelect,
  excludeId,
}: {
  label: string;
  selected: { id: string; display_name: string } | null;
  onSelect: (a: { id: string; display_name: string } | null) => void;
  excludeId?: string;
}) {
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; display_name: string; instagram: string | null }[]>([]);
  const [open, setOpen] = useState(false);

  const search = async (val: string) => {
    setQ(val);
    if (!val.trim()) {
      setResults([]);
      return;
    }
    const query = supabase
      .from("artists")
      .select("id, display_name, instagram")
      .ilike("display_name", `%${val}%`)
      .is("deleted_at", null)
      .limit(8);
    const { data } = excludeId ? await query.neq("id", excludeId) : await query;
    setResults(data ?? []);
  };

  if (selected) {
    return (
      <div className="flex-1 min-w-[140px]">
        <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
          <span className="text-sm text-brand-amber font-bold truncate">{selected.display_name}</span>
          <button onClick={() => onSelect(null)} className="text-muted-foreground hover:text-foreground/80 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-[140px] relative">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => {
            search(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="이름 검색..."
          className="w-full bg-background border border-border rounded-lg pl-7 pr-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto shadow-lg">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSelect(r);
                setOpen(false);
                setQ("");
                setResults([]);
              }}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors text-left"
            >
              <span className="text-xs text-foreground font-bold truncate">{r.display_name}</span>
              {r.instagram && <span className="text-[10px] text-muted-foreground shrink-0 ml-2">@{r.instagram}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
