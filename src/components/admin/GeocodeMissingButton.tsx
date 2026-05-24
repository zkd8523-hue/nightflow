"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

export function GeocodeMissingButton() {
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (running) return;
    if (!window.confirm("좌표 없는 클럽 전체를 일괄 geocode 합니다. 진행할까요?")) return;

    setRunning(true);
    try {
      const res = await fetch("/api/admin/clubs/geocode-missing", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "실패");
        return;
      }
      const s = json.summary as {
        total: number;
        ok: number;
        not_found: number;
        no_address: number;
        error: number;
      };
      toast.success(
        `완료 · ${s.ok}/${s.total} 성공` +
          (s.not_found ? ` · 미매칭 ${s.not_found}` : "") +
          (s.no_address ? ` · 주소없음 ${s.no_address}` : "") +
          (s.error ? ` · 오류 ${s.error}` : "")
      );
      // 새로고침으로 좌표 반영
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error(err);
      toast.error("요청 실패");
    } finally {
      setRunning(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRun}
      disabled={running}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-bold disabled:opacity-50"
    >
      {running ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <MapPin className="w-3.5 h-3.5" />
      )}
      {running ? "처리 중..." : "좌표 누락 일괄 처리"}
    </button>
  );
}
