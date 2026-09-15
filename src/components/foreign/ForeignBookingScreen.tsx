"use client";

import { useRef } from "react";
import { BackButton } from "@/components/foreign/BackButton";
import { ForeignRequestForm, type ForeignRequestFormHandle } from "@/components/foreign/ForeignRequestForm";
import { FOREIGN_BOOKING_DRAFT_KEY } from "@/lib/utils/formDraft";
import type { Lang } from "@/lib/i18n";
import type { ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";

// BackButton과 ForeignRequestForm은 원래 각자 독립 컴포넌트였는데(page.tsx가 서버
// 컴포넌트라 상태를 못 가짐), 그래서 상단 "返回"가 폼 안의 화면 전환(클럽 선택 →
// 날짜/인원)을 전혀 몰랐다 — 클럽만 바꾸고 싶어도 router.back()이 그대로 폼 진입
// 이전 페이지(홈에서 곧장 들어온 경우 홈)로 나가버렸다. 둘을 여기 한 클라이언트
// 컴포넌트로 묶어, 폼이 ref로 "지금 뒤로가기를 내가 대신 처리해도 되는지"를
// 노출하고 BackButton이 라우터 이동 전에 그걸 먼저 물어보게 한다(2026-09-09).
export function ForeignBookingScreen({
  label,
  fallbackHref,
  userId,
  lang,
  countryCode,
  clubs,
  presetArea,
  presetClubId,
}: {
  label: string;
  fallbackHref: string;
  userId: string | null;
  lang: Lang;
  countryCode: string | null;
  clubs: ForeignClubDetail[];
  presetArea?: string;
  presetClubId?: string;
}) {
  const formRef = useRef<ForeignRequestFormHandle>(null);

  return (
    <>
      <BackButton
        label={label}
        fallbackHref={fallbackHref}
        guardDraftKey={FOREIGN_BOOKING_DRAFT_KEY}
        onBeforeLeave={() => formRef.current?.stepBack() ?? false}
        lang={lang}
      />
      <ForeignRequestForm
        ref={formRef}
        userId={userId}
        lang={lang}
        countryCode={countryCode}
        clubs={clubs}
        presetArea={presetArea}
        presetClubId={presetClubId}
      />
    </>
  );
}
