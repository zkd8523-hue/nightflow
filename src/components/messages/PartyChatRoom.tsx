"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AtSign, ChevronDown, ChevronRight, CornerDownRight, Send, SmilePlus, ThumbsDown, ThumbsUp, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadChatMedia } from "@/lib/utils/uploadChatMedia";
import { ChatMediaGrid } from "@/components/chat/ChatMediaGrid";
import { ChatAttachMenu } from "@/components/chat/ChatAttachMenu";
import { ChatContentText } from "@/components/chat/ChatContentText";
import { usePartyMessages } from "@/hooks/usePartyMessages";
import { usePartyOffers } from "@/hooks/usePartyOffers";
import { usePartyReactions } from "@/hooks/usePartyReactions";
import { CHAT_REACTION_EMOJIS, type ChatReactionEmoji } from "@/types/database";
import type { ChatMediaItem, PartyMessage, PartyParticipant } from "@/types/database";

const MAX_LEN = 500;

interface Me {
  id: string;
  display_name: string | null;
  profile_image: string | null;
}

interface PartyInfo {
  dateLabel: string;
  area: string;
  perPerson: number;
  currentCount: number;
  targetCount: number;
}

interface Props {
  puzzleId: string;
  me: Me;
  isLeader: boolean;
  isMd?: boolean;
  /** MD가 상담(크레딧 사용)에 이미 동의했는지. false면 입장 시 동의 모달 노출 */
  mdConsented?: boolean;
  puzzleStatus: string;
  partyInfo: PartyInfo;
  participants: PartyParticipant[];
}

// 조각 매치 크레딧 정액 (Migration 358 / OfferSheet와 일치)
const PARTY_MATCH_CREDIT_COST = 10;

