"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { ClubDetailSheet } from "@/components/clubs/ClubDetailSheet";

/**
 * 호 본문 전체가 공유하는 클럽 상세 시트 — **한 호에 시트는 하나만** 둔다.
 *
 * 줄마다 ClubDetailSheet 를 들고 있으면, 다른 줄을 눌러도 앞 시트가 닫히지 않아
 * 시트가 겹쳐 쌓인다(실제 버그로 확인됨: 클럽 줄 + 쿠폰 + 간판까지 네 개가 겹쳐
 * 뒤 시트가 영영 안 보이는 상태가 됐다). 여는 쪽은 clubId 만 넘기고, 열고 닫는
 * 상태는 여기 한 곳이 갖는다 — 새 clubId 로 열면 앞엣것은 자연히 교체된다.
 */
const Ctx = createContext<(clubId: string, opts?: { coupons?: boolean }) => void>(() => {});

export function useClubSheet() {
  return useContext(Ctx);
}

export function ClubSheetProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<{ id: string; coupons?: boolean } | null>(null);
  const open = useCallback(
    (id: string, opts?: { coupons?: boolean }) => setTarget({ id, coupons: opts?.coupons }),
    []
  );

  return (
    <Ctx.Provider value={open}>
      {children}
      <ClubDetailSheet
        clubId={target?.id ?? null}
        query={target?.coupons ? "coupons=1" : undefined}
        onClose={() => setTarget(null)}
      />
    </Ctx.Provider>
  );
}
