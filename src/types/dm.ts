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

export interface DmThread {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: DmStatus;
  source: string;
  shot_id: string | null;
  created_at: string;
  accepted_at: string | null;
  last_message_at: string;
  /** 상대방 프로필 (목록/방 표시용) */
  counterpart?: DmCounterpart;
  /** 마지막 메시지 미리보기 (목록용) */
  last_message?: string | null;
}
