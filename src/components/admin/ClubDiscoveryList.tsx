"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RegistryRow {
  id: string;
  name_raw: string;
  area_guess: string | null;
  venue_type: string | null;
  event_count: number;
  first_seen: string | null;
  last_seen: string | null;
}

const AREAS = ["강남", "홍대", "이태원", "건대", "부산", "대구", "인천", "광주", "대전", "울산", "세종"];

const VENUE_TYPE_LABEL: Record<string, string> = {
  club: "클럽",
  venue: "공연장",
  other: "기타",
};

function guessArea(areaGuess: string | null): string {
  if (!areaGuess) return "";
  const found = AREAS.find((a) => areaGuess.includes(a));
  return found ?? "";
}

function RegistryCard({ row }: { row: RegistryRow }) {
  const router = useRouter();
  const [area, setArea] = useState(guessArea(row.area_guess));
  const [instagram, setInstagram] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleCreate() {
    if (!area) {
      setError("지역을 선택해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clubs/create-from-registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registryId: row.id, area, instagram }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "생성 실패");
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return null;

  const isVenue = row.venue_type === "venue" || row.venue_type === "other";

  return (
    <li className="rounded-2xl bg-[#1C1C1E] px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-bold">{row.name_raw}</p>
            {row.venue_type && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isVenue ? "bg-violet-500/15 text-violet-400" : "bg-green-500/15 text-green-400"
                }`}
              >
                {VENUE_TYPE_LABEL[row.venue_type]}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {row.area_guess ?? "지역 미상"}
            {row.first_seen && row.last_seen && (
              <span className="ml-2 tabular-nums">
                {row.first_seen} ~ {row.last_seen}
              </span>
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-400 tabular-nums">
          {row.event_count}회
        </span>
      </div>

      {isVenue ? (
        <p className="mt-2.5 text-[11px] text-neutral-600">
          공연/파티가 열리는 장소지만 클럽(테이블 예약)이 아니라 등록 대상이 아닙니다. 인스타 계정은 계속 자동 감시됩니다.
        </p>
      ) : !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="mt-3 w-full rounded-xl bg-white/5 py-2 text-xs font-bold text-neutral-300 hover:bg-white/10"
        >
          클럽으로 등록
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-black/30 p-3">
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-lg bg-[#1C1C1E] px-3 py-2 text-sm text-white"
          >
            <option value="">지역 선택</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="인스타 핸들 (예: spacebrickkorea, 선택)"
            className="rounded-lg bg-[#1C1C1E] px-3 py-2 text-sm text-white placeholder:text-neutral-600"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="flex-1 rounded-xl bg-white/5 py-2 text-xs font-bold text-neutral-400"
            >
              취소
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="flex-[2] rounded-xl bg-white py-2 text-xs font-black text-black disabled:opacity-50"
            >
              {submitting ? "생성 중..." : "클럽 생성"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ClubDiscoveryList({ rows }: { rows: RegistryRow[] }) {
  const [filter, setFilter] = useState<"all" | "club">("all");

  const filtered = filter === "club" ? rows.filter((r) => r.venue_type !== "venue" && r.venue_type !== "other") : rows;

  const venueCount = rows.filter((r) => r.venue_type === "venue" || r.venue_type === "other").length;

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === "all" ? "bg-white text-black" : "bg-white/5 text-neutral-400"}`}
        >
          전체 ({rows.length})
        </button>
        <button
          onClick={() => setFilter("club")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === "club" ? "bg-white text-black" : "bg-white/5 text-neutral-400"}`}
        >
          클럽만
        </button>
        {venueCount > 0 && (
          <span className="self-center text-xs text-neutral-600">공연장 등 {venueCount}곳</span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#1C1C1E] px-5 py-10 text-center text-sm text-neutral-500">
          해당하는 미등록 클럽이 없습니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((r) => (
            <RegistryCard key={r.id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
