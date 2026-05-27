"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Undo2, Loader2, Tag, Clock, Shirt } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getTagLabel } from "@/lib/clubs/tags";

interface Row {
  id: string;
  club_id: string;
  changed_by: string | null;
  field: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
  club: { id: string; name: string; area: string | null } | null;
  changer_name: string;
}

interface Props {
  rows: Row[];
}

function formatTagList(value: unknown): string {
  if (!Array.isArray(value)) return "—";
  if (value.length === 0) return "(없음)";
  return value
    .map((t) => (typeof t === "string" ? (getTagLabel(t) ?? t) : String(t)))
    .join(" · ");
}

function formatValue(field: string, value: unknown): string {
  if (field === "tags") return formatTagList(value);
  if (field === "operating_hours" || field === "dresscode") {
    if (!value) return "(없음)";
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return value === null || value === undefined ? "(없음)" : JSON.stringify(value);
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export function ClubChangeLogList({ rows }: Props) {
  const router = useRouter();
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const handleRollback = async (id: string) => {
    if (!window.confirm("이 변경을 롤백할까요? old_value로 복구되고 새 로그가 기록됩니다.")) return;
    setRollingBack(id);
    try {
      const res = await fetch(`/api/admin/clubs/change-log/${id}/rollback`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "롤백 실패");
        return;
      }
      toast.success("롤백됐어요");
      router.refresh();
    } catch (err) {
      console.error("[rollback]", err);
      toast.error("롤백 중 오류가 발생했어요");
    } finally {
      setRollingBack(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 bg-[#1C1C1E] rounded-2xl border border-neutral-800">
        <p className="text-sm text-neutral-500">변경 이력이 없어요</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const FieldIcon =
          row.field === "tags" ? Tag :
          row.field === "dresscode" ? Shirt :
          Clock;
        const fieldLabel =
          row.field === "tags" ? "태그" :
          row.field === "operating_hours" ? "영업시간" :
          row.field === "dresscode" ? "드레스코드" :
          row.field;
        return (
          <div
            key={row.id}
            className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <FieldIcon className="w-3 h-3" />
                  <span className="font-bold">{fieldLabel}</span>
                  <span>·</span>
                  <span>{formatRelative(row.created_at)}</span>
                </div>
                <p className="text-[14px] text-white font-bold mt-1">
                  {row.club ? (
                    <Link
                      href={`/clubs/${row.club.id}`}
                      className="hover:text-amber-300 transition-colors"
                    >
                      {row.club.name}
                    </Link>
                  ) : "(삭제된 클럽)"}
                  {row.club?.area && (
                    <span className="text-[12px] text-neutral-500 font-medium ml-1.5">
                      {row.club.area}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  변경자: {row.changer_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRollback(row.id)}
                disabled={rollingBack === row.id}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:text-red-200 hover:bg-red-500/25 text-[11px] font-black transition-colors disabled:opacity-50"
              >
                {rollingBack === row.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Undo2 className="w-3 h-3" />
                )}
                롤백
              </button>
            </div>
            <div className="bg-black/30 rounded-xl p-3 space-y-1.5">
              <div>
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                  변경 전
                </span>
                <p className="text-[12px] text-neutral-400 mt-0.5 break-words">
                  {formatValue(row.field, row.old_value)}
                </p>
              </div>
              <div className="border-t border-neutral-800/50 pt-1.5">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                  변경 후
                </span>
                <p className="text-[12px] text-white mt-0.5 break-words">
                  {formatValue(row.field, row.new_value)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
