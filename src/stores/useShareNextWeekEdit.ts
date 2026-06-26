import { create } from "zustand";

// 조각 "다음 주 설정" 토글 상태 — ShareSlotBoard(버튼)와 ShareWeekdayPlanBoard(요일표)가 공유.
// 클럽 단위로 관리(MD는 주당 1클럽이지만 admin/테스트 다중 대비).
interface ShareNextWeekEditState {
  // clubId → 다음 주 편집 모드 여부
  editingByClub: Record<string, boolean>;
  // clubId → 다음 주 슬롯 id (선점됐을 때만, 없으면 null)
  slotByClub: Record<string, string | null>;
  setEditing: (clubId: string, v: boolean) => void;
  toggle: (clubId: string) => void;
  setSlot: (clubId: string, slotId: string | null) => void;
}

export const useShareNextWeekEdit = create<ShareNextWeekEditState>((set) => ({
  editingByClub: {},
  slotByClub: {},
  setEditing: (clubId, v) =>
    set((s) => ({ editingByClub: { ...s.editingByClub, [clubId]: v } })),
  toggle: (clubId) =>
    set((s) => ({ editingByClub: { ...s.editingByClub, [clubId]: !s.editingByClub[clubId] } })),
  setSlot: (clubId, slotId) =>
    set((s) => {
      // 슬롯이 사라지면(해제) 편집 모드도 해제
      const editingByClub = slotId
        ? s.editingByClub
        : { ...s.editingByClub, [clubId]: false };
      return { slotByClub: { ...s.slotByClub, [clubId]: slotId }, editingByClub };
    }),
}));
