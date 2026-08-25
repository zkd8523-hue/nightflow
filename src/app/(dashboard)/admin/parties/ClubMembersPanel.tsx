"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ClubPartyMemberRow } from "./types";

const STATUS_STYLE: Record<ClubPartyMemberRow["member_status"], string> = {
  참여중: "text-green-500",
  나감: "text-muted-foreground",
  추방됨: "text-red-500",
};

export function ClubMembersPanel({ clubId }: { clubId: string }) {
  const [rows, setRows] = useState<ClubPartyMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("admin_get_club_party_members", { p_club_id: clubId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        setRows((data as ClubPartyMemberRow[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  if (error) {
    return <p className="text-xs text-red-500 py-3">조회 실패: {error}</p>;
  }
  if (!rows) {
    return <p className="text-xs text-muted-foreground py-3">불러오는 중...</p>;
  }
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-3">참여자 기록이 없습니다.</p>;
  }

  const grouped = new Map<string, ClubPartyMemberRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.puzzle_id) ?? [];
    list.push(r);
    grouped.set(r.puzzle_id, list);
  }

  return (
    <div className="py-3 space-y-4">
      {[...grouped.entries()].map(([puzzleId, members]) => (
        <div key={puzzleId} className="pl-3 border-l-2 border-border">
          <p className="text-[11px] text-muted-foreground mb-1.5">
            {dayjs(members[0].puzzle_created_at).format("MM/DD HH:mm")} 발행 ·{" "}
            {members[0].puzzle_status}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {members.map((m) => (
              <div key={`${m.user_id}-${m.member_status}`} className="text-xs flex items-center gap-1">
                <Link
                  href={`/u/${m.user_id}`}
                  target="_blank"
                  className="font-bold hover:underline"
                >
                  {m.display_name}
                  {m.is_leader && <span className="text-amber-500 ml-0.5">방장</span>}
                </Link>
                <span className={STATUS_STYLE[m.member_status]}>{m.member_status}</span>
                {m.reason && (
                  <span className="text-muted-foreground">({m.reason})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
