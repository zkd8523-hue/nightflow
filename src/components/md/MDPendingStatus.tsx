"use client";

import { Clock, Instagram, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import type { User } from "@/types/database";

export function MDPendingStatus({ user }: { user: User }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* 상태 헤더 */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-xl font-black text-white">승인 대기 중</h1>
        <p className="text-neutral-500 text-[13px]">
          관리자가 확인 후 승인해드립니다. 잠시만 기다려주세요.
        </p>
      </div>

      {/* 인스타그램 정보 */}
      {user.instagram && (
        <div className="bg-[#1C1C1E] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Instagram className="w-4 h-4 text-neutral-500" />
            <p className="text-[13px] text-neutral-400">등록된 인스타그램</p>
          </div>
          <p className="text-white font-bold text-lg">@{user.instagram}</p>
        </div>
      )}

      {/* 안내 */}
      <div className="bg-[#1C1C1E] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-amber-500" />
          <p className="text-amber-400 font-bold text-[13px]">승인 대기 중</p>
        </div>
        <p className="text-neutral-500 text-[12px]">
          보통 24시간 이내에 승인이 완료됩니다.
          승인되면 알림으로 안내해드립니다.
        </p>
      </div>

      {/* 홈으로 버튼 */}
      <button
        onClick={() => router.push("/")}
        className="w-full py-3 flex items-center justify-center gap-2 text-neutral-400 text-[13px] font-medium hover:text-white transition-colors"
      >
        <Home className="w-4 h-4" />
        홈으로 돌아가기
      </button>
    </div>
  );
}
