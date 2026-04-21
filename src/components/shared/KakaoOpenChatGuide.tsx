"use client";

import { useState } from "react";
import { ExternalLink, HelpCircle, X } from "lucide-react";
import { toast } from "sonner";

interface KakaoOpenChatGuideProps {
  suggestedTitle?: string;
}

export function KakaoOpenChatGuide({ suggestedTitle }: KakaoOpenChatGuideProps) {
  const [open, setOpen] = useState(false);

  const handleCreateOpenChat = async () => {
    if (suggestedTitle) {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(suggestedTitle);
          toast.success("추천 방 이름이 복사되었습니다!", {
            description: "카카오톡 앱에서 오픈채팅을 만들어주세요.",
            duration: 4000,
          });
        }
      } catch {
        // clipboard 실패 시 무시
      }
    }
    window.location.href = "kakaotalk://main";
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCreateOpenChat}
          className="flex items-center gap-1 text-[11px] text-amber-400 font-medium shrink-0 whitespace-nowrap hover:text-amber-300 transition-colors"
        >
          오픈채팅 만들기 <ExternalLink className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-[11px] text-neutral-400 underline underline-offset-2 hover:text-white transition-colors"
        >
          <HelpCircle className="w-3 h-3" />
          만드는 법
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-w-sm bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-5 space-y-4 text-[13px] text-neutral-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold text-white">오픈채팅 개설 &amp; 링크 복사 방법</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded bg-green-500/20 text-green-500 flex items-center justify-center font-bold shrink-0 mt-0.5 text-[11px]">1</div>
              <p className="leading-relaxed"><button type="button" onClick={handleCreateOpenChat} className="text-amber-400 underline underline-offset-2 hover:text-amber-300 transition-colors">오픈채팅 만들기</button> 버튼을 눌러 카카오톡을 엽니다.{suggestedTitle ? " (방 이름이 자동 복사됩니다)" : ""}</p>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded bg-green-500/20 text-green-500 flex items-center justify-center font-bold shrink-0 mt-0.5 text-[11px]">2</div>
              <p className="leading-relaxed">하단 가운데 <strong>오픈채팅</strong> 탭 ➔ 우측 상단 <strong>+</strong> 버튼 ➔ <strong>그룹 채팅방 만들기</strong>를 선택합니다.</p>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded bg-green-500/20 text-green-500 flex items-center justify-center font-bold shrink-0 mt-0.5 text-[11px]">3</div>
              <p className="leading-relaxed">방을 만든 후 우측 상단의 <strong>≡ (메뉴)</strong> ➔ <strong>공유 아이콘</strong>을 눌러 <strong>링크 복사</strong> 후 입력창에 붙여넣습니다.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
