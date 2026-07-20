"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { PartnerContactSettings } from "@/components/settings/PartnerContactSettings";
import { ThemeToggle } from "@/components/settings/ThemeToggle";

const LINKS = [
  { href: "/faq", label: "자주 묻는 질문" },
  { href: "/contact", label: "고객 문의" },
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
];

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto bg-background min-h-dvh pb-24">
      <div className="flex items-center gap-2 px-3 py-3">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-xl font-black text-foreground">설정</h1>
      </div>

      <div className="px-4">
        {/* 파트너 정보 (인스타/카카오 오픈채팅) — MD/admin만 노출, PartnerContactSettings 내부에서 가드 */}
        <PartnerContactSettings />

        {/* 화면 테마 — "알림" 섹션과 라벨이 섞이지 않도록 별도 섹션으로 분리 */}
        <ThemeToggle />

        {/* 알림 설정 — 인라인 노출 */}
        <h2 className="text-[13px] font-bold text-muted-foreground mb-2 px-1">알림</h2>
        <NotificationSettings />

        {/* 기타 메뉴 */}
        <h2 className="text-[13px] font-bold text-muted-foreground mt-6 mb-2 px-1">
          더보기
        </h2>
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {LINKS.map((it, i) => (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors ${
                i < LINKS.length - 1 ? "border-b border-border/50" : ""
              }`}
            >
              <span className="text-[14px] text-foreground/80">{it.label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          ))}
        </div>

        <Link
          href="/profile/delete"
          className="block text-center text-[12px] text-muted-foreground mt-6 hover:text-red-400 transition-colors"
        >
          회원탈퇴
        </Link>
      </div>
    </div>
  );
}
