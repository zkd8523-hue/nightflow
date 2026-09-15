"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { loadFormDraft, clearFormDraft } from "@/lib/utils/formDraft";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { makeT, type Lang } from "@/lib/i18n";

// 브라우저 히스토리로 진짜 "이전 화면"을 돌아간다.
//
// 예전엔 이게 <Link href={foreignHome}>이라 항상 외국인 홈으로 고정 이동했다.
// 폼 3장(연락처)까지 채운 손님이 눌러도 무조건 홈으로 튕겨나가 사실상 "취소"
// 버튼처럼 동작했다 — 클럽 상세에서 "Book at ○○"를 누르고 들어온 손님이라면
// 그 클럽 상세로, 폼 안에서 온 거라면 이전 상태로 돌아가야 자연스럽다.
//
// 히스토리가 없는 경우(북마크·직접 URL 진입 등)를 대비해 fallbackHref로 돌아간다.
//
// ForeignRequestForm은 술을 담는 순간부터 draftKey(nf_booking_draft_foreign)에
// 진행 중 입력을 저장한다 — 이 버튼은 그 폼과 별도 컴포넌트라 진행 상태를 직접
// 모르지만, draft 존재 여부로 "진행 중"을 그대로 판별할 수 있다. 예전엔 이 버튼이
// 그 상태를 몰라서 폼 안 X·바깥 닫기는 막아놓고 정작 Back은 그냥 다 날려버렸다
// (2026-09-06).
export function BackButton({
  label,
  fallbackHref,
  guardDraftKey,
  onBeforeLeave,
  lang = "en",
}: {
  label: string;
  fallbackHref: string;
  /** 진행 중 입력이 있는지 확인할 formDraft 키. 없으면 확인 없이 바로 나간다. */
  guardDraftKey?: string;
  /** 페이지 이동 전에 먼저 물어본다 — true를 반환하면 폼이 자체적으로 처리했다는
      뜻이라(예: 클럽 재선택 화면 → 목록으로 되돌림) 라우터 이동을 하지 않는다. */
  onBeforeLeave?: () => boolean;
  /** 확인 시트("작성 중인 내용이 사라져요")를 그릴 언어. 이 버튼은 외국인 트랙
   *  전용이라(한국어 트랙은 KoreanBookingForm이 자체 처리) 기본값 en. */
  lang?: Lang;
}) {
  const router = useRouter();
  const t = makeT(lang);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const leave = () => {
    if (onBeforeLeave?.()) return;
    // history.length는 탭 안에서 쌓인 엔트리 수 — 1이면 이 탭의 첫 페이지라
    // 뒤로 갈 곳이 없다(직접 링크로 들어온 경우).
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          if (guardDraftKey && loadFormDraft(guardDraftKey)) {
            setConfirmOpen(true);
            return;
          }
          leave();
        }}
        className="inline-flex items-center gap-1 -ml-1 mb-4 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
        <span className="text-[14px] font-bold">{label}</span>
      </button>

      {guardDraftKey && (
        <ConfirmDialog
          isOpen={confirmOpen}
          onOpenChange={setConfirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            clearFormDraft(guardDraftKey);
            leave();
          }}
          title={t("작성 중인 내용이 사라져요", "You'll lose what you've entered", "入力内容が消えます", "已填写的内容会消失", "已填寫的內容會消失")}
          description={t("정말 나가시겠어요?", "Are you sure you want to leave?", "本当に離れますか？", "确定要离开吗？", "確定要離開嗎？")}
          cancelText={t("이어하기", "Continue", "続ける", "继续", "繼續")}
          confirmText={t("닫기", "Leave", "閉じる", "关闭", "關閉")}
          variant="danger"
        />
      )}
    </>
  );
}
