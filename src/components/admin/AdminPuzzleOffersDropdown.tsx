"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, BadgeCheck, Flame, Instagram, MessageCircle, Phone } from "lucide-react";

interface OfferData {
  id: string;
  status: string;
  table_type: string;
  proposed_price: number;
  includes: string[];
  comment: string | null;
  club: { name?: string; area?: string } | null;
  md: {
    id?: string;
    display_name?: string;
    md_deal_count?: number;
    instagram?: string | null;
    kakao_open_chat_url?: string | null;
    phone?: string | null;
  } | null;
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

interface Props {
  offers: OfferData[];
}

const OFFER_STATUS_LABEL: Record<string, string> = {
  pending: "제안 중",
  accepted: "수락됨",
};

const OFFER_STATUS_COLOR: Record<string, string> = {
  pending: "bg-green-500/20 text-green-400",
  accepted: "bg-amber-500/20 text-amber-400",
};

export function AdminPuzzleOffersDropdown({ offers }: Props) {
  const [open, setOpen] = useState(false);

  if (offers.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] font-bold text-neutral-500">제안 0건</p>
        <p className="text-[12px] text-neutral-700 italic">아직 제안 없음</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-1 group"
      >
        <p className="text-[12px] font-bold text-neutral-400 group-hover:text-white transition-colors">
          제안 {offers.length}건
        </p>
        <ChevronDown
          className={`w-4 h-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-2">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className={`rounded-xl border p-3.5 space-y-2 ${
                offer.status === "accepted"
                  ? "bg-amber-500/5 border-amber-500/30"
                  : "bg-neutral-900/50 border-neutral-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-black text-white">
                    {offer.club?.name || "클럽 미상"}
                    {offer.club?.area && (
                      <span className="text-neutral-500 font-medium"> · {offer.club.area}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-neutral-500">{offer.table_type}</p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    OFFER_STATUS_COLOR[offer.status] || "bg-neutral-700 text-neutral-400"
                  }`}
                >
                  {OFFER_STATUS_LABEL[offer.status] || offer.status}
                </span>
              </div>

              <p className="text-[15px] font-black text-green-400">
                {offer.proposed_price.toLocaleString()}원
              </p>

              {offer.includes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {offer.includes.map((inc) => (
                    <span
                      key={inc}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700"
                    >
                      {inc}
                    </span>
                  ))}
                </div>
              )}

              {offer.comment && (
                <p className="text-[11px] text-neutral-400 italic">"{offer.comment}"</p>
              )}

              {offer.md?.display_name && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800/60 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {offer.md.id ? (
                      <Link
                        href={`/admin/mds/${offer.md.id}`}
                        className="text-[11px] text-white font-bold underline decoration-neutral-600 underline-offset-2 hover:decoration-white transition-colors"
                      >
                        {offer.md.display_name}
                      </Link>
                    ) : (
                      <p className="text-[11px] text-neutral-300 font-bold">{offer.md.display_name}</p>
                    )}
                    {offer.md.md_deal_count != null && offer.md.md_deal_count >= 3 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-neutral-500">
                        {offer.md.md_deal_count >= 30 ? (
                          <Flame className="w-3 h-3 text-orange-500" />
                        ) : (
                          <BadgeCheck className="w-3 h-3 text-blue-400" />
                        )}
                        거래 {offer.md.md_deal_count}회
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {offer.md.instagram && (
                      <a
                        href={normalizeInstagram(offer.md.instagram)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-pink-500/10 border border-pink-500/30 text-pink-300 text-[10px] font-bold hover:bg-pink-500/20 transition-colors"
                      >
                        <Instagram className="w-3 h-3" />
                        @{extractInstagramHandle(offer.md.instagram)}
                      </a>
                    )}
                    {offer.md.kakao_open_chat_url && (
                      <a
                        href={offer.md.kakao_open_chat_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-[10px] font-bold hover:bg-yellow-500/20 transition-colors"
                      >
                        <MessageCircle className="w-3 h-3" />
                        카카오
                      </a>
                    )}
                    {offer.md.phone && (
                      <a
                        href={`tel:${offer.md.phone}`}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 transition-colors"
                      >
                        <Phone className="w-3 h-3" />
                        {formatPhone(offer.md.phone)}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
