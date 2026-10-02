"use client";

import { MessageCircle, Instagram, Mail } from "lucide-react";
import { type Lang, makeT } from "@/lib/i18n";
import { trackForeignEvent } from "@/lib/analytics/events";

// 외국인 "문의하기" 채널 — 예약 폼 2단계와 외국어 홈 하단이 같이 쓴다(2026-10-02, 운영자 지정).
// 번호·주소는 화면에 띄우지 않고 아이콘 버튼만 둔다. WhatsApp은 env(NEXT_PUBLIC_WHATSAPP_NUMBER)가
// 아니라 이 상수를 쓴다 — env를 채우면 접수 완료 화면 "이어가기"와 홈 가격 카드까지 WhatsApp으로
// 바뀌므로 그건 따로 결정한다.
export const CONTACT_INSTAGRAM = "nightflow.kr";
export const CONTACT_EMAIL = "maddawids@gmail.com";
export const CONTACT_WHATSAPP = "821022051052";

export function ContactButtons({
  lang,
  message,
  source,
  step,
}: {
  lang: Lang;
  /** WhatsApp·이메일 본문에 미리 채울 문장. 인스타 DM은 미리 채우기가 안 된다. */
  message: string;
  /** 계측용 — 어느 화면에서 눌렀는지(form·home). */
  source: string;
  step?: number;
}) {
  const t = makeT(lang);
  const subject = t("테이블 예약 문의", "Table booking question", "テーブル予約の相談", "订卡座咨询", "訂包廂諮詢");
  const items = [
    {
      key: "whatsapp",
      href: `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(message)}`,
      icon: <MessageCircle className="w-6 h-6 text-[#25D366]" />,
      label: "WhatsApp",
      external: true,
    },
    {
      key: "instagram",
      href: `https://ig.me/m/${CONTACT_INSTAGRAM}`,
      icon: <Instagram className="w-6 h-6 text-foreground" />,
      label: "Instagram",
      external: true,
    },
    {
      key: "email",
      href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
      icon: <Mail className="w-6 h-6 text-foreground" />,
      label: t("이메일", "Email", "メール", "邮箱", "信箱"),
      external: false,
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((c) => (
        <a
          key={c.key}
          href={c.href}
          {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          onClick={() => trackForeignEvent("foreign_chat_click", { lang, channel: c.key, source, step: step ?? null })}
          className="h-[72px] rounded-xl bg-muted border border-border flex flex-col items-center justify-center gap-1.5 hover:border-amber-500/50 transition-colors"
        >
          {c.icon}
          <span className="text-[12px] font-bold text-foreground">{c.label}</span>
        </a>
      ))}
    </div>
  );
}

/** 외국어 홈 하단용 카드 — 제목 + 아이콘 버튼. */
export function ContactCard({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const message = t(
    "안녕하세요! 한국 클럽 테이블 예약 문의드려요.",
    "Hi! I'd like to ask about booking a club table in Korea.",
    "こんにちは！韓国のクラブのテーブル予約について相談したいです。",
    "你好！想咨询一下韩国夜店订卡座。",
    "你好！想詢問一下韓國夜店訂包廂。"
  );
  return (
    <div className="mx-4 my-4 rounded-2xl bg-card border border-border p-4 space-y-3">
      <p className="text-[15px] font-black text-foreground">{t("문의하기", "Contact us", "お問い合わせ", "联系我们", "聯絡我們")}</p>
      <ContactButtons lang={lang} message={message} source="home" />
    </div>
  );
}