// 첫 진입 인사말 추천 (한 번이라도 보내면 사라짐)
const GREETING_PRESETS = [
  "안녕하세요! 반가워요 😊",
  "오늘 잘 부탁드려요 🙌",
  "다들 몇 시에 만날까요?",
  "어디서 모일까요?",
  "기대돼요 🔥",
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isSameMinute(a: Date, b: Date) {
  return isSameDay(a, b) && a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
}
function formatTime(d: Date) {
  const h = d.getHours();
  const h12 = h % 12 || 12;
  return `${h < 12 ? "오전" : "오후"} ${h12}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function formatDateDivider(d: Date) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

export function PartyChatRoom({
  puzzleId,
  me,
  isLeader,
  isMd = false,
  mdConsented = false,
  puzzleStatus,
  partyInfo,
  participants: initialParticipants,
}: Props) {
  const router = useRouter();
  const { messages, loading, readMap, addLocalMessage, removeLocalMessage } = usePartyMessages(puzzleId);
  const { offers, vote, reload: reloadOffers } = usePartyOffers(puzzleId);
  const reactableIds = useMemo(
    () => messages.filter((m) => !m.is_system && !m.is_deleted).map((m) => m.id),
    [messages]
  );
  const { summaries, toggle: toggleReaction } = usePartyReactions(puzzleId, reactableIds, me.id);

  const [participants, setParticipants] = useState<PartyParticipant[]>(initialParticipants);
  const [offersOpen, setOffersOpen] = useState(false);
  // MD 입장 동의(크레딧 사용) 상태. 미동의면 상담 시작 모달을 띄우고 채팅 차단.
  const [consented, setConsented] = useState(mdConsented);
  const [consentBusy, setConsentBusy] = useState(false);
  const [declineConfirm, setDeclineConfirm] = useState(false);
  const showConsentGate = isMd && !consented;

  async function handleStartConsult() {
    setConsentBusy(true);
    const { data, error } = await createClient().rpc("start_party_consultation", { p_puzzle_id: puzzleId });
    setConsentBusy(false);
    if (error || (data && !(data as { success?: boolean }).success)) {
      toast.error((data as { error?: string })?.error ?? "상담을 시작하지 못했어요");
      return;
    }
    setConsented(true);
    toast.success(`매치 크레딧 ${PARTY_MATCH_CREDIT_COST}개를 사용해 상담을 시작했어요`);
  }

  async function handleDeclineConsult() {
    setConsentBusy(true);
    const { data, error } = await createClient().rpc("decline_party_consultation", { p_puzzle_id: puzzleId });
    setConsentBusy(false);
    if (error || (data && !(data as { success?: boolean }).success)) {
      toast.error((data as { error?: string })?.error ?? "처리하지 못했어요");
      setDeclineConfirm(false);
      return;
    }
    toast.success("상담을 거절했어요. 오퍼가 철회됐어요");
    router.push(`/flags/${puzzleId}`);
  }
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  // 롱프레스 → 리액션/답글 메뉴
  const [menuMsg, setMenuMsg] = useState<PartyMessage | null>(null);
  const [replyTarget, setReplyTarget] = useState<PartyMessage | null>(null);
  // 방에서 내보내진 상태 (전송 시 참여자 아님 감지)
  const [removed, setRemoved] = useState(false);

  async function handleDeleteMessage(m: PartyMessage) {
    setMenuMsg(null);
    if (typeof window !== "undefined" && !window.confirm("이 메시지를 삭제할까요?")) return;
    removeLocalMessage(m.id);
    const { data, error } = await createClient().rpc("delete_party_message", { p_message_id: m.id });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "삭제에 실패했어요");
    }
  }
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function startPress(m: PartyMessage) {
    if (m.is_system || m.is_deleted) return;
    cancelPress();
    pressTimer.current = setTimeout(() => setMenuMsg(m), 400);
  }
  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  async function handleInvite(offerId: string) {
    if (invitingId) return;
    setInvitingId(offerId);
    const { data, error } = await createClient().rpc("invite_md_to_party", {
      p_puzzle_id: puzzleId,
      p_offer_id: offerId,
    });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "초대에 실패했어요");
      setInvitingId(null);
      return;
    }
    toast.success("파트너를 단체채팅에 초대했어요");
    reloadOffers();
    setInvitingId(null);
  }

  async function handleReleaseMd() {
    if (releasing) return;
    if (typeof window !== "undefined" &&
        !window.confirm("상담 중인 파트너를 내보낼까요?\n다른 파트너를 초대하려면 먼저 내보내야 해요.")) return;
    setReleasing(true);
    const { data, error } = await createClient().rpc("release_party_md", {
      p_puzzle_id: puzzleId,
    });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "내보내기에 실패했어요");
      setReleasing(false);
      return;
    }
    toast.success("파트너 상담을 종료했어요");
    reloadOffers();
    setReleasing(false);
  }

  // 오퍼를 채팅에 공유 ("이거 어때요?")
  async function handleShareOffer(offerId: string) {
    const { data, error } = await createClient().rpc("share_offer_to_party", {
      p_puzzle_id: puzzleId,
      p_offer_id: offerId,
    });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "공유에 실패했어요");
      return;
    }
    if (data.message_id) {
      addLocalMessage({
        id: data.message_id,
        puzzle_id: puzzleId,
        sender_id: me.id,
        content: "이거 어때요? 👀",
        media: [],
        is_system: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        shared_offer_id: offerId,
        sender: me,
      });
    }
    setOffersOpen(false);
  }
  const [input, setInput] = useState("");
  const [media, setMedia] = useState<ChatMediaItem[]>([]);
  const [sending, setSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 추방(내보내기)
  const [kickTarget, setKickTarget] = useState<PartyParticipant | null>(null);
  const [kickReason, setKickReason] = useState("");
  const [kicking, setKicking] = useState(false);

  async function handleKick() {
    if (!kickTarget || kicking) return;
    setKicking(true);
    const { data, error } = await createClient().rpc("kick_party_member", {
      p_puzzle_id: puzzleId,
      p_user_id: kickTarget.id,
      p_reason: kickReason.trim() || null,
    });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "내보내기에 실패했어요");
      setKicking(false);
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.id !== kickTarget.id));
    toast.success(`${kickTarget.display_name ?? "멤버"}님을 내보냈어요`);
    setKickTarget(null);
    setKickReason("");
    setKicking(false);
  }
  const bottomRef = useRef<HTMLDivElement>(null);

  // 만료(expired)는 채팅을 막지 않음 — 오퍼는 마감돼도 "그날 밤 만나는" 파티는
  // 이벤트 당일/직후에 계속 대화해야 함(get_party_chats도 최근 expired는 목록 유지).
  // 방장이 내린 cancelled만 읽기 전용.
  const readOnly = puzzleStatus === "cancelled";

  // 입장/새 메시지 시 읽음 처리
  useEffect(() => {
    if (loading) return;
    createClient().rpc("mark_party_read", { p_puzzle_id: puzzleId });
  }, [puzzleId, loading, messages.length]);

  // 스크롤 맨 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const slots = Math.max(0, 4 - media.length);
    const uploaded = (
      await Promise.all(files.slice(0, slots).map((f) => uploadChatMedia(f, me.id)))
    ).filter(Boolean) as ChatMediaItem[];
    if (uploaded.length) setMedia((prev) => [...prev, ...uploaded].slice(0, 4));
  }

  // 내 위치 — 첨부 미리보기에 담지 않고 바로 전송 (DmRoom과 동일)
  async function handleLocation(item: ChatMediaItem) {
    if (sending || readOnly) return;
    const { data, error } = await createClient().rpc("send_party_message", {
      p_puzzle_id: puzzleId,
      p_content: "",
      p_media: [item],
      p_reply_to: null,
    });
    if (error || !data?.success) {
      toast.error(data?.error || "위치를 보내지 못했어요");
    }
  }

  const handleSend = useCallback(async (textOverride?: string) => {
    const isPreset = typeof textOverride === "string";
    const trimmed = (isPreset ? textOverride : input).trim();
    const useMedia = isPreset ? [] : media;
    if (sending || readOnly) return;
    if (trimmed.length < 1 && useMedia.length === 0) return;
    if (trimmed.length > MAX_LEN) {
      toast.error(`${MAX_LEN}자를 넘을 수 없어요`);
      return;
    }

    setSending(true);
    const supabase = createClient();
    const sentContent = trimmed;
    const sentMedia = useMedia;
    const replyToId = replyTarget?.id ?? null;
    if (!isPreset) {
      setInput("");
      setMedia([]);
    }
    setReplyTarget(null);

    const { data, error } = await supabase.rpc("send_party_message", {
      p_puzzle_id: puzzleId,
      p_content: sentContent,
      p_media: sentMedia,
      p_reply_to: replyToId,
    });

    if (error || !data?.success) {
      // 내보내진 뒤 방을 열어둔 상태 → 안내 + 잠금
      if (typeof data?.error === "string" && data.error.includes("참여자가 아닙니다")) {
        setRemoved(true);
        setInput("");
        setMedia([]);
        toast.error("이 조각에서 나가게 되어 더 이상 참여할 수 없어요");
        setSending(false);
        return;
      }
      if (!isPreset) {
        setInput(sentContent);
        setMedia(sentMedia);
      }
      toast.error(data?.error || error?.message || "전송에 실패했어요");
      setSending(false);
      return;
    }

    if (data.message_id) {
      const local: PartyMessage = {
        id: data.message_id,
        puzzle_id: puzzleId,
        sender_id: me.id,
        content: sentContent,
        media: sentMedia,
        is_system: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        reply_to: replyToId,
        sender: me,
      };
      addLocalMessage(local);
    }
    setSending(false);
  }, [input, media, sending, readOnly, puzzleId, me, addLocalMessage, replyTarget]);

  const shownMessages = messages.filter((m) => !m.is_deleted);
  const msgById = useMemo(() => {
    const map = new Map<string, PartyMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // 인용(답글) 박스 — 원본 메시지 미리보기
  const renderQuoted = (m: PartyMessage) => {
    if (!m.reply_to) return null;
    const parent = msgById.get(m.reply_to);
    if (!parent) return null;
    const name = parent.is_system
      ? "안내"
      : parent.sender_id === me.id
        ? "나"
        : parent.sender?.display_name ?? "멤버";
    const preview = parent.content || (parent.media?.length ? "사진" : "");
    return (
      <div className="mb-1 pl-2 border-l-2 border-white/30 opacity-80">
        <p className="text-[11px] font-bold truncate">{name}</p>
        <p className="text-[11px] opacity-80 truncate max-w-[200px]">{preview}</p>
      </div>
    );
  };

  // 공유된 오퍼 카드 ("이거 어때요?")
  const renderSharedOffer = (m: PartyMessage, mine: boolean) => {
    if (!m.shared_offer_id) return null;
    // MD에겐 경쟁 오퍼 내용 마스킹 (시크릿오퍼 유지)
    if (isMd) {
      return (
        <div className={`mt-1.5 rounded-xl border px-3 py-2 max-w-[240px] ${mine ? "border-black/15 bg-black/5" : "border-white/15 bg-white/5"}`}>
          <p className="text-[12px] opacity-70">오퍼가 공유됐어요</p>
        </div>
      );
    }
    const o = offers.find((x) => x.offer_id === m.shared_offer_id);
    return (
      <div className={`mt-1.5 rounded-xl border px-3 py-2 max-w-[240px] ${mine ? "border-black/15 bg-black/5" : "border-white/15 bg-white/5"}`}>
        <p className="text-[13px] font-bold truncate">{o?.club_name ?? "공유된 오퍼"}</p>
        {o && (
          <p className={`text-[13px] font-black mt-0.5 ${mine ? "text-green-600" : "text-green-400"}`}>
            ₩{o.proposed_price.toLocaleString()}
            {o.table_type && <span className="ml-1.5 text-[11px] font-medium opacity-70">{o.table_type}</span>}
          </p>
        )}
      </div>
    );
  };

  // 이모지 반응 칩 — count>0 이모지만, 내가 누른 건 강조
  const renderReactions = (m: PartyMessage, align: "start" | "end") => {
    const rx = summaries.get(m.id);
    if (!rx) return null;
    const active = CHAT_REACTION_EMOJIS.filter((e) => rx.counts[e] > 0);
    if (active.length === 0) return null;
    return (
      <div className={`flex flex-wrap gap-1 mt-1 ${align === "end" ? "justify-end" : "justify-start"}`}>
        {active.map((e) => (
          <button
            key={e}
            onClick={() => toggleReaction(m.id, e)}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] leading-none border transition-colors ${
              rx.mine.has(e)
                ? "bg-white/15 border-white/30 text-white"
                : "bg-neutral-800 border-transparent text-neutral-300"
            }`}
          >
            <span>{e}</span>
            <span className="font-bold">{rx.counts[e]}</span>
          </button>
        ))}
      </div>
    );
  };

  // 실제 채팅 참여자 수(방장+합류 유저, 게스트 제외)
  const memberCount = participants.length;
  // 내가 아직 한 마디도 안 했으면 인사말 추천 노출
  const iHaveSent = messages.some((m) => m.sender_id === me.id && !m.is_system);
  // 이미 초대된 MD가 있으면 다른 오퍼 초대 비활성 (조각당 MD 1명)
  const someInvited = offers.some((o) => o.is_invited);
  // 초대된 오퍼를 맨 위로 (나머지는 서버 정렬=좋아요순 유지)
  const sortedOffers = [...offers].sort((a, b) => Number(b.is_invited) - Number(a.is_invited));

  // 시스템 메시지 맨 앞 클럽명을 강조 (오퍼 club_name과 매칭)
  const clubNames = offers.map((o) => o.club_name).filter((c): c is string => !!c);
  const renderSystemContent = (content: string) => {
    const club = clubNames.find((c) => content.startsWith(c));
    if (!club) return content;
    return (
      <>
        <span className="font-black text-neutral-200">{club}</span>
        {content.slice(club.length)}
      </>
    );
  };

  // 카톡식 안읽음 "N": 이 메시지를 아직 안 읽은 참여자 수(발신자 제외)
  const unreadCountFor = (senderId: string | null, createdAt: string): number => {
    const t = new Date(createdAt).getTime();
    return participants.filter((p) => {
      if (p.id === senderId) return false;
      const r = readMap[p.id];
      return !r || new Date(r).getTime() < t;
    }).length;
  };

  return (
    <div className="max-w-lg mx-auto min-h-dvh bg-[#0A0A0A] flex flex-col">
      {/* 헤더 (고정) */}
      <div className="sticky top-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-sm border-b border-neutral-800">
        <header className="flex items-center gap-2 px-3 py-3">
          <button onClick={() => router.push("/messages")} className="p-1 -ml-1 text-neutral-300">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-white truncate">
              조각 채팅방 <span className="text-neutral-500 font-medium">{memberCount}</span>
            </p>
            <p className="text-[11px] text-neutral-500 truncate">
              {[partyInfo.dateLabel, partyInfo.area].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1 p-1.5 text-neutral-300"
            aria-label="참여자 보기"
          >
            <Users className="w-5 h-5" />
          </button>
        </header>
        {/* 조각 요약 바 — 탭하면 조각 상세로 */}
        <Link
          href={`/flags/${puzzleId}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#141416] border-t border-neutral-800/70 active:bg-neutral-900"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white truncate">
              {[partyInfo.dateLabel, partyInfo.area, participants.find((p) => p.is_leader && p.is_md)?.club_name, `인당 ${partyInfo.perPerson.toLocaleString()}원`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-[12px] text-neutral-400 truncate">
              현재 {partyInfo.currentCount}/{partyInfo.targetCount}명 모임
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
        </Link>

        {/* 받은 오퍼 드롭다운 — 멤버 좋아요/싫어요, 방장이 MD 초대. MD에겐 비노출(시크릿오퍼 유지) */}
        {offers.length > 0 && !isMd && (
          <div className="border-t border-neutral-800/70 bg-[#0F0F11]">
            <button
              onClick={() => setOffersOpen((v) => !v)}
              className="flex items-center justify-between w-full px-4 py-2.5"
            >
              <span className="text-[13px] font-bold text-white">
                받은 오퍼 <span className="text-amber-400">{offers.length}</span>건
                <span className="ml-2 text-[11px] font-medium text-neutral-500">
                  마음에 드는 오퍼에 투표해보세요
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${offersOpen ? "rotate-180" : ""}`} />
            </button>
            {offersOpen && (
              <ul className="max-h-[40vh] overflow-y-auto px-3 pb-3 space-y-2">
                {sortedOffers.map((o) => (
                  <li
                    key={o.offer_id}
                    className={`rounded-xl p-3 border ${o.is_invited ? "border-amber-500/40 bg-amber-500/5" : "border-neutral-800 bg-neutral-900/50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-white truncate">
                          {o.club_id ? (
                            <Link
                              href={`/clubs/${o.club_id}`}
                              className="hover:text-amber-300 hover:underline"
                            >
                              {o.club_name ?? "클럽"}
                            </Link>
                          ) : (
                            o.club_name ?? "클럽"
                          )}
                          {o.is_invited && (
                            <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold align-middle">
                              초대됨
                            </span>
                          )}
                        </p>
                        <p className="text-[13px] text-green-400 font-black mt-0.5">
                          ₩{o.proposed_price.toLocaleString()}
                          {o.table_type && <span className="ml-1.5 text-[11px] text-neutral-500 font-medium">{o.table_type}</span>}
                        </p>
                      </div>
                    </div>
                    {o.comment && (
                      <p className="text-[12px] text-neutral-400 mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
                        {o.comment}
                      </p>
                    )}
                    {o.includes?.length > 0 && (
                      <p className="text-[11px] text-neutral-500 mt-1 truncate">
                        {o.includes.join(" · ")}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        onClick={() => vote(o.offer_id, "like")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors ${o.my_vote === "like" ? "bg-green-500/20 text-green-400" : "bg-neutral-800 text-neutral-400"}`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        {o.like_count > 0 && o.like_count}
                      </button>
                      <button
                        onClick={() => vote(o.offer_id, "dislike")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors ${o.my_vote === "dislike" ? "bg-red-500/20 text-red-400" : "bg-neutral-800 text-neutral-400"}`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        {o.dislike_count > 0 && o.dislike_count}
                      </button>
                      <button
                        onClick={() => handleShareOffer(o.offer_id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300 hover:text-white text-[12px] font-bold"
                        aria-label="채팅에 언급"
                      >
                        <AtSign className="w-3.5 h-3.5" />
                        언급하기
                      </button>
                      {isLeader && (
                        o.is_invited ? (
                          <button
                            onClick={handleReleaseMd}
                            disabled={releasing}
                            className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-800 text-neutral-300 hover:text-red-400 text-[12px] font-bold disabled:opacity-50"
                          >
                            {releasing ? "내보내는 중…" : "내보내기"}
                          </button>
                        ) : someInvited ? (
                          <span className="ml-auto text-[12px] text-neutral-600 px-2 py-1">
                            다른 파트너 상담 중
                          </span>
                        ) : (
                          <button
                            onClick={() => handleInvite(o.offer_id)}
                            disabled={invitingId === o.offer_id}
                            className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full bg-white text-black text-[12px] font-black disabled:opacity-50"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            {invitingId === o.offer_id ? "초대 중…" : "초대"}
                          </button>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 메시지 리스트 */}
      <div className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        {loading ? (
          <p className="text-center text-[13px] text-neutral-600 mt-10">불러오는 중…</p>
        ) : shownMessages.length === 0 ? (
          <p className="text-center text-[13px] text-neutral-600 mt-10">
            단체채팅이 열렸어요. 첫 인사를 건네보세요 👋
          </p>
        ) : (
          shownMessages.map((m, i) => {
            const d = new Date(m.created_at);
            const prev = i > 0 ? shownMessages[i - 1] : null;
            const showDate = !prev || !isSameDay(new Date(prev.created_at), d);

            // 시스템 메시지 (합류 등) — 가운데 정렬 pill
            if (m.is_system) {
              return (
                <Fragment key={m.id}>
                  {showDate && (
                    <div className="flex justify-center my-3">
                      <span className="text-[11px] text-neutral-400 bg-neutral-800/70 rounded-full px-3 py-1">
                        {formatDateDivider(d)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center my-1">
                    <span className="text-[11px] text-neutral-500 bg-neutral-900/60 rounded-full px-3 py-1">
                      {renderSystemContent(m.content)}
                    </span>
                  </div>
                </Fragment>
              );
            }

            const mine = m.sender_id === me.id;
            const next = i < shownMessages.length - 1 ? shownMessages[i + 1] : null;
            // 같은 사람·같은 분의 연속 메시지: 마지막에만 시간 표시 (카톡식)
            const showTime =
              !next ||
              next.is_system ||
              next.sender_id !== m.sender_id ||
              !isSameMinute(new Date(next.created_at), d);
            // 이름/아바타는 이전 메시지가 다른 사람일 때만 (연속 그룹핑, 카톡식)
            const firstOfGroup =
              !prev ||
              prev.is_system ||
              prev.sender_id !== m.sender_id ||
              !isSameDay(new Date(prev.created_at), d);
            const senderName = m.sender?.display_name ?? "멤버";
            const unread = unreadCountFor(m.sender_id, m.created_at);

            return (
              <Fragment key={m.id}>
                {showDate && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-neutral-400 bg-neutral-800/70 rounded-full px-3 py-1">
                      {formatDateDivider(d)}
                    </span>
                  </div>
                )}
                {mine ? (
                  <div className="flex justify-end">
                    <div className="flex flex-col items-end max-w-[80%]">
                      <div className="flex items-end gap-1.5 flex-row-reverse group">
                        <div className="hidden group-hover:flex items-center gap-0.5 self-center shrink-0">
                          <button
                            onClick={() => setReplyTarget(m)}
                            className="p-1 text-neutral-500 hover:text-white"
                            aria-label="답글"
                          >
                            <CornerDownRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setMenuMsg(m)}
                            className="p-1 text-neutral-500 hover:text-white"
                            aria-label="반응"
                          >
                            <SmilePlus className="w-4 h-4" />
                          </button>
                        </div>
                        <div
                          onContextMenu={(e) => { e.preventDefault(); setMenuMsg(m); }}
                          onDoubleClick={() => !m.is_system && toggleReaction(m.id, "❤️")}
                          onTouchStart={() => startPress(m)}
                          onTouchEnd={cancelPress}
                          onTouchMove={cancelPress}
                          onPointerDown={() => startPress(m)}
                          onPointerUp={cancelPress}
                          onPointerLeave={cancelPress}
                          className="px-3 py-2 rounded-2xl bg-white text-black rounded-br-md select-none"
                        >
                          {renderQuoted(m)}
                          {m.content && (
                            <ChatContentText
                              content={m.content}
                              clubTags={[]}
                              className="text-[14px] leading-snug whitespace-pre-wrap break-words"
                            />
                          )}
                          {m.media?.length > 0 && <ChatMediaGrid items={m.media} />}
                          {renderSharedOffer(m, true)}
                        </div>
                        {(unread > 0 || showTime) && (
                          <div className="flex flex-col items-end justify-end shrink-0 mb-0.5 gap-0.5 leading-none">
                            {unread > 0 && (
                              <span className="text-[11px] font-bold text-amber-400">{unread}</span>
                            )}
                            {showTime && (
                              <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                                {formatTime(d)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {renderReactions(m, "end")}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-start gap-2">
                    {/* 아바타: 그룹 첫 메시지만, 아니면 자리만 확보 */}
                    {firstOfGroup ? (
                      <button
                        type="button"
                        onClick={() => m.sender_id && router.push(`/u/${m.sender_id}`)}
                        className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0 mt-4"
                        aria-label={`${senderName} 프로필 보기`}
                      >
                        {m.sender?.profile_image ? (
                          <Image src={m.sender.profile_image} alt="" fill className="object-cover" sizes="32px" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-[12px] font-bold text-neutral-400">
                            {senderName.slice(0, 1)}
                          </div>
                        )}
                      </button>
                    ) : (
                      <div className="w-8 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex flex-col items-start">
                      {firstOfGroup && (
                        <span className="text-[12px] text-neutral-400 mb-0.5 ml-0.5">{senderName}</span>
                      )}
                      <div className="flex items-end gap-1.5 max-w-full group">
                        <div
                          onContextMenu={(e) => { e.preventDefault(); setMenuMsg(m); }}
                          onDoubleClick={() => !m.is_system && toggleReaction(m.id, "❤️")}
                          onTouchStart={() => startPress(m)}
                          onTouchEnd={cancelPress}
                          onTouchMove={cancelPress}
                          onPointerDown={() => startPress(m)}
                          onPointerUp={cancelPress}
                          onPointerLeave={cancelPress}
                          className="px-3 py-2 rounded-2xl bg-[#1C1C1E] text-white rounded-bl-md select-none"
                        >
                          {renderQuoted(m)}
                          {m.content && (
                            <ChatContentText
                              content={m.content}
                              clubTags={[]}
                              className="text-[14px] leading-snug whitespace-pre-wrap break-words"
                            />
                          )}
                          {m.media?.length > 0 && <ChatMediaGrid items={m.media} />}
                          {renderSharedOffer(m, false)}
                        </div>
                        {(unread > 0 || showTime) && (
                          <div className="flex flex-col items-start justify-end shrink-0 mb-0.5 gap-0.5 leading-none">
                            {unread > 0 && (
                              <span className="text-[11px] font-bold text-amber-400">{unread}</span>
                            )}
                            {showTime && (
                              <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                                {formatTime(d)}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="hidden group-hover:flex items-center gap-0.5 self-center shrink-0">
                          <button
                            onClick={() => setReplyTarget(m)}
                            className="p-1 text-neutral-500 hover:text-white"
                            aria-label="답글"
                          >
                            <CornerDownRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setMenuMsg(m)}
                            className="p-1 text-neutral-500 hover:text-white"
                            aria-label="반응"
                          >
                            <SmilePlus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {renderReactions(m, "start")}
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 / 상태 안내 */}
      {removed ? (
        <div className="px-4 py-4 border-t border-neutral-800 text-center text-[13px] text-neutral-500">
          이 조각에서 나가게 되어 더 이상 대화할 수 없어요.
        </div>
      ) : readOnly ? (
        <div className="px-4 py-4 border-t border-neutral-800 text-center text-[13px] text-neutral-500">
          종료된 조각이에요. 대화를 더 보낼 수 없어요.
        </div>
      ) : (
        <div className="sticky bottom-0 bg-[#0A0A0A] border-t border-neutral-800" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {/* 답장 대상 미리보기 */}
          {replyTarget && (
            <div className="flex items-center gap-2 px-4 pt-2.5">
              <div className="flex-1 min-w-0 pl-2 border-l-2 border-white/30">
                <p className="text-[11px] font-bold text-neutral-300 truncate">
                  {replyTarget.sender_id === me.id ? "나" : replyTarget.sender?.display_name ?? "멤버"}에게 답장
                </p>
                <p className="text-[11px] text-neutral-500 truncate">
                  {replyTarget.content || (replyTarget.media?.length ? "사진" : "")}
                </p>
              </div>
              <button onClick={() => setReplyTarget(null)} className="p-1 text-neutral-500 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* 첫 진입 인사말 추천 — 한 번이라도 보내면 사라짐 */}
          {!iHaveSent && (
            <div className="flex gap-2 px-3 pt-2.5 overflow-x-auto no-scrollbar">
              {GREETING_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  disabled={sending}
                  className="shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[13px] text-neutral-200 whitespace-nowrap active:bg-neutral-800 disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {media.length > 0 && (
            <div className="flex gap-2 px-4 pt-3">
              {media.map((m, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden bg-neutral-900">
                  {m.type === "image" ? (
                    <Image src={m.url} alt="" fill className="object-cover" sizes="56px" />
                  ) : (
                    <video src={m.url} className="w-full h-full object-cover" muted />
                  )}
                  <button
                    onClick={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 grid place-items-center"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative flex items-end gap-2 px-3 py-3">
            <ChatAttachMenu onFiles={handleFiles} onLocation={handleLocation} />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="메시지 보내기"
              className="flex-1 min-w-0 resize-none bg-[#1C1C1E] text-white text-[14px] rounded-2xl px-4 py-2.5 outline-none placeholder:text-neutral-600 max-h-28"
            />
            <button
              onClick={() => handleSend()}
              disabled={sending || (input.trim().length === 0 && media.length === 0)}
              className="p-2.5 rounded-full bg-white text-black shrink-0 disabled:opacity-30"
              aria-label="전송"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 참여자 드로어 (바텀시트) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#1C1C1E] rounded-t-3xl overflow-hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-[15px] font-black text-white">참여자 {memberCount}</p>
              <button onClick={() => setDrawerOpen(false)} className="p-1 text-neutral-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto px-2 pb-3">
              {participants.map((p) => {
                const canKick = isLeader && !p.is_leader && !p.is_md && p.id !== me.id;
                return (
                <li key={p.id} className="flex items-center gap-1 px-1">
                  <Link
                    href={`/u/${p.id}`}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-neutral-800/60 min-w-0 flex-1"
                  >
                    <div className="relative w-9 h-9 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                      {p.profile_image ? (
                        <Image src={p.profile_image} alt="" fill className="object-cover" sizes="36px" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[13px] font-bold text-neutral-400">
                          {(p.display_name ?? "?").slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-white truncate">
                        {p.display_name ?? "멤버"}
                        {p.id === me.id && <span className="ml-1 text-[11px] text-amber-400">나</span>}
                      </p>
                      {p.is_md && p.club_name && (
                        <p className="text-[11px] text-green-400 font-medium truncate">{p.club_name}</p>
                      )}
                      {p.guest_count > 0 && (
                        <p className="text-[11px] text-neutral-500">+{p.guest_count}명 동행</p>
                      )}
                    </div>
                  </Link>
                  {p.is_leader ? (
                    <span className={`shrink-0 mr-2 text-[11px] px-2 py-0.5 rounded-full font-bold ${p.is_md ? "bg-blue-500/15 text-blue-400" : "bg-amber-500/15 text-amber-400"}`}>
                      {p.is_md ? "파트너" : "방장"}
                    </span>
                  ) : p.is_md ? (
                    <span className="shrink-0 mr-2 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold">
                      파트너
                    </span>
                  ) : canKick ? (
                    <button
                      onClick={() => { setKickReason(""); setKickTarget(p); }}
                      className="shrink-0 mr-2 text-[12px] px-2.5 py-1 rounded-full text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      내보내기
                    </button>
                  ) : null}
                </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* 내보내기 확인 모달 */}
      {kickTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center"
          onClick={() => !kicking && setKickTarget(null)}
        >
          <div
            className="w-full max-w-lg bg-[#1C1C1E] rounded-t-3xl p-5 space-y-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <p className="text-[16px] font-black text-white">
                {kickTarget.display_name ?? "멤버"}님을 내보낼까요?
              </p>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                내보내면 이 조각과 단체채팅에서 나가게 되고, <br />
                다시 합류할 수 없어요.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-neutral-500">
                한마디 (선택) · 상대에게만 전달돼요
              </label>
              <textarea
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                rows={2}
                maxLength={100}
                placeholder="예: 인원이 맞지 않아 부득이하게 조정했어요"
                className="w-full resize-none bg-neutral-900 text-white text-[14px] rounded-xl px-3.5 py-2.5 outline-none placeholder:text-neutral-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setKickTarget(null)}
                disabled={kicking}
                className="flex-1 py-3 rounded-xl bg-neutral-800 text-white font-bold text-[14px] disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleKick}
                disabled={kicking}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-[14px] disabled:opacity-50"
              >
                {kicking ? "내보내는 중…" : "내보내기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 롱프레스: 이모지 반응 + 답글 */}
      {menuMsg && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center"
          onClick={() => setMenuMsg(null)}
        >
          <div
            className="w-full max-w-lg p-3 space-y-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 이모지 반응 */}
            <div className="flex items-center justify-around bg-[#1C1C1E] rounded-2xl px-2 py-3">
              {CHAT_REACTION_EMOJIS.map((e) => {
                const mine = summaries.get(menuMsg.id)?.mine.has(e);
                return (
                  <button
                    key={e}
                    onClick={() => { toggleReaction(menuMsg.id, e); setMenuMsg(null); }}
                    className={`text-[26px] leading-none transition-transform active:scale-90 ${mine ? "opacity-100 scale-110" : "opacity-90"}`}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
            {/* 답글 */}
            <button
              onClick={() => { setReplyTarget(menuMsg); setMenuMsg(null); }}
              className="w-full flex items-center gap-3 bg-[#1C1C1E] rounded-2xl px-5 py-4 text-[15px] font-bold text-white hover:bg-neutral-800/40"
            >
              <CornerDownRight className="w-5 h-5 text-neutral-400" />
              답글
            </button>
            {/* 본인 메시지 삭제 */}
            {menuMsg.sender_id === me.id && (
              <button
                onClick={() => handleDeleteMessage(menuMsg)}
                className="w-full flex items-center gap-3 bg-[#1C1C1E] rounded-2xl px-5 py-4 text-[15px] font-bold text-red-400 hover:bg-neutral-800/40"
              >
                <Trash2 className="w-5 h-5" />
                삭제
              </button>
            )}
            <button
              onClick={() => setMenuMsg(null)}
              className="w-full bg-[#1C1C1E] rounded-2xl px-5 py-4 text-[15px] font-black text-white hover:bg-neutral-800/40"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* MD 입장 동의 게이트: 미동의 시 채팅 차단 + 크레딧 사용 확인 */}
      {showConsentGate && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-end justify-center">
          <div
            className="w-full max-w-lg bg-[#1C1C1E] rounded-t-3xl p-6 space-y-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
          >
            <div className="space-y-2 text-center">
              <div className="text-[34px] leading-none">🤝</div>
              <p className="text-[19px] font-black text-white">상담을 시작할까요?</p>
              <p className="text-[14px] text-neutral-300">
                수락 시 <span className="text-amber-400 font-bold">{PARTY_MATCH_CREDIT_COST}크레딧</span>이 소모돼요
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleStartConsult}
                disabled={consentBusy}
                className="w-full py-4 rounded-2xl bg-white text-black font-black text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {consentBusy ? "처리 중…" : "상담 시작"}
              </button>
              <button
                onClick={() => setDeclineConfirm(true)}
                disabled={consentBusy}
                className="w-full py-3 rounded-2xl text-[14px] text-neutral-400 hover:text-red-400 font-bold disabled:opacity-50 transition-colors"
              >
                거절 (오퍼 철회)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 거절 재확인 */}
      {declineConfirm && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-end justify-center">
          <div
            className="w-full max-w-lg bg-[#1C1C1E] rounded-t-3xl p-6 space-y-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
          >
            <div className="space-y-2 text-center">
              <p className="text-[19px] font-black text-white">정말 거절할까요?</p>
              <p className="text-[14px] text-neutral-300">거절 시 오퍼가 철회됩니다.</p>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleDeclineConsult}
                disabled={consentBusy}
                className="w-full py-4 rounded-2xl bg-red-500 text-white font-black text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {consentBusy ? "처리 중…" : "거절하기"}
              </button>
              <button
                onClick={() => setDeclineConfirm(false)}
                disabled={consentBusy}
                className="w-full py-3 rounded-2xl text-[14px] text-neutral-400 hover:text-white font-bold disabled:opacity-50 transition-colors"
              >
                돌아가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
