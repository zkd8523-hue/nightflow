"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AtSign, ChevronDown, CornerDownRight, Send, SmilePlus, ThumbsDown, ThumbsUp, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadChatMedia } from "@/lib/utils/uploadChatMedia";
import { ChatMediaGrid } from "@/components/chat/ChatMediaGrid";
import { ChatAttachMenu } from "@/components/chat/ChatAttachMenu";
import { ContactCardMessage, isContactCardContent } from "@/components/messages/ContactCardMessage";
import { ContactPickerButton } from "@/components/messages/ContactPickerButton";
import { SwipeToReply } from "@/components/chat/SwipeToReply";
import { ChatContentText } from "@/components/chat/ChatContentText";
import { useComposerNavHide } from "@/hooks/useComposerNavHide";
import { usePartyMessages } from "@/hooks/usePartyMessages";
import { usePartyOffers } from "@/hooks/usePartyOffers";
import { usePartyReactions } from "@/hooks/usePartyReactions";
import { usePartyRoomActivity } from "@/hooks/usePartyRoomActivity";
import { CHAT_REACTION_EMOJIS, type ChatReactionEmoji } from "@/types/database";
import type { ChatMediaItem, ContactMethodType, PartyMessage, PartyParticipant, PartyRoom } from "@/types/database";

const MAX_LEN = 500;

interface Me {
  id: string;
  display_name: string | null;
  profile_image: string | null;
  instagram?: string | null;
  phone?: string | null;
  kakao_open_chat_url?: string | null;
  preferred_contact_methods?: ContactMethodType[] | null;
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
  /** 파트너 본인의 md_id (isMd일 때). 자기 방을 고정하는 데 쓴다 */
  myMdId?: string | null;
  /** MD가 상담에 이미 동의했는지. false면 입장 시 동의 모달 노출 */
  mdConsented?: boolean;
  puzzleStatus: string;
  partyInfo: PartyInfo;
  participants: PartyParticipant[];
  /** 초대된 파트너 방 목록 — 파트너 본인 세션엔 자기 방 1개만 내려온다 */
  rooms: PartyRoom[];
}


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

/**
 * 칩 라벨 재계산 — 같은 클럽이 2개 이상이면 "클럽명 1", "클럽명 2"로 번호를 붙인다.
 * 서버(page.tsx)와 같은 규칙. 초대/내보내기로 방 목록이 바뀔 때마다 전체를 다시 계산해야
 * "두 번째 파트너가 들어와서 첫 번째도 번호가 붙는" 케이스가 맞는다.
 */
