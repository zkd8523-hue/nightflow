"use client";

import { Instagram, Phone, MessageCircle, MapPin, ChevronRight } from "lucide-react";

/** 채팅 메시지 content 인코딩: "__CONTACT__:{method}:{value}" (address는 "클럽명||주소") */
const PREFIX = "__CONTACT__:";

export type ContactCardMethod = "dm" | "kakao" | "phone" | "address";

export function isContactCardContent(content: string): boolean {
  return content.startsWith(PREFIX);
}

export function encodeContactCard(method: ContactCardMethod, value: string): string {
  return `${PREFIX}${method}:${value}`;
}

function decodeContactCard(content: string): { method: ContactCardMethod; value: string } | null {
  const rest = content.slice(PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep < 0) return null;
  const method = rest.slice(0, sep) as ContactCardMethod;
  const value = rest.slice(sep + 1);
  if (!value || !["dm", "kakao", "phone", "address"].includes(method)) return null;
  return { method, value };
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

/** 채팅 안에서 탭 가능한 연락처/위치 카드 — 인스타/카톡/전화/지도로 즉시 이동 */
export function ContactCardMessage({ content }: { content: string }) {
  const decoded = decodeContactCard(content);
  if (!decoded) return null;
  const { method, value } = decoded;

  const config = (() => {
    switch (method) {
      // dm의 value는 항상 순수 handle(앞의 @ 없음)로 인코딩됨 (encodeContactCard 호출부에서 보장)
      case "dm":
        return {
          href: `https://instagram.com/${value.replace(/^@/, "")}`,
          icon: Instagram,
          iconBg: "bg-pink-500/15",
          iconColor: "text-pink-400",
          caption: "인스타그램",
          title: `@${value.replace(/^@/, "")}`,
          cta: "열기",
          external: true,
        };
      case "kakao":
        return {
          href: value,
          icon: MessageCircle,
          iconBg: "bg-yellow-500/15",
          iconColor: "text-yellow-400",
          caption: null,
          title: "카카오 오픈채팅",
          cta: "입장",
          external: true,
        };
      case "phone":
        return {
          href: `tel:${value}`,
          icon: Phone,
          iconBg: "bg-green-500/15",
          iconColor: "text-money",
          caption: "전화",
          title: formatPhone(value),
          cta: "전화",
          external: false,
        };
      case "address": {
        // value = "클럽명||주소" (주소 없으면 클럽명으로 검색)
        const [clubName, address] = value.split("||");
        return {
          href: `https://map.naver.com/v5/search/${encodeURIComponent(address || clubName)}`,
          icon: MapPin,
          iconBg: "bg-blue-500/15",
          iconColor: "text-blue-400",
          caption: "위치",
          title: clubName || "지도에서 보기",
          cta: "지도 열기",
          external: true,
        };
      }
    }
  })();

  const Icon = config.icon;

  return (
    <a
      href={config.href}
      target={config.external ? "_blank" : undefined}
      rel={config.external ? "noopener noreferrer" : undefined}
      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border active:bg-muted transition-colors min-w-[220px]"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-full ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${config.iconColor}`} />
        </div>
        <div className="min-w-0">
          {config.caption && (
            <p className="text-[11px] font-bold text-muted-foreground uppercase">{config.caption}</p>
          )}
          <p className="text-[14px] font-bold text-foreground truncate">{config.title}</p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-foreground flex-shrink-0" />
    </a>
  );
}
