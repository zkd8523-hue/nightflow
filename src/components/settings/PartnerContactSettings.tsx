"use client";

import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Phone, MessageCircle, Instagram, Check } from "lucide-react";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
import { toast } from "sonner";
import type { ContactMethodType } from "@/types/database";

const CONTACT_METHOD_OPTIONS: { value: ContactMethodType; label: string; icon: typeof Instagram }[] = [
  { value: "dm", label: "인스타 DM", icon: Instagram },
  { value: "kakao", label: "오픈채팅", icon: MessageCircle },
  { value: "phone", label: "전화", icon: Phone },
];

/**
 * MD 파트너 연락처(인스타/카카오 오픈채팅/공개 연락 수단) 설정.
 * 자주 안 바꾸는 값이라 MY 화면에서 설정으로 이동 (2026-07-20).
 * 실제 손님에게 보이는 공개 값은 PublicProfileView/MD 프로필 쪽에서 별도 렌더 — 여긴 편집 전용.
 */
export function PartnerContactSettings() {
  const { user, refetch } = useCurrentUser();
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [instagram, setInstagram] = useState("");
  const [kakaoUrl, setKakaoUrl] = useState("");
  const [preferredMethods, setPreferredMethods] = useState<ContactMethodType[]>([]);
  const [savingBusiness, setSavingBusiness] = useState(false);

  if (!user || (user.role !== "md" && user.role !== "admin")) return null;

  const handleEditBusiness = () => {
    setInstagram(user.instagram || "");
    setKakaoUrl(user.kakao_open_chat_url || "");
    setPreferredMethods(user.preferred_contact_methods || []);
    setIsEditingBusiness(true);
  };

  const handleSaveBusiness = async () => {
    const cleanInstagram = instagram.trim().replace(/^@/, "");
    if (!cleanInstagram) {
      toast.error("인스타그램 아이디를 입력해주세요");
      return;
    }
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanInstagram)) {
      toast.error("인스타그램 아이디 형식이 올바르지 않습니다");
      return;
    }
    if (kakaoUrl && !/^https:\/\/open\.kakao\.com\//.test(kakaoUrl)) {
      toast.error("카카오톡 오픈채팅 URL 형식이 올바르지 않습니다");
      return;
    }

    setSavingBusiness(true);
    try {
      const res = await fetch("/api/md/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram: cleanInstagram,
          kakao_open_chat_url: kakaoUrl.trim() || null,
          preferred_contact_methods: preferredMethods.length > 0 ? preferredMethods : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "저장에 실패했습니다");
      toast.success("파트너 정보가 저장되었습니다");
      setIsEditingBusiness(false);
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다");
    } finally {
      setSavingBusiness(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-bold text-foreground">파트너 정보</h2>
        {!isEditingBusiness ? (
          <button
            onClick={handleEditBusiness}
            className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
          >
            수정
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditingBusiness(false)}
              className="text-[13px] text-muted-foreground hover:text-foreground/80 transition-colors font-bold"
            >
              취소
            </button>
            <button
              onClick={handleSaveBusiness}
              disabled={savingBusiness}
              className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold disabled:opacity-50"
            >
              {savingBusiness ? "저장 중..." : "저장"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* 인스타그램 */}
        <div className="flex items-center gap-3">
          <Instagram className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="text-[11px] text-muted-foreground">인스타그램 *</p>
            {isEditingBusiness ? (
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[14px]">@</span>
                <input
                  type="text"
                  value={instagram.replace(/^@/, "")}
                  onChange={(e) =>
                    setInstagram(e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, ""))
                  }
                  maxLength={30}
                  placeholder="your_instagram_id"
                  className="w-full bg-muted border border-border rounded-lg pl-7 pr-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            ) : (
              <p className="text-[14px] text-foreground font-bold">@{user.instagram || "미설정"}</p>
            )}
          </div>
        </div>

        {/* 카카오 오픈채팅 */}
        {isEditingBusiness ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-bold text-[13px]">
                <MessageCircle className="w-4 h-4 text-money" />
                카카오 오픈채팅 URL
              </div>
              <KakaoOpenChatGuide />
            </div>
            <div className="bg-muted/50 border border-border rounded-2xl p-4 space-y-3">
              <input
                type="url"
                value={kakaoUrl}
                onChange={(e) => setKakaoUrl(e.target.value)}
                placeholder="https://open.kakao.com/o/..."
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-green-500 font-mono"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                방 만든 후 URL을 붙여넣어 주세요.<br />
                낙찰 고객에게만 공개됩니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground">카카오 오픈채팅</p>
              {user.kakao_open_chat_url ? (
                <a
                  href={user.kakao_open_chat_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-[#FEE500] text-[#3C1E1E] font-bold text-[13px] rounded-xl hover:bg-[#FDD835] transition-colors mt-1"
                >
                  카카오 오픈채팅 열기
                </a>
              ) : (
                <p className="text-[13px] text-muted-foreground">미설정</p>
              )}
            </div>
          </div>
        )}

        {/* 고객에게 표시할 연락 수단 */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">고객에게 표시할 연락 수단</p>
          {isEditingBusiness ? (
            <>
              <div className="flex flex-wrap gap-2">
                {CONTACT_METHOD_OPTIONS.map(({ value, label, icon: Icon }) => {
                  const isSelected = preferredMethods.includes(value);
                  const isDisabled = value === "kakao" && !kakaoUrl;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        setPreferredMethods((prev) =>
                          isSelected ? prev.filter((m) => m !== value) : [...prev, value]
                        );
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
                        isDisabled
                          ? "bg-card text-muted-foreground cursor-not-allowed"
                          : isSelected
                            ? "bg-inverse text-inverse-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                {preferredMethods.length === 0
                  ? "미선택 시 모든 연락 수단이 표시됩니다"
                  : "선택한 수단만 고객에게 표시됩니다"}
              </p>
            </>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(user.preferred_contact_methods?.length ?? 0) > 0
                ? user.preferred_contact_methods!.map((m) => {
                    const opt = CONTACT_METHOD_OPTIONS.find((o) => o.value === m);
                    if (!opt) return null;
                    const Icon = opt.icon;
                    return (
                      <span key={m} className="flex items-center gap-1 px-2.5 py-1 bg-muted rounded-full text-[11px] text-foreground/80 font-bold">
                        <Icon className="w-3 h-3" />
                        {opt.label}
                      </span>
                    );
                  })
                : <span className="text-[13px] text-muted-foreground">모든 수단 표시</span>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
