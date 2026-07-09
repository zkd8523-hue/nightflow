"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronRight, ImageIcon, Pencil, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { uploadChatMedia } from "@/lib/utils/uploadChatMedia";
import { ChatMediaGrid } from "@/components/chat/ChatMediaGrid";
import { ChatContentText } from "@/components/chat/ChatContentText";
import { LeaderInfoSheet } from "@/components/puzzles/LeaderInfoSheet";
import { useOfferMessages } from "@/hooks/useOfferMessages";
import type { ChatMediaItem, OfferMessage } from "@/types/database";

const MAX_LEN = 500;

interface Profile {
  id: string;
  display_name: string | null;
  profile_image: string | null;
  deal_count_total?: number | null;
  deal_amount_total?: number | null;
}

interface OfferSummary {
  clubName: string | null;
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
  puzzleId,
  puzzleInfo,
  offerSummary,
}: Props) {
  const router = useRouter();
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
  const [profileOpen, setProfileOpen] = useState(false);
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
  // 수락 전(pending)에만 "방장 먼저" 차단 + 15크레딧 경고. 수락 후엔 우선순위·과금 없음.
  const mdBlocked = isMd && !leaderHasMessaged && !accepted;
  const mdFirstReply = isMd && !mdHasReplied && leaderHasMessaged && !accepted;

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

  const handleSend = useCallback(async (textOverride?: string) => {
    const isPreset = typeof textOverride === "string";
    const trimmed = (isPreset ? textOverride : input).trim();
    const useMedia = isPreset ? [] : media;
    if (sending || readOnly) return;

    // 수정 모드: 텍스트만 교체
    if (editingId && !isPreset) {
      if (trimmed.length < 1) {
        toast.error("내용을 입력해주세요");
        return;
      }
      if (trimmed.length > MAX_LEN) {
        toast.error(`${MAX_LEN}자를 넘을 수 없어요`);
        return;
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
        return;
      }
      updateLocalMessage(editingId, { content: trimmed, edited_at: new Date().toISOString() });
      setEditingId(null);
      setInput("");
      setSending(false);
      return;
    }

    if (trimmed.length < 1 && useMedia.length === 0) return;
    if (trimmed.length > MAX_LEN) {
      toast.error(`${MAX_LEN}자를 넘을 수 없어요`);
      return;
    }
    if (mdBlocked) {
      toast.error("방장이 먼저 대화를 시작해야 답장할 수 있어요");
      return;
    }
    // MD 첫 답장 → 15크레딧 경고
    if (mdFirstReply) {
      const ok = window.confirm(
        "답장을 보내면 15크레딧이 차감됩니다.\n(이 대화에서 처음 한 번만 차감, 이후 무제한 무료)"
      );
      if (!ok) return;
    }

    // 방장 첫 메시지 → 한 깃발 총 5팀 캡 (기본 3팀 앵커, 종료 포함·swap 없음)
    if (myRole === "leader" && !iHaveSent) {
      const sb = createClient();
      const { count } = await sb
        .from("puzzle_offers")
        .select("id", { count: "exact", head: true })
        .eq("puzzle_id", puzzleId)
        .not("leader_chat_started_at", "is", null);
      const n = (count ?? 0) + 1; // 이번이 n번째 대화
      const label = puzzleInfo.isRecruitingParty ? "조각" : "깃발";
      if (n > 5) {
        toast.error("한 깃발에서는 최대 5팀과 대화할 수 있어요.");
        return;
      }
      const confirmMsg =
        n <= 3
          ? `이 ${label}에서 ${n}/3번째 대화예요.\n대화를 시작할까요?`
          : n === 4
            ? "기본은 3팀이에요. 신중히 고르셨나요?\n원하시면 최대 5팀까지 대화할 수 있어요.\n계속할까요?"
            : "마지막 5번째 팀이에요. 이후로는 더 대화할 수 없어요.\n시작할까요?";
      if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
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
      return;
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
  }, [input, media, sending, readOnly, mdBlocked, mdFirstReply, myRole, iHaveSent, puzzleId, offerId, me, addLocalMessage, editingId, updateLocalMessage]);

  // 삭제된 메시지는 흔적 없이 숨김 (인스타 언센드식)
  const shownMessages = messages.filter((m) => !m.is_deleted);

  return (
    <div className="max-w-lg mx-auto min-h-dvh bg-[#0A0A0A] flex flex-col">
      {/* 헤더 + 오퍼 요약 (고정) */}
      <div className="sticky top-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-sm border-b border-neutral-800">
        <header className="flex items-center gap-3 px-3 py-3">
          <button onClick={() => router.push("/messages")} className="p-1 -ml-1 text-neutral-300">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {/* 상대 프로필 탭 → 정보 모달 (깃발 상세와 동일) */}
          <button
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0">
              {counterpart.profile_image ? (
                <Image src={counterpart.profile_image} alt="" fill className="object-cover" sizes="32px" />
              ) : (
                <div className="w-full h-full grid place-items-center text-[12px] font-bold text-neutral-400">
                  {(counterpart.display_name ?? "?").slice(0, 1)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-white truncate">
                {counterpart.display_name ?? (isMd ? "방장" : "파트너")}
              </p>
              <p className="text-[11px] text-neutral-500 truncate">{isMd ? "방장" : "파트너"}</p>
            </div>
          </button>
        </header>
        {/* 깃발+오퍼 요약 바 (당근 상품바 스타일) — 탭하면 깃발 상세로 */}
        <Link
          href={`/flags/${puzzleId}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#141416] border-t border-neutral-800/70 active:bg-neutral-900"
        >
          <div className="flex-1 min-w-0">
            {/* 위: 조각 — 날짜 · 지역 · 인당가 / 현재인원 · 깃발 — 날짜 · 인원 · 금액 */}
            <p className="text-[13px] font-bold text-white truncate">
              {puzzleInfo.isRecruitingParty
                ? [puzzleInfo.dateLabel, puzzleInfo.area, `인당 ${puzzleInfo.perPerson.toLocaleString()}원 / 현재 ${puzzleInfo.currentCount}명`]
                    .filter(Boolean)
                    .join(" · ")
                : [puzzleInfo.dateLabel, `${puzzleInfo.targetCount}명`, puzzleInfo.budgetText]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            {/* 아래: 오퍼 내용 */}
            <p className="text-[12px] text-neutral-400 truncate">
              {[offerSummary.clubName, offerSummary.includes.join(", ") || null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
        </Link>
        {/* 방장 전용: 채팅 → 상담 → 수락 동선 완결 */}
        {myRole === "leader" &&
          (accepted ? (
            <div className="px-4 py-2 border-t border-neutral-800/70 text-center text-[11px] text-neutral-500">
              ✓ 매칭 완료 · 예약을 확정하세요
            </div>
          ) : puzzleStatus === "open" || puzzleStatus === "selecting" ? (
            <button
              onClick={handleAcceptOffer}
              disabled={accepting}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white/95 hover:bg-white text-black font-black text-[13px] border-t border-neutral-800/70 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {accepting ? "수락 중…" : "이 오퍼 수락하기"}
            </button>
          ) : null)}
      </div>

      {/* 메시지 리스트 */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {loading ? (
          <p className="text-center text-[13px] text-neutral-600 mt-10">불러오는 중…</p>
        ) : shownMessages.length === 0 ? (
          <p className="text-center text-[13px] text-neutral-600 mt-10">
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
            return (
              <Fragment key={m.id}>
                {showDate && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-neutral-400 bg-neutral-800/70 rounded-full px-3 py-1">
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
                      className={`px-3 py-2 rounded-2xl select-none ${
                        mine
                          ? "bg-white text-black rounded-br-md"
                          : "bg-[#1C1C1E] text-white rounded-bl-md"
                      }`}
                    >
                      {m.content && (
                        <ChatContentText
                          content={m.content}
                          clubTags={[]}
                          className="text-[14px] leading-snug whitespace-pre-wrap break-words"
                        />
                      )}
                      {m.media?.length > 0 && <ChatMediaGrid items={m.media} />}
                    </div>
                    {/* 카톡식: "1"(안읽음) + 시간 — 보낸 메시지 안쪽 */}
                    <div className="flex flex-col items-end justify-end shrink-0 mb-0.5 gap-0.5 leading-none">
                      {unreadByOther && (
                        <span className="text-[11px] font-bold text-amber-400">1</span>
                      )}
                      {m.edited_at && (
                        <span className="text-[10px] text-neutral-600 whitespace-nowrap">수정됨</span>
                      )}
                      {showTime && (
                        <span className="text-[10px] text-neutral-500 whitespace-nowrap">
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
          <div className="px-4 py-4 border-t border-neutral-800 flex items-center justify-center gap-3 text-[13px]">
            <span className="text-neutral-500">종료된 대화예요. 삭제하시겠어요?</span>
            <button onClick={handleDeleteChat} className="font-bold text-red-400 hover:text-red-300 transition-colors">
              삭제
            </button>
          </div>
        ) : (
          <div className="px-4 py-4 border-t border-neutral-800 text-center text-[13px] text-neutral-500">
            종료된 {puzzleInfo.isRecruitingParty ? "조각" : "깃발"}이에요. 대화를 더 보낼 수 없어요.
          </div>
        )
      ) : mdBlocked ? (
        <div className="px-4 py-4 border-t border-neutral-800 text-center text-[13px] text-neutral-500">
          방장이 먼저 대화를 시작하면 답장할 수 있어요.
        </div>
      ) : (
        <div className="sticky bottom-0 bg-[#0A0A0A] border-t border-neutral-800" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {/* 빠른 답장 프리셋 (당근 스타일) — 내가 한 번 보내면 사라짐 */}
          {!iHaveSent && (
            <div className="flex gap-2 px-3 pt-2.5 overflow-x-auto no-scrollbar">
              {(isMd ? MD_PRESETS : LEADER_PRESETS).map((p) => (
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
          {mdFirstReply && (
            <p className="px-4 pt-2 text-[12px] text-amber-400 font-bold text-center">
              ⚡ 답장하면 15크레딧이 차감돼요 (이 대화 1회만)
            </p>
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
          {editingId && (
            <div className="flex items-center justify-between px-4 pt-2.5 pb-0.5">
              <span className="text-[12px] font-bold text-amber-400">메시지 수정 중</span>
              <button onClick={cancelEdit} className="text-[12px] text-neutral-500 hover:text-neutral-300">
                취소
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 px-3 py-3">
            {!editingId && (
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 text-neutral-400 shrink-0"
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
              rows={1}
              placeholder={editingId ? "메시지 수정…" : "메시지 보내기"}
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
            <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
              {!!menuMsg.content && (
                <button
                  onClick={() => startEditMessage(menuMsg)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-[15px] font-bold text-white hover:bg-neutral-800/40 border-b border-neutral-800/60"
                >
                  <Pencil className="w-5 h-5 text-neutral-400" />
                  수정
                </button>
              )}
              <button
                onClick={() => handleDeleteMessage(menuMsg.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-[15px] font-bold text-red-400 hover:bg-neutral-800/40"
              >
                <Trash2 className="w-5 h-5" />
                삭제
              </button>
            </div>
            <button
              onClick={() => setMenuMsg(null)}
              className="w-full bg-[#1C1C1E] rounded-2xl px-5 py-4 text-[15px] font-black text-white hover:bg-neutral-800/40"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 상대 정보 모달 (깃발 상세의 LeaderInfoSheet 재사용) */}
      <LeaderInfoSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        title={isMd ? "방장 정보" : "파트너 정보"}
        leader={{
          display_name: counterpart.display_name,
          profile_image: counterpart.profile_image,
          deal_count_total: counterpart.deal_count_total ?? 0,
          deal_amount_total: counterpart.deal_amount_total ?? 0,
        }}
      />
    </div>
  );
}
