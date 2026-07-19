import { create } from "zustand";

/**
 * 와글 채팅 컴포저 포커스 상태 (크로스-트리 공유).
 *
 * 입력창 포커스 시 하단 BottomNav를 숨겨 채팅 공간을 확보하고 키보드와의 겹침을 줄인다.
 * (메신저 표준 UX) 블러되면 다시 노출.
 * - ChatRoom 컴포저: onFocus/onBlur로 setFocused
 * - BottomNav: focused면 렌더 안 함
 * - chat/page.tsx: focused면 네비 높이(56px) 차감 없이 확장
 */
interface ChatComposerStore {
  focused: boolean;
  setFocused: (v: boolean) => void;
}

export const useChatComposerStore = create<ChatComposerStore>((set) => ({
  focused: false,
  setFocused: (v) => set({ focused: v }),
}));
