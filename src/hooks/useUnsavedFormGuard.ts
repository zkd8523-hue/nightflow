"use client";

import { useEffect, useState } from "react";

// 예약 폼(한국인/외국인 공통) 이탈 방지.
//
// 술을 하나라도 담은 뒤에 실수로 새로고침·탭 닫기로 폼이 통째로 날아가는
// 사고를 막는다(2026-09-06). "담기 전"까지는 막지 않는다 — 아직 입력한 게
// 없으면 잃을 것도 없어서, 여기서부터 막으면 그냥 구경하다 나가려는 손님까지
// 붙잡아 오히려 이탈처럼 느껴진다.
//
// 바깥 클릭·ESC·닫기(X) 버튼으로 시트가 닫히려는 시도는 모두 같은 방식으로
// 처리한다 — 무조건 막으면 "닫을 방법이 없다"는 사고가 나므로, 즉시 닫는
// 대신 confirmOpen을 true로 세워 확인 시트를 띄운다. 브라우저 기본
// window.confirm()은 이 앱 톤과 안 맞아서 쓰지 않는다(2026-09-06) — 호출한
// 쪽에서 "이어하기/닫기" 버튼이 있는 시트를 직접 그리고, 그 시트의 "닫기"가
// confirmDiscard를 부르면 실제로 onOpenChange(false)가 나가게 한다.
export function useUnsavedFormGuard(active: boolean) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!active) return;
    // beforeunload는 커스텀 문구를 못 띄우고 브라우저 기본 확인창만 뜬다
    // (모든 최신 브라우저 공통 제약 — returnValue를 세팅하는 것만으로 충분).
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  return {
    confirmOpen,
    // 닫으려는 시도를 가로챌지 결정한다. true를 반환하면 그 자리에서는
    // 닫지 않고 확인 시트를 띄운 것 — 호출부는 실제 onOpenChange(false)를
    // 보류해야 한다.
    interceptClose: () => {
      if (!active) return false;
      setConfirmOpen(true);
      return true;
    },
    closeConfirm: () => setConfirmOpen(false),
  };
}
