"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { generateSlug } from "@/lib/utils/slug";
import type { Area } from "@/types/database";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";

import type { User as AuthUser } from "@supabase/supabase-js";

export default function MDSignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    area: "" as Area | "",
    bank_name: "",
    bank_account: "",
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthUser(user);
      const kakaoName =
        user.user_metadata?.full_name || user.user_metadata?.name || "";
      setFormData((prev) => ({ ...prev, name: kakaoName }));
    });
  }, [router, supabase]);

  const formatBankAccount = (value: string, bankName: string) => {
    // 숫자만 추출
    const numbers = value.replace(/[^\d]/g, "");

    // 은행별 포맷 적용 및 최대 자릿수 제한
    switch (bankName) {
      case "KB국민은행": // 123456-78-901234 (14자리)
        const kb = numbers.slice(0, 14);
        if (kb.length <= 6) return kb;
        if (kb.length <= 8) return `${kb.slice(0, 6)}-${kb.slice(6)}`;
        return `${kb.slice(0, 6)}-${kb.slice(6, 8)}-${kb.slice(8)}`;

      case "신한은행": // 110-123-456789 (12자리)
        const sh = numbers.slice(0, 12);
        if (sh.length <= 3) return sh;
        if (sh.length <= 6) return `${sh.slice(0, 3)}-${sh.slice(3)}`;
        return `${sh.slice(0, 3)}-${sh.slice(3, 6)}-${sh.slice(6)}`;

      case "우리은행": // 1002-123-456789 (13자리)
        const wr = numbers.slice(0, 13);
        if (wr.length <= 4) return wr;
        if (wr.length <= 7) return `${wr.slice(0, 4)}-${wr.slice(4)}`;
        return `${wr.slice(0, 4)}-${wr.slice(4, 7)}-${wr.slice(7)}`;

      case "하나은행": // 123-456789-01234 (14자리)
        const hn = numbers.slice(0, 14);
        if (hn.length <= 3) return hn;
        if (hn.length <= 9) return `${hn.slice(0, 3)}-${hn.slice(3)}`;
        return `${hn.slice(0, 3)}-${hn.slice(3, 9)}-${hn.slice(9)}`;

      case "NH농협은행": // 123-4567-8901-23 (13자리)
        const nh = numbers.slice(0, 13);
        if (nh.length <= 3) return nh;
        if (nh.length <= 7) return `${nh.slice(0, 3)}-${nh.slice(3)}`;
        if (nh.length <= 11) return `${nh.slice(0, 3)}-${nh.slice(3, 7)}-${nh.slice(7)}`;
        return `${nh.slice(0, 3)}-${nh.slice(3, 7)}-${nh.slice(7, 11)}-${nh.slice(11)}`;

      case "IBK기업은행": // 123-456789-12-345 (14자리)
        const ibk = numbers.slice(0, 14);
        if (ibk.length <= 3) return ibk;
        if (ibk.length <= 9) return `${ibk.slice(0, 3)}-${ibk.slice(3)}`;
        if (ibk.length <= 11) return `${ibk.slice(0, 3)}-${ibk.slice(3, 9)}-${ibk.slice(9)}`;
        return `${ibk.slice(0, 3)}-${ibk.slice(3, 9)}-${ibk.slice(9, 11)}-${ibk.slice(11)}`;

      case "SC제일은행": // 123-45-678901 (11자리)
        const sc = numbers.slice(0, 11);
        if (sc.length <= 3) return sc;
        if (sc.length <= 5) return `${sc.slice(0, 3)}-${sc.slice(3)}`;
        return `${sc.slice(0, 3)}-${sc.slice(3, 5)}-${sc.slice(5)}`;

      case "카카오뱅크": // 3333-12-3456789 (13자리)
        const kakao = numbers.slice(0, 13);
        if (kakao.length <= 4) return kakao;
        if (kakao.length <= 6) return `${kakao.slice(0, 4)}-${kakao.slice(4)}`;
        return `${kakao.slice(0, 4)}-${kakao.slice(4, 6)}-${kakao.slice(6)}`;

      case "토스뱅크": // 1234-5678-9012 (12자리)
        const toss = numbers.slice(0, 12);
        if (toss.length <= 4) return toss;
        if (toss.length <= 8) return `${toss.slice(0, 4)}-${toss.slice(4)}`;
        return `${toss.slice(0, 4)}-${toss.slice(4, 8)}-${toss.slice(8)}`;

      case "케이뱅크": // 123-456-789012 (12자리)
        const k = numbers.slice(0, 12);
        if (k.length <= 3) return k;
        if (k.length <= 6) return `${k.slice(0, 3)}-${k.slice(3)}`;
        return `${k.slice(0, 3)}-${k.slice(3, 6)}-${k.slice(6)}`;

      default:
        return numbers;
    }
  };

  const handleBankAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatBankAccount(e.target.value, formData.bank_name);
    setFormData({ ...formData, bank_account: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !formData.area) return;

    setLoading(true);

    try {
      const slug = generateSlug(formData.name);

      const { error } = await supabase.from("users").insert({
        id: authUser.id,
        kakao_id: authUser.user_metadata?.provider_id || authUser.id,
        name: formData.name,
        phone: formData.phone,
        profile_image: authUser.user_metadata?.avatar_url || null,
        role: "user", // Admin 승인 후 'md'로 변경
        md_status: "pending",
        md_unique_slug: slug,
        area: formData.area,
        bank_name: formData.bank_name,
        bank_account: formData.bank_account,
      });

      if (error) throw error;

      trackEvent("signup_completed", { user_type: "md", area: formData.area });
      toast.success("MD 신청이 완료되었습니다! 승인을 기다려주세요.");
      router.push("/");
    } catch (error: unknown) {
      logger.error("MD signup error:", error);
      toast.error(error instanceof Error ? error.message : "신청 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  if (!authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">MD 신청</h1>
          <p className="text-sm text-neutral-500">
            클럽 테이블 경매를 등록하고 수익을 올리세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">전화번호 *</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              placeholder="010-1234-5678"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="area">활동 지역 *</Label>
            <select
              id="area"
              value={formData.area}
              onChange={(e) =>
                setFormData({ ...formData, area: e.target.value as Area })
              }
              className="w-full px-3 py-2 bg-white text-black border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            >
              <option value="">선택하세요</option>
              <option value="강남">강남</option>
              <option value="홍대">홍대</option>
              <option value="이태원">이태원</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank_name">정산 은행 *</Label>
            <select
              id="bank_name"
              value={formData.bank_name}
              onChange={(e) =>
                setFormData({ ...formData, bank_name: e.target.value })
              }
              className="w-full px-3 py-2 bg-white text-black border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            >
              <option value="">선택하세요</option>
              <option value="KB국민은행">KB국민은행</option>
              <option value="신한은행">신한은행</option>
              <option value="우리은행">우리은행</option>
              <option value="하나은행">하나은행</option>
              <option value="NH농협은행">NH농협은행</option>
              <option value="IBK기업은행">IBK기업은행</option>
              <option value="SC제일은행">SC제일은행</option>
              <option value="카카오뱅크">카카오뱅크</option>
              <option value="토스뱅크">토스뱅크</option>
              <option value="케이뱅크">케이뱅크</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank_account">계좌번호 *</Label>
            <Input
              id="bank_account"
              value={formData.bank_account}
              onChange={handleBankAccountChange}
              placeholder={
                formData.bank_name === "KB국민은행"
                  ? "123456-78-901234"
                  : formData.bank_name === "신한은행"
                    ? "110-123-456789"
                    : formData.bank_name === "우리은행"
                      ? "1002-123-456789"
                      : formData.bank_name === "하나은행"
                        ? "123-456789-01234"
                        : formData.bank_name === "NH농협은행"
                          ? "123-4567-8901-23"
                          : formData.bank_name === "IBK기업은행"
                            ? "123-456789-12-345"
                            : formData.bank_name === "SC제일은행"
                              ? "123-45-678901"
                              : formData.bank_name === "카카오뱅크"
                                ? "3333-12-3456789"
                                : formData.bank_name === "토스뱅크"
                                  ? "1234-5678-9012"
                                  : formData.bank_name === "케이뱅크"
                                    ? "123-456-789012"
                                    : "계좌번호를 입력하세요"
              }
              required
            />
          </div>

          <div className="bg-neutral-900 p-4 rounded-md text-sm text-neutral-400">
            <p>• MD 승인은 최대 1-2일 소요됩니다</p>
            <p>• 승인 후 경매 등록이 가능합니다</p>
            <p>• 베타 기간 수수료 0% (낙찰가 전액 정산)</p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "신청 중..." : "MD 신청하기"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
