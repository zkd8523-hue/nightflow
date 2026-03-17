"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  Trash2,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function DeleteAccountPage() {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && !isDeleted) {
    router.push("/login?redirect=/profile/delete");
    return null;
  }

  const isMD = user.role === "md";
  const isAdmin = user.role === "admin";

  const handleDelete = async () => {
    if (confirmText !== "회원탈퇴") return;
    setLoading(true);

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "탈퇴 처리 중 오류가 발생했습니다");
        setShowConfirm(false);
        setLoading(false);
        return;
      }

      setIsDeleted(true);
      const supabase = createClient();
      await supabase.auth.signOut();

      toast.success("회원탈퇴가 완료되었습니다", {
        description: "30일 이내에 다시 로그인하면 계정을 복구할 수 있습니다.",
        duration: 5000,
      });

      router.push("/");
      router.refresh();
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/profile"
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <h1 className="text-xl font-black text-white">회원탈퇴</h1>
        </div>

        {/* Admin 차단 */}
        {isAdmin && (
          <Card className="bg-red-500/5 border-red-500/20 p-5 gap-0">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h2 className="text-[15px] font-black text-red-400">
                관리자 계정
              </h2>
            </div>
            <p className="text-[13px] text-neutral-400 leading-relaxed">
              관리자 계정은 탈퇴할 수 없습니다.
              <br />
              다른 관리자에게 문의해주세요.
            </p>
          </Card>
        )}

        {!isAdmin && (
          <div className="space-y-3.5">
            {/* 계정 요약 */}
            <Card className="bg-[#1C1C1E] border-neutral-800 p-5 gap-0 space-y-2">
              <h2 className="text-[15px] font-black text-white">계정 정보</h2>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500 font-medium">이름</span>
                  <span className="text-white font-bold">
                    {user.name || "미설정"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500 font-medium">가입일</span>
                  <span className="text-white font-bold">
                    {dayjs(user.created_at).format("YYYY년 M월 D일")}
                  </span>
                </div>
                {isMD && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500 font-medium">역할</span>
                    <span className="text-amber-400 font-bold">MD</span>
                  </div>
                )}
              </div>
            </Card>

            {/* 30일 복구 안내 */}
            <Card className="bg-amber-500/5 border-amber-500/20 p-5 gap-0 space-y-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-amber-400">
                  30일 이내 복구 가능
                </h3>
              </div>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                탈퇴 후 30일 이내에 다시 로그인하면 계정을 복구할 수 있습니다.
                30일이 지나면 모든 데이터가 영구적으로 삭제됩니다.
              </p>
            </Card>

            {/* 삭제되는 데이터 */}
            <Card className="bg-red-500/5 border-red-500/20 p-5 gap-0 space-y-3">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-black text-red-400">
                  30일 후 삭제되는 데이터
                </h3>
              </div>
              <ul className="space-y-2">
                {[
                  "입찰 기록 및 낙찰 내역",
                  "알림 구독 및 수신 설정",
                  "경고 및 스트라이크 기록",
                  "리뷰 및 신고 기록",
                  ...(isMD
                    ? [
                        "등록한 경매 및 거래 기록",
                        "VIP 고객 목록 및 메모",
                        "경매 템플릿",
                      ]
                    : []),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400/70 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-neutral-400 font-medium">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* MD 추가 안내 */}
            {isMD && (
              <Card className="bg-amber-500/5 border-amber-500/20 p-5 gap-0 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-amber-400">
                    MD 계정 안내
                  </h3>
                </div>
                <ul className="space-y-1.5">
                  <li className="text-[13px] text-neutral-400 font-medium leading-relaxed">
                    진행 중인 경매(활성/예정/낙찰 진행)가 있는 경우 탈퇴할 수
                    없습니다.
                  </li>
                  <li className="text-[13px] text-neutral-400 font-medium leading-relaxed">
                    소속 클럽과의 연결이 해제됩니다.
                  </li>
                </ul>
              </Card>
            )}

            {/* CTA */}
            <div className="pt-1">
              <Button
                onClick={() => setShowConfirm(true)}
                className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-black text-sm rounded-xl transition-colors"
              >
                회원탈퇴
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 확인 Sheet */}
      <Sheet
        open={showConfirm}
        onOpenChange={(open) => {
          setShowConfirm(open);
          if (!open) setConfirmText("");
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">
              정말 탈퇴하시겠습니까?
            </SheetTitle>
            <SheetDescription className="text-neutral-400">
              확인을 위해 아래에 &quot;회원탈퇴&quot;를 입력해주세요
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3.5 px-4">
            {/* 복구 안내 */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5">
              <p className="text-[13px] text-amber-400 font-bold">
                30일 이내에 로그인하면 계정을 복구할 수 있습니다
              </p>
              <p className="text-[12px] text-neutral-500 font-medium mt-1">
                30일 후 모든 데이터가 영구 삭제됩니다
              </p>
            </div>

            {/* 확인 입력 */}
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="회원탈퇴"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500 transition-colors"
              autoComplete="off"
            />

            {/* 버튼 */}
            <div className="grid grid-cols-2 gap-3 pt-0.5 pb-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                disabled={loading}
                className="h-12 border-neutral-700 text-neutral-300 font-black rounded-xl hover:bg-neutral-800"
              >
                돌아가기
              </Button>
              <Button
                onClick={handleDelete}
                disabled={loading || confirmText !== "회원탈퇴"}
                className="h-12 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl disabled:opacity-30"
              >
                {loading ? "처리 중..." : "탈퇴 확인"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
