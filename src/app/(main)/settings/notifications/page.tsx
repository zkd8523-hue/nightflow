"use client";

import { useState, useEffect, useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Phone,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { getErrorMessage, logError } from "@/lib/utils/error";
export default function NotificationSettingsPage() {
  const { user, isLoading, refetch } = useCurrentUser();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // 알림톡 상태
  const [alimtalkConsent, setAlimtalkConsent] = useState(false);
  const [toggling, setToggling] = useState(false);

  // 전화번호 편집
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  // user 로드 시 초기값 설정
  useEffect(() => {
    if (user) {
      setAlimtalkConsent(user.alimtalk_consent || false);
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/settings/notifications");
    return null;
  }

  // ── 알림톡 동의 토글 ──
  const handleToggleConsent = async () => {
    const newValue = !alimtalkConsent;

    // OFF→ON: 전화번호 필수
    if (newValue && !user.phone) {
      toast.error("전화번호를 먼저 등록해주세요");
      setEditingPhone(true);
      setPhoneInput("");
      return;
    }

    setToggling(true);
    try {
      const updateData: Record<string, unknown> = {
        alimtalk_consent: newValue,
      };
      if (newValue) {
        updateData.alimtalk_consent_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", user.id);

      if (error) throw error;

      setAlimtalkConsent(newValue);
      refetch();
      toast.success(newValue ? "알림톡 수신이 활성화되었습니다" : "알림톡 수신이 해제되었습니다");
    } catch (error: unknown) {
      logError(error, "Toggle Alimtalk Consent");
      toast.error(getErrorMessage(error));
    } finally {
      setToggling(false);
    }
  };

  // ── 전화번호 저장 ──
  const handleSavePhone = async () => {
    const cleanPhone = phoneInput.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      toast.error("올바른 전화번호를 입력해주세요");
      return;
    }

    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ phone: cleanPhone })
        .eq("id", user.id);

      if (error) throw error;

      setEditingPhone(false);
      refetch();
      toast.success("전화번호가 저장되었습니다");
    } catch (error: unknown) {
      logError(error, "Save Phone");
      toast.error(getErrorMessage(error));
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <h1 className="text-xl font-black text-white">알림 설정</h1>
        </div>

        {/* Section 1: 카카오 알림톡 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <h2 className="text-[15px] font-bold text-white mb-4">카카오 알림톡</h2>

          <div className="space-y-4">
            {/* 알림톡 수신 토글 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-neutral-500 shrink-0" />
                <div>
                  <p className="text-[14px] text-white font-bold">알림톡 수신</p>
                  <p className="text-[11px] text-neutral-500">경매 시작, 입찰, 낙찰 등 주요 알림</p>
                </div>
              </div>
              <button
                onClick={handleToggleConsent}
                disabled={toggling}
                className={`w-12 h-7 rounded-full relative transition-colors ${
                  alimtalkConsent ? "bg-green-500" : "bg-neutral-700"
                } ${toggling ? "opacity-50" : ""}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                    alimtalkConsent ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* 전화번호 */}
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-neutral-500 shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] text-neutral-500">전화번호</p>
                {editingPhone ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="01012345678"
                      className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-[14px] text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => setEditingPhone(false)}
                      className="text-[13px] text-neutral-500 font-bold px-2"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSavePhone}
                      disabled={savingPhone}
                      className="text-[13px] text-blue-400 font-bold px-2 disabled:opacity-50"
                    >
                      {savingPhone ? "..." : "저장"}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] text-white font-bold">
                      {user.phone || "미등록"}
                    </p>
                    <button
                      onClick={() => {
                        setPhoneInput(user.phone || "");
                        setEditingPhone(true);
                      }}
                      className="text-[13px] text-blue-400 hover:text-blue-300 font-bold"
                    >
                      수정
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 동의 일시 */}
            {user.alimtalk_consent_at && (
              <p className="text-[11px] text-neutral-600 ml-7">
                동의 일시: {dayjs(user.alimtalk_consent_at).format("YYYY.MM.DD HH:mm")}
              </p>
            )}
          </div>
        </div>

        {/* Section 2: 경매 알림 안내 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] text-white font-bold mb-1">경매 시작 알림</p>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                개별 경매 알림은 경매 상세 페이지에서 🔔 아이콘을 눌러 설정할 수 있습니다
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
