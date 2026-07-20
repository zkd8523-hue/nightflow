"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Instagram, MessageCircle, ExternalLink, Pencil } from "lucide-react";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";
import type { User } from "@/types/database";

interface Props {
  user: User;
}

/**
 * MD 대시보드 내 연락처 카드.
 * 인스타그램 / 오픈채팅을 대시보드에서 바로 열고(=링크 열기) 수정할 수 있게 한다.
 * 저장은 /profile 과 동일하게 /api/md/profile PATCH 경유 (인스타 기반 slug 재생성 포함).
 */
export function MDContactCard({ user }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [instagram, setInstagram] = useState(user.instagram || "");
  const [kakaoUrl, setKakaoUrl] = useState(user.kakao_open_chat_url || "");

  const igHandle = user.instagram?.replace(/^@/, "") || null;
  const igUrl = igHandle ? `https://instagram.com/${igHandle}` : null;
  const openChatUrl = user.kakao_open_chat_url || null;

  const startEdit = () => {
    setInstagram(user.instagram || "");
    setKakaoUrl(user.kakao_open_chat_url || "");
    setEditing(true);
  };

  const handleSave = async () => {
    const cleanInstagram = instagram.trim().replace(/^@/, "");
    if (!cleanInstagram) {
      toast.error("인스타그램 아이디를 입력해주세요");
      return;
    }
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanInstagram)) {
      toast.error("인스타그램 아이디 형식이 올바르지 않습니다");
      return;
    }
    const cleanKakao = kakaoUrl.trim();
    if (cleanKakao && !/^https:\/\/open\.kakao\.com\//.test(cleanKakao)) {
      toast.error("카카오톡 오픈채팅 URL 형식이 올바르지 않습니다");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/md/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram: cleanInstagram,
          kakao_open_chat_url: cleanKakao || null,
          // 기존 선호 연락 수단은 유지 (대시보드에서는 인스타/오픈채팅만 편집)
          preferred_contact_methods: user.preferred_contact_methods,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "저장에 실패했습니다");
      toast.success("연락처가 저장되었습니다");
      setEditing(false);
      router.refresh();
    } catch (e: unknown) {
      logError(e, "MDContactCard.handleSave");
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 mt-3">
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-bold text-foreground">내 연락처</span>
          {!editing ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-3 h-3" />
              {igHandle || openChatUrl ? "수정" : "등록"}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="text-[12px] font-bold text-muted-foreground hover:text-foreground/80 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-[12px] font-bold text-brand-amber hover:text-brand-amber transition-colors disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            {/* 인스타그램 */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground mb-1.5">
                <Instagram className="w-3.5 h-3.5" />
                인스타그램 *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[14px]">@</span>
                <input
                  type="text"
                  value={instagram.replace(/^@/, "")}
                  onChange={(e) =>
                    setInstagram(e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, ""))
                  }
                  maxLength={30}
                  placeholder="your_instagram_id"
                  className="w-full bg-background border border-border rounded-xl pl-7 pr-3 py-2.5 text-[14px] text-foreground placeholder-neutral-600 focus:outline-none focus:border-border font-mono"
                />
              </div>
            </div>

            {/* 오픈채팅 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                  <MessageCircle className="w-3.5 h-3.5" />
                  카카오 오픈채팅
                </label>
                <KakaoOpenChatGuide />
              </div>
              <input
                type="url"
                value={kakaoUrl}
                onChange={(e) => setKakaoUrl(e.target.value)}
                placeholder="https://open.kakao.com/o/..."
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder-neutral-600 focus:outline-none focus:border-border font-mono"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                고객에게 연락 수단으로 표시됩니다. 방을 만든 뒤 링크를 붙여넣어 주세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {/* 인스타그램 열기 */}
            {igUrl ? (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-muted hover:bg-muted transition-colors text-[13px] font-bold text-foreground"
              >
                <Instagram className="w-4 h-4 text-pink-400" />
                <span className="truncate">@{igHandle}</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
              </a>
            ) : (
              <button
                onClick={startEdit}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-dashed border-border hover:border-border transition-colors text-[13px] font-bold text-muted-foreground"
              >
                <Instagram className="w-4 h-4" />
                인스타 등록
              </button>
            )}

            {/* 오픈채팅 열기 */}
            {openChatUrl ? (
              <a
                href={openChatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-muted hover:bg-muted transition-colors text-[13px] font-bold text-foreground"
              >
                <MessageCircle className="w-4 h-4 text-[#FEE500]" />
                <span>오픈채팅 등록됨</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
              </a>
            ) : (
              <button
                onClick={startEdit}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-dashed border-border hover:border-border transition-colors text-[13px] font-bold text-muted-foreground"
              >
                <MessageCircle className="w-4 h-4" />
                오픈채팅 등록
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
