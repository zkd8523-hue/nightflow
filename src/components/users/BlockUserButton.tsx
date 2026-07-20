"use client";

import { useState, useEffect } from "react";
import { Ban } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface BlockUserButtonProps {
  targetUserId: string;
  targetDisplayName?: string | null;
  variant?: "icon" | "text";
}

const REASONS = [
  { value: "inappropriate_content", label: "부적절한 콘텐츠", desc: "음란·폭력·혐오 표현 포함" },
  { value: "scam_suspect", label: "사기 의심", desc: "금전 피해가 우려되는 사용자" },
  { value: "harassment", label: "괴롭힘·욕설", desc: "무례한 언행, 집요한 연락, 성희롱" },
  { value: "spam", label: "스팸/반복 게시", desc: "도배 또는 광고성 게시글" },
  { value: "other", label: "기타", desc: "직접 입력" },
] as const;

export function BlockUserButton({
  targetUserId,
  targetDisplayName,
  variant = "text",
}: BlockUserButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [memo, setMemo] = useState("");
  const router = useRouter();

  // 현재 차단 상태 조회
  useEffect(() => {
    let alive = true;
    fetch(`/api/users/${targetUserId}/block`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setIsBlocked(!!d?.blocked);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [targetUserId]);

  const resetForm = () => {
    setReason("");
    setMemo("");
  };

  const handleSubmit = async () => {
    // 차단 시에만 사유 검증
    if (!isBlocked) {
      if (!reason) {
        toast.error("차단 사유를 선택해주세요");
        return;
      }
      if (reason === "other" && !memo.trim()) {
        toast.error("기타 사유를 입력해주세요");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/users/${targetUserId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: isBlocked
          ? undefined
          : JSON.stringify({ reason, memo: memo.trim() || null }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || "차단 처리에 실패했습니다");
        return;
      }

      if (data.blocked) {
        toast.success("사용자를 차단했습니다", {
          description: "이 사용자의 게시글이 더 이상 표시되지 않으며, 사유가 관리자에게 전달되었습니다",
        });
      } else {
        toast.success("차단을 해제했습니다");
      }

      setIsBlocked(!!data.blocked);
      setOpen(false);
      resetForm();
      router.refresh();
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const label = targetDisplayName ? `${targetDisplayName}님` : "이 사용자";
  const submitDisabled =
    loading ||
    (!isBlocked &&
      (!reason || (reason === "other" && !memo.trim())));

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="사용자 차단"
          className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
        >
          <Ban className="w-4 h-4 text-neutral-500" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 py-3 group mx-auto"
        >
          <Ban className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
          <span className="text-[11px] text-neutral-600 font-medium group-hover:text-neutral-400 transition-colors">
            {isBlocked ? "차단 해제" : "이 사용자 차단"}
          </span>
        </button>
      )}

      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <SheetContent
          side="bottom"
          className="bg-[#1C1C1E] border-neutral-800 rounded-t-3xl pb-8 max-h-[90vh] overflow-y-auto"
        >
          <SheetHeader className="pb-2 text-left">
            <SheetTitle className="text-white text-[16px]">
              {isBlocked ? "차단 해제하시겠습니까?" : `${label} 차단하기`}
            </SheetTitle>
            <SheetDescription className="text-neutral-400 text-[13px] mt-1">
              {isBlocked
                ? "이 사용자의 게시글이 다시 표시됩니다."
                : "차단 사유가 관리자에게 전달되어 24시간 내 검토됩니다. 차단 즉시 이 사용자의 모든 게시글이 피드에서 사라집니다."}
            </SheetDescription>
          </SheetHeader>

          {!isBlocked && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                      reason === r.value
                        ? "border-red-500/50 bg-red-500/10"
                        : "border-neutral-800 bg-[#0A0A0A] hover:border-neutral-700"
                    }`}
                  >
                    <p
                      className={`text-[14px] font-bold ${
                        reason === r.value ? "text-red-400" : "text-white"
                      }`}
                    >
                      {r.label}
                    </p>
                    <p className="text-[12px] text-neutral-500 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>

              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={
                  reason === "other"
                    ? "차단 사유를 입력해주세요 (필수)"
                    : "추가 설명 (선택)"
                }
                className="w-full h-20 bg-[#0A0A0A] border border-neutral-800 rounded-xl p-3 text-[13px] text-white placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600"
                maxLength={500}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              className="h-12 rounded-xl border-neutral-800 text-neutral-400 font-bold"
            >
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitDisabled}
              className={`h-12 rounded-xl font-black text-base text-white disabled:opacity-40 ${
                isBlocked
                  ? "bg-neutral-700 hover:bg-neutral-600"
                  : "bg-red-500 hover:bg-red-600"
              }`}
            >
              {loading
                ? "처리 중..."
                : isBlocked
                ? "차단 해제"
                : "차단하기"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
