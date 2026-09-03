"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ClubPartyMemberRow } from "./types";

dayjs.locale("ko");

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
    return (
      <p className="text-xs text-muted-foreground py-3">
        방장 외 참여자가 있는 파티가 없습니다.
      </p>
    );
  }

  const grouped = new Map<string, ClubPartyMemberRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.puzzle_id) ?? [];
    list.push(r);
    grouped.set(r.puzzle_id, list);
  }

  return (
    <div className="py-3 space-y-4">
      {[...grouped.entries()].map(([puzzleId, members]) => {
        const head = members[0];
        const perPerson =
          head.budget_per_person ??
          (head.total_budget && head.target_count
            ? Math.round(head.total_budget / head.target_count)
            : null);
        const totalBudget =
          head.total_budget ??
          (head.budget_per_person && head.target_count
            ? head.budget_per_person * head.target_count
            : null);
        return (
        <div key={puzzleId} className="pl-3 border-l-2 border-border">
          <p className="text-xs mb-0.5">
            <span className="font-bold">
              {head.event_date
                ? dayjs(head.event_date).format("YYYY.MM.DD (ddd)")
                : "날짜 미정"}
            </span>
            {perPerson !== null && (
              <span className="text-green-500 ml-2">
                인당 {perPerson.toLocaleString()}원
              </span>
            )}
            {totalBudget !== null && (
              <span className="text-muted-foreground ml-1.5">
                (총 {totalBudget.toLocaleString()}원)
              </span>
            )}
            {head.target_count !== null && (
              <span className="text-muted-foreground ml-2">
                {head.current_count ?? 0}/{head.target_count}명
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground mb-1.5">
            {dayjs(head.puzzle_created_at).format("MM/DD HH:mm")} 발행 ·{" "}
            {head.puzzle_status} · 대화{" "}
            {head.msg_count > 0 ? (
              <span className="text-foreground font-bold">{head.msg_count}건</span>
            ) : (
              "0건"
            )}
            {head.last_msg_at && (
              <>
                {" · 마지막 "}
                <span className="text-foreground">{head.last_msg_sender ?? "알 수 없음"}</span>
                {" "}
                {dayjs(head.last_msg_at).format("MM/DD HH:mm")}
              </>
            )}
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
        );
      })}
    </div>
  );
}
