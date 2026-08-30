"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronRight, ImageIcon, Instagram, MessageCircle, Phone, Pencil, IdCard, MapPin, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadChatMedia } from "@/lib/utils/uploadChatMedia";
import { ChatMediaGrid } from "@/components/chat/ChatMediaGrid";
import { ChatContentText } from "@/components/chat/ChatContentText";
import { ChatLinkPreview } from "@/components/chat/ChatLinkPreview";
import { firstLinkInContent } from "@/lib/chat/hashtag";
import { ContactCardMessage, isContactCardContent, encodeContactCard, type ContactCardMethod } from "@/components/messages/ContactCardMessage";
import { useComposerNavHide } from "@/hooks/useComposerNavHide";
import { useOfferMessages } from "@/hooks/useOfferMessages";
import type { ChatMediaItem, ContactMethodType, OfferMessage } from "@/types/database";

const MAX_LEN = 500;

interface Profile {
  id: string;
  display_name: string | null;
  profile_image: string | null;
  deal_count_total?: number | null;
  deal_amount_total?: number | null;
  // MD 본인 연락처 — "연락처 첨부" 기능에서 본인이 채운 채널만 첨부 가능
  instagram?: string | null;
  phone?: string | null;
  kakao_open_chat_url?: string | null;
  preferred_contact_methods?: ContactMethodType[] | null;
}

interface OfferSummary {
  clubName: string | null;
  clubAddress?: string | null;
  tableType: string;
  price: number;
  includes: string[];
}

interface PuzzleInfo {
  dateLabel: string;
  area: string;
  targetCount: number;
  currentCount: number;
  perPerson: number;
  budgetText: string;
  isRecruitingParty: boolean;
}

interface Props {
  offerId: string;
  me: Profile;
  myRole: "leader" | "md";
  counterpart: Profile;
  /** 'expired' | 'cancelled' 이면 읽기전용 */
  puzzleStatus: string;
  offerStatus: string;
  /** MD가 방장 연락처를 이미 열람(과금)했는지 (Migration 449) */
  mdContactUnlocked?: boolean;
  puzzleId: string;
  puzzleInfo: PuzzleInfo;
  offerSummary: OfferSummary;
}

