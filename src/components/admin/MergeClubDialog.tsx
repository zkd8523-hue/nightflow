"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GitMerge, Search, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { Club } from "@/types/database";

interface MergeClubDialogProps {
  source: Club | null;
  onClose: () => void;
  onMerged: (sourceId: string) => void;
}

export function MergeClubDialog({ source, onClose, onMerged }: MergeClubDialogProps) {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; area: string; md_count: number }[]>([]);
  const [target, setTarget] = useState<{ id: string; name: string; area: string; md_count: number } | null>(null);
  const [preview, setPreview] = useState<{ auction_count: number; md_count: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // 다이얼로그 열릴 때 미리보기 카운트 조회
  useEffect(() => {
    if (!source) return;
    setSearch("");
    setResults([]);
    setTarget(null);
    setPreview(null);
    (async () => {
      const { data, error } = await supabase.rpc("preview_merge_clubs", {
        p_source_id: source.id,
      });
      if (!error && data) {
        setPreview(data as { auction_count: number; md_count: number });
      }
    })();
  }, [source, supabase]);

  const searchClubs = async (q: string) => {
    setSearch(q);
    if (!q.trim() || !source) { setResults([]); return; }
    const { data } = await supabase
      .from("clubs")
      .select("id, name, area")
      .ilike("name", `%${q}%`)
      .is("deleted_at", null)
      .neq("id", source.id)
      .limit(10);
    if (!data || data.length === 0) { setResults([]); return; }

    const ids = data.map((c) => c.id);
    const { data: mds } = await supabase
      .from("users")
      .select("default_club_id")
      .in("default_club_id", ids);

    const counts: Record<string, number> = {};
    for (const m of mds ?? []) {
      const id = m.default_club_id as string;
      counts[id] = (counts[id] ?? 0) + 1;
    }

    setResults(data.map((c) => ({ ...c, md_count: counts[c.id] ?? 0 })));
  };

  const handleMerge = async () => {
    if (!source || !target) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clubs/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: source.id, target_id: target.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "병합 실패");
      toast.success(`${source.name} → ${target.name} 병합 완료 (경매 ${result.merged_auctions}건, 파트너 ${result.merged_mds}명)`);
      onMerged(source.id);
      onClose();
    } catch (e: unknown) {
      logError(e, "MergeClubDialog.handleMerge");
      toast.error(getErrorMessage(e) || "병합 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!source} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-brand-amber" /> 클럽 병합
          </DialogTitle>
        </DialogHeader>

        {source && (
          <div className="space-y-4">
            {/* Source 정보 + 영향 범위 */}
            <div className="bg-card rounded-xl p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1">병합할 클럽 (사라짐)</p>
              <p className="text-base text-foreground font-bold">
                {source.name} <span className="text-muted-foreground text-xs ml-1">{source.area}</span>
              </p>
              {preview && (
                <p className="text-xs text-muted-foreground mt-2">
                  경매 <span className="text-brand-amber font-bold">{preview.auction_count}건</span>, 파트너 <span className="text-brand-amber font-bold">{preview.md_count}명</span>이 대표 클럽으로 이전됩니다
                </p>
              )}
            </div>

            {/* 대표 클럽 검색/선택 */}
            {!target ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">대표 클럽 검색</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => searchClubs(e.target.value)}
                    placeholder="클럽명 검색..."
                    className="w-full bg-card border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                    autoFocus
                  />
                </div>
                {results.length > 0 && (
                  <div className="bg-card border border-border rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    {results.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setTarget(c)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted transition-colors text-left"
                      >
                        <span className="text-sm text-foreground font-bold">
                          {c.name}
                          <span className="text-xs text-muted-foreground font-normal ml-1.5">(파트너 {c.md_count}명)</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{c.area}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">대표 클럽 (이쪽으로 합쳐짐)</p>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                  <span className="text-sm text-brand-amber font-bold flex-1">
                    {target.name} <span className="text-muted-foreground text-xs ml-1">{target.area}</span>
                  </span>
                  <button onClick={() => setTarget(null)} className="text-muted-foreground hover:text-foreground/80">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* 경고 */}
            {target && (
              <div className="flex gap-2 bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300 leading-relaxed">
                  병합 후 source 클럽은 삭제됩니다. 복구는 가능하지만 이전된 경매·파트너는 자동 복구되지 않습니다. 신중히 확인하세요.
                </p>
              </div>
            )}

            {/* 액션 */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={loading}
                className="flex-1 bg-muted hover:bg-muted text-foreground"
              >
                취소
              </Button>
              <Button
                onClick={handleMerge}
                disabled={!target || loading}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-black disabled:opacity-40"
              >
                {loading ? "병합 중..." : "병합 확정"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
