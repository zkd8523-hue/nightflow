"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface MissSummary {
  normalized_query: string;
  miss_count: number;
  sample_query: string;
  last_seen: string;
  resolved_alias_for: string | null;
}

interface ClubOption {
  id: string;
  name: string;
  area: string | null;
}

export default function AdminSearchMissesPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);

  const [misses, setMisses] = useState<MissSummary[]>([]);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);
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
        }),
        supabase
          .from("clubs")
          .select("id, name, area")
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
  }, [user, onlyUnresolved]);

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
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/admin/clubs"
            className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-white">검색 실패 로그</h1>
            <p className="text-[11px] text-neutral-500">
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
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            미해결만
          </button>
          <button
            type="button"
            onClick={() => setOnlyUnresolved(false)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              !onlyUnresolved
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            전체
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
          </div>
        ) : misses.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Search className="w-8 h-8 text-neutral-700 mx-auto" />
            <p className="text-[13px] text-neutral-500">
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
                  key={m.normalized_query}
                  className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-white font-black text-[15px] truncate">
                      {m.sample_query}
                    </p>
                    <span className="text-amber-400 text-[12px] font-bold flex-shrink-0">
                      {m.miss_count}회
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-600">
                    마지막: {new Date(m.last_seen).toLocaleString("ko-KR")}
                  </p>

                  {resolvedClub ? (
                    <div className="text-[12px] text-green-400">
                      ✅ "{resolvedClub.name}" 별칭으로 등록됨
                    </div>
                  ) : (
                    <ResolveControl
                      normalized={m.normalized_query}
                      sample={m.sample_query}
                      clubs={clubs}
                      disabled={resolving === m.normalized_query}
                      onResolve={handleResolve}
                    />
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
        className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-amber-500/50"
      >
        <option value="">클럽 선택...</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} {c.area ? `· ${c.area}` : ""}
          </option>
        ))}
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
