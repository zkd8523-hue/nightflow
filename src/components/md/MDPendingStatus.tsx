"use client";

import { useState } from "react";
import { Clock, CheckCircle2, Instagram, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { User } from "@/types/database";

export function MDPendingStatus({ user }: { user: User }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const hasCode = !!user.instagram_verify_code;
  const isVerified = !!user.instagram_verified_at;

  const handleSubmitCode = async () => {
    if (code.length !== 6) {
      toast.error("6자리 인증코드를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/md/verify-instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success("인스타그램 인증이 완료되었습니다!");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "인증에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 상태 헤더 */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
          {isVerified
            ? <CheckCircle2 className="w-8 h-8 text-green-500" />
            : <Clock className="w-8 h-8 text-amber-500" />
          }
        </div>
        <h1 className="text-xl font-black text-white">
          {isVerified ? "인증 완료! 승인 대기 중" : "파트너 심사 중"}
        </h1>
        <p className="text-neutral-500 text-[13px]">
          {isVerified
            ? "관리자가 최종 확인 후 승인해드립니다. 조금만 기다려주세요."
            : "인스타그램 DM으로 인증코드가 발송됩니다. 잠시만 기다려주세요."
          }
        </p>
      </div>

      {/* 인스타그램 정보 */}
      <div className="bg-[#1C1C1E] rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <Instagram className="w-4 h-4 text-neutral-500" />
          <p className="text-[13px] text-neutral-400">등록된 인스타그램</p>
        </div>
        <p className="text-white font-bold text-lg">@{user.instagram || "미설정"}</p>
      </div>

      {/* 인증코드 입력 (코드 발급됨 + 미인증) */}
      {hasCode && !isVerified && (
        <div className="bg-[#1C1C1E] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            <p className="text-white font-bold text-[14px]">인증코드가 발송되었습니다</p>
          </div>
          <p className="text-neutral-500 text-[12px]">
            인스타그램 DM으로 받은 6자리 코드를 입력해주세요.
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-center text-2xl font-black text-white tracking-[0.5em] focus:outline-none focus:border-green-500"
          />
          <button
            onClick={handleSubmitCode}
            disabled={loading || code.length !== 6}
            className="w-full py-3 bg-white text-black font-black text-[14px] rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "확인 중..." : "인증하기"}
          </button>
        </div>
      )}

      {/* 인증 완료 상태 */}
      {isVerified && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <p className="text-green-400 font-bold text-[13px]">인스타그램 인증 완료</p>
          </div>
          <p className="text-neutral-500 text-[12px] mt-1">
            관리자 승인 후 바로 활동을 시작할 수 있습니다.
          </p>
        </div>
      )}

      {/* 코드 미발급 (대기 중) */}
      {!hasCode && !isVerified && (
        <div className="bg-[#1C1C1E] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="text-amber-400 font-bold text-[13px]">인증코드 대기 중</p>
          </div>
          <p className="text-neutral-500 text-[12px]">
            관리자가 인스타그램 @{user.instagram}으로 인증코드를 보내드립니다.
            보통 24시간 이내에 발송됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
