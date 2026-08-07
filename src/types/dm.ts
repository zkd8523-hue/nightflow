import type { ChatMediaItem } from "@/types/database";

export type DmStatus = "pending" | "accepted" | "declined";

export interface DmMessage {
  /** 인용 답글 대상 (Migration 472) */
  reply_to?: string | null;
  id: string;
  thread_id: string;
  sender_id: string;
  content: string | null;
  media: ChatMediaItem[];
  is_deleted: boolean;
  read_at: string | null;
  created_at: string;
}

export interface DmCounterpart {
  id: string;
  display_name: string | null;
  profile_image: string | null;
}

/** DM이 시작된 파티(깃발/조각) 컨텍스트 — 메시지함 그룹핑용 (Migration 535) */
export interface DmPuzzleContext {
  id: string;
  area: string;
  event_date: string;
  status: string;
  is_recruiting_party: boolean;
  budget_per_person: number;
  total_budget: number | null;
}

export interface DmThread {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: DmStatus;
  source: string;
  shot_id: string | null;
  /** 마지막으로 이 DM을 촉발한 파티 (Migration 535) */
  context_puzzle_id: string | null;
  created_at: string;
  accepted_at: string | null;
  last_message_at: string;
  /** 상대방 프로필 (목록/방 표시용) */
  counterpart?: DmCounterpart;
  /** 마지막 메시지 미리보기 (목록용) */
  last_message?: string | null;
  /** 안읽은 메시지 개수 (Migration 484 · 카톡식 N 뱃지) */
  unread_count?: number;
  /** context_puzzle_id 조인 결과 (목록 그룹핑용, Migration 535) */
  puzzle?: DmPuzzleContext | null;
}
