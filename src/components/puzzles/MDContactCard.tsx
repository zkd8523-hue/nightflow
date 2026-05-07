"use client";

import { Instagram, Phone, MessageCircle, ChevronRight } from "lucide-react";
import type { ContactMethodType, PublicUserProfile } from "@/types/database";

type MDContactInfo = Pick<PublicUserProfile,
  "instagram" | "phone" | "kakao_open_chat_url" | "preferred_contact_methods"
>;

interface MDContactCardProps {
  md: MDContactInfo;
  /** 액션 트래킹용 콜백 (선택) */
  onContactClick?: (method: ContactMethodType) => void;
}

function extractInstagramHandle(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http")) {
    const match = trimmed.match(/instagram\.com\/([^/?#]+)/i);
    return match ? match[1] : trimmed;
  }
  return trimmed.replace(/^@/, "");
}

function normalizeInstagram(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http")) return trimmed;
  return `https://instagram.com/${trimmed.replace(/^@/, "")}`;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

export function MDContactCard({ md, onContactClick }: MDContactCardProps) {
  const methods = md.preferred_contact_methods;
  // null 또는 빈 배열 = 모든 수단 표시 (MDApplyForm UI 시맨틱과 일치)
  const showAll = !methods || methods.length === 0;

  const showDm    = (showAll || methods!.includes("dm"))    && !!md.instagram;
  const showPhone = (showAll || methods!.includes("phone")) && !!md.phone;
  const showKakao = (showAll || methods!.includes("kakao")) && !!md.kakao_open_chat_url;

  return (
    <div className="space-y-2">
      {showDm && md.instagram && (
        <a
          href={normalizeInstagram(md.instagram)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onContactClick?.("dm")}
          className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 active:bg-neutral-800 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-pink-500/15 flex items-center justify-center flex-shrink-0">
              <Instagram className="w-4 h-4 text-pink-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-neutral-500 uppercase">인스타그램 DM</p>
              <p className="text-[14px] font-bold text-white truncate">
                @{extractInstagramHandle(md.instagram)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[12px] font-bold text-white flex-shrink-0">
            열기
            <ChevronRight className="w-4 h-4" />
          </div>
        </a>
      )}

      {showKakao && md.kakao_open_chat_url && (
        <a
          href={md.kakao_open_chat_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onContactClick?.("kakao")}
          className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 active:bg-neutral-800 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-neutral-500 uppercase">카카오 오픈채팅</p>
              <p className="text-[14px] font-bold text-white truncate">MD 채팅방 입장</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[12px] font-bold text-white flex-shrink-0">
            입장
            <ChevronRight className="w-4 h-4" />
          </div>
        </a>
      )}

      {showPhone && md.phone && (
        <a
          href={`tel:${md.phone}`}
          onClick={() => onContactClick?.("phone")}
          className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 active:bg-neutral-800 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
              <Phone className="w-4 h-4 text-green-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-neutral-500 uppercase">전화</p>
              <p className="text-[14px] font-bold text-white truncate">
                {formatPhone(md.phone)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[12px] font-bold text-white flex-shrink-0">
            전화
            <ChevronRight className="w-4 h-4" />
          </div>
        </a>
      )}
    </div>
  );
}
