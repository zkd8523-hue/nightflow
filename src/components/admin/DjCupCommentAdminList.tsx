"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EyeOff, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";

/**
 * DJ컵 댓글 관리 목록 (Migration 621).
 *
 * hard delete가 아니라 is_hidden 토글이다 — 오조작을 되돌릴 수 있어야 하고,
 * 같은 세션의 레이트리밋 카운트도 남아야 도배범이 지워서 제한을 리셋하는 걸
 * 막는다. 숨기는 순간 공개 조회 RPC(is_hidden = FALSE 필터)에서 빠진다.
 */

export interface AdminCommentRow {
  id: string;
  nickname: string;
  body: string;
  champion_name: string | null;
  round_size: number | null;
  is_hidden: boolean;
  is_test: boolean;
  user_id: string | null;
  created_at: string;
}

export function DjCupCommentAdminList({ initialRows }: { initialRows: AdminCommentRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (row: AdminCommentRow) => {
    if (busy) return;
    setBusy(row.id);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("admin_set_dj_cup_comment_hidden", {
        p_comment_id: row.id,
        p_hidden: !row.is_hidden,
      });
      const res = data as { success?: boolean; error?: string } | null;
      if (error || !res?.success) {
        toast.error(res?.error ?? "처리하지 못했어요");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, is_hidden: !row.is_hidden } : r))
      );
      toast.success(row.is_hidden ? "다시 보이게 했어요" : "숨겼어요");
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return (
      <Card className="bg-card border-border p-6 text-muted-foreground text-sm">
        아직 댓글이 없습니다.
      </Card>
    );
  }

  const visible = rows.filter((r) => !r.is_hidden).length;

  return (
    <>
      <div className="flex gap-4 flex-wrap">
        <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[120px]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            전체
          </span>
          <span className="text-3xl font-black text-foreground">{rows.length}</span>
        </Card>
        <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[120px]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            공개 중
          </span>
          <span className="text-3xl font-black text-foreground">{visible}</span>
        </Card>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <Card
            key={r.id}
            className={`bg-card border-border p-4 flex items-start gap-3 ${
              r.is_hidden ? "opacity-50" : ""
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-extrabold text-foreground">{r.nickname}</span>
                {r.champion_name && (
                  <span className="text-xs text-green-500 font-bold">{r.champion_name}</span>
                )}
                {r.is_test && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">
                    TEST
                  </span>
                )}
                {r.is_hidden && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                    숨김
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ko-KR")}
                </span>
              </p>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">
                {r.body}
              </p>
            </div>

            <button
              type="button"
              onClick={() => toggle(r)}
              disabled={busy === r.id}
              title={r.is_hidden ? "다시 보이게" : "숨기기"}
              className="shrink-0 h-9 px-3 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {r.is_hidden ? (
                <>
                  <Eye className="w-3.5 h-3.5" /> 복구
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" /> 숨기기
                </>
              )}
            </button>
          </Card>
        ))}
      </div>
    </>
  );
}
