"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { MapPin, X, Loader2, Hash, ArrowUp } from "lucide-react";
import { WagleIcon } from "@/components/icons/WagleIcon";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatComposerStore } from "@/stores/useChatComposerStore";
import { useAreaVerification } from "@/hooks/useAreaVerification";
import { useChatReactions } from "@/hooks/useChatReactions";
import { useChatReplyPreviews } from "@/hooks/useChatReplyPreviews";
import { ChatMessageItem } from "./ChatMessageItem";
import { AreaVerifySheet } from "./AreaVerifySheet";
import { ChatReplySheet } from "./ChatReplySheet";
import { ClubHashtagSuggester } from "./ClubHashtagSuggester";
import { ShotCarousel } from "./ShotCarousel";
import { ShotCaptureSheet } from "./ShotCaptureSheet";
import { ChatAttachMenu } from "./ChatAttachMenu";
import { SharePuzzleSheet } from "./SharePuzzleSheet";
import { getCurrentHashtagToken, extractHashtags } from "@/lib/chat/hashtag";
import { findClubIdsByAlias } from "@/lib/clubs/aliases";
import type { ChatMessage, Puzzle } from "@/types/database";
import {
  ROOM_LABEL,
  type ChatRoomCode,
  type ChatRegionCode,
  type VerifiableArea,
} from "@/lib/chat/areas";
import {
  CHAT_MEDIA_MAX_COUNT,
  uploadChatMedia,
  type ChatMediaItem,
} from "@/lib/utils/uploadChatMedia";

interface Props {
  room: ChatRoomCode;
  onAreaVerified?: (detected: VerifiableArea) => void;
  loginRedirect?: string;
  /** LIVE 라벨 행에 넣을 지역 필터 (세로 공간 절약) */
  regionFilter?: React.ReactNode;
}

const MAX_LEN = 500;

