"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import {
  isDisplayNameTaken,
  suggestDisplayName,
  validateDisplayName,
} from "@/lib/utils/displayName";
import type { User as AuthUser } from "@supabase/supabase-js";

interface ExistingProfile {
  id: string;
  name: string;
  phone: string;
  birthday: string | null;
  display_name: string | null;
}

export function DisplayNameForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const redirectAfter =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const supabase = createClient();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ExistingProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }
      if (cancelled) return;
      setAuthUser(user);

      const { data, error } = await supabase
        .from("users")
        .select("id, name, phone, birthday, display_name")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        logger.error("DisplayNameForm profile load failed:", error);
        router.replace("/signup");
        return;
      }
      if (cancelled) return;

      setProfile(data as ExistingProfile);
      const seed = (data as ExistingProfile).name || "유저";
      setDisplayName(suggestDisplayName(seed));
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !profile) return;

    const trimmed = displayName.trim();
    const check = validateDisplayName(trimmed);
    if (!check.ok) {
      toast.error(check.message ?? "닉네임을 확인해주세요.");
      return;
    }

    setLoading(true);
    try {
      if (await isDisplayNameTaken(supabase, trimmed, authUser.id)) {
        toast.error("이미 사용 중인 닉네임입니다.");
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("users")
        .update({ display_name: trimmed })
        .eq("id", authUser.id);

      if (error) throw error;

      toast.success("닉네임이 설정되었습니다.");
      router.replace(redirectAfter);
      router.refresh();
    } catch (error) {
      logger.error("display_name update failed:", error);
      toast.error(
        error instanceof Error ? error.message : "닉네임 저장에 실패했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!authUser || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <p className="text-neutral-400">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">프로필 설정 완료</h1>
          <p className="text-sm text-neutral-500">
            NightFlow에서 사용할 닉네임을 설정해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">닉네임 *</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="2-16자"
              maxLength={16}
              required
              autoFocus
            />
            <p className="text-xs text-neutral-500">
              경매 입찰 시 다른 사용자에게 표시됩니다. 실명은 MD 연락 용도로만 사용됩니다.
            </p>
          </div>

          <div className="rounded-lg bg-neutral-900/60 border border-neutral-800 p-4 space-y-2 text-sm">
            <p className="text-xs text-neutral-500 uppercase tracking-wider">
              이미 등록된 정보
            </p>
            <div className="flex justify-between">
              <span className="text-neutral-500">이름</span>
              <span className="text-neutral-200">{profile.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">전화번호</span>
              <span className="text-neutral-200">{profile.phone}</span>
            </div>
            {profile.birthday && (
              <div className="flex justify-between">
                <span className="text-neutral-500">생년월일</span>
                <span className="text-neutral-200">{profile.birthday}</span>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "저장 중..." : "시작하기"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
