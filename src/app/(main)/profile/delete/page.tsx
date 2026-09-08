"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getLang, makeT } from "@/lib/i18n";
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

// 확인 입력 문구. 언어와 무관하게 "DELETE"로 통일한다.
// 기존에는 한글 "회원탈퇴" 4글자를 요구했는데, 영어 심사자·외국인 유저는
// 한글 IME가 없어 입력 자체가 불가능했다 (App Review 5.1.1(v) 리젝 원인).
const CONFIRM_WORD = "DELETE";

// useSearchParams는 Suspense 경계가 필요하다 (없으면 빌드 시 CSR bailout).
export default function DeleteAccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-border border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <DeleteAccountContent />
    </Suspense>
  );
}

function DeleteAccountContent() {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = getLang(searchParams.get("lang"));
  const t = makeT(lang);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && !isDeleted) {
    const back = encodeURIComponent(`/profile/delete?lang=${lang}`);
    router.push(`/login?redirect=${back}&lang=${lang}`);
    return null;
  }

  const isMD = user.role === "md";
  const isAdmin = user.role === "admin";

  const handleDelete = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) return;
    setLoading(true);

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(
          data.error ||
            t("탈퇴 처리 중 오류가 발생했습니다", "Something went wrong while deleting your account.")
        );
        setShowConfirm(false);
        setLoading(false);
        return;
      }

      setIsDeleted(true);
      const supabase = createClient();
      await supabase.auth.signOut();

      toast.success(
        t("계정이 삭제되었습니다", "Your account has been deleted"),
        {
          description: t(
            "모든 데이터가 30일 후 영구 삭제됩니다.",
            "All your data will be permanently erased after 30 days."
          ),
          duration: 5000,
        }
      );

      router.push(lang === "ko" ? "/" : `/${lang}`);
      router.refresh();
    } catch {
      toast.error(t("네트워크 오류가 발생했습니다", "Network error. Please try again."));
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href={lang === "ko" ? "/profile" : `/${lang}`}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <h1 className="text-xl font-black text-foreground">
            {t("계정 삭제", "Delete Account")}
          </h1>
        </div>

        {/* Admin 차단 */}
        {isAdmin && (
          <Card className="bg-red-500/5 border-red-500/20 p-5 gap-0">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h2 className="text-[15px] font-black text-red-400">
                {t("관리자 계정", "Administrator account")}
              </h2>
            </div>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {t(
                "관리자 계정은 삭제할 수 없습니다. 다른 관리자에게 문의해주세요.",
                "Administrator accounts cannot be deleted here. Please contact another administrator."
              )}
            </p>
          </Card>
        )}

        {!isAdmin && (
          <div className="space-y-3.5">
            {/* 계정 요약 */}
            <Card className="bg-card border-border p-5 gap-0 space-y-2">
              <h2 className="text-[15px] font-black text-foreground">
                {t("계정 정보", "Account")}
              </h2>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">
                    {t("이름", "Name")}
                  </span>
                  <span className="text-foreground font-bold">
                    {user.name || t("미설정", "Not set")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">
                    {t("가입일", "Joined")}
                  </span>
                  <span className="text-foreground font-bold">
                    {dayjs(user.created_at).format(
                      lang === "ko" ? "YYYY년 M월 D일" : "MMM D, YYYY"
                    )}
                  </span>
                </div>
                {isMD && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-medium">
                      {t("역할", "Role")}
                    </span>
                    <span className="text-brand-amber font-bold">
                      {t("파트너", "Partner")}
                    </span>
                  </div>
                )}
              </div>
            </Card>

            {/* 영구 삭제 고지 — 반드시 첫 번째로 온다.
                Apple 5.1.1(v)는 "일시 비활성화만 제공하는 것은 불충분"이라고 못박고 있어,
                복구 안내를 앞세우면 계정 삭제가 아니라 계정 비활성화로 읽힌다. */}
            <Card className="bg-red-500/5 border-red-500/20 p-5 gap-0 space-y-2">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-black text-red-400">
                  {t("계정이 영구 삭제됩니다", "Your account will be permanently deleted")}
                </h3>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {t(
                  "삭제를 확인하면 계정이 즉시 비활성화되어 더 이상 로그인하거나 서비스를 이용할 수 없습니다. 30일이 지나면 아래의 모든 데이터가 서버에서 영구적으로 삭제되며, 이후에는 복구할 수 없습니다.",
                  "Once you confirm, your account is immediately closed — you will no longer be able to sign in or use the service. After 30 days, all of the data below is permanently erased from our servers and cannot be recovered."
                )}
              </p>
            </Card>

            {/* 삭제되는 데이터 */}
            <Card className="bg-card border-border p-5 gap-0 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-black text-foreground">
                  {t("삭제되는 데이터", "Data that will be erased")}
                </h3>
              </div>
              <ul className="space-y-2">
                {[
                  t("입찰 기록 및 낙찰 내역", "Bids and winning records"),
                  t("알림 구독 및 수신 설정", "Notification subscriptions and settings"),
                  t("경고 및 스트라이크 기록", "Warning and strike history"),
                  t("리뷰 및 신고 기록", "Reviews and reports"),
                  ...(isMD
                    ? [
                        t("등록한 경매 및 거래 기록", "Listings and transaction history"),
                        t("VIP 고객 목록 및 메모", "VIP customer list and notes"),
                      ]
                    : []),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400/70 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-muted-foreground font-medium">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* 복구는 부가 정보로 뒤에 배치 (삭제 자체를 되돌리는 조건이 아님을 분명히) */}
            <Card className="bg-card border-border p-5 gap-0 space-y-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-black text-foreground">
                  {t("실수로 삭제하셨나요?", "Deleted by mistake?")}
                </h3>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {t(
                  "영구 삭제 전 30일 동안은 같은 계정으로 다시 로그인하면 복구할 수 있습니다. 30일이 지나면 복구할 수 없습니다.",
                  "During the 30 days before permanent erasure, signing in again with the same account will restore it. After 30 days, recovery is no longer possible."
                )}
              </p>
            </Card>

            {/* MD 추가 안내 */}
            {isMD && (
              <Card className="bg-amber-500/5 border-amber-500/20 p-5 gap-0 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-brand-amber" />
                  <h3 className="text-sm font-black text-brand-amber">
                    {t("파트너 계정 안내", "For partner accounts")}
                  </h3>
                </div>
                <ul className="space-y-1.5">
                  <li className="text-[13px] text-muted-foreground font-medium leading-relaxed">
                    {t(
                      "진행 중인 경매(활성/예정/낙찰 진행)가 있는 경우 삭제할 수 없습니다.",
                      "You cannot delete your account while you have listings in progress (active, scheduled, or awaiting handover)."
                    )}
                  </li>
                  <li className="text-[13px] text-muted-foreground font-medium leading-relaxed">
                    {t(
                      "소속 클럽과의 연결이 해제됩니다.",
                      "Your link to any affiliated venues will be removed."
                    )}
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
                {t("계정 삭제", "Delete Account")}
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
          className="h-auto bg-card border-border rounded-t-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-foreground font-black text-xl">
              {t("계정을 삭제할까요?", "Delete your account?")}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              {t(
                `확인을 위해 아래에 "${CONFIRM_WORD}"를 입력해주세요`,
                `Type "${CONFIRM_WORD}" below to confirm`
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3.5 px-4">
            {/* 영구 삭제 경고가 먼저, 복구는 부가 정보 */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5">
              <p className="text-[13px] text-red-400 font-bold">
                {t(
                  "계정이 삭제되고 30일 후 모든 데이터가 영구 삭제됩니다",
                  "Your account will be closed and all data permanently erased after 30 days"
                )}
              </p>
              <p className="text-[12px] text-muted-foreground font-medium mt-1">
                {t(
                  "그 전에 다시 로그인하면 복구할 수 있습니다",
                  "Signing in again before then will restore it"
                )}
              </p>
            </div>

            {/* 확인 입력 — 언어 무관 "DELETE" (한글 IME 없는 유저도 입력 가능) */}
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-500 transition-colors"
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
                className="h-12 border-border text-foreground/80 font-black rounded-xl hover:bg-muted"
              >
                {t("돌아가기", "Cancel")}
              </Button>
              <Button
                onClick={handleDelete}
                disabled={
                  loading || confirmText.trim().toUpperCase() !== CONFIRM_WORD
                }
                className="h-12 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl disabled:opacity-30"
              >
                {loading
                  ? t("처리 중...", "Deleting...")
                  : t("삭제 확인", "Delete")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