function withChipLabels(rooms: Omit<PartyRoom, "chipLabel">[]): PartyRoom[] {
  const counts = new Map<string, number>();
  for (const r of rooms) {
    if (r.clubName) counts.set(r.clubName, (counts.get(r.clubName) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return rooms.map((r) => {
    if (!r.clubName) return { ...r, chipLabel: "파트너" };
    if ((counts.get(r.clubName) ?? 0) <= 1) return { ...r, chipLabel: r.clubName };
    const idx = (seen.get(r.clubName) ?? 0) + 1;
    seen.set(r.clubName, idx);
    return { ...r, chipLabel: `${r.clubName} ${idx}` };
  });
}

export function PartyChatRoom({
  puzzleId,
  me,
  isLeader,
  isMd = false,
  myMdId = null,
  mdConsented = false,
  puzzleStatus,
  partyInfo,
  participants: initialParticipants,
  rooms,
}: Props) {
  const router = useRouter();
  // 입력 포커스 중엔 하단 네비를 숨겨 키보드와 겹치지 않게 (와글과 동일)
  const { focused: composerFocused, onFocus: onComposerFocus, onBlur: onComposerBlur } =
    useComposerNavHide();
  // 파트너 본인은 자기 방에 고정 — 칩이 안 보이므로 방을 바꿀 수 없다.
  // 방장·멤버는 파티원방(null)이 기본, 칩으로 파트너 방을 오간다.
  const [activeRoomMdId, setActiveRoomMdId] = useState<string | null>(isMd ? myMdId : null);
  const [chipsExpanded, setChipsExpanded] = useState(false);
  // rooms를 로컬 state로 — 초대/내보내기 직후 새로고침 없이 칩이 바로 갱신되게 한다.
  const [roomsState, setRoomsState] = useState<Omit<PartyRoom, "chipLabel">[]>(() =>
    rooms.map((r) => ({
      mdId: r.mdId,
      clubName: r.clubName,
      displayName: r.displayName,
      profileImage: r.profileImage,
      consented: r.consented,
    }))
  );
  const chatRooms = useMemo(() => withChipLabels(roomsState), [roomsState]);
  const { messages, loading, readMap, addLocalMessage, removeLocalMessage } = usePartyMessages(puzzleId, activeRoomMdId);
  const { offers, vote, reload: reloadOffers } = usePartyOffers(puzzleId);
  // 칩 빨간 점 — 파트너 본인 세션엔 rooms가 비어있으므로(칩 자체를 안 그림) 무해하다.
  const { hasUnread: roomHasUnread, markSeen: markRoomSeen } = usePartyRoomActivity(puzzleId);
  // 지금 보고 있는 방은 곧바로 "읽음"으로 표시 (칩에서 점이 즉시 사라지게)
  useEffect(() => {
    if (activeRoomMdId) markRoomSeen(activeRoomMdId);
  }, [activeRoomMdId, markRoomSeen, messages.length]);
  const reactableIds = useMemo(
    () => messages.filter((m) => !m.is_system && !m.is_deleted).map((m) => m.id),
    [messages]
  );
  const { summaries, toggle: toggleReaction } = usePartyReactions(puzzleId, reactableIds, me.id);

  const [participants, setParticipants] = useState<PartyParticipant[]>(initialParticipants);
  const [offersOpen, setOffersOpen] = useState(false);
  // MD 입장 동의 상태. 미동의면 상담 시작 모달을 띄우고 채팅 차단.
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
    toast.success("상담을 시작했어요");
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
  // "언급하기" 대상 오퍼 — 답장(replyTarget)과 같은 패턴: 배너를 띄우고
  // 기존 입력창에 직접 멘트를 적어서 보낸다. 고정 문구 대신 자유롭게 쓸 수 있다.
  const [shareOfferTarget, setShareOfferTarget] = useState<string | null>(null);
  // 연락처 남기기 — 최초 1회만 상단에 노출, X로 닫으면 이후 "+"메뉴에서만 접근.
  // ⚠️ localStorage는 브라우저 단위라 puzzleId만 키로 쓰면 같은 브라우저에서
  // 계정을 바꿔가며 테스트할 때(방장→MD 등) 다른 사람이 닫은 게 그대로 적용된다.
  // 반드시 유저(me.id)까지 키에 포함해 계정별로 독립시킨다.
  const [contactRowDismissed, setContactRowDismissed] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const contactDismissKey = `party_contact_dismissed_${puzzleId}_${me.id}`;
  useEffect(() => {
    try {
      setContactRowDismissed(window.localStorage.getItem(contactDismissKey) === "1");
    } catch {
      // localStorage 접근 불가 시 그냥 계속 보여준다
    }
  }, [contactDismissKey]);
  function dismissContactRow() {
    setContactRowDismissed(true);
    try {
      window.localStorage.setItem(contactDismissKey, "1");
    } catch {
      // 저장 실패해도 이번 세션에서는 숨김 상태 유지됨
    }
  }
  // 답장 시작 — 언급하기 배너와 배타적이므로 항상 같이 정리한다
  function startReply(m: PartyMessage) {
    setShareOfferTarget(null);
    setReplyTarget(m);
  }
  // 방에서 내보내진 상태 (전송 시 참여자 아님 감지)
  const [removed, setRemoved] = useState(false);
  // 채팅방 나가기 — 기존엔 채팅 목록 롱프레스에만 있어 방 안에서는 나갈 방법이 없었다
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function handleLeaveParty() {
    if (leaving) return;
    setLeaving(true);
    const { data, error } = await createClient().rpc("leave_party", { p_puzzle_id: puzzleId });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "나가기에 실패했어요");
      setLeaving(false);
      return;
    }
    toast.success("채팅방에서 나왔어요");
    router.push("/messages");
  }

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
    // 새 파트너 칩·참여자를 새로고침 없이 즉시 반영 — offers 목록에 이미
    // club_name/md_id가 있으니 그걸로 room/participant 엔트리를 구성한다.
    const offer = offers.find((o) => o.offer_id === offerId);
    if (offer) {
      setRoomsState((prev) =>
        prev.some((r) => r.mdId === offer.md_id)
          ? prev
          : [...prev, { mdId: offer.md_id, clubName: offer.club_name, displayName: null, profileImage: null, consented: false }]
      );
      setParticipants((prev) =>
        prev.some((p) => p.id === offer.md_id)
          ? prev
          : [...prev, { id: offer.md_id, display_name: null, profile_image: null, is_leader: false, guest_count: 0, is_md: true, club_name: offer.club_name }]
      );
    }
    reloadOffers();
    setInvitingId(null);
  }

  async function handleReleaseMd(mdId: string) {
    if (releasing) return;
    if (typeof window !== "undefined" &&
        !window.confirm("이 파트너와의 상담을 종료할까요?")) return;
    setReleasing(true);
    const { data, error } = await createClient().rpc("release_party_md", {
      p_puzzle_id: puzzleId,
      p_md_id: mdId,
    });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "내보내기에 실패했어요");
      setReleasing(false);
      return;
    }
    toast.success("파트너 상담을 종료했어요");
    setRoomsState((prev) => prev.filter((r) => r.mdId !== mdId));
    setParticipants((prev) => prev.filter((p) => p.id !== mdId));
    // 지금 그 파트너의 방을 보고 있었다면 파티원방으로 되돌린다
    setActiveRoomMdId((prev) => (prev === mdId ? null : prev));
    reloadOffers();
    setReleasing(false);
  }

  // 오퍼를 채팅에 공유 ("이거 어때요?")
  // "언급하기" — 바로 보내지 않고 답장(replyTarget)처럼 배너만 띄운다.
  // 실제 전송은 handleSend가 shareOfferTarget이 있을 때 분기해서 처리한다.
  // 답장과는 배타적 — 동시에 뜨면 어느 쪽으로 전송될지 헷갈린다.
  function handleShareOffer(offerId: string) {
    setReplyTarget(null);
    setShareOfferTarget(offerId);
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
  // ⚠️ supabase-js 빌더는 lazy thenable — await(또는 .then) 하지 않으면 요청이
  //    아예 나가지 않는다. 이걸 빼먹어서 목록의 안읽음 점이 안 사라졌음.
  useEffect(() => {
    if (loading) return;
    (async () => {
      const { error } = await createClient().rpc("mark_party_read", { p_puzzle_id: puzzleId });
      if (error) console.error("[mark_party_read] failed", error);
    })();
  }, [puzzleId, loading, messages.length]);

  // 스크롤 맨 아래로 — 입장 시 첫 로드는 즉시 이동(smooth로 하면 맨 위에서
  // 아래로 슬라이드하는 게 매번 보여 거슬림), 이후 새 메시지가 오면만 부드럽게.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    didInitialScroll.current = false;
  }, [activeRoomMdId]);
  useEffect(() => {
    if (!didInitialScroll.current) {
      didInitialScroll.current = true;
      bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
      return;
    }
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
      p_room_md_id: activeRoomMdId,
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
    // 오퍼 언급 모드는 내용이 비어도 기본 문구로 보낼 수 있게 허용
    if (!shareOfferTarget && trimmed.length < 1 && useMedia.length === 0) return;
    if (trimmed.length > MAX_LEN) {
      toast.error(`${MAX_LEN}자를 넘을 수 없어요`);
      return;
    }

    setSending(true);
    const supabase = createClient();
    const sentContent = trimmed;
    const sentMedia = useMedia;
    const replyToId = replyTarget?.id ?? null;

    // 오퍼 언급 — 일반 채팅과 다른 RPC(share_offer_to_party)로 보낸다.
    // 항상 파티원방에만 올라간다(Migration 591이 room_md_id != null이면 거부).
    if (shareOfferTarget) {
      const offerId = shareOfferTarget;
      const shareContent = sentContent || "이거 어때요? 👀";
      if (!isPreset) setInput("");
      setShareOfferTarget(null);
      const { data, error } = await supabase.rpc("share_offer_to_party", {
        p_puzzle_id: puzzleId,
        p_offer_id: offerId,
        p_content: shareContent,
        p_room_md_id: null,
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "공유에 실패했어요");
        setSending(false);
        return;
      }
      if (data.message_id) {
        addLocalMessage({
          id: data.message_id,
          puzzle_id: puzzleId,
          sender_id: me.id,
          content: shareContent,
          media: [],
          is_system: false,
          is_deleted: false,
          created_at: new Date().toISOString(),
          shared_offer_id: offerId,
          sender: me,
        });
      }
      setSending(false);
      return;
    }

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
      p_room_md_id: activeRoomMdId,
    });

    if (error || !data?.success) {
      // 내보내진 뒤 방을 열어둔 상태 → 안내 + 잠금
      if (typeof data?.error === "string" && data.error.includes("참여자가 아닙니다")) {
        setRemoved(true);
        setInput("");
        setMedia([]);
        toast.error("이 파티에서 나가게 되어 더 이상 참여할 수 없어요");
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
  }, [input, media, sending, readOnly, puzzleId, me, addLocalMessage, replyTarget, activeRoomMdId, shareOfferTarget]);

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
        <div className={`mt-1.5 rounded-md border px-3 py-2 max-w-[240px] ${mine ? "border-black/30 bg-black/10" : "border-white/15 bg-white/5"}`}>
          <p className="text-[12px] opacity-70">오퍼가 공유됐어요</p>
        </div>
      );
    }
    const o = offers.find((x) => x.offer_id === m.shared_offer_id);
    return (
      <div className={`mt-1.5 rounded-md border px-3 py-2 max-w-[240px] ${mine ? "border-black/30 bg-black/10" : "border-white/15 bg-white/5"}`}>
        <p className="text-[13px] font-bold truncate">{o?.club_name ?? "공유된 오퍼"}</p>
        {o && (
          <>
            {/* 밝은 amber 배경(mine)에서는 기본 money 초록이 너무 튀어서 어두운 톤을 쓴다 */}
            <p className={`text-[13px] font-black mt-0.5 ${mine ? "text-green-900" : "text-money"}`}>
              ₩{o.proposed_price.toLocaleString()}
            </p>
            {/* 코멘트(파트너가 실제로 쓴 내용) — 이게 없으면 클럽명·가격만 보이고
                내용을 보려면 매번 "받은 오퍼" 드로어를 다시 열어야 했다 */}
            {o.comment && (
              <p className="text-[12px] mt-1 leading-relaxed whitespace-pre-wrap break-words opacity-80">
                {o.comment}
              </p>
            )}
          </>
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
                ? "bg-white/15 border-white/30 text-foreground"
                : "bg-muted border-transparent text-foreground/80"
            }`}
          >
            <span>{e}</span>
            <span className="font-bold">{rx.counts[e]}</span>
          </button>
        ))}
      </div>
    );
  };

  // 활성 방 기준 참여자 — 파티원방(null)은 방장+멤버만, 파트너 방은 그 파트너 한 명만 더해서.
  // 안 그러면 "Muffin" 방을 보면서 참여자 목록엔 "운영자 테스트 클럽"까지 같이 떠서
  // 마치 그 파트너도 이 대화에 있는 것처럼 보인다(격리 원칙 위반과 동일한 혼선).
  const roomParticipants = useMemo(
    () =>
      activeRoomMdId === null
        ? participants.filter((p) => !p.is_md)
        : participants.filter((p) => !p.is_md || p.id === activeRoomMdId),
    [participants, activeRoomMdId]
  );
  // 실제 채팅 참여자 수(방장+합류 유저, 게스트 제외)
  const memberCount = roomParticipants.length;
  // 참여자 목록은 "나"를 맨 위로 — 내가 이 방에 제대로 들어와 있는지 한눈에 확인시켜준다.
  // 서버 정렬(방장 → 파트너 → 멤버)은 나머지 순서로 그대로 유지.
  const sortedParticipants = useMemo(
    () => [...roomParticipants].sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id)),
    [roomParticipants, me.id]
  );
  // 내가 아직 한 마디도 안 했으면 인사말 추천 노출
  const iHaveSent = messages.some((m) => m.sender_id === me.id && !m.is_system);
  // 드로어는 초대 여부와 무관하게 전체 오퍼를 보여준다 — 이미 초대한 파트너끼리도
  // 조건을 나란히 비교하고 싶을 수 있고, 그건 칩으로 하나씩 들어가서는 안 되는 일이다.
  // 다만 "내보내기"는 그 파트너의 방(칩 펼침 패널)으로 옮겼다 — 전체 목록에 여러 개
  // 흩어놓으면 "지금 뭘 조작하는 건지" 헷갈린다.
  const sortedOffers = [...offers].sort((a, b) => Number(b.is_invited) - Number(a.is_invited));

  // 시스템 메시지 맨 앞 클럽명을 강조 (오퍼 club_name과 매칭)
  const clubNames = offers.map((o) => o.club_name).filter((c): c is string => !!c);
  const renderSystemContent = (content: string) => {
    const club = clubNames.find((c) => content.startsWith(c));
    if (!club) return content;
    return (
      <>
        <span className="font-black text-foreground">{club}</span>
        {content.slice(club.length)}
      </>
    );
  };

  // 카톡식 안읽음 "N": 이 메시지를 아직 안 읽은 참여자 수(발신자 제외) — 이 방 사람 기준
  const unreadCountFor = (senderId: string | null, createdAt: string): number => {
    const t = new Date(createdAt).getTime();
    return roomParticipants.filter((p) => {
      if (p.id === senderId) return false;
      const r = readMap[p.id];
      return !r || new Date(r).getTime() < t;
    }).length;
  };

  return (
    // 하단 네비(56px)를 띄운 채로 대화 — 와글(/chat)과 동일한 높이 계산.
    <div
      className={`max-w-lg mx-auto bg-background flex flex-col overflow-hidden ${
        composerFocused
          ? "h-[calc(100dvh-env(safe-area-inset-bottom))]"
          : "h-[calc(100dvh-56px-env(safe-area-inset-bottom))]"
      }`}
    >
      {/* 헤더 — "파티 채팅방 N" 줄을 없애고 요약바 한 줄에 뒤로가기·참여자 아이콘을
          같이 얹었다. 어차피 인원수는 참여자 아이콘 누르면 바로 보이니 중복이었다. */}
      <div className="shrink-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-1 px-3 py-2.5">
          <button onClick={() => router.push("/messages")} className="p-1 -ml-1 text-foreground/80 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {/* 클럽명은 아래 칩이 보여주므로 반복하지 않는다. 파티 상세로 이동은
              쓸모가 없어 없앤 순수 요약 텍스트다(탭 불가). */}
          <p className="text-[13px] font-bold text-foreground truncate min-w-0 flex-1">
            {[
              partyInfo.dateLabel,
              partyInfo.area,
              `인당 ${partyInfo.perPerson.toLocaleString()}원`,
              `${partyInfo.currentCount}/${partyInfo.targetCount}명`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1 p-1.5 text-foreground/80 shrink-0"
            aria-label="참여자 보기"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>

        {/* 파트너 방 전환 칩 — 파트너 본인에겐 절대 노출하지 않는다(다른 파트너 존재를 숨김).
            평소엔 칩 한 줄만, ▾를 누르면 현재 방의 닉네임이 펼쳐진다. */}
        {!isMd && chatRooms.length > 0 && (
          <div className="border-t border-border/70 bg-background">
            <div className="flex items-center">
              <div className="flex-1 min-w-0 flex gap-1.5 px-4 py-2 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setActiveRoomMdId(null)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors ${
                    activeRoomMdId === null
                      ? "bg-inverse text-inverse-foreground"
                      : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  💬 파티원
                </button>
                {chatRooms.map((r) => (
                  <button
                    key={r.mdId}
                    onClick={() => setActiveRoomMdId(r.mdId)}
                    className={`relative shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors ${
                      activeRoomMdId === r.mdId
                        ? "bg-inverse text-inverse-foreground"
                        : "bg-white/5 text-muted-foreground"
                    }`}
                  >
                    {r.chipLabel}
                    {roomHasUnread(r.mdId) && activeRoomMdId !== r.mdId && (
                      <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                    )}
                  </button>
                ))}
              </div>
              {/* 파티원방엔 펼쳐서 보여줄 파트너 정보가 없으므로 파트너 방일 때만 노출 */}
              {activeRoomMdId !== null && (
                <button
                  onClick={() => setChipsExpanded((v) => !v)}
                  className="shrink-0 px-3 py-2 text-muted-foreground"
                  aria-label="파트너 정보 펼치기"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${chipsExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {chipsExpanded && activeRoomMdId && (
              <div className="flex items-center gap-2 px-4 pb-2.5">
                <div className="relative w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-foreground shrink-0 overflow-hidden">
                  {(() => {
                    const room = chatRooms.find((r) => r.mdId === activeRoomMdId);
                    return room?.profileImage ? (
                      <Image src={room.profileImage} alt="" fill className="object-cover" sizes="28px" />
                    ) : (
                      <span>{(room?.clubName || room?.displayName || "?").slice(0, 1)}</span>
                    );
                  })()}
                </div>
                <span className="text-[13px] font-bold text-foreground truncate min-w-0 flex-1">
                  {chatRooms.find((r) => r.mdId === activeRoomMdId)?.displayName ?? "파트너"}
                </span>
                {/* 내보내기는 "지금 보고 있는 이 파트너"에 한정 — 오퍼 드로어의 전체
                    목록에 흩어놓으면 다른 파트너 것과 헷갈린다(관리 대상 = 활성 방). */}
                {isLeader && (
                  <button
                    onClick={() => handleReleaseMd(activeRoomMdId)}
                    disabled={releasing}
                    className="shrink-0 px-3 py-1 rounded-full bg-muted text-foreground/80 hover:text-red-400 text-[12px] font-bold disabled:opacity-50"
                  >
                    {releasing ? "종료하는 중…" : "상담 종료하기"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 받은 오퍼 드롭다운 — 초대 여부와 무관하게 전체. 초대된 것끼리도 조건을
            나란히 비교하고 싶을 수 있어 여기선 안 뺀다. 내보내기만 칩 펼침 패널로 이동.
            멤버 좋아요/싫어요, 방장이 MD 초대. MD에겐 비노출(시크릿오퍼 유지) */}
        {offers.length > 0 && !isMd && (
          <div className="border-t border-border/70 bg-background">
            <button
              onClick={() => setOffersOpen((v) => !v)}
              className="flex items-center justify-between w-full px-4 py-2.5"
            >
              <span className="text-[13px] font-bold text-foreground">
                받은 오퍼 <span className="text-brand-amber">{offers.length}</span>건
                <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                  마음에 드는 오퍼에 선택해보세요
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${offersOpen ? "rotate-180" : ""}`} />
            </button>
            {offersOpen && (
              <ul className="max-h-[40vh] overflow-y-auto px-3 pb-3 space-y-2">
                {sortedOffers.map((o) => (
                  <li
                    key={o.offer_id}
                    className="rounded-xl p-3 border border-border bg-card/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-foreground truncate">
                          {o.club_id ? (
                            <Link
                              href={`/clubs/${o.club_id}`}
                              className="hover:text-brand-amber hover:underline"
                            >
                              {o.club_name ?? "클럽"}
                            </Link>
                          ) : (
                            o.club_name ?? "클럽"
                          )}
                          {o.is_invited && (
                            <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-brand-amber font-bold align-middle">
                              대화중
                            </span>
                          )}
                        </p>
                        <p className="text-[13px] text-money font-black mt-0.5">
                          ₩{o.proposed_price.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {o.comment && (
                      <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
                        {o.comment}
                      </p>
                    )}
                    {o.includes?.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">
                        {o.includes.join(" · ")}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2.5">
                      <button
                        onClick={() => vote(o.offer_id, "like")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors ${o.my_vote === "like" ? "bg-green-500/20 text-money" : "bg-muted text-muted-foreground"}`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        {o.like_count > 0 && o.like_count}
                      </button>
                      <button
                        onClick={() => vote(o.offer_id, "dislike")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors ${o.my_vote === "dislike" ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground"}`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        {o.dislike_count > 0 && o.dislike_count}
                      </button>
                      {/* 언급하기는 항상 파티원방에만 올라간다(다른 파트너 방엔 절대 안 됨).
                          그런데 지금 파트너 방을 보고 있으면 눌러도 여기 화면엔 안 보이고
                          안 보이는 파티원방에 조용히 올라가버려 헷갈린다 — 파티원방을
                          보고 있을 때만 노출한다. */}
                      {activeRoomMdId === null && (
                        <button
                          onClick={() => handleShareOffer(o.offer_id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-foreground/80 hover:text-foreground text-[12px] font-bold"
                          aria-label="채팅에 언급"
                        >
                          <AtSign className="w-3.5 h-3.5" />
                          언급하기
                        </button>
                      )}
                      {/* 이미 초대된 파트너는 "초대됨" 배지로 상태만 표시 —
                          내보내기는 그 파트너의 방(칩 펼침 패널)에서 한다 */}
                      {isLeader && !o.is_invited && (
                        <button
                          onClick={() => handleInvite(o.offer_id)}
                          disabled={invitingId === o.offer_id}
                          className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full bg-inverse text-inverse-foreground text-[12px] font-black disabled:opacity-50"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {invitingId === o.offer_id ? "초대 중…" : "초대"}
                        </button>
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
          <p className="text-center text-[13px] text-muted-foreground mt-10">불러오는 중…</p>
        ) : shownMessages.length === 0 ? (
          <p className="text-center text-[13px] text-muted-foreground mt-10">
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
                      <span className="text-[11px] text-muted-foreground bg-muted/70 rounded-full px-3 py-1">
                        {formatDateDivider(d)}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col items-center my-1">
                    <span className="text-[11px] text-muted-foreground bg-card/60 rounded-full px-3 py-1">
                      {renderSystemContent(m.content)}
                    </span>
                    {/* 신규 오퍼 도착 알림(Migration 530)은 오퍼 카드를 함께 단다 */}
                    {m.shared_offer_id && renderSharedOffer(m, false)}
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
                    <span className="text-[11px] text-muted-foreground bg-muted/70 rounded-full px-3 py-1">
                      {formatDateDivider(d)}
                    </span>
                  </div>
                )}
                {mine ? (
                  <div className="flex justify-end">
                    <div className="flex flex-col items-end max-w-[80%]">
                      <div className="relative flex items-end gap-1.5 flex-row-reverse group">
                        {/* absolute로 뺀다 — flex 자식이면 hidden→flex 전환 때 말풍선을
                            밀어내서 호버할 때마다 위치가 왔다갔다했다. 절대 위치라 레이아웃에
                            영향을 안 준다. 내 메시지(오른쪽 정렬)라 반대편인 왼쪽에 띄운다. */}
                        <div className="hidden group-hover:flex items-center gap-0.5 absolute right-full top-1/2 -translate-y-1/2 mr-1.5 z-10 bg-card rounded-full px-1 py-0.5 shadow-lg whitespace-nowrap">
                          {/* 삭제 — 웹에선 SwipeToReply가 pointer capture를 걸어서
                              롱프레스(400ms) 중 손이 조금만 떨려도 onMoveCancel이 취소시킨다.
                              데스크톱은 마우스로 완벽히 정지하기 어려워 롱프레스가 사실상
                              안 열리므로, 항상 접근 가능한 호버 버튼을 따로 둔다. */}
                          {!m.is_system && (
                            <button
                              onClick={() => handleDeleteMessage(m)}
                              className="p-1 text-muted-foreground hover:text-red-400"
                              aria-label="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => startReply(m)}
                            className="p-1 text-muted-foreground hover:text-foreground"
                            aria-label="답글"
                          >
                            <CornerDownRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setMenuMsg(m)}
                            className="p-1 text-muted-foreground hover:text-foreground"
                            aria-label="반응"
                          >
                            <SmilePlus className="w-4 h-4" />
                          </button>
                        </div>
                        <SwipeToReply isMine onReply={() => startReply(m)} onMoveCancel={cancelPress}>
                        <div
                          onContextMenu={(e) => { e.preventDefault(); setMenuMsg(m); }}
                          onDoubleClick={() => !m.is_system && toggleReaction(m.id, "❤️")}
                          onTouchStart={() => startPress(m)}
                          onTouchEnd={cancelPress}
                          onTouchMove={cancelPress}
                          onPointerDown={() => startPress(m)}
                          onPointerUp={cancelPress}
                          onPointerLeave={cancelPress}
                          className="px-3 py-2 rounded-2xl bg-amber-400 text-black rounded-br-md select-none"
                        >
                          {renderQuoted(m)}
                          {/* 사진 → 텍스트 순서 (와글·DM과 동일) */}
                          {m.media?.length > 0 && <ChatMediaGrid items={m.media} />}
                          {/* 오퍼 카드가 먼저, 직접 적은 멘트는 그 아래(캡션처럼) */}
                          {renderSharedOffer(m, true)}
                          {m.content && (
                            isContactCardContent(m.content) ? (
                              <ContactCardMessage content={m.content} mine />
                            ) : (
                              <ChatContentText
                                content={m.content}
                                clubTags={[]}
                                className={`text-[14px] leading-snug whitespace-pre-wrap break-words ${m.shared_offer_id ? "mt-1.5" : ""}`}
                              />
                            )
                          )}
                        </div>
                        </SwipeToReply>
                        {(unread > 0 || showTime) && (
                          <div className="flex flex-col items-end justify-end shrink-0 mb-0.5 gap-0.5 leading-none">
                            {unread > 0 && (
                              <span className="text-[11px] font-bold text-brand-amber">{unread}</span>
                            )}
                            {showTime && (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
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
                        className="relative w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0 mt-4"
                        aria-label={`${senderName} 프로필 보기`}
                      >
                        {m.sender?.profile_image ? (
                          <Image src={m.sender.profile_image} alt="" fill className="object-cover" sizes="32px" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-[12px] font-bold text-muted-foreground">
                            {senderName.slice(0, 1)}
                          </div>
                        )}
                      </button>
                    ) : (
                      <div className="w-8 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex flex-col items-start">
                      {firstOfGroup && (
                        <span className="text-[12px] text-muted-foreground mb-0.5 ml-0.5">{senderName}</span>
                      )}
                      <div className="relative flex items-end gap-1.5 max-w-full group">
                        <SwipeToReply isMine={false} onReply={() => startReply(m)} onMoveCancel={cancelPress}>
                        <div
                          onContextMenu={(e) => { e.preventDefault(); setMenuMsg(m); }}
                          onDoubleClick={() => !m.is_system && toggleReaction(m.id, "❤️")}
                          onTouchStart={() => startPress(m)}
                          onTouchEnd={cancelPress}
                          onTouchMove={cancelPress}
                          onPointerDown={() => startPress(m)}
                          onPointerUp={cancelPress}
                          onPointerLeave={cancelPress}
                          className="px-3 py-2 rounded-2xl bg-card text-foreground rounded-bl-md select-none"
                        >
                          {renderQuoted(m)}
                          {/* 사진 → 텍스트 순서 (와글·DM과 동일) */}
                          {m.media?.length > 0 && <ChatMediaGrid items={m.media} />}
                          {m.content && (
                            isContactCardContent(m.content) ? (
                              <ContactCardMessage content={m.content} />
                            ) : (
                              <ChatContentText
                                content={m.content}
                                clubTags={[]}
                                className="text-[14px] leading-snug whitespace-pre-wrap break-words"
                              />
                            )
                          )}
                          {renderSharedOffer(m, false)}
                        </div>
                        </SwipeToReply>
                        {(unread > 0 || showTime) && (
                          <div className="flex flex-col items-start justify-end shrink-0 mb-0.5 gap-0.5 leading-none">
                            {unread > 0 && (
                              <span className="text-[11px] font-bold text-brand-amber">{unread}</span>
                            )}
                            {showTime && (
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {formatTime(d)}
                              </span>
                            )}
                          </div>
                        )}
                        {/* absolute — mine과 동일한 이유로 flex에서 뺐다. 상대 메시지(왼쪽 정렬)라
                            반대편인 오른쪽에 띄운다. */}
                        <div className="hidden group-hover:flex items-center gap-0.5 absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-10 bg-card rounded-full px-1 py-0.5 shadow-lg whitespace-nowrap">
                          <button
                            onClick={() => startReply(m)}
                            className="p-1 text-muted-foreground hover:text-foreground"
                            aria-label="답글"
                          >
                            <CornerDownRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setMenuMsg(m)}
                            className="p-1 text-muted-foreground hover:text-foreground"
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
        <div className="px-4 py-4 border-t border-border text-center text-[13px] text-muted-foreground">
          이 파티에서 나가게 되어 더 이상 대화할 수 없어요.
        </div>
      ) : readOnly ? (
        <div className="shrink-0 px-4 py-4 border-t border-border text-center text-[13px] text-muted-foreground">
          종료된 파티가에요. 대화를 더 보낼 수 없어요.
        </div>
      ) : (
        <div className="shrink-0 bg-background border-t border-border">
          {/* 답장 대상 미리보기 */}
          {replyTarget && (
            <div className="flex items-center gap-2 px-4 pt-2.5">
              <div className="flex-1 min-w-0 pl-2 border-l-2 border-white/30">
                <p className="text-[11px] font-bold text-foreground/80 truncate">
                  {replyTarget.sender_id === me.id ? "나" : replyTarget.sender?.display_name ?? "멤버"}에게 답장
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {replyTarget.content || (replyTarget.media?.length ? "사진" : "")}
                </p>
              </div>
              <button onClick={() => setReplyTarget(null)} className="p-1 text-muted-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* 오퍼 언급 대상 미리보기 — 답장 배너와 동일한 패턴. 여기 뜨면 아래 입력창에
              적는 멘트가 일반 채팅이 아니라 이 오퍼를 소개하는 문구로 전송된다. */}
          {shareOfferTarget && (() => {
            const o = offers.find((x) => x.offer_id === shareOfferTarget);
            return (
              <div className="flex items-start gap-2 px-4 pt-2.5">
                {/* 드로어 카드와 동일한 정보량 — 클럽명·상태·가격·코멘트·구성까지 그대로 */}
                <div className="flex-1 min-w-0 pl-2 border-l-2 border-brand-amber/60">
                  <p className="text-[13px] font-bold text-foreground truncate">
                    {o?.club_name ?? "오퍼"}
                    {o?.is_invited && (
                      <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-brand-amber font-bold align-middle">
                        대화중
                      </span>
                    )}
                  </p>
                  {o && (
                    <>
                      <p className="text-[13px] text-money font-black mt-0.5">
                        ₩{o.proposed_price.toLocaleString()}
                      </p>
                      {o.comment && (
                        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
                          {o.comment}
                        </p>
                      )}
                      {o.includes?.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {o.includes.join(" · ")}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <button onClick={() => setShareOfferTarget(null)} className="p-1 text-muted-foreground shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })()}
          {/* 연락처 남기기(인스타/카톡/전화) — DM·오퍼 채팅과 동일 기능.
              최초 1회만 이 자리에 노출하고, X로 닫으면 이후 "+"메뉴에서만 연다
              (매번 뜨면 대화창을 계속 차지해서 거슬린다). */}
          {!contactRowDismissed ? (
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto no-scrollbar">
                <ContactPickerButton
                  me={me}
                  isMd={isMd}
                  onSend={(content) => handleSend(content)}
                  open={contactPickerOpen}
                  onOpenChange={setContactPickerOpen}
                />
              </div>
              <button onClick={dismissContactRow} className="p-1 text-muted-foreground shrink-0" aria-label="연락처 안내 닫기">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            // 트리거는 숨기되 컴포넌트는 마운트 유지 — +메뉴에서 open을 true로 바꿔 시트만 연다
            <ContactPickerButton
              me={me}
              isMd={isMd}
              onSend={(content) => handleSend(content)}
              open={contactPickerOpen}
              onOpenChange={setContactPickerOpen}
              hideTrigger
            />
          )}
          {/* 첫 진입 인사말 추천 — 한 번이라도 보내면 사라짐 */}
          {!iHaveSent && (
            <div className="flex gap-2 px-3 pt-2.5 overflow-x-auto no-scrollbar">
              {GREETING_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  disabled={sending}
                  className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-foreground/90 whitespace-nowrap active:bg-muted disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {media.length > 0 && (
            <div className="flex gap-2 px-4 pt-3">
              {media.map((m, i) => (
                <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden bg-card">
                  {m.type === "image" ? (
                    <Image src={m.url} alt="" fill className="object-cover" sizes="56px" />
                  ) : (
                    <video src={m.url} className="w-full h-full object-cover" muted />
                  )}
                  <button
                    onClick={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 grid place-items-center"
                  >
                    <X className="w-2.5 h-2.5 text-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative flex items-end gap-2 px-3 py-3">
            <ChatAttachMenu onFiles={handleFiles} onLocation={handleLocation} onContact={() => setContactPickerOpen(true)} />
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
              onFocus={onComposerFocus}
              onBlur={onComposerBlur}
              rows={1}
              placeholder="메시지 보내기"
              className="flex-1 min-w-0 resize-none bg-card text-foreground text-[14px] rounded-2xl border border-border px-4 py-2.5 outline-none placeholder:text-muted-foreground max-h-28"
            />
            <button
              onClick={() => handleSend()}
              disabled={sending || (input.trim().length === 0 && media.length === 0)}
              className="p-2.5 rounded-full bg-inverse text-inverse-foreground shrink-0 disabled:opacity-30"
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
            className="w-full max-w-lg bg-card rounded-t-3xl overflow-hidden"
            /* 하단 네비(56px) 위로 띄운다 — 안 그러면 목록 마지막 줄과 나가기 버튼이 네비에 가린다 */
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 56px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-[15px] font-black text-foreground">참여자 {memberCount}</p>
              <button onClick={() => setDrawerOpen(false)} className="p-1 text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto px-2 pb-3">
              {sortedParticipants.map((p) => {
                const canKick = isLeader && !p.is_leader && !p.is_md && p.id !== me.id;
                return (
                <li key={p.id} className="flex items-center gap-1 px-1">
                  <Link
                    href={`/u/${p.id}`}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-muted/60 min-w-0 flex-1"
                  >
                    <div className="relative w-9 h-9 rounded-full overflow-hidden bg-muted shrink-0">
                      {p.profile_image ? (
                        <Image src={p.profile_image} alt="" fill className="object-cover" sizes="36px" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[13px] font-bold text-muted-foreground">
                          {(p.display_name ?? "?").slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-foreground truncate">
                        {p.display_name ?? "멤버"}
                        {p.id === me.id && <span className="ml-1 text-[11px] text-brand-amber">나</span>}
                        {/* 성별·연령 제한 파티(Migration 594)에서만 의미가 있지만,
                            굳이 제한 여부로 숨기지 않고 정보가 있으면 그대로 보여준다 */}
                        {(p.age != null || p.gender) && (
                          <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
                            {[p.age != null ? `${p.age}세` : null, p.gender === "male" ? "남" : p.gender === "female" ? "여" : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </p>
                      {p.is_md && p.club_name && (
                        <p className="text-[11px] text-money font-medium truncate">{p.club_name}</p>
                      )}
                      {p.guest_count > 0 && (
                        <p className="text-[11px] text-muted-foreground">+{p.guest_count}명 동행</p>
                      )}
                    </div>
                  </Link>
                  {p.is_leader ? (
                    <span className={`shrink-0 mr-2 text-[11px] px-2 py-0.5 rounded-full font-bold ${p.is_md ? "bg-blue-500/15 text-blue-400" : "bg-amber-500/15 text-brand-amber"}`}>
                      {p.is_md ? "파트너" : "방장"}
                    </span>
                  ) : p.is_md ? (
                    <span className="shrink-0 mr-2 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold">
                      파트너
                    </span>
                  ) : canKick ? (
                    <button
                      onClick={() => { setKickReason(""); setKickTarget(p); }}
                      className="shrink-0 mr-2 text-[12px] px-2.5 py-1 rounded-full text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      내보내기
                    </button>
                  ) : null}
                </li>
                );
              })}
            </ul>

            {/* 나가기 — 방장(파트너)은 방을 유지해야 하므로 노출하지 않는다 */}
            {!isLeader && (
              <div className="px-4 pt-2 pb-1 border-t border-border">
                <button
                  onClick={() => { setDrawerOpen(false); setLeaveConfirm(true); }}
                  className="w-full py-3 rounded-xl text-[14px] font-bold text-red-400 active:bg-red-500/10 transition-colors"
                >
                  채팅방 나가기
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 나가기 확인 (채팅 목록의 나가기 시트와 동일한 문구) */}
      {leaveConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center"
          onClick={() => !leaving && setLeaveConfirm(false)}
        >
          <div
            className="w-full max-w-lg bg-card rounded-t-3xl p-5 space-y-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <p className="text-[16px] font-black text-foreground">이 채팅방에서 나갈까요?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {partyInfo.dateLabel} · {partyInfo.area}
                <br />
                단체채팅에서 나가고 파티 인원에서 빠져요.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLeaveConfirm(false)}
                disabled={leaving}
                className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold text-[14px] disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleLeaveParty}
                disabled={leaving}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-[14px] disabled:opacity-50"
              >
                {leaving ? "나가는 중…" : "나가기"}
              </button>
            </div>
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
            className="w-full max-w-lg bg-card rounded-t-3xl p-5 space-y-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <p className="text-[16px] font-black text-foreground">
                {kickTarget.display_name ?? "멤버"}님을 내보낼까요?
              </p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                내보내면 이 파티와 단체채팅에서 나가게 되고, <br />
                다시 합류할 수 없어요.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-muted-foreground">
                한마디 (선택) · 상대에게만 전달돼요
              </label>
              <textarea
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                rows={2}
                maxLength={100}
                placeholder="예: 인원이 맞지 않아 부득이하게 조정했어요"
                className="w-full resize-none bg-card text-foreground text-[14px] rounded-xl border border-border px-3.5 py-2.5 outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setKickTarget(null)}
                disabled={kicking}
                className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold text-[14px] disabled:opacity-50"
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
            <div className="flex items-center justify-around bg-card rounded-2xl border border-border px-2 py-3">
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
              className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border px-5 py-4 text-[15px] font-bold text-foreground hover:bg-muted/40"
            >
              <CornerDownRight className="w-5 h-5 text-muted-foreground" />
              답글
            </button>
            {/* 본인 메시지 삭제 */}
            {menuMsg.sender_id === me.id && (
              <button
                onClick={() => handleDeleteMessage(menuMsg)}
                className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border px-5 py-4 text-[15px] font-bold text-red-400 hover:bg-muted/40"
              >
                <Trash2 className="w-5 h-5" />
                삭제
              </button>
            )}
            <button
              onClick={() => setMenuMsg(null)}
              className="w-full bg-card rounded-2xl border border-border px-5 py-4 text-[15px] font-black text-foreground hover:bg-muted/40"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* MD 입장 동의 게이트: 미동의 시 채팅 차단 (Migration 587부터 무료) */}
      {showConsentGate && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-end justify-center">
          <div
            className="w-full max-w-lg bg-card rounded-t-3xl p-6 space-y-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
          >
            <div className="space-y-2 text-center">
              <div className="text-[34px] leading-none">🤝</div>
              <p className="text-[19px] font-black text-foreground">상담을 시작할까요?</p>
              <p className="text-[14px] text-foreground/80">
                파티원 전원이 있는 단톡방에서 상담해요 · <span className="text-brand-amber font-bold">무료</span>
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleStartConsult}
                disabled={consentBusy}
                className="w-full py-4 rounded-2xl bg-inverse text-inverse-foreground font-black text-[16px] disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {consentBusy ? "처리 중…" : "상담 시작"}
              </button>
              <button
                onClick={() => setDeclineConfirm(true)}
                disabled={consentBusy}
                className="w-full py-3 rounded-2xl text-[14px] text-muted-foreground hover:text-red-400 font-bold disabled:opacity-50 transition-colors"
              >
                거절 (메시지 철회)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 거절 재확인 */}
      {declineConfirm && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-end justify-center">
          <div
            className="w-full max-w-lg bg-card rounded-t-3xl p-6 space-y-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
          >
            <div className="space-y-2 text-center">
              <p className="text-[19px] font-black text-foreground">정말 거절할까요?</p>
              <p className="text-[14px] text-foreground/80">거절 시 오퍼가 철회됩니다.</p>
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
                className="w-full py-3 rounded-2xl text-[14px] text-muted-foreground hover:text-foreground font-bold disabled:opacity-50 transition-colors"
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
