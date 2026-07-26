"use client";

import { useEffect, useState } from "react";
import { useChatComposerStore } from "@/stores/useChatComposerStore";

/**
 * 채팅 입력창 포커스 시 하단 네비를 숨기는 공용 훅 (와글 ChatRoom 패턴을 공용화).
 *
 * - 숨김은 "가상 키보드가 화면을 먹는" 터치 기기에서만. 데스크톱 웹은 키보드가
 *   화면을 가리지 않으므로 숨기면 나갈 방법만 사라진다.
 * - 언마운트 시 포커스 상태를 리셋 → 다른 화면에서 네비 숨김이 남지 않게.
 *
 * focused는 컨테이너 높이 계산(네비 56px 차감 여부)에도 쓴다.
 */
export function useComposerNavHide() {
  const focused = useChatComposerStore((s) => s.focused);
  const setFocused = useChatComposerStore((s) => s.setFocused);

  useEffect(() => () => setFocused(false), [setFocused]);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  }, []);

  return {
    focused,
    onFocus: () => {
      if (isTouchDevice) setFocused(true);
    },
    onBlur: () => setFocused(false),
  };
}