export function ChatRoom({ room, onAreaVerified, loginRedirect, regionFilter }: Props) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { messages, loading, reload, addLocalMessage } = useChatMessages(room);
  const { isVerified, activeAreas, refresh: refreshVerifications } =
    useAreaVerification();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyReason, setVerifyReason] = useState<"chat" | "shot">("chat");
  const [media, setMedia] = useState<ChatMediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setComposerFocused = useChatComposerStore((s) => s.setFocused);
  // 언마운트(와글 이탈) 시 포커스 상태 리셋 → 다른 탭에서 네비 숨김 잔존 방지
  useEffect(() => () => setComposerFocused(false), [setComposerFocused]);

  // 네비 숨김은 "가상 키보드가 화면을 먹는" 터치 기기에서만.
  // 데스크톱 웹은 키보드가 화면을 가리지 않으므로 숨기면 나갈 방법만 사라진다.
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(
      window.matchMedia("(hover: none) and (pointer: coarse)").matches
    );
  }, []);

  // 자동완성용 현재 # 토큰 위치
  const [hashtagToken, setHashtagToken] = useState<{
    token: string;
    start: number;
    end: number;
  } | null>(null);
  // 본문에 박제된 클럽 ID 매핑 (해시태그 텍스트 → 클럽 ID)
  // 메시지 전송 시 club_tags 컬럼에 사용
  const taggedClubsRef = useRef<Map<string, string>>(new Map());
  const newMsgAnchorRef = useRef<HTMLDivElement>(null);
  const scrollPaneRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);
  const forceScrollRef = useRef(false); // 내가 방금 보낸 글 → 스크롤 위치 무관 강제 하단
  const initialScrollDoneRef = useRef(false); // 현재 방 초기 스크롤 완료 여부
  const loginTarget = `/login?redirect=${encodeURIComponent(loginRedirect ?? "/chat")}`;
  // 도배 방지 (클라 사전 차단)
  const lastSentAtRef = useRef<number>(0);
  const lastSentContentRef = useRef<string>("");

  // 답글 시트
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);

  // LIVE 캡처 시트
  const [shotComposeOpen, setShotComposeOpen] = useState(false);

  // 내 조각 공유 (Migration 471) — 사진처럼 입력창에 첨부했다가 함께 전송
  const [sharePuzzleOpen, setSharePuzzleOpen] = useState(false);
  const [attachedPuzzle, setAttachedPuzzle] = useState<Puzzle | null>(null);

  // 메시지 ID 리스트 (이모지 반응 일괄 로드)
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { summaries: reactionSummaries, toggle: toggleReaction } =
    useChatReactions(messageIds, user?.id);

  // 답글 미리보기 — 피드에 인라인 노출 (카톡식).
  // ⚠️ reply_count 트리거가 신뢰 불가라, 최상위 메시지 '전부'를 넘겨 실제 답글을 직접 조회.
  const replyParentIds = useMemo(
    () => messages.filter((m) => !m.parent_id).map((m) => m.id),
    [messages]
  );
  // 새 답글이 오면 옵티미스틱 reply_count 합이 바뀌어 재조회 트리거 (+ 메시지 수 변화)
  const replyVersion = useMemo(
    () => messages.length + messages.reduce((s, m) => s + (m.reply_count || 0), 0),
    [messages]
  );
  const replyPreviews = useChatReplyPreviews(replyParentIds, replyVersion);

  // 알림에서 /chat?reply=<parentId>로 진입 시 해당 답글 스레드 자동 오픈
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rid = new URLSearchParams(window.location.search).get("reply");
    if (!rid) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("chat_messages")
        .select(
          `id, room, author_id, parent_id, reply_count, content, media, author_area, club_tags, is_deleted, created_at,
           author:public_user_profiles!chat_messages_author_id_fkey(id, display_name, profile_image)`
        )
        .eq("id", rid)
        .maybeSingle();
      if (cancelled || !data) return;
      const rawAuthor = (data as { author?: unknown }).author;
      const authorObj = Array.isArray(rawAuthor)
        ? (rawAuthor[0] as ChatMessage["author"])
        : (rawAuthor as ChatMessage["author"]);
      setReplyTarget({
        id: data.id,
        room: data.room as ChatMessage["room"],
        author_id: data.author_id,
        parent_id: (data as { parent_id?: string | null }).parent_id ?? null,
        reply_count: (data as { reply_count?: number }).reply_count ?? 0,
        content: data.content,
        media: ((data as { media?: ChatMessage["media"] }).media ?? []) as ChatMessage["media"],
        author_area: (data as { author_area?: ChatMessage["author_area"] }).author_area ?? null,
        club_tags: ((data as { club_tags?: string[] }).club_tags ?? []) as string[],
        is_deleted: data.is_deleted,
        created_at: data.created_at,
        author: authorObj,
        quoted_message_id: null,
        quoted_message: null,
      });
      // URL에서 reply 파라미터 제거 (뒤로가기/재마운트 시 재오픈 방지)
      window.history.replaceState(window.history.state, "", "/chat");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 방 전환 시 초기 스크롤/카운트 리셋 (이전 방과 혼동 방지)
  useEffect(() => {
    prevLenRef.current = 0;
    initialScrollDoneRef.current = false;
  }, [room]);

  // 카톡식: 최신이 아래. 내부 스크롤 pane(상단 캐러셀은 pane 밖이라 항상 보임).
  // - 방 최초 로드(로딩 끝 + 메시지 있음): 즉시 맨 아래.
  // - 새 글: 사용자가 이미 바닥 근처거나(nearBottom) 내가 방금 보낸 글일 때만 하단으로.
  //   (위로 스크롤해 옛 글 읽는 중이면 강제로 튀지 않음)
  useEffect(() => {
    if (loading) return; // 방 전환 스피너 중엔 스킵 (stale 메시지로 스크롤 방지)
    if (messages.length === 0) return;
    const pane = scrollPaneRef.current;
    if (!pane) return;
    const nearBottom =
      pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120;
    if (!initialScrollDoneRef.current) {
      pane.scrollTo({ top: pane.scrollHeight, behavior: "auto" });
      initialScrollDoneRef.current = true;
    } else if (
      (messages.length > prevLenRef.current && nearBottom) ||
      forceScrollRef.current
    ) {
      pane.scrollTo({ top: pane.scrollHeight, behavior: "smooth" });
    }
    forceScrollRef.current = false;
    prevLenRef.current = messages.length;
  }, [messages.length, loading, room]);

  // 컴포저 textarea 자동높이 동기화 — input이 프로그램적으로 바뀌는 경로
  // (전송 후 비우기, 해시태그 삽입, 전송 실패 복원)에서도 높이가 stale하지 않게.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 112)}px`;
  }, [input]);

  // Migration 421: 광역 채팅방은 인증 불필요 — 로그인만 하면 누구나 쓰기.
  const requiresVerification = false;
  const verifiedForRoom = true;

  // LIVE 작성 시 넘길 area — 인증된 지역이 있으면 힌트로 사용 (없으면 null, 전국 허용).
  const shotAuthorArea: VerifiableArea | null = useMemo(() => {
    return activeAreas.length > 0 ? activeAreas[0].area : null;
  }, [activeAreas]);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    if (!user) {
      router.push(loginTarget);
      return;
    }
    const slotsLeft = CHAT_MEDIA_MAX_COUNT - media.length;
    if (slotsLeft <= 0) {
      toast.error(`첨부는 최대 ${CHAT_MEDIA_MAX_COUNT}개까지 가능해요`);
      return;
    }
    const toUpload = files.slice(0, slotsLeft);
    if (files.length > slotsLeft) {
      toast.message(
        `${slotsLeft}개만 첨부됩니다 (최대 ${CHAT_MEDIA_MAX_COUNT}개)`
      );
    }
    setUploading(true);
    try {
      const results = await Promise.all(
        toUpload.map((f) => uploadChatMedia(f, user.id))
      );
      const ok = results.filter((r): r is ChatMediaItem => r !== null);
      if (ok.length > 0) {
        setMedia((prev) => [...prev, ...ok].slice(0, CHAT_MEDIA_MAX_COUNT));
      }
    } finally {
      setUploading(false);
    }
  }

  // 내 위치 — 첨부 미리보기에 담지 않고 바로 전송 (DM·조각방과 동일)
  async function handleLocation(item: ChatMediaItem) {
    if (!user) {
      router.push(loginTarget);
      return;
    }
    const { error } = await createClient()
      .from("chat_messages")
      .insert({ room, author_id: user.id, content: "", media: [item], club_tags: [] });
    if (error) {
      toast.error("위치를 보내지 못했어요");
      return;
    }
    forceScrollRef.current = true;
    reload();
  }

  function removeMedia(idx: number) {
    setMedia((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (sending) return;
    // 텍스트 / 미디어 / 조각 첨부 중 하나 이상 있어야 함
    if (trimmed.length < 1 && media.length === 0 && !attachedPuzzle) return;
    if (trimmed.length > MAX_LEN) {
      toast.error(`${MAX_LEN}자를 넘을 수 없어요`);
      return;
    }
    if (!user) {
      // 비로그인: 로그인 페이지로 강제 이동 (router.push가 막힐 케이스 대비 location 폴백)
      const target = loginTarget;
      try {
        router.push(target);
      } catch (e) {
        console.error("[ChatRoom] router.push failed, falling back", e);
      }
      // 만약 0.3초 안에 라우팅 안 됐으면 location으로 강제 이동
      setTimeout(() => {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = target;
        }
      }, 300);
      return;
    }
    if (requiresVerification && !verifiedForRoom) {
      setVerifyReason("chat");
      setVerifyOpen(true);
      return;
    }

    // 도배 방지 (클라 사전 차단, 서버 트리거 Migration 466과 동일 기준)
    const now = Date.now();
    // 분당 글수 제한 제거 (Migration 466) — 카톡식 실시간 UX. 서버도 더 이상 안 막음.
    // 1시간 내 같은 텍스트는 서버에서 1차 차단, 클라는 최근 1건만 빠른 가드
    if (trimmed.length > 0 && trimmed === lastSentContentRef.current) {
      toast.error("같은 내용은 잠시 후에 다시 보낼 수 있어요");
      return;
    }

    setSending(true);
    const supabase = createClient();

    // 조각 첨부는 RPC 경유 (본인 조각·모집중 검증이 서버에 있음)
    if (attachedPuzzle) {
      const puzzleId = attachedPuzzle.id;
      const { data, error } = await supabase.rpc("share_puzzle_to_chat", {
        p_room: room,
        p_puzzle_id: puzzleId,
        p_content: trimmed,
      });
      setSending(false);
      if (error || !data?.success) {
        const msg = error?.message ?? "";
        if (msg.includes("does not exist")) toast.error("파티 공유 마이그레이션 미적용 (471)");
        else toast.error(data?.error ?? "공유하지 못했어요");
        return;
      }
      setInput("");
      setAttachedPuzzle(null);
      lastSentContentRef.current = trimmed;
      lastSentAtRef.current = Date.now();
      forceScrollRef.current = true;
      reload();
      return;
    }

    // 본문에서 해시태그 추출 → 클럽 ID 매핑
    // 1) taggedClubsRef (자동완성으로 선택한 것) 우선
    // 2) 그 외 #토큰은 alias 매칭으로 추론
    const hashtags = extractHashtags(trimmed);
    const clubTagIds: string[] = [];
    const seen = new Set<string>();
    for (const tag of hashtags) {
      const fromRef = taggedClubsRef.current.get(tag);
      if (fromRef && !seen.has(fromRef)) {
        clubTagIds.push(fromRef);
        seen.add(fromRef);
        continue;
      }
      // alias 매칭으로 보완 (수동 입력했지만 일치하는 클럽 있을 때)
      const aliasMatches = findClubIdsByAlias(tag);
      if (aliasMatches.length === 1 && !seen.has(aliasMatches[0])) {
        clubTagIds.push(aliasMatches[0]);
        seen.add(aliasMatches[0]);
      }
    }

    // 입력은 먼저 비워서 체감 지연 제거
    const sentContent = trimmed;
    const sentMedia = media;
    setInput("");
    setMedia([]);
    setHashtagToken(null); // 전송 시 클럽태그 추천 팝업 닫기

    const { data: inserted, error } = await supabase
      .from("chat_messages")
      .insert({
        room,
        author_id: user.id,
        content: sentContent,
        media: sentMedia,
        club_tags: clubTagIds,
      })
      .select(
        `id, room, author_id, parent_id, reply_count, content, media, author_area, club_tags, is_deleted, created_at, quoted_message_id`
      )
      .single();
    if (error) {
      // 실패 시 입력 복원
      setInput(sentContent);
      setMedia(sentMedia);
      console.error("[ChatRoom] send error", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      if (
        error.code === "42501" ||
        error.message?.includes("row-level security")
      ) {
        toast.error("지역 인증이 만료되었어요. 다시 인증해주세요");
        setVerifyOpen(true);
      } else if (error.code === "42P01") {
        // 테이블 자체가 없음 → 284 마이그레이션 누락
        toast.error("DB 마이그레이션이 적용되지 않았습니다 (284)");
      } else if (error.code === "42703") {
        // 컬럼 누락 → 313/314 마이그레이션 미적용
        toast.error(
          `컬럼 누락 (313/314 미적용): ${error.message ?? ""}`
        );
      } else if (error.message?.includes("RATE_LIMIT_DUPLICATE")) {
        toast.error("1시간 이내 같은 내용은 보낼 수 없어요");
      } else if (error.message?.includes("RATE_LIMIT_PER_MINUTE")) {
        toast.error("1분에 5개까지만 보낼 수 있어요");
      } else {
        toast.error(`전송 실패: ${error.message ?? "알 수 없는 오류"}`);
      }
      setSending(false);
      return;
    }
    // 성공 시 도배 방지 ref 업데이트
    lastSentAtRef.current = now;
    lastSentContentRef.current = trimmed;

    // 옵티미스틱 prepend — realtime 이벤트보다 먼저 화면에 표시
    if (inserted) {
      forceScrollRef.current = true; // 내가 보낸 글은 위치 무관 하단으로
      addLocalMessage({
        id: inserted.id,
        room: inserted.room as typeof room,
        author_id: inserted.author_id,
        parent_id: inserted.parent_id ?? null,
        reply_count: inserted.reply_count ?? 0,
        content: inserted.content,
        media: (inserted.media ?? []) as never,
        author_area: inserted.author_area ?? null,
        club_tags: inserted.club_tags ?? [],
        is_deleted: inserted.is_deleted,
        created_at: inserted.created_at,
        author: {
          id: user.id,
          display_name: user.display_name ?? "나",
          profile_image: user.profile_image ?? null,
        },
        quoted_message_id: inserted.quoted_message_id ?? null,
        quoted_message: null,
      });
    }

    taggedClubsRef.current.clear();
    setSending(false);
  }


  // 컴포저 JSX (메시지 리스트 아래로 렌더)
  const composer = (
    <div className="shrink-0 bg-background border-t border-border">
      <div className="max-w-lg mx-auto px-3 py-2">
        {/* 미디어 미리보기 */}
        {attachedPuzzle && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-black text-foreground truncate">
                🎉 {attachedPuzzle.event_date.slice(5).replace("-", "/")} · {attachedPuzzle.area}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {attachedPuzzle.current_count}/{attachedPuzzle.target_count}명 모집 중
              </span>
            </span>
            <button
              type="button"
              onClick={() => setAttachedPuzzle(null)}
              className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-foreground shrink-0"
              aria-label="파티 첨부 삭제"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {media.length > 0 && (
          <div className="mb-2 flex gap-1.5 flex-wrap">
            {media.map((m, i) => (
              <div
                key={i}
                className="relative w-16 h-16 rounded-lg overflow-hidden bg-card border border-border"
              >
                {m.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <video
                      src={m.url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-foreground text-[10px]">
                        ▶
                      </div>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-foreground"
                  aria-label="삭제"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* 카톡식 한 줄 입력 */}
        <div className="relative flex items-end gap-2">
          {/* 클럽태그 안내 (# 눌렀지만 아직 클럽명 입력 전) */}
          {hashtagToken && hashtagToken.token.length === 0 && (
            <div className="absolute left-0 right-0 bottom-full mb-2 z-20 flex justify-center">
              <div className="px-3 py-2 rounded-full bg-muted border border-border text-[12px] text-foreground/80 shadow-lg">
클럽을 <span className="text-brand-amber font-bold">태그</span>할 수 있어요 🏷️
              </div>
            </div>
          )}
          {/* 해시태그 추천 (입력창 위 팝업) */}
          {hashtagToken && hashtagToken.token.length > 0 && (
            <div className="absolute left-0 right-0 bottom-full mb-2 z-20">
              <ClubHashtagSuggester
                query={hashtagToken.token}
                open={true}
                onSelect={(club) => {
                  const before = input.slice(0, hashtagToken.start);
                  const after = input.slice(hashtagToken.end);
                  const insert = `#${club.name}`;
                  const newInput = `${before}${insert} ${after}`;
                  setInput(newInput);
                  taggedClubsRef.current.set(club.name, club.id);
                  setHashtagToken(null);
                  setTimeout(() => {
                    const ta = textareaRef.current;
                    if (ta) {
                      const cursor = hashtagToken.start + insert.length + 1;
                      ta.focus();
                      ta.setSelectionRange(cursor, cursor);
                    }
                  }, 0);
                }}
              />
            </div>
          )}
          <ChatAttachMenu
            onFiles={handleFiles}
            onLocation={handleLocation}
            onSharePuzzle={() => {
              if (!user) {
                router.push(loginTarget);
                return;
              }
              setSharePuzzleOpen(true);
            }}
            disabled={uploading || media.length >= CHAT_MEDIA_MAX_COUNT}
          />
          {/* 입력 pill */}
          <div className="flex-1 min-w-0 flex items-end gap-1 bg-card rounded-3xl border border-border pl-4 pr-1.5 py-1.5">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                const v = e.target.value;
                setInput(v);
                const cursor = e.target.selectionStart ?? v.length;
                setHashtagToken(getCurrentHashtagToken(v, cursor));
                // 카톡식 자동 높이 조절 (최대 ~4줄)
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
              }}
              onSelect={(e) => {
                const t = e.currentTarget;
                setHashtagToken(
                  getCurrentHashtagToken(t.value, t.selectionStart ?? 0)
                );
              }}
              onFocus={() => {
                if (isTouchDevice) setComposerFocused(true);
              }}
              onBlur={() => {
                setComposerFocused(false);
                setTimeout(() => setHashtagToken(null), 100);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Escape" && hashtagToken) {
                  setHashtagToken(null);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지 입력"
              rows={1}
              maxLength={MAX_LEN}
              className="flex-1 min-w-0 bg-transparent text-foreground text-[16px] placeholder:text-muted-foreground focus:outline-none resize-none leading-snug py-1.5 max-h-28"
            />
            <button
              type="button"
              onClick={() => {
                const ta = textareaRef.current;
                if (!ta) return;
                const start = ta.selectionStart ?? input.length;
                const end = ta.selectionEnd ?? input.length;
                const prev = input.slice(0, start);
                const next = input.slice(end);
                const needsSpace = prev.length > 0 && !/\s$/.test(prev);
                const insert = needsSpace ? " #" : "#";
                const newValue = `${prev}${insert}${next}`;
                setInput(newValue);
                const cursor = prev.length + insert.length;
                setTimeout(() => {
                  ta.focus();
                  ta.setSelectionRange(cursor, cursor);
                  setHashtagToken({ token: "", start: cursor - 1, end: cursor });
                }, 0);
              }}
              className="shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center text-brand-amber hover:bg-muted transition-colors"
              aria-label="클럽 태그"
            >
              <Hash className="w-4 h-4" />
            </button>
          </div>
          {/* 전송 */}
          <button
            onClick={handleSend}
            disabled={
              !user ||
              (requiresVerification && !verifiedForRoom) ||
              (!input.trim() && media.length === 0 && !attachedPuzzle) ||
              sending ||
              uploading
            }
            className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center bg-inverse text-inverse-foreground disabled:bg-muted disabled:text-muted-foreground transition-colors"
            aria-label="전송"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
            )}
          </button>
        </div>
        {/* 글자수 (한도 임박 시에만) */}
        {input.length >= 450 && (
          <div className="mt-1 pr-12 text-right text-[11px] text-brand-amber">
            {input.length}/{MAX_LEN}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 와글 LIVE 통합 캐러셀 — 상단 고정(스크롤 안 됨), 채팅만 내부 스크롤 */}
      <div className="shrink-0">
      <ShotCarousel
        currentRoom={room === "all" ? undefined : (room as ChatRegionCode)}
        headerRight={regionFilter}
        size={68} // LIVE 탭은 홈(60)보다 조금 크게
        showComposeButton={true}
        currentUserId={user?.id}
        currentUserProfile={user ? { profile_image: user.profile_image ?? null, display_name: user.display_name ?? null } : null}
        onComposeClick={() => {
          if (!user) {
            router.push(loginTarget);
            return;
          }
          // 인증 여부 상관 없이 항상 캡처 시트 오픈 — 안에서 일반/LIVE 분기
          setShotComposeOpen(true);
        }}
      />
      </div>

      {/* LIVE 캡처 시트 — area 없어도 클럽 미지정 LIVE는 게시 가능 */}
      {user && (
        <ShotCaptureSheet
          open={shotComposeOpen}
          onOpenChange={setShotComposeOpen}
          area={shotAuthorArea}
          userId={user.id}
          userProfile={{
            display_name: user.display_name ?? null,
            profile_image: user.profile_image ?? null,
          }}
          onRequestAreaVerify={() => {
            setShotComposeOpen(false);
            setVerifyReason("shot");
            setVerifyOpen(true);
          }}
        />
      )}

      {/* 내 파티 공유 (Migration 471) */}
      <SharePuzzleSheet
        open={sharePuzzleOpen}
        onOpenChange={setSharePuzzleOpen}
        userId={user?.id}
        onSelect={setAttachedPuzzle}
      />

      {/* 지역방 + 미인증 = 항상 보이는 인증 학습 안내 (글 유무 무관) */}
      {requiresVerification && !verifiedForRoom && (
        <div className="py-6 px-6 text-center border-b border-border">
          <p className="text-[15px] text-foreground font-bold">
            현위치 인증자만 참여할 수 있어요
          </p>
          <button
            onClick={() => {
              if (!user) {
                router.push(loginTarget);
                return;
              }
              setVerifyReason("chat");
              setVerifyOpen(true);
            }}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-black bg-amber-500 text-black"
          >
            <MapPin className="w-4 h-4" />
            {ROOM_LABEL[room]}
            {hasJongseong(ROOM_LABEL[room]) ? "이에요" : "예요"}
          </button>
        </div>
      )}

      {/* 메시지 영역 — 높이 제한 내부 스크롤 (카톡식). 새 글이 오면 아래로, 오래된 건 위로 밀림 */}
      {/* 입력 중일 때 메시지 영역을 터치하면 키보드를 내린다(카톡식).
          /chat은 헤더가 없고 입력 포커스 시 BottomNav도 숨어서, 이게 없으면
          키보드를 띄운 뒤 화면을 빠져나갈 방법이 없다. */}
      <div
        ref={scrollPaneRef}
        className="flex-1 min-h-0 overflow-y-auto"
        onPointerDown={(e) => {
          // 웹은 네비가 계속 보이므로 굳이 포커스를 뺏지 않는다(입력 중 클릭 시 짜증)
          if (!isTouchDevice) return;
          if (!textareaRef.current) return;
          if (document.activeElement !== textareaRef.current) return;
          // 메시지 안의 버튼/링크 탭은 그대로 살린다 (blur 후에도 click은 발생)
          const el = e.target as HTMLElement;
          if (el.closest("button, a, input, textarea")) return;
          textareaRef.current.blur();
        }}
      >
      {loading ? (
        <div className="py-10 text-center text-[13px] text-muted-foreground">
          불러오는 중...
        </div>
      ) : messages.length === 0 ? (
        <div className="py-10 px-6 text-center">
          <p className="text-[13px] text-muted-foreground">
            {room === "all"
              ? "첫 LIVE를 남겨보세요!"
              : `지금 ${ROOM_LABEL[room]}에 있다면 첫 LIVE를 남겨보세요!`}
          </p>
        </div>
      ) : (
        <div>
          {/* 오래된 → 최신 순으로 표시 (카톡식, 새 메시지가 아래) — parent_id 있는 답글은 타임라인에서 제외 */}
          {(() => {
            const sorted = [...messages].filter((m) => !m.parent_id);
            // 같은 작성자 + 5분 이내 연속이면 그루핑 (헤더 숨김)
            const GROUP_GAP_MS = 5 * 60 * 1000;
            return sorted.map((m, idx) => {
              const prev = sorted[idx - 1];
              const isGrouped =
                !!prev &&
                prev.author_id === m.author_id &&
                new Date(m.created_at).getTime() -
                  new Date(prev.created_at).getTime() <
                  GROUP_GAP_MS;
              return (
                <ChatMessageItem
                  key={m.id}
                  message={m}
                  currentUserId={user?.id}
                  isLoggedIn={!!user}
                  isAdmin={user?.role === "admin"}
                  reactionSummary={reactionSummaries.get(m.id)}
                  replyPreview={replyPreviews.get(m.id)}
                  onReact={(emoji) => toggleReaction(m.id, emoji)}
                  onOpenReplies={(target) => setReplyTarget(target)}
                  onChange={reload}
                  onRequireLogin={() => router.push(loginTarget)}
                  groupedWithPrev={isGrouped}
                />
              );
            });
          })()}
        </div>
      )}

      {/* 새 메시지 스크롤 앵커 — 리스트 맨 아래 */}
      <div ref={newMsgAnchorRef} />
      </div>

      {/* 카톡식 컴포저 — 컬럼 하단 고정 (fixed 아님, 내부 스크롤 pane 아래) */}
      {composer}

      <AreaVerifySheet
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        reason={verifyReason}
        onSuccess={(detected) => {
          // ChatRoom 인스턴스의 useAreaVerification 상태도 갱신
          refreshVerifications();
          onAreaVerified?.(detected);
        }}
      />

      <ChatReplySheet
        open={!!replyTarget}
        onOpenChange={(v) => {
          if (!v) setReplyTarget(null);
        }}
        parent={replyTarget}
        onChange={reload}
      />
    </div>
  );
}

/** 한국어 마지막 글자에 받침(종성) 있는지 — 조사 분기용 */
function hasJongseong(text: string): boolean {
  if (!text) return false;
  const last = text.charCodeAt(text.length - 1);
  // 한글 가(0xAC00) ~ 힣(0xD7A3)
  if (last < 0xac00 || last > 0xd7a3) return false;
  return (last - 0xac00) % 28 !== 0;
}

