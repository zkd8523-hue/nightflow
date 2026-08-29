"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { clubDisplayAlias } from "@/lib/clubs/seoAliases";

type Surface = "clubs" | "lineups" | "events";

interface MissSummary {
  normalized_query: string;
  miss_count: number;
  sample_query: string;
  last_seen: string;
  resolved_alias_for: string | null;
  /** 검색이 일어난 화면 (Migration 601) */
  surface: Surface;
}

const SURFACE_LABEL: Record<Surface, string> = {
  clubs: "클럽",
  lineups: "라인업",
  events: "공연",
};

/** 화면별 미스 필터 칩 */
const SURFACE_FILTERS: Array<{ value: Surface | null; label: string }> = [
  { value: null, label: "전체 화면" },
  { value: "clubs", label: "클럽" },
  { value: "lineups", label: "라인업" },
  { value: "events", label: "공연" },
];

interface ClubOption {
  id: string;
  name: string;
  area: string | null;
  aliases: string[] | null;
}

export default function AdminSearchMissesPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);

  const [misses, setMisses] = useState<MissSummary[]>([]);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);
  const [surface, setSurface] = useState<Surface | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!user || user.role !== "admin") {
      router.replace("/");
      return;
    }
  }, [user, userLoading, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [missesRes, clubsRes] = await Promise.all([
        supabase.rpc("admin_get_search_miss_summary", {
          p_limit: 200,
          p_only_unresolved: onlyUnresolved,
          p_surface: surface,
        }),
        supabase
          .from("clubs")
          .select("id, name, area, aliases")
          .is("deleted_at", null)
          .order("name"),
      ]);
      if (missesRes.error) throw missesRes.error;
      if (clubsRes.error) throw clubsRes.error;
      setMisses((missesRes.data ?? []) as MissSummary[]);
      setClubs((clubsRes.data ?? []) as ClubOption[]);
    } catch (err) {
      console.error("[admin/search-misses]", err);
      toast.error("데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, onlyUnresolved, surface]);

  const handleResolve = async (
    normalized: string,
    sample: string,
    clubId: string
  ) => {
    const club = clubs.find((c) => c.id === clubId);
    if (!club) return;
    const confirmed = window.confirm(
      `"${sample}" 검색어를 "${club.name}" 클럽의 별칭으로 등록할까요?\n같은 검색어로 누락된 다른 기록도 일괄 해소됩니다.`
    );
    if (!confirmed) return;

    setResolving(normalized);
    try {
      const { data, error } = await supabase.rpc("admin_resolve_search_miss", {
        p_normalized_query: normalized,
        p_alias: sample,
        p_club_id: clubId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; resolved_count?: number };
      if (!result?.success) throw new Error(result?.error || "처리 실패");
      toast.success(`별칭 등록 완료 (${result.resolved_count ?? 0}건 해소)`);
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error("처리 실패");
    } finally {
      setResolving(null);
    }
  };

  if (userLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/admin/clubs"
            className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-foreground">검색 실패 로그</h1>
            <p className="text-[11px] text-muted-foreground">
              결과가 없었던 검색어. 클릭해서 클럽 별칭으로 등록하세요.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setOnlyUnresolved(true)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              onlyUnresolved
                ? "bg-inverse text-inverse-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
          >
            미해결만
          </button>
          <button
            type="button"
            onClick={() => setOnlyUnresolved(false)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              !onlyUnresolved
                ? "bg-inverse text-inverse-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
          >
            전체
          </button>
        </div>

        {/* 화면별 필터 — 클럽 미스와 DJ/아티스트 미스를 섞어 보면 오해소가 난다 */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {SURFACE_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setSurface(f.value)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                surface === f.value
                  ? "bg-inverse text-inverse-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : misses.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Search className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-[13px] text-muted-foreground">
              {onlyUnresolved ? "미해결 검색 실패가 없어요" : "검색 실패 기록이 없어요"}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {misses.map((m) => {
              const resolvedClub = m.resolved_alias_for
                ? clubs.find((c) => c.id === m.resolved_alias_for)
                : null;
              return (
                <li
                  key={`${m.surface}:${m.normalized_query}`}
                  className="bg-card rounded-2xl border border-border p-4 space-y-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-foreground font-black text-[15px] truncate">
                      {m.sample_query}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                        {SURFACE_LABEL[m.surface] ?? m.surface}
                      </span>
                      <span className="text-brand-amber text-[12px] font-bold">
                        {m.miss_count}회
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    마지막: {new Date(m.last_seen).toLocaleString("ko-KR")}
                  </p>

                  {resolvedClub ? (
                    <div className="text-[12px] text-money">
                      ✅ "{resolvedClub.name}" 별칭으로 등록됨
                    </div>
                  ) : m.surface === "clubs" ? (
                    <ResolveControl
                      normalized={m.normalized_query}
                      sample={m.sample_query}
                      clubs={clubs}
                      disabled={resolving === m.normalized_query}
                      onResolve={handleResolve}
                    />
                  ) : (
                    <div className="space-y-2">
                      {/* 라인업·공연 미스는 DJ/아티스트 이름일 수 있다. 여기서 클럽을 매핑하면
                          clubs.aliases에 엉뚱한 별칭이 들어가므로, 클럽이 확실할 때만 등록한다. */}
                      <p className="text-[11px] text-muted-foreground">
                        {SURFACE_LABEL[m.surface]} 화면 미스 — DJ·아티스트 이름일 수 있어요.
                        클럽이 확실한 경우에만 등록하세요.
                      </p>
                      <ResolveControl
                        normalized={m.normalized_query}
                        sample={m.sample_query}
                        clubs={clubs}
                        disabled={resolving === m.normalized_query}
                        onResolve={handleResolve}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResolveControl({
  normalized,
  sample,
  clubs,
  disabled,
  onResolve,
}: {
  normalized: string;
  sample: string;
  clubs: ClubOption[];
  disabled: boolean;
  onResolve: (normalized: string, sample: string, clubId: string) => void;
}) {
  const [clubId, setClubId] = useState("");

  return (
    <div className="flex gap-2">
      <select
        value={clubId}
        onChange={(e) => setClubId(e.target.value)}
        disabled={disabled}
        className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-amber-500/50"
      >
        <option value="">클럽 선택...</option>
        {clubs.map((c) => {
          // 방금 miss 큐에서 별칭을 등록해도 이 드롭다운은 등록명만 보여줘서
          // "볼레로"를 등록한 관리자가 Bolero를 다시 못 찾는 문제가 있었다.
          // 한글 대표명을 앞에 붙여 스캔·타이핑 둘 다 되게 한다.
          const primary = clubDisplayAlias({ id: c.id, name: c.name, aliases: c.aliases });
          const label = primary ? `${primary}(${c.name})` : c.name;
          return (
            <option key={c.id} value={c.id}>
              {label} {c.area ? `· ${c.area}` : ""}
            </option>
          );
        })}
      </select>
      <button
        type="button"
        disabled={!clubId || disabled}
        onClick={() => onResolve(normalized, sample, clubId)}
        className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-black disabled:opacity-50"
      >
        {disabled ? "..." : "등록"}
      </button>
    </div>
  );
}
