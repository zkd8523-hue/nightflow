"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Instagram, MessageCircle, Mail, ChevronDown } from "lucide-react";
import { SupportChat } from "@/components/support/SupportChat";

export function ContactClient() {
  const router = useRouter();
  const [showOther, setShowOther] = useState(false);

  return (
    <div className="max-w-lg mx-auto h-dvh flex flex-col bg-background">
      {/* 헤더 */}
      <header className="shrink-0 flex items-center gap-2 px-3 py-3 border-b border-border">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-[16px] font-black text-foreground leading-tight">고객 문의</h1>
          <p className="text-[11px] text-muted-foreground">운영팀과 바로 대화하세요</p>
        </div>
      </header>

      {/* 채팅 */}
      <SupportChat />

      {/* 다른 문의 방법 (접이식) */}
      <div className="shrink-0 border-t border-border bg-background">
        <button
          onClick={() => setShowOther((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 text-[12px] text-muted-foreground hover:text-foreground/80 transition-colors"
        >
          다른 방법으로 문의
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${showOther ? "rotate-180" : ""}`}
          />
        </button>
        {showOther && (
          <div className="grid grid-cols-3 gap-2 px-3 pb-3">
            <a
              href="https://instagram.com/nightflow.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 py-3 rounded-xl bg-card text-foreground/80 hover:bg-muted transition-colors"
            >
              <Instagram className="w-5 h-5 text-pink-400" />
              <span className="text-[11px] font-bold">인스타 DM</span>
            </a>
            <a
              href="http://pf.kakao.com/_ilSqX"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 py-3 rounded-xl bg-card text-foreground/80 hover:bg-muted transition-colors"
            >
              <MessageCircle className="w-5 h-5 text-[#FEE500]" />
              <span className="text-[11px] font-bold">카카오 채널</span>
            </a>
            <a
              href="mailto:maddawids@gmail.com"
              className="flex flex-col items-center gap-1 py-3 rounded-xl bg-card text-foreground/80 hover:bg-muted transition-colors"
            >
              <Mail className="w-5 h-5 text-muted-foreground" />
              <span className="text-[11px] font-bold">이메일</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
