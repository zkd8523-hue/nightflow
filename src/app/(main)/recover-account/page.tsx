"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RotateCcw, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function RecoverAccountPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [deletedAt, setDeletedAt] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("name, deleted_at")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.deleted_at) {
        router.push("/");
        return;
      }

      setDeletedAt(profile.deleted_at);
      setUserName(profile.name || "");
      setLoading(false);
    }

    checkUser();
  }, [router, supabase]);

  const daysRemaining = deletedAt
    ? Math.max(0, 30 - dayjs().diff(dayjs(deletedAt), "day"))
    : 0;

  const purgeDate = deletedAt
    ? dayjs(deletedAt).add(30, "day").format("YYYY년 M월 D일")
    : "";

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const response = await fetch("/api/auth/restore-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "복구 중 오류가 발생했습니다");
        setRestoring(false);
        return;
      }

      toast.success("계정이 복구되었습니다!", {
        description: "다시 돌아오셔서 감사합니다.",
      });
      router.push("/");
      router.refresh();
    } catch {
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setRestoring(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {/* 메인 카드 */}
        <Card className="bg-[#1C1C1E] border-neutral-800 p-6 gap-0 space-y-5 text-center">
          <div className="w-16 h-16 mx-auto bg-amber-500/10 rounded-full flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-white">
              탈퇴 처리된 계정입니다
            </h1>
            {userName && (
              <p className="text-[14px] text-neutral-400 font-bold">
                {userName}님, 다시 돌아오셨군요
              </p>
            )}
          </div>

          {/* 남은 기간 */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-1">
            <p className="text-3xl font-black text-amber-400">
              {daysRemaining}
              <span className="text-base font-bold">일 남음</span>
            </p>
            <p className="text-[12px] text-neutral-500 font-medium">
              {purgeDate}에 영구 삭제 예정
            </p>
          </div>

          {/* 복구 버튼 */}
          <Button
            onClick={handleRestore}
            disabled={restoring}
            className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-black text-sm rounded-xl transition-colors"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {restoring ? "복구 중..." : "계정 복구하기"}
          </Button>

          {/* 안내 텍스트 */}
          <p className="text-[12px] text-neutral-500 font-medium leading-relaxed">
            복구하면 기존 데이터가 모두 원래대로 돌아옵니다.
            <br />
            경고·스트라이크 기록도 유지됩니다.
          </p>
        </Card>

        {/* 하단 안내 */}
        <div className="text-center space-y-3">
          <button
            onClick={handleSignOut}
            className="text-[12px] text-neutral-600 hover:text-neutral-400 transition-colors font-medium"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
