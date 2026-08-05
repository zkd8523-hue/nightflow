"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOfferChats } from "@/hooks/useOfferChats";
import { usePartyChats } from "@/hooks/usePartyChats";
import { useOfferChatFlag } from "@/hooks/useOfferChatFlag";
import { useDmThreads } from "@/hooks/useDmThreads";
import { UnreadBadge, unreadCountOf } from "@/components/chat/UnreadBadge";
import { contactCardPreview } from "@/components/messages/ContactCardMessage";

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

// 종료된 대화(만료/거절/철회)는 읽을 수 없으므로 미읽음 집계에서 제외
function isClosedStatus(status: string): boolean {
  return status === "expired" || status === "rejected" || status === "withdrawn";
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

  const handleDeleteChat = async (offerId: string) => {
    if (typeof window !== "undefined" &&
        !window.confirm("이 종료된 대화를 삭제할까요?\n삭제하면 목록에서 사라집니다.")) return;
    const { data, error } = await createClient().rpc("hide_offer_chat", { p_offer_id: offerId });
    if (error || !data?.success) {
      toast.error(data?.error || "삭제에 실패했습니다");
      return;
    }
    reload();
  };

  // 종료된 채팅 모아서 한 번에 삭제
  const [deletingAll, setDeletingAll] = useState(false);
  const handleDeleteAllClosed = async (offerIds: string[]) => {
    if (deletingAll || offerIds.length === 0) return;
    if (typeof window !== "undefined" &&
        !window.confirm(`종료된 대화 ${offerIds.length}개를 모두 삭제할까요?`)) return;
    setDeletingAll(true);
    const supabase = createClient();
    const results = await Promise.all(
      offerIds.map((id) => supabase.rpc("hide_offer_chat", { p_offer_id: id }))
    );
    setDeletingAll(false);
    const failed = results.filter((r) => r.error || !r.data?.success).length;
    if (failed > 0) toast.error(`${failed}개는 삭제하지 못했어요`);
    else toast.success("종료된 대화를 모두 삭제했어요");
    reload();
  };

  // 깃발(puzzle)별 그룹 — 그룹은 최근 활동순, 그룹 내부도 최근순(RPC가 정렬해 옴)
  const groups = useMemo(() => {
    const map = new Map<string, typeof chats>();
    for (const c of chats) {
      const arr = map.get(c.puzzle_id);
      if (arr) arr.push(c);
      else map.set(c.puzzle_id, [c]);
    }
    // 이벤트 날짜 임박순(빠른 날짜 먼저). 같은 날짜면 최근 대화순.
    return Array.from(map.values()).sort((a, b) => {
      const d = new Date(a[0].event_date).getTime() - new Date(b[0].event_date).getTime();
      if (d !== 0) return d;
      return new Date(b[0].last_at).getTime() - new Date(a[0].last_at).getTime();
    });
  }, [chats]);

  // 깃발 / 조각 섹션 분리 (is_recruiting_party 기준)
  const sections = useMemo(() => [
    { key: "flag", label: "🚩 깃발", items: groups.filter((g) => !g[0].is_recruiting_party) },
    { key: "share", label: "🎉 파티", items: groups.filter((g) => g[0].is_recruiting_party) },
  ], [groups]);

  // 탭 순서·기본값: 메시지(1) → 조각(2) → 깃발(3), 진입 시 항상 메시지
  const [tab, setTab] = useState<"flag" | "share" | "dm">("dm");
  const activeSection = sections.find((s) => s.key === tab)!;
  const didAutoSelect = useRef(false);

  // 깃발 탭: 진행 중인 대화만 위에 깃발별로 묶어 보여주고,
  // 종료(만료/거절/철회)된 대화는 맨 아래 "종료된 채팅" 드롭다운으로 몰아둔다.
  const [closedOpen, setClosedOpen] = useState(false);
  const flagOpenGroups = useMemo(
    () =>
      sections[0].items
        .map((g) => g.filter((c) => !isClosedStatus(c.offer_status)))
        .filter((g) => g.length > 0),
    [sections]
  );
  const flagClosedChats = useMemo(
    () => sections[0].items.flatMap((g) => g.filter((c) => isClosedStatus(c.offer_status))),
    [sections]
  );

  // 탭별 안읽음 합계 (카톡식 N 뱃지)
  const dmUnread = useMemo(
    () => dmThreads.reduce((sum, t) => sum + (t.unread_count ?? 0), 0),
    [dmThreads]
  );
  const shareUnread = useMemo(
    () => partyRooms.reduce((sum, r) => sum + unreadCountOf(r), 0),
    [partyRooms]
  );
  const flagUnread = useMemo(
    () =>
      sections[0].items.reduce(
        (sum, g) =>
          sum +
          g.reduce((s, c) => s + (isClosedStatus(c.offer_status) ? 0 : unreadCountOf(c)), 0),
        0
      ),
    [sections]
  );

  // 메시지가 비어 있어도 다른 탭으로 튀지 않는다(기본 탭 고정).
  // 단, 깃발/조각에 안 읽은 대화가 있으면 그쪽을 1회 먼저 보여준다.
  useEffect(() => {
    if (didAutoSelect.current || loading || partyLoading) return;
    didAutoSelect.current = true;
    if (dmThreads.length > 0) return; // 메시지가 있으면 그대로 메시지 탭
    if (shareUnread > 0) setTab("share");
    else if (flagUnread > 0) setTab("flag");
  }, [loading, partyLoading, shareUnread, flagUnread, dmThreads]);

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
        {user && (
          <div className="grid grid-cols-3 gap-1 p-1 mx-4 mb-2 bg-card rounded-full">
            {/* 1번 메시지(DM) — 항상 노출 (메시지/파티/깃발 3채널 구조) */}
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
            {/* 2번 파티 → 3번 깃발 (sections는 flag,share 순이라 역순 렌더) */}
            {[...sections].reverse().map((s) => {
              const isShare = s.key === "share";
              // 조각 탭 = 파티 단체방만(1:1 제거), 깃발 탭 = 1:1 오퍼 채팅
              const count = isShare ? partyRooms.length : s.items.length;
              const unreadTotal = isShare ? shareUnread : flagUnread;
              const active = tab === s.key;
              const name = s.key === "flag" ? "🚩 깃발" : "🎉 파티";
              return (
                <button
                  key={s.key}
                  onClick={() => {
                    didAutoSelect.current = true;
                    setTab(s.key as "flag" | "share");
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-full text-[13px] font-black transition-colors ${active ? "bg-white/10 text-foreground" : "text-muted-foreground"}`}
                >
                  <span>{name}</span>
                  {count > 0 && (
                    <span className={`text-[11px] ${active ? "text-foreground/80" : "text-muted-foreground"}`}>
                      {count}
                    </span>
                  )}
                  <UnreadBadge count={unreadTotal} />
                </button>
              );
            })}
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
            깃발 상세에서 마음에 드는 오퍼에 <br />“대화하기”를 눌러 시작해보세요
          </p>
        </div>
      ) : tab === "dm" ? (
        dmThreads.length === 0 ? (
          <p className="text-center text-[13px] text-muted-foreground mt-16">메시지가 없어요</p>
        ) : (
          <div className="px-2 pt-1">
            {dmThreads.map((t) => {
              const name = t.counterpart?.display_name ?? "익명";
              return (
                <Link
                  key={t.id}
                  href={`/dm/${t.id}`}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-card transition-colors"
                >
                  <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0">
                    {t.counterpart?.profile_image ? (
                      <Image src={t.counterpart.profile_image} alt="" fill sizes="44px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground/60 text-[14px] font-black">
                        {name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground text-[14px] font-black truncate">{name}</span>
                      {/* 수락 게이트 폐지(Migration 470) — 신청/대기중 배지 없음 */}
                    </div>
                    <p className={`text-[13px] truncate ${(t.unread_count ?? 0) > 0 ? "text-foreground/90 font-semibold" : "text-muted-foreground"}`}>
                      {previewText(t.last_message, "")}
                    </p>
                  </div>
                  {(t.unread_count ?? 0) > 0 ? (
                    <UnreadBadge count={t.unread_count ?? 0} className="shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </Link>
              );
            })}
          </div>
        )
      ) : tab === "share" && partyRooms.length === 0 ? (
        <p className="text-center text-[13px] text-muted-foreground mt-16">파티 대화가 없어요</p>
      ) : tab === "flag" && activeSection.items.length === 0 ? (
        <p className="text-center text-[13px] text-muted-foreground mt-16">깃발 대화가 없어요</p>
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
          {/* 깃발 탭만 1:1 오퍼 채팅 그룹 노출 (파티는 단체방으로 통합) — 진행 중만 */}
          {tab === "flag" && flagOpenGroups.map((group) => {
            const head = group[0];
            const budgetText = head.budget ? ` · ${Math.round(head.budget / 10000)}만원` : "";
            const isMatched = group.some((c) => c.offer_status === "accepted");
            return (
              <div key={head.puzzle_id} className="mb-1">
                {/* 깃발 헤더 — 매칭된 깃발은 녹색 강조 */}
                <Link
                  href={`/flags/${head.puzzle_id}`}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 bg-card/40 active:bg-card"
                >
                  <p className="text-[13px] font-bold text-foreground/80 truncate">
                    {formatDate(head.event_date)} · {head.area}{budgetText}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isMatched && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-inverse text-inverse-foreground font-bold">
                        <Check className="w-3 h-3" />
                        매칭됨
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
                {/* 이 깃발의 대화들 (종료된 건 아래 "종료된 채팅"으로 빠짐) */}
                <ul className="divide-y divide-neutral-900">
                  {group.map((c) => (
                    <li key={c.offer_id}>
                      <Link
                        href={`/messages/${c.offer_id}`}
                        onClick={suppressIfLongPress}
                        onContextMenu={(e) => { e.preventDefault(); setLeaveTarget({ kind: "offer", offerId: c.offer_id, myRole: c.my_role, label: `${formatDate(head.event_date)} · ${head.area}` }); }}
                        onPointerDown={() => startPress({ kind: "offer", offerId: c.offer_id, myRole: c.my_role, label: `${formatDate(head.event_date)} · ${head.area}` })}
                        onPointerUp={cancelPress}
                        onPointerLeave={cancelPress}
                        className="flex items-center gap-3 px-4 py-3.5 active:bg-card/60"
                      >
                        <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0">
                          {c.counterpart_image ? (
                            <Image src={c.counterpart_image} alt="" fill className="object-cover" sizes="44px" />
                          ) : (
                            <div className="w-full h-full grid place-items-center text-[14px] font-bold text-muted-foreground">
                              {(c.counterpart_name ?? "?").slice(0, 1)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold text-foreground truncate">
                            {c.counterpart_name ?? (c.my_role === "leader" ? "파트너" : "방장")}
                          </p>
                          <p className={`text-[13px] truncate mt-0.5 ${unreadCountOf(c) > 0 ? "text-foreground/90 font-semibold" : "text-muted-foreground"}`}>
                            {previewText(c.last_content, "사진")}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[11px] text-muted-foreground">{chatListTime(c.last_at)}</span>
                          <UnreadBadge count={unreadCountOf(c)} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {/* 종료된 채팅 — 맨 아래 접힌 드롭다운 하나로 묶음 */}
          {tab === "flag" && flagClosedChats.length > 0 && (
            <div className="mt-2 border-t border-border">
              <button
                onClick={() => setClosedOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3.5 active:bg-card/60"
              >
                <span className="text-[13px] font-bold text-muted-foreground">
                  종료된 채팅 {flagClosedChats.length}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${closedOpen ? "rotate-180" : ""}`}
                />
              </button>
              {closedOpen && (
                <>
                  <ul className="divide-y divide-neutral-900">
                    {flagClosedChats.map((c) => {
                      const budgetText = c.budget ? ` · ${Math.round(c.budget / 10000)}만원` : "";
                      return (
                        <li key={c.offer_id}>
                          <Link
                            href={`/messages/${c.offer_id}`}
                            className="flex items-center gap-3 px-4 py-3.5 opacity-50 active:bg-card/60"
                          >
                            <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0">
                              {c.counterpart_image ? (
                                <Image src={c.counterpart_image} alt="" fill className="object-cover" sizes="44px" />
                              ) : (
                                <div className="w-full h-full grid place-items-center text-[14px] font-bold text-muted-foreground">
                                  {(c.counterpart_name ?? "?").slice(0, 1)}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[14px] font-bold text-foreground truncate">
                                  {c.counterpart_name ?? (c.my_role === "leader" ? "파트너" : "방장")}
                                </p>
                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">종료</span>
                              </div>
                              {/* 깃발별 그룹이 없어졌으니 어떤 깃발이었는지 여기서 표시 */}
                              <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                                {formatDate(c.event_date)} · {c.area}{budgetText}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-[11px] text-muted-foreground">{chatListTime(c.last_at)}</span>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteChat(c.offer_id);
                                }}
                                className="p-0.5 text-muted-foreground hover:text-red-400 transition-colors"
                                aria-label="삭제"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    onClick={() => handleDeleteAllClosed(flagClosedChats.map((c) => c.offer_id))}
                    disabled={deletingAll}
                    className="w-full py-3.5 text-[13px] font-bold text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {deletingAll ? "삭제하는 중…" : "종료된 채팅 전체 삭제"}
                  </button>
                </>
              )}
            </div>
          )}
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
