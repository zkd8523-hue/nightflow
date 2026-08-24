"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOfferChats } from "@/hooks/useOfferChats";
import { usePartyChats } from "@/hooks/usePartyChats";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";
import { useDmThreads } from "@/hooks/useDmThreads";
import { UnreadBadge, unreadCountOf } from "@/components/chat/UnreadBadge";
import { contactCardPreview } from "@/components/messages/ContactCardMessage";
import type { DmThread } from "@/types/dm";

function formatDate(d: string): string {
  try {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  } catch {
    return "";
  }
}

// 카톡식 목록 시간: 오늘=시간(오전/오후 h:mm), 어제="어제", 그 이전="M월 D일"
function chatListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startToday.getDate() - 1);
  if (d >= startToday) {
    const h = d.getHours();
    const h12 = h % 12 || 12;
    return `${h < 12 ? "오전" : "오후"} ${h12}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  if (d >= startYesterday) return "어제";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 목록 미리보기 — 연락처 카드는 원본 토큰(__CONTACT__:dm:…) 대신 사람이 읽을 문구로
function previewText(content: string | null | undefined, fallback: string): string {
  if (!content) return fallback;
  return contactCardPreview(content) ?? content;
}

// DM이 시작된 파티 헤더 라벨 — 깃발/파티 헤더와 같은 톤(날짜 · 지역 · 예산)
function dmPartyHeaderLabel(puzzle: DmThread["puzzle"]): string {
  if (!puzzle) return "파티";
  const budgetText = puzzle.total_budget ? ` · ${Math.round(puzzle.total_budget / 10000)}만원` : "";
  return `${formatDate(puzzle.event_date)} · ${puzzle.area}${budgetText}`;
}

function dmPartyHref(puzzle: DmThread["puzzle"], puzzleId: string): string {
  return puzzle?.is_recruiting_party ? `/party/${puzzleId}` : `/flags/${puzzleId}`;
}

// 메시지(DM) 탭 한 행 — 단독 대화든 파티 그룹 안 대화든 동일하게 사용
function DmThreadRow({ thread, dim, subtitle }: { thread: DmThread; dim?: boolean; subtitle?: string }) {
  const name = thread.counterpart?.display_name ?? "익명";
  return (
    <Link
      href={`/dm/${thread.id}`}
      className={`flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-card transition-colors ${dim ? "opacity-50" : ""}`}
    >
      <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0">
        {thread.counterpart?.profile_image ? (
          <Image src={thread.counterpart.profile_image} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-foreground/60 text-[14px] font-black">
            {name.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-[14px] font-black truncate">{name}</span>
        </div>
        {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        <p className={`text-[13px] truncate ${(thread.unread_count ?? 0) > 0 ? "text-foreground/90 font-semibold" : "text-muted-foreground"}`}>
          {previewText(thread.last_message, "")}
        </p>
      </div>
      {(thread.unread_count ?? 0) > 0 ? (
        <UnreadBadge count={thread.unread_count ?? 0} className="shrink-0" />
      ) : (
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      )}
    </Link>
  );
}

export function MessagesListClient() {
  const router = useRouter();
  const flagOn = useOfferChatFlag();
  const { user, isLoading } = useCurrentUser();
  const { chats, loading, reload } = useOfferChats(user?.id);
  const { rooms: partyRooms, loading: partyLoading, reload: reloadParty } = usePartyChats(user?.id);
  const { threads: dmThreads } = useDmThreads(user?.id);

  // 롱프레스 → 채팅방 나가기
  type LeaveTarget =
    | { kind: "party"; puzzleId: string; isLeader: boolean; label: string }
    | { kind: "offer"; offerId: string; myRole: "leader" | "md"; label: string };
  const [leaveTarget, setLeaveTarget] = useState<LeaveTarget | null>(null);
  const [leaving, setLeaving] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const startPress = (t: LeaveTarget) => {
    longPressedRef.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      setLeaveTarget(t);
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  const suppressIfLongPress = (e: React.MouseEvent) => {
    if (longPressedRef.current) { e.preventDefault(); longPressedRef.current = false; }
  };

  async function handleLeave() {
    if (!leaveTarget || leaving) return;
    setLeaving(true);
    const supabase = createClient();
    let res;
    if (leaveTarget.kind === "party") {
      res = await supabase.rpc("leave_party", { p_puzzle_id: leaveTarget.puzzleId });
    } else {
      // 깃발 1:1: 대화 종료 (방장=거절 / MD=철회)
      res = await supabase.rpc(
        leaveTarget.myRole === "leader" ? "reject_offer" : "withdraw_offer",
        { p_offer_id: leaveTarget.offerId }
      );
    }
    const { data, error } = res;
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || "나가기에 실패했어요");
      setLeaving(false);
      return;
    }
    toast.success("채팅방에서 나왔어요");
    setLeaveTarget(null);
    setLeaving(false);
    reload();
    reloadParty();
  }

  // handleDeleteChat/handleDeleteAllClosed·groups·shareGroups(깃발 1:1 오퍼 채팅 그룹핑) 제거 — 깃발 탭 UI가 없어져 미사용.
  // chats/loading/reload(useOfferChats)는 빈 상태 판정과 나가기 갱신에 계속 쓰여 유지.

  // 탭 순서·기본값: 메시지(1) → 파티(2). 깃발 탭 제거. 진입 시 항상 메시지
  const [tab, setTab] = useState<"share" | "dm">("dm");
  const didAutoSelect = useRef(false);

  // 메시지(DM) 탭: 파티에서 시작된 대화는 그 파티별로 묶고(Migration 535 context_puzzle_id),
  // 파티가 이미 매칭/종료됐으면 "지난 대화"로 내려 접어둔다. 파티 무관 DM은 그대로 개별 표시.
  const [dmClosedOpen, setDmClosedOpen] = useState(false);
  const dmFeed = useMemo(() => {
    const openGroups = new Map<string, typeof dmThreads>();
    const closed: typeof dmThreads = [];
    const singles: typeof dmThreads = [];

    for (const t of dmThreads) {
      if (!t.context_puzzle_id) {
        singles.push(t);
        continue;
      }
      if (t.puzzle && (t.puzzle.status === "open" || t.puzzle.status === "selecting")) {
        const arr = openGroups.get(t.context_puzzle_id);
        if (arr) arr.push(t);
        else openGroups.set(t.context_puzzle_id, [t]);
      } else {
        // 파티가 매칭/취소/만료됐거나(또는 삭제돼 조인 실패) → 지난 대화로
        closed.push(t);
      }
    }

    type FeedItem =
      | { kind: "thread"; thread: (typeof dmThreads)[number]; sortAt: number }
      | { kind: "group"; puzzleId: string; threads: typeof dmThreads; sortAt: number };
    const items: FeedItem[] = [
      ...singles.map((t): FeedItem => ({ kind: "thread", thread: t, sortAt: new Date(t.last_message_at).getTime() })),
      ...Array.from(openGroups.entries()).map(([puzzleId, threads]): FeedItem => ({
        kind: "group",
        puzzleId,
        threads,
        sortAt: Math.max(...threads.map((t) => new Date(t.last_message_at).getTime())),
      })),
    ];
    items.sort((a, b) => b.sortAt - a.sortAt);

    return { items, closed };
  }, [dmThreads]);

  // 탭별 안읽음 합계 (카톡식 N 뱃지)
  const dmUnread = useMemo(
    () => dmThreads.reduce((sum, t) => sum + (t.unread_count ?? 0), 0),
    [dmThreads]
  );
  const shareUnread = useMemo(
    () => partyRooms.reduce((sum, r) => sum + unreadCountOf(r), 0),
    [partyRooms]
  );

  // 메시지가 비어 있어도 다른 탭으로 튀지 않는다(기본 탭 고정).
  // 단, 파티에 안 읽은 대화가 있으면 그쪽을 1회 먼저 보여준다. (깃발 탭 제거로 깃발 분기 삭제)
  useEffect(() => {
    if (didAutoSelect.current || loading || partyLoading) return;
    didAutoSelect.current = true;
    if (dmThreads.length > 0) return; // 메시지가 있으면 그대로 메시지 탭
    if (shareUnread > 0) setTab("share");
  }, [loading, partyLoading, shareUnread, dmThreads]);

  // 플래그 OFF면 기능 자체가 없음 → 홈으로
  useEffect(() => {
    if (!isLoading && !flagOn) router.replace("/");
  }, [isLoading, flagOn, router]);

  return (
    <div className="max-w-lg mx-auto min-h-dvh bg-background pb-24">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <header className="flex items-center gap-2 px-3 py-3">
          <button
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) router.back();
              else router.push("/");
            }}
            className="p-1 -ml-1 text-foreground/80"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[16px] font-black text-foreground">나의 채팅</h1>
        </header>
        {/* 🚩 깃발 탭 제거 — 메시지 / 파티 2탭 구조. 기존 깃발 오퍼 대화는 /flags/[id] 상세에서 계속 접근 가능 */}
        {user && (
          <div className="grid grid-cols-2 gap-1 p-1 mx-4 mb-2 bg-card rounded-full">
            <button
              onClick={() => { didAutoSelect.current = true; setTab("dm"); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-full text-[13px] font-black transition-colors ${tab === "dm" ? "bg-white/10 text-foreground" : "text-muted-foreground"}`}
            >
              <span>💬 메시지</span>
              {dmThreads.length > 0 && (
                <span className={`text-[11px] ${tab === "dm" ? "text-foreground/80" : "text-muted-foreground"}`}>
                  {dmThreads.length}
                </span>
              )}
              {/* 수락 게이트 폐지(470) — 신청 알림점 제거.
                  안읽음은 Migration 484부터 개수로 표시. */}
              <UnreadBadge count={dmUnread} />
            </button>
            <button
              onClick={() => { didAutoSelect.current = true; setTab("share"); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-full text-[13px] font-black transition-colors ${tab === "share" ? "bg-white/10 text-foreground" : "text-muted-foreground"}`}
            >
              <span>🎉 파티</span>
              {partyRooms.length > 0 && (
                <span className={`text-[11px] ${tab === "share" ? "text-foreground/80" : "text-muted-foreground"}`}>
                  {partyRooms.length}
                </span>
              )}
              <UnreadBadge count={shareUnread} />
            </button>
          </div>
        )}
      </div>

      {isLoading || loading || partyLoading ? (
        <p className="text-center text-[13px] text-muted-foreground mt-16">불러오는 중…</p>
      ) : !user ? (
        <p className="text-center text-[13px] text-muted-foreground mt-16">로그인이 필요해요</p>
      ) : chats.length === 0 && partyRooms.length === 0 && dmThreads.length === 0 ? (
        <div className="text-center mt-20 px-8">
          <p className="text-[14px] text-muted-foreground font-bold">아직 대화가 없어요</p>
          <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
            파티에 참여하면 단체 채팅방에서 <br />파트너와 대화를 시작할 수 있어요
          </p>
        </div>
      ) : tab === "dm" ? (
        dmThreads.length === 0 ? (
          <p className="text-center text-[13px] text-muted-foreground mt-16">메시지가 없어요</p>
        ) : (
          <div className="px-2 pt-1">
            {dmFeed.items.map((item) =>
              item.kind === "thread" ? (
                <DmThreadRow key={item.thread.id} thread={item.thread} />
              ) : (
                <div key={item.puzzleId} className="mb-1">
                  {/* 파티 헤더 — 이 파티에서 시작된 파트너 1:1 대화들을 묶음 */}
                  <Link
                    href={dmPartyHref(item.threads[0].puzzle, item.puzzleId)}
                    className="flex items-center justify-between gap-2 px-4 py-2.5 bg-card/40 active:bg-card rounded-xl"
                  >
                    <p className="text-[13px] font-bold text-foreground/80 truncate">
                      {dmPartyHeaderLabel(item.threads[0].puzzle)}
                    </p>
                    <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold">
                      {item.threads.length}명과 대화중
                    </span>
                  </Link>
                  {item.threads.map((t) => (
                    <DmThreadRow key={t.id} thread={t} />
                  ))}
                </div>
              )
            )}

            {/* 매칭/취소/만료로 끝난 파티의 1:1 대화 — 맨 아래 접힌 드롭다운으로 정리 */}
            {dmFeed.closed.length > 0 && (
              <div className="mt-2 border-t border-border">
                <button
                  onClick={() => setDmClosedOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3.5 active:bg-card/60"
                >
                  <span className="text-[13px] font-bold text-muted-foreground">
                    지난 대화 {dmFeed.closed.length}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${dmClosedOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {dmClosedOpen &&
                  dmFeed.closed.map((t) => (
                    <DmThreadRow key={t.id} thread={t} dim subtitle={dmPartyHeaderLabel(t.puzzle) + " · 종료"} />
                  ))}
              </div>
            )}
          </div>
        )
      ) : tab === "share" && partyRooms.length === 0 ? (
        <p className="text-center text-[13px] text-muted-foreground mt-16">파티 대화가 없어요</p>
      ) : (
        <div>
          {/* 파티 탭: 단체채팅방(파티) — 깃발과 동일한 헤더+행 구조 */}
          {tab === "share" && partyRooms.map((room) => {
            const budgetText = room.budget ? ` · ${Math.round(room.budget / 10000)}만원` : "";
            return (
              <div key={room.puzzle_id} className="mb-1">
                {/* 파티 헤더 — 깃발 헤더와 동일한 톤 */}
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-card/40">
                  <p className="text-[13px] font-bold text-foreground/80 truncate">
                    {formatDate(room.event_date)}
                  </p>
                  <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold">
                    {room.member_count}/{room.target_count}명
                  </span>
                </div>
                {/* 단체채팅 행 */}
                <Link
                  href={`/party/${room.puzzle_id}`}
                  onClick={suppressIfLongPress}
                  onContextMenu={(e) => { e.preventDefault(); setLeaveTarget({ kind: "party", puzzleId: room.puzzle_id, isLeader: room.is_leader, label: `${formatDate(room.event_date)} · ${room.area}` }); }}
                  onPointerDown={() => startPress({ kind: "party", puzzleId: room.puzzle_id, isLeader: room.is_leader, label: `${formatDate(room.event_date)} · ${room.area}` })}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  className={`flex items-center gap-3 px-4 py-3.5 active:bg-card/60 ${["expired", "cancelled"].includes(room.puzzle_status) ? "opacity-50" : ""}`}
                >
                  {/* 아바타: 클럽 대표 이미지 있으면 이미지, 없으면 지역 첫 글자 */}
                  <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0 grid place-items-center text-[14px] font-bold text-muted-foreground">
                    {room.club_thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={room.club_thumbnail} alt="" className="w-full h-full object-cover" decoding="async" />
                    ) : (
                      (room.area || "?").slice(0, 1)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[14px] font-bold text-foreground truncate">
                        {room.notes || `${formatDate(room.event_date)} · ${room.area}${budgetText}`}
                      </p>
                      {room.is_leader && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">MY</span>
                      )}
                    </div>
                    <p className={`text-[13px] truncate mt-0.5 ${unreadCountOf(room) > 0 ? "text-foreground/90 font-semibold" : "text-muted-foreground"}`}>
                      {previewText(room.last_content, "")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[11px] text-muted-foreground">{chatListTime(room.last_at)}</span>
                    <UnreadBadge count={unreadCountOf(room)} />
                  </div>
                </Link>
              </div>
            );
          })}
          {/* 🚩 깃발 탭 렌더(1:1 오퍼 채팅 그룹 + 종료된 채팅) 제거 — 탭 UI 자체를 없앰.
              기존 깃발 대화는 /flags/[id] 상세를 거쳐 /messages/[offerId]로 계속 접근 가능. */}
        </div>
      )}

      {/* 채팅방 나가기 확인 시트 */}
      {leaveTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center"
          onClick={() => !leaving && setLeaveTarget(null)}
        >
          <div
            className="w-full max-w-lg bg-card rounded-t-3xl p-5 space-y-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <p className="text-[16px] font-black text-foreground">
                이 채팅방에서 나갈까요?
              </p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {leaveTarget.label}
                <br />
                {leaveTarget.kind === "party"
                  ? leaveTarget.isLeader
                    ? "남은 멤버가 있으면 방장이 넘어가고, 없으면 파티가 마감돼요."
                    : "단체채팅에서 나가고 파티 인원에서 빠져요."
                  : "나가면 이 상담이 종료돼요(상대도 종료)."}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setLeaveTarget(null)}
                disabled={leaving}
                className="flex-1 py-3 rounded-xl bg-muted text-foreground font-bold text-[14px] disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-[14px] disabled:opacity-50"
              >
                {leaving ? "나가는 중…" : "나가기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
