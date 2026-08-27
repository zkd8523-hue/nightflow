"use client";

import { Clock } from "lucide-react";
import { DjClaimCard } from "./DjClaimCard";
import type { DjClaim } from "@/types/database";

export function DjClaimManagement({
  claims,
  setClaims,
}: {
  claims: DjClaim[];
  setClaims: (claims: DjClaim[] | ((prev: DjClaim[]) => DjClaim[])) => void;
}) {
  const pending = claims.filter((c) => c.status === "pending");

  const handleUpdate = (updated: Partial<DjClaim> & { id: string }) => {
    setClaims((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  };

  return (
    <div className="space-y-6">
      {pending.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-brand-amber">심사 대기 ({pending.length})</h2>
          {pending.map((c) => (
            <DjClaimCard key={c.id} claim={c} onUpdate={handleUpdate} />
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-4 bg-card/20 rounded-3xl border border-dashed border-border/50">
          <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8 text-neutral-800" />
          </div>
          <p className="text-muted-foreground font-medium italic">대기 중인 DJ 인증 신청이 없습니다.</p>
        </div>
      )}
    </div>
  );
}
