"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Search, Instagram } from "lucide-react";

interface DjSearchResult {
  id: string;
  display_name: string;
  instagram: string | null;
}

export interface DjPickerResult {
  djId: string | null;
  /** djId가 null일 때만 사용 — 새 DJ 등록 정보 */
  newDjName?: string;
  newDjInstagram?: string | null;
  learnAlias: boolean;
}

interface DjPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 포스터에 찍힌 원문 표기. "이 표기를 별칭으로 추가"의 대상 */
  rawName: string;
  onSelect: (result: DjPickerResult) => void;
}

export function DjPickerSheet({ open, onOpenChange, rawName, onSelect }: DjPickerSheetProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DjSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [learnAlias, setLearnAlias] = useState(true);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState(rawName);
  const [newInstagram, setNewInstagram] = useState("");

  // 부모가 이 컴포넌트에 rawName을 key로 넘겨 매번 새로 마운트시킨다 —
  // 그래서 열릴 때마다 상태를 리셋하는 effect가 따로 필요 없다.

  useEffect(() => {
    if (!open || !query.trim()) {
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const supabase = createClient();
      // display_name 또는 alias 양쪽 ilike 검색
      const [{ data: byName }, { data: byAlias }] = await Promise.all([
        supabase
          .from("djs")
          .select("id, display_name, instagram")
          .ilike("display_name", `%${query.trim()}%`)
          .is("deleted_at", null)
          .limit(15),
        supabase
          .from("dj_aliases")
          .select("dj_id, djs(id, display_name, instagram)")
          .ilike("alias", `%${query.trim()}%`)
          .limit(15),
      ]);

      const map = new Map<string, DjSearchResult>();
      for (const d of byName ?? []) map.set(d.id, d);
      for (const a of byAlias ?? []) {
        const dj = a.djs as unknown as DjSearchResult | null;
        if (dj) map.set(dj.id, dj);
      }
      setResults([...map.values()]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  const handlePickExisting = (dj: DjSearchResult) => {
    onSelect({ djId: dj.id, learnAlias });
    onOpenChange(false);
  };

  const handleCreateNew = () => {
    if (!newName.trim()) return;
    onSelect({
      djId: null,
      newDjName: newName.trim(),
      newDjInstagram: newInstagram.trim() || null,
      learnAlias: false, // 새 DJ는 publish 라우트가 display_name 자체를 별칭으로 등록함
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-10 max-h-[85vh] overflow-y-auto max-w-lg mx-auto">
        <SheetHeader className="text-left pb-2">
          <SheetTitle className="text-foreground text-lg">DJ 매칭</SheetTitle>
          <p className="text-sm text-muted-foreground">
            포스터 표기: <span className="text-foreground font-medium">&ldquo;{rawName}&rdquo;</span>
          </p>
        </SheetHeader>

        {!showNewForm ? (
          <div className="space-y-4 mt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="DJ 이름 검색"
                className="pl-9 bg-[#1C1C1E] border-border"
                autoFocus
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={learnAlias}
                onChange={(e) => setLearnAlias(e.target.checked)}
                className="w-4 h-4 rounded border-border"
              />
              이 표기를 별칭으로 추가 (다음부터 자동 매칭)
            </label>

            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && query.trim() && results.length > 0 && (
              <div className="space-y-2">
                {results.map((dj) => (
                  <button
                    key={dj.id}
                    onClick={() => handlePickExisting(dj)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-[#1C1C1E] hover:bg-[#2A2A2C] transition-colors text-left"
                  >
                    <span className="text-foreground font-medium">{dj.display_name}</span>
                    {dj.instagram && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Instagram className="w-3 h-3" />@{dj.instagram}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!loading && query.trim() && results.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">검색 결과가 없습니다.</p>
            )}

            <Button
              variant="outline"
              className="w-full rounded-full"
              onClick={() => setShowNewForm(true)}
            >
              ＋ 새 DJ 등록
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">표시명</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-[#1C1C1E] border-border"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">인스타그램 핸들 (선택)</label>
              <Input
                value={newInstagram}
                onChange={(e) => setNewInstagram(e.target.value.replace(/^@/, ""))}
                placeholder="handle"
                className="bg-[#1C1C1E] border-border"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-full" onClick={() => setShowNewForm(false)}>
                취소
              </Button>
              <Button
                className="flex-1 rounded-full bg-white text-black font-black"
                onClick={handleCreateNew}
                disabled={!newName.trim()}
              >
                등록
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