const LEADER_PRESETS = [
  "안녕하세요!",
  "예약 가능할까요?",
  "오늘 방문 가능해요?",
  "테이블 위치가 어디예요?",
  "지금 바로 가도 되나요?",
];
const MD_PRESETS = [
  "안녕하세요! 문의 감사합니다 😊",
  "네, 예약 가능합니다",
  "위치 안내드릴게요",
  "지금 바로 가능해요",
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

export function MessageRoom({
  offerId,
  me,
  myRole,
  counterpart,
  puzzleStatus,
  offerStatus,
  mdContactUnlocked = false,
  puzzleId,
  puzzleInfo,
  offerSummary,
}: Props) {
  const router = useRouter();
  // 입력 포커스 중엔 하단 네비를 숨겨 키보드와 겹치지 않게 (와글과 동일)
  const { focused: composerFocused, onFocus: onComposerFocus, onBlur: onComposerBlur } =
    useComposerNavHide();
  const {
    messages,
    loading,
    addLocalMessage,
    updateLocalMessage,
    leaderReadAt,
    mdReadAt,
  } = useOfferMessages(offerId);

  const [input, setInput] = useState("");
  const [media, setMedia] = useState<ChatMediaItem[]>([]);
  const [sending, setSending] = useState(false);
  // 본인 메시지 수정/삭제
  const [menuMsg, setMenuMsg] = useState<OfferMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(offerStatus === "accepted");

  // 방장 전용: 채팅 중에 이 오퍼 수락
  async function handleAcceptOffer() {
    if (accepting || accepted) return;
    const ok = window.confirm(
      "이 오퍼를 수락하시겠어요?\n수락하면 파트너 연락처가 안내되고, 다른 오퍼와의 대화는 종료됩니다."
    );
    if (!ok) return;
    setAccepting(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("accept_offer", { p_offer_id: offerId });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "수락에 실패했어요");
      setAccepting(false);
      return;
    }
    setAccepted(true);
    setAccepting(false);
    toast.success("수락 완료! 파트너와 예약을 확정하세요.");
  }

  async function handleDeleteChat() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("hide_offer_chat", { p_offer_id: offerId });
    if (error || !data?.success) {
      toast.error(data?.error || "삭제에 실패했습니다");
      return;
    }
    router.push("/messages");
  }

  // 본인 메시지 롱프레스 → 수정/삭제 메뉴
  function startPress(m: OfferMessage) {
    if (m.is_deleted || m.sender_id !== me.id) return;
    cancelPress();
    pressTimer.current = setTimeout(() => setMenuMsg(m), 450);
  }
  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function startEditMessage(m: OfferMessage) {
    setMenuMsg(null);
    setEditingId(m.id);
    setInput(m.content);
    setMedia([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function cancelEdit() {
    setEditingId(null);
    setInput("");
  }

  async function handleDeleteMessage(id: string) {
    setMenuMsg(null);
    if (typeof window !== "undefined" && !window.confirm("이 메시지를 삭제할까요?")) return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("delete_offer_message", { p_message_id: id });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "삭제에 실패했어요");
      return;
    }
    updateLocalMessage(id, { is_deleted: true, content: "", media: [] });
    if (editingId === id) cancelEdit();
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 종료된 오퍼(다른 MD 매칭/거절/철회) 또는 종료된 깃발이면 읽기전용
  const offerClosed = offerStatus === "expired" || offerStatus === "rejected" || offerStatus === "withdrawn";
  const readOnly = puzzleStatus === "expired" || puzzleStatus === "cancelled" || offerClosed;
  const isMd = myRole === "md";
  // 상대(counterpart)의 읽음 포인터 — 내 메시지의 "1" 계산용
  const counterpartReadAt = myRole === "leader" ? mdReadAt : leaderReadAt;
  // MD 전용: 방장이 먼저 말 걸었는지 / 내가 답장했는지
  const leaderHasMessaged = messages.some((m) => m.sender_id === counterpart.id);
  const iHaveSent = messages.some((m) => m.sender_id === me.id);
  const mdHasReplied = iHaveSent;
  // 방장 연락처 열람 과금 (Migration 449): MD가 답장/수락/열람 전이면 방장 연락처 카드 잠금
  const [contactUnlockedLocal, setContactUnlockedLocal] = useState(mdContactUnlocked);
  const [unlockingContact, setUnlockingContact] = useState(false);
  const contactPaid = accepted || mdHasReplied || contactUnlockedLocal;
  async function handleUnlockContact() {
    if (unlockingContact) return;
    setUnlockingContact(true);
    const { data, error } = await createClient().rpc("unlock_leader_contact", { p_offer_id: offerId });
    setUnlockingContact(false);
    const res = data as { success?: boolean; error?: string } | null;
    if (error || !res?.success) {
      toast.error(res?.error ?? "열람에 실패했어요");
      return;
    }
    setContactUnlockedLocal(true);
  }
  // 수락 전(pending)에만 "방장 먼저" 차단 + 15크레딧 경고. 수락 후엔 우선순위·과금 없음.
  const mdBlocked = isMd && !leaderHasMessaged && !accepted;
  const mdFirstReply = isMd && !mdHasReplied && leaderHasMessaged && !accepted;
  // 상대(파트너/방장)가 1회 이상 답장했는지. 방장 화면에서 이게 true여야 수락 버튼 노출
  // (파트너 응답 전 블라인드 수락 방지 + 마찰 완화). leaderHasMessaged와 동일 값(상대 발신 여부).
  const counterpartReplied = leaderHasMessaged;

  // "연락처 남기기" — 등록된 채널은 바로 전송, 미등록(유저)은 인라인 등록 후 전송
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [myContact, setMyContact] = useState({
    instagram: me.instagram ?? null,
    kakao_open_chat_url: me.kakao_open_chat_url ?? null,
  });
  // 인라인 등록 모달 (미등록 인스타/오픈챗)
  const [registerMethod, setRegisterMethod] = useState<"dm" | "kakao" | null>(null);
  const [registerValue, setRegisterValue] = useState("");
  const [registerPublic, setRegisterPublic] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  type ContactOption =
    | { method: ContactCardMethod; label: string; value: string; registered: true }
    | { method: "dm" | "kakao"; label: string; registered: false };

  const contactOptions: ContactOption[] = (() => {
    const list: ContactOption[] = [];
    if (isMd) {
      // MD: 본인이 등록한 채널만 (preferred_contact_methods 필터)
      const methods = me.preferred_contact_methods;
      const showAll = !methods || methods.length === 0;
      if ((showAll || methods!.includes("dm")) && myContact.instagram)
        list.push({ method: "dm", label: "인스타그램 DM", value: myContact.instagram.replace(/^@/, ""), registered: true });
      if ((showAll || methods!.includes("kakao")) && myContact.kakao_open_chat_url)
        list.push({ method: "kakao", label: "카카오 오픈채팅", value: myContact.kakao_open_chat_url, registered: true });
      if ((showAll || methods!.includes("phone")) && me.phone)
        list.push({ method: "phone", label: "전화", value: me.phone, registered: true });
      return list;
    }
    // 유저: 전화(인증됨) + 인스타/오픈챗(등록됨→전송 / 미등록→등록)
    if (me.phone) list.push({ method: "phone", label: "전화번호 · 인증됨", value: me.phone, registered: true });
    if (myContact.instagram) list.push({ method: "dm", label: "인스타그램", value: myContact.instagram.replace(/^@/, ""), registered: true });
    else list.push({ method: "dm", label: "인스타그램", registered: false });
    if (myContact.kakao_open_chat_url) list.push({ method: "kakao", label: "카카오 오픈채팅", value: myContact.kakao_open_chat_url, registered: true });
    else list.push({ method: "kakao", label: "카카오 오픈채팅", registered: false });
    return list;
  })();

  function sendContactCard(method: ContactCardMethod, value: string) {
    setContactPickerOpen(false);
    handleSend(encodeContactCard(method, value));
  }

  function openRegister(method: "dm" | "kakao") {
    setRegisterMethod(method);
    setRegisterValue("");
    setRegisterPublic(false);
  }

  async function saveAndSendContact() {
    if (!registerMethod) return;
    const raw = registerValue.trim();
    if (!raw) return;
    let value = raw;
    const update: Record<string, unknown> = {};
    if (registerMethod === "dm") {
      value = raw.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
      if (!value) { toast.error("인스타그램 아이디를 확인해주세요"); return; }
      update.instagram = value;
    } else {
      if (!/^https?:\/\//.test(raw)) { toast.error("오픈채팅 링크를 확인해주세요"); return; }
      update.kakao_open_chat_url = raw;
    }
    if (registerPublic) update.contact_public = true;
    setSavingContact(true);
    const { error } = await createClient().from("users").update(update).eq("id", me.id);
    setSavingContact(false);
    if (error) { toast.error("저장에 실패했어요"); return; }
    setMyContact((c) => registerMethod === "dm" ? { ...c, instagram: value } : { ...c, kakao_open_chat_url: value });
    const m = registerMethod;
    setRegisterMethod(null);
    setContactPickerOpen(false);
    handleSend(encodeContactCard(m, value));
  }

  // 방장 진입 게이트: 대화 안 시작한 방장이 채팅방에 들어오면 "대화하시겠어요?" 시트 → 확인 시 자동 인사.
  // 3한도 안내는 상단 배너가 이미 하므로 반복하지 않고, 상한(5팀) 근접/초과 시에만 경고/차단.
  const [gate, setGate] = useState<null | { n: number; blocked: boolean }>(null);
  const [gateSending, setGateSending] = useState(false);
  const gateCheckedRef = useRef(false);

  // 입장/메시지 변화 시 읽음 처리
  useEffect(() => {
    if (loading) return;
    (async () => {
      const { error } = await createClient().rpc("mark_offer_read", { p_offer_id: offerId });
      if (error) {
        console.error("[mark_offer_read] failed", error);
        toast.error(`읽음 처리 실패: ${error.message}`);
      }
    })();
  }, [offerId, loading, messages.length]);

  // 스크롤 맨 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;
    const slots = Math.max(0, 4 - media.length);
    const uploaded = (
      await Promise.all(files.slice(0, slots).map((f) => uploadChatMedia(f, me.id)))
    ).filter(Boolean) as ChatMediaItem[];
    if (uploaded.length) setMedia((prev) => [...prev, ...uploaded].slice(0, 4));
  }

  const handleSend = useCallback(async (textOverride?: string, skipLeaderGate?: boolean): Promise<boolean> => {
    const isPreset = typeof textOverride === "string";
    const trimmed = (isPreset ? textOverride : input).trim();
    const useMedia = isPreset ? [] : media;
    if (sending || readOnly) return false;

    // 수정 모드: 텍스트만 교체
    if (editingId && !isPreset) {
      if (trimmed.length < 1) {
        toast.error("내용을 입력해주세요");
        return false;
      }
      if (trimmed.length > MAX_LEN) {
        toast.error(`${MAX_LEN}자를 넘을 수 없어요`);
        return false;
      }
      setSending(true);
      const supabase = createClient();
      const { data, error } = await supabase.rpc("edit_offer_message", {
        p_message_id: editingId,
        p_content: trimmed,
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "수정에 실패했어요");
        setSending(false);
        return false;
      }
      updateLocalMessage(editingId, { content: trimmed, edited_at: new Date().toISOString() });
      setEditingId(null);
      setInput("");
      setSending(false);
      return true;
    }

    if (trimmed.length < 1 && useMedia.length === 0) return false;
    if (trimmed.length > MAX_LEN) {
      toast.error(`${MAX_LEN}자를 넘을 수 없어요`);
      return false;
    }
    if (mdBlocked) {
      toast.error("방장이 먼저 대화를 시작해야 답장할 수 있어요");
      return false;
    }
    // MD 첫 답장 → 15크레딧 경고
    if (mdFirstReply) {
      const ok = window.confirm(
        "답장을 보내면 15크레딧이 차감됩니다.\n(이 대화에서 처음 한 번만 차감, 이후 무제한 무료)"
      );
      if (!ok) return false;
    }

    // 방장 첫 메시지 → 한 깃발 총 5팀 캡 (기본 3팀 앵커, 종료 포함·swap 없음)
    // 진입 게이트에서 자동 인사로 보낼 땐 skipLeaderGate=true (게이트가 이미 확인/차단 처리).
    if (myRole === "leader" && !iHaveSent && !skipLeaderGate) {
      const sb = createClient();
      const { count } = await sb
        .from("puzzle_offers")
        .select("id", { count: "exact", head: true })
        .eq("puzzle_id", puzzleId)
        .not("leader_chat_started_at", "is", null);
      const n = (count ?? 0) + 1; // 이번이 n번째 대화
      const label = puzzleInfo.isRecruitingParty ? "파티" : "깃발";
      if (n > 5) {
        toast.error(`한 ${label}에서는 최대 5팀과 대화할 수 있어요.`);
        return false;
      }
      const confirmMsg =
        n <= 3
          ? `이 ${label}에서 ${n}/3번째 대화예요.\n대화를 시작할까요?`
          : n === 4
            ? "기본은 3팀이에요. 신중히 고르셨나요?\n원하시면 최대 5팀까지 대화할 수 있어요.\n계속할까요?"
            : "마지막 5번째 팀이에요. 이후로는 더 대화할 수 없어요.\n시작할까요?";
      if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return false;
    }

    setSending(true);
    const supabase = createClient();
    const sentContent = trimmed;
    const sentMedia = useMedia;
    if (!isPreset) {
      setInput("");
      setMedia([]);
    }

    const { data, error } = await supabase.rpc("send_offer_message", {
      p_offer_id: offerId,
      p_content: sentContent,
      p_media: sentMedia,
    });

    if (error || !data?.success) {
      if (!isPreset) {
        setInput(sentContent);
        setMedia(sentMedia);
      }
      toast.error(data?.error || error?.message || "전송에 실패했어요");
      setSending(false);
      return false;
    }

    // 옵티미스틱 추가 (realtime 이벤트보다 먼저)
    if (data.message_id) {
      const local: OfferMessage = {
        id: data.message_id,
        offer_id: offerId,
        sender_id: me.id,
        content: sentContent,
        media: sentMedia,
        is_deleted: false,
        created_at: new Date().toISOString(),
        sender: me,
      };
      addLocalMessage(local);
    }
    setSending(false);
    return true;
  }, [input, media, sending, readOnly, mdBlocked, mdFirstReply, myRole, iHaveSent, puzzleId, offerId, me, addLocalMessage, editingId, updateLocalMessage, puzzleInfo.isRecruitingParty]);

  // 진입 게이트 오픈: 방장이 아직 대화 안 건 채팅방에 들어오면 자동 표시(1회).
  useEffect(() => {
    if (gateCheckedRef.current || loading || readOnly) return;
    if (myRole !== "leader" || iHaveSent) return;
    gateCheckedRef.current = true;
    (async () => {
      const { count } = await createClient()
        .from("puzzle_offers")
        .select("id", { count: "exact", head: true })
        .eq("puzzle_id", puzzleId)
        .not("leader_chat_started_at", "is", null);
      const n = (count ?? 0) + 1; // 이번이 n번째 대화
      setGate({ n, blocked: n > 5 });
    })();
  }, [loading, readOnly, myRole, iHaveSent, puzzleId]);

  // 게이트 확인 → 자동으로 "안녕하세요!" 발송 (인라인 확인은 우회) → 성공 시 바로 "연락처 남기기" 시트 제안
  const confirmGate = useCallback(async () => {
    setGateSending(true);
    const ok = await handleSend("안녕하세요!", true);
    setGateSending(false);
    setGate(null);
    if (ok) setContactPickerOpen(true);
  }, [handleSend]);

  // 삭제된 메시지는 흔적 없이 숨김 (인스타 언센드식)
  const shownMessages = messages.filter((m) => !m.is_deleted);

  return (
    // 하단 네비(56px)를 띄운 채로 대화 — 와글(/chat)과 동일한 높이 계산.
    <div
      className={`max-w-lg mx-auto bg-background flex flex-col overflow-hidden ${
        composerFocused
          ? "h-[calc(100dvh-env(safe-area-inset-bottom))]"
          : "h-[calc(100dvh-56px-env(safe-area-inset-bottom))]"
      }`}
    >
      {/* 헤더 + 오퍼 요약 (고정) */}
      <div className="shrink-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <header className="flex items-center gap-3 px-3 py-3">
          <button onClick={() => router.push("/messages")} className="p-1 -ml-1 text-foreground/80">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {/* 상대 프로필 탭 → 공개 프로필 페이지로 이동 */}
          <button
            onClick={() => router.push(`/u/${counterpart.id}`)}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            <div className="relative w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
              {counterpart.profile_image ? (
                <Image src={counterpart.profile_image} alt="" fill className="object-cover" sizes="32px" />
              ) : (
                <div className="w-full h-full grid place-items-center text-[12px] font-bold text-muted-foreground">
                  {(counterpart.display_name ?? "?").slice(0, 1)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-foreground truncate">
                {counterpart.display_name ?? (isMd ? "방장" : "파트너")}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{isMd ? "방장" : "파트너"}</p>
            </div>
          </button>
        </header>
        {/* 깃발+오퍼 요약 바 (당근 상품바 스타일) — 탭하면 깃발 상세로 */}
        <Link
          href={`/flags/${puzzleId}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-background border-t border-border/70 active:bg-card"
        >
          <div className="flex-1 min-w-0">
            {/* 위: 파티 — 날짜 · 지역 · 인당가 / 현재인원 · 깃발 — 날짜 · 인원 · 금액 */}
            <p className="text-[13px] font-bold text-foreground truncate">
              {puzzleInfo.isRecruitingParty
                ? [puzzleInfo.dateLabel, puzzleInfo.area, `인당 ${puzzleInfo.perPerson.toLocaleString()}원 / 현재 ${puzzleInfo.currentCount}명`]
                    .filter(Boolean)
                    .join(" · ")
                : [puzzleInfo.dateLabel, `${puzzleInfo.targetCount}명`, puzzleInfo.budgetText]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            {/* 아래: 오퍼 내용 */}
            <p className="text-[12px] text-muted-foreground truncate">
              {[offerSummary.clubName, offerSummary.includes.join(", ") || null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>
        {/* 매칭 완료 배너: 양쪽 모두 노출. 수락 버튼은 방장 전용(수락 주체) */}
        {accepted ? (
          <div className="px-4 py-2 border-t border-border/70 text-center text-[11px] text-muted-foreground">
            ✓ 매칭 완료 · 예약을 확정하세요
          </div>
        ) : myRole === "leader" && (puzzleStatus === "open" || puzzleStatus === "selecting") && counterpartReplied ? (
          <button
            onClick={handleAcceptOffer}
            disabled={accepting}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-inverse/95 hover:bg-inverse text-inverse-foreground font-black text-[13px] border-t border-border/70 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {accepting ? "수락 중…" : "이 오퍼 수락하기"}
          </button>
        ) : null}
      </div>

      {/* 메시지 리스트 */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {loading ? (
          <p className="text-center text-[13px] text-muted-foreground mt-10">불러오는 중…</p>
        ) : shownMessages.length === 0 ? (
          <p className="text-center text-[13px] text-muted-foreground mt-10">
            {isMd
              ? accepted
                ? "매칭됐어요! 먼저 인사를 보내보세요"
                : "방장의 메시지를 기다리고 있어요"
              : "예약 문의를 시작해보세요"}
          </p>
        ) : (
          shownMessages.map((m, i) => {
            const mine = m.sender_id === me.id;
            const d = new Date(m.created_at);
            const prev = i > 0 ? shownMessages[i - 1] : null;
            const showDate = !prev || !isSameDay(new Date(prev.created_at), d);
            const next = i < shownMessages.length - 1 ? shownMessages[i + 1] : null;
            // 같은 사람·같은 분의 연속 메시지는 마지막 것만 시간 표시 (카톡식)
            const showTime =
              !next ||
              next.sender_id !== m.sender_id ||
              !isSameMinute(new Date(next.created_at), d);
            const unreadByOther =
              mine && (!counterpartReadAt || new Date(counterpartReadAt) < d);
            const isContactCard = !!m.content && isContactCardContent(m.content);
            return (
              <Fragment key={m.id}>
                {showDate && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-muted-foreground bg-muted/70 rounded-full px-3 py-1">
                      {formatDateDivider(d)}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`flex items-end gap-1.5 max-w-[80%] ${mine ? "flex-row-reverse" : ""}`}>
                    <div
                      onContextMenu={(e) => {
                        if (mine) {
                          e.preventDefault();
                          setMenuMsg(m);
                        }
                      }}
                      onDoubleClick={() => { if (mine) setMenuMsg(m); }}
                      onTouchStart={() => startPress(m)}
                      onTouchEnd={cancelPress}
                      onTouchMove={cancelPress}
                      onPointerDown={() => startPress(m)}
                      onPointerUp={cancelPress}
                      onPointerLeave={cancelPress}
                      className={
                        isContactCard
                          ? "select-none"
                          : `px-3 py-2 rounded-2xl select-none ${
                              mine
                                ? "bg-inverse text-inverse-foreground rounded-br-md"
                                : "bg-card text-foreground rounded-bl-md"
                            }`
                      }
                    >
                      {isContactCard ? (
                        // MD가 아직 과금 전이면 방장 연락처 카드 잠금(열람 시 과금)
                        !mine && isMd && !contactPaid ? (
                          <button
                            onClick={handleUnlockContact}
                            disabled={unlockingContact}
                            className="flex flex-col items-start gap-0.5 rounded-2xl rounded-bl-md bg-card border border-amber-500/40 px-4 py-3 text-left active:bg-muted disabled:opacity-60"
                          >
                            <span className="text-[13px] font-bold text-brand-amber">🔒 유저가 연락처를 남겼어요</span>
                            <span className="text-[12px] text-muted-foreground">열람 시 15크레딧이 차감돼요</span>
                            <span className="mt-1 text-[13px] font-black text-foreground">
                              {unlockingContact ? "여는 중…" : "열람하기 →"}
                            </span>
                          </button>
                        ) : (
                          <ContactCardMessage content={m.content} />
                        )
                      ) : m.content ? (
                        <>
                          <ChatContentText
                            content={m.content}
                            clubTags={[]}
                            className="text-[14px] leading-snug whitespace-pre-wrap break-words"
                          />
                          {firstLinkInContent(m.content) && (
                            <ChatLinkPreview url={firstLinkInContent(m.content)!} />
                          )}
                        </>
                      ) : null}
                      {m.media?.length > 0 && <ChatMediaGrid items={m.media} />}
                    </div>
                    {/* 카톡식: "1"(안읽음) + 시간 — 보낸 메시지 안쪽 */}
                    <div className="flex flex-col items-end justify-end shrink-0 mb-0.5 gap-0.5 leading-none">
                      {unreadByOther && (
                        <span className="text-[11px] font-bold text-brand-amber">1</span>
                      )}
                      {m.edited_at && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">수정됨</span>
                      )}
                      {showTime && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatTime(d)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 / 상태 안내 */}
      {readOnly ? (
        offerClosed ? (
          <div className="px-4 py-4 border-t border-border flex items-center justify-center gap-3 text-[13px]">
            <span className="text-muted-foreground">종료된 대화예요. 삭제하시겠어요?</span>
            <button onClick={handleDeleteChat} className="font-bold text-red-400 hover:text-red-300 transition-colors">
              삭제
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 border-t border-border text-center text-[13px] text-muted-foreground">
            종료된 {puzzleInfo.isRecruitingParty ? "파티" : "깃발"}이에요. 대화를 더 보낼 수 없어요.
          </div>
        )
      ) : mdBlocked ? (
        <div className="shrink-0 px-4 py-4 border-t border-border text-center text-[13px] text-muted-foreground">
          방장이 먼저 대화를 시작하면 답장할 수 있어요.
        </div>
      ) : (
        <div className="shrink-0 bg-background border-t border-border">
          {/* 연락처 남기기(유저·MD) / 주소 보내기(MD) */}
          {(contactOptions.length > 0 || (isMd && offerSummary.clubName)) && (
            <div className="flex gap-2 px-3 pt-2.5 overflow-x-auto no-scrollbar">
              {contactOptions.length > 0 && (
                <button
                  onClick={() => setContactPickerOpen(true)}
                  className="shrink-0 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-bold text-foreground whitespace-nowrap active:bg-muted"
                >
                  <IdCard className="w-3.5 h-3.5" />
                  {isMd ? "연락처 보내기" : "연락처 남기기"}
                </button>
              )}
              {offerSummary.clubName && (
                <button
                  onClick={() =>
                    handleSend(
                      encodeContactCard("address", `${offerSummary.clubName}||${offerSummary.clubAddress ?? ""}`)
                    )
                  }
                  className="shrink-0 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-bold text-foreground whitespace-nowrap active:bg-muted"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  주소 보내기
                </button>
              )}
            </div>
          )}
          {/* 빠른 답장 프리셋 (당근 스타일) — 내가 한 번 보내면 사라짐 */}
          {!iHaveSent && (
            <div className="flex gap-2 px-3 pt-2.5 overflow-x-auto no-scrollbar">
              {(isMd ? MD_PRESETS : LEADER_PRESETS).map((p) => (
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
          {mdFirstReply && (
            <p className="px-4 pt-2 text-[12px] text-brand-amber font-bold text-center">
              ⚡ 답장하면 15크레딧이 차감돼요 (이 대화 1회만)
            </p>
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
          {editingId && (
            <div className="flex items-center justify-between px-4 pt-2.5 pb-0.5">
              <span className="text-[12px] font-bold text-brand-amber">메시지 수정 중</span>
              <button onClick={cancelEdit} className="text-[12px] text-muted-foreground hover:text-foreground/80">
                취소
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 px-3 py-3">
            {!editingId && (
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 text-muted-foreground shrink-0"
                aria-label="사진 첨부"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFilePick} />
            <textarea
              ref={inputRef}
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
              placeholder={editingId ? "메시지 수정…" : "메시지 보내기"}
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

      {/* 연락처 남기기 선택 시트 — 등록된 채널은 전송, 미등록(유저)은 등록 모달 */}
      {contactPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
          onClick={() => setContactPickerOpen(false)}
        >
          <div
            className="w-full max-w-lg p-3 space-y-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {!isMd && (
                <div className="px-5 pt-4 pb-2.5 border-b border-border/60">
                  <p className="text-[15px] font-black text-foreground">연락처 남기기</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">다른 연락수단을 선호하시다면, 바로 남겨주세요</p>
                </div>
              )}
              {contactOptions.map((opt, i) => {
                const Icon = opt.method === "dm" ? Instagram : opt.method === "kakao" ? MessageCircle : Phone;
                return (
                  <button
                    key={opt.method}
                    onClick={() => (opt.registered ? sendContactCard(opt.method, opt.value) : openRegister(opt.method as "dm" | "kakao"))}
                    className={`w-full flex items-center gap-3 px-5 py-4 text-[15px] font-bold text-foreground hover:bg-muted/40 ${
                      i < contactOptions.length - 1 ? "border-b border-border/60" : ""
                    }`}
                  >
                    <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{opt.label}</span>
                    {opt.registered ? (
                      <span className="text-[13px] text-muted-foreground font-medium truncate max-w-[45%]">
                        {opt.method === "dm" ? `@${opt.value}` : opt.method === "phone" ? opt.value : "보내기"}
                      </span>
                    ) : (
                      <span className="text-[13px] text-brand-amber font-bold shrink-0">등록하고 보내기 →</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setContactPickerOpen(false)}
              className="w-full bg-card rounded-2xl border border-border px-5 py-4 text-[15px] font-black text-foreground hover:bg-muted/40"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 미등록 채널 인라인 등록 모달 */}
      {registerMethod && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center"
          onClick={() => setRegisterMethod(null)}
        >
          <div
            className="w-full max-w-lg p-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <p className="text-[15px] font-black text-foreground">
                {registerMethod === "dm" ? "인스타그램 아이디" : "카카오 오픈채팅 링크"}
              </p>
              {registerMethod === "dm" ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[14px]">@</span>
                  <input
                    type="text"
                    value={registerValue}
                    onChange={(e) => setRegisterValue(e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, ""))}
                    maxLength={30}
                    placeholder="your_instagram_id"
                    autoFocus
                    className="w-full bg-muted border border-border rounded-lg pl-7 pr-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              ) : (
                <input
                  type="url"
                  value={registerValue}
                  onChange={(e) => setRegisterValue(e.target.value)}
                  placeholder="https://open.kakao.com/..."
                  autoFocus
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-blue-500"
                />
              )}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={registerPublic}
                  onChange={(e) => setRegisterPublic(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-white"
                />
                <span>
                  <span className="block text-[13px] text-foreground font-bold">내 프로필에도 표시하기</span>
                  <span className="block text-[11px] text-muted-foreground">꺼두면 이 대화에서만 공유돼요</span>
                </span>
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setRegisterMethod(null)}
                  className="flex-1 h-11 rounded-xl border border-border text-foreground/80 font-bold text-[14px] hover:bg-muted"
                >
                  취소
                </button>
                <button
                  onClick={saveAndSendContact}
                  disabled={savingContact || !registerValue.trim()}
                  className="flex-1 h-11 rounded-xl bg-inverse text-inverse-foreground font-black text-[14px] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingContact ? "저장 중..." : "저장하고 보내기"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 본인 메시지 수정/삭제 액션 시트 */}
      {menuMsg && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
          onClick={() => setMenuMsg(null)}
        >
          <div
            className="w-full max-w-lg p-3 space-y-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {!!menuMsg.content && (
                <button
                  onClick={() => startEditMessage(menuMsg)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-[15px] font-bold text-foreground hover:bg-muted/40 border-b border-border/60"
                >
                  <Pencil className="w-5 h-5 text-muted-foreground" />
                  수정
                </button>
              )}
              <button
                onClick={() => handleDeleteMessage(menuMsg.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-[15px] font-bold text-red-400 hover:bg-muted/40"
              >
                <Trash2 className="w-5 h-5" />
                삭제
              </button>
            </div>
            <button
              onClick={() => setMenuMsg(null)}
              className="w-full bg-card rounded-2xl border border-border px-5 py-4 text-[15px] font-black text-foreground hover:bg-muted/40"
            >
              취소
            </button>
          </div>
        </div>
      )}


      {/* 방장 진입 게이트 — "대화하시겠어요?" → 확인 시 자동 "안녕하세요!". 취소/차단은 뒤로 */}
      {gate && (() => {
        const { n, blocked } = gate;
        const title = blocked
          ? "더 이상 대화할 수 없어요"
          : n <= 3
            ? "대화하시겠어요?"
            : n === 4
              ? "이미 여러 곳과 상담 중이에요"
              : "마지막 한 팀이에요";
        const body = blocked
          ? `이 ${puzzleInfo.isRecruitingParty ? "파티" : "깃발"}에서는 최대 5팀과 대화할 수 있어요.`
          : n <= 3
            ? "확인하면 '안녕하세요!'로 대화가 시작돼요."
            : n === 4
              ? "기본 3팀을 넘었어요. 최대 5팀까지 가능해요. 계속할까요?"
              : "이 팀 이후로는 더 대화할 수 없어요. 시작할까요?";
        const cta = n === 5 ? "시작하기" : "계속하기";
        return (
          <div className="fixed inset-0 z-[60] flex items-end justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => { if (!gateSending) router.back(); }}
            />
            <div className="relative w-full max-w-lg bg-card rounded-t-3xl p-6 pb-8 space-y-5 animate-in slide-in-from-bottom-4 duration-200"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
              <div className="space-y-2 text-center">
                <div className="text-[36px]">💬</div>
                <h2 className="text-[19px] font-black text-foreground tracking-tight break-keep">{title}</h2>
                <p className="text-[14px] text-muted-foreground leading-relaxed break-keep">{body}</p>
              </div>
              {blocked ? (
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="w-full h-13 py-3.5 rounded-2xl bg-inverse text-inverse-foreground font-black text-[15px] hover:opacity-90 active:scale-[0.99] transition-all"
                >
                  뒤로
                </button>
              ) : (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={confirmGate}
                    disabled={gateSending}
                    className="w-full h-13 py-3.5 rounded-2xl bg-inverse text-inverse-foreground font-black text-[15px] hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    {gateSending ? "시작하는 중…" : cta}
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!gateSending) router.back(); }}
                    disabled={gateSending}
                    className="w-full h-12 py-3 rounded-2xl bg-muted text-foreground/80 font-bold text-[14px] hover:bg-muted/60 active:scale-[0.99] transition-all disabled:opacity-60"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
