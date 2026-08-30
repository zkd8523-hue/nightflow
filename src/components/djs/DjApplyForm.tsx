"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Search, Loader2, Instagram, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SHOW_TEST_DATA } from "@/lib/utils/testData";

interface SearchResult {
  id: string;
  slug: string;
  display_name: string;
  instagram: string | null;
  claimed: boolean;
  lineupCount: number;
}

type Mode = "search" | "selected" | "new";

function sanitizeInstagram(v: string) {
  return v.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
}

export function DjApplyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /* 프로필에서 "본인인가요?"로 넘어오면 그 DJ 이름이 실려 온다 — 자기 이름을
     처음부터 다시 검색하게 두지 않는다. */
  const [query, setQuery] = useState(() => searchParams.get("name") ?? "");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<Mode>("search");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [requestedName, setRequestedName] = useState("");
  const [requestedClubs, setRequestedClubs] = useState("");
  const [instagram, setInstagram] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const nameQuery = supabase
        .from("djs")
        .select("id, slug, display_name, instagram, claimed_by_user_id, deleted_at, lineup_sets(count)")
        .ilike("display_name", `%${q}%`)
        .is("deleted_at", null)
        .limit(8);
      const aliasQuery = supabase
        .from("dj_aliases")
        .select("djs(id, slug, display_name, instagram, claimed_by_user_id, deleted_at, lineup_sets(count))")
        .ilike("alias", `%${q}%`)
        .limit(8);
      if (!SHOW_TEST_DATA) nameQuery.eq("is_test", false);

      const [{ data: byName }, { data: byAlias }] = await Promise.all([nameQuery, aliasQuery]);

      type RawDj = {
        id: string; slug: string; display_name: string; instagram: string | null;
        claimed_by_user_id: string | null; deleted_at: string | null;
        lineup_sets?: { count: number }[];
      };

      const merged = new Map<string, SearchResult>();
      const addRow = (row: RawDj | null | undefined) => {
        if (!row || row.deleted_at || merged.has(row.id)) return;
        merged.set(row.id, {
          id: row.id,
          slug: row.slug,
          display_name: row.display_name,
          instagram: row.instagram,
          claimed: !!row.claimed_by_user_id,
          lineupCount: row.lineup_sets?.[0]?.count ?? 0,
        });
      };
      for (const r of (byName ?? []) as unknown as RawDj[]) addRow(r);
      for (const r of (byAlias ?? []) as unknown as { djs: RawDj | RawDj[] | null }[]) {
        addRow(Array.isArray(r.djs) ? r.djs[0] : r.djs);
      }

      setResults(Array.from(merged.values()).slice(0, 8));
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const selectDj = (dj: SearchResult) => {
    if (dj.claimed) return;
    setSelected(dj);
    setInstagram(dj.instagram ?? "");
    setMode("selected");
  };

  const startNew = () => {
    setRequestedName(query.trim());
    setInstagram("");
    setMode("new");
  };

  const back = () => {
    setSelected(null);
    setMode("search");
  };

  const submit = async () => {
    const cleanIg = sanitizeInstagram(instagram);
    if (!cleanIg) {
      toast.error("인스타그램 아이디를 입력해주세요");
      return;
    }
    if (mode === "new" && !requestedName.trim()) {
      toast.error("활동명을 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("request_dj_claim", {
        p_dj_id: mode === "selected" ? selected!.id : null,
        p_instagram: cleanIg,
        p_requested_name: mode === "new" ? requestedName.trim() : null,
        p_requested_clubs: mode === "new" ? requestedClubs.trim() || null : null,
        p_memo: memo.trim() || null,
      });
      if (error) throw error;
      router.replace("/dj/apply");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "신청에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === "search") {
    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="내 활동명 검색"
            autoFocus
            className="w-full bg-card border border-border rounded-xl pl-10 pr-3 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {searching && (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!searching && results && results.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => selectDj(r)}
                disabled={r.claimed}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-foreground truncate">
                    {r.display_name}
                    {r.instagram && <span className="text-muted-foreground font-medium"> @{r.instagram}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">라인업 {r.lineupCount}건</p>
                </div>
                {r.claimed ? (
                  <span className="text-[11px] font-bold text-muted-foreground flex-shrink-0">이미 인증됨</span>
                ) : (
                  <span className="text-[11px] font-bold text-brand-amber flex-shrink-0">선택</span>
                )}
              </button>
            ))}
          </div>
        )}

        {!searching && query.trim() && results?.length === 0 && (
          <p className="text-[12px] text-muted-foreground px-1">검색 결과가 없어요</p>
        )}

        {query.trim().length > 0 && (
          <button
            onClick={startNew}
            className="text-[12px] font-bold text-amber-400 hover:text-amber-300 px-1"
          >
            찾는 이름이 없나요? →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === "selected" && selected && (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[14px] font-black text-foreground">{selected.display_name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">라인업 {selected.lineupCount}건</p>
          </div>
          <CheckCircle2 className="w-5 h-5 text-brand-amber flex-shrink-0" />
        </div>
      )}

      {mode === "new" && (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">활동명 *</label>
            <input
              value={requestedName}
              onChange={(e) => setRequestedName(e.target.value)}
              placeholder="예: SMASHER"
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">주로 뛰는 클럽 (선택)</label>
            <input
              value={requestedClubs}
              onChange={(e) => setRequestedClubs(e.target.value)}
              placeholder="예: 그루브앤스팟, 옥타곤"
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">인스타그램 *</label>
        <div className="relative">
          <Instagram className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <span className="absolute left-9 top-1/2 -translate-y-1/2 text-muted-foreground text-[14px]">@</span>
          <input
            value={instagram}
            onChange={(e) => setInstagram(sanitizeInstagram(e.target.value))}
            placeholder="your_instagram_id"
            className="w-full bg-card border border-border rounded-xl pl-14 pr-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">한마디 (선택)</label>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={200}
          placeholder="운영자에게 남길 말"
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={back}
          disabled={submitting}
          className="px-4 py-3 rounded-xl bg-muted text-muted-foreground font-bold text-sm hover:bg-muted/70 transition-colors"
        >
          뒤로
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-black text-[14px] hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          인증 신청하기
        </button>
      </div>
    </div>
  );
}
