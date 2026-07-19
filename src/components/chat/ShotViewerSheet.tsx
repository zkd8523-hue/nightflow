"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Flag,
  Heart,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MoreVertical,
  Trash2,
  X,
  Zap,
  Volume2,
  VolumeX,
  Eye,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import type { ChatShot } from "@/types/database";
import { ShotCommentSheet } from "./ShotCommentSheet";
import { ShotActivitySheet } from "./ShotActivitySheet";
import { useShotActivity } from "@/hooks/useShotActivity";
import { DmRequestSheet } from "@/components/messages/DmRequestSheet";
import { getViewedShotIds, markShotViewed } from "@/lib/chat/viewedShots";

interface Props {
  shots: ChatShot[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  currentUserId?: string;
  onToggleLike?: (shotId: string) => void;
  onRequireLogin?: () => void;
  /** 마지막 LIVE까지 다 보면 닫는 대신 이 경로로 유도(엔드카드). 홈 캐러셀 전용 */
  endCardTo?: string;
}

const SWIPE_THRESHOLD = 80; // 세로 스와이프 임계값(px)
const IMAGE_AUTO_MS = 5000; // 이미지 SHOT 자동 다음 (5초)
const DRAG_ENGAGE_PX = 12; // 이 이상 움직여야 드래그로 인정 (탭 오인식 방지)

export function ShotViewerSheet({
  shots,
  index,
  onIndexChange,
  currentUserId,
  onToggleLike,
  onRequireLogin,
  endCardTo,
}: Props) {
  const router = useRouter();
  const open = index !== null;
  const shot = index !== null ? shots[index] : null;
  // 홈에서 마지막 LIVE까지 다 보면 뜨는 엔드카드 (와글로 유도)
  const [endCardOpen, setEndCardOpen] = useState(false);
  useEffect(() => {
    if (index === null) setEndCardOpen(false);
  }, [index]);

  // onIndexChange를 ref로 안정화 — popstate effect가 이걸 deps에 두면,
  // 넘길 때마다 부모가 새 함수를 주며 effect가 재실행 → cleanup의 history.back()이
  // popstate를 발동시켜 뷰어가 스스로 닫히던 버그를 막는다.
  const onIndexChangeRef = useRef(onIndexChange);
  useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  }, [onIndexChange]);
  const [commentOpen, setCommentOpen] = useState(false);

  // ── 인스타식 3D 큐브 전환 ────────────────────────────────────────────────
  // 앞면=현재 스토리, 오른쪽면=다음, 왼쪽면=이전. 드래그하면 컨테이너가 회전해
  // 두 면이 모서리로 동시에 보이고, 놓으면 ±90°로 스냅하며 인덱스를 커밋한다.
  const cubeRef = useRef<HTMLDivElement>(null);
  const [cubeW, setCubeW] = useState(390);
  const [angle, setAngle] = useState(0);
  const [animating, setAnimating] = useState(false);
  const animatingRef = useRef(false); // setState보다 즉시 반영 — 중복 커밋 차단용
  const commitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CUBE_MS = 320;

  // 폭 측정 — 0으로 잡히면 translateZ(0)이 되어 세 면이 겹쳐 이웃이 안 보인다.
  // ResizeObserver로 레이아웃 확정 시점까지 추적하고, 실패 시 화면폭으로 폴백.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const w =
        cubeRef.current?.clientWidth ||
        (typeof window !== "undefined" ? window.innerWidth : 0) ||
        390;
      setCubeW(w);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const el = cubeRef.current;
    const ro =
      el && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (commitRef.current) clearTimeout(commitRef.current);
    },
    []
  );

  const hasNext = index !== null && index < shots.length - 1;
  const hasPrev = index !== null && index > 0;

  // 현재 shot이 속한 그룹의 세그먼트 위치 계산 (인스타 진행바용).
  // 캐러셀과 동일한 그룹 키: 남의 LIVE는 클럽 단위(클럽 없으면 작성자), 내 LIVE는 "me" 하나.
  // shots(groupedShots)는 같은 그룹이 연속되도록 정렬돼 있어, 연속 구간이 한 스토리 묶음.
  const segKeyOf = (s: ChatShot) =>
    currentUserId && s.author_id === currentUserId
      ? "me"
      : s.club?.name
      ? `c:${s.club.name.trim().toLowerCase()}|${s.club.area ?? ""}`
      : s.club_id
      ? `c:${s.club_id}`
      : `u:${s.author_id}`;
  /** 임의 인덱스의 세그먼트 위치 — 앞면/이웃 면 모두 같은 값을 써야 전환 시 깜빡이지 않음 */
  function segFor(i: number): { total: number; idx: number } {
    const s = shots[i];
    if (!s) return { total: 1, idx: 0 };
    const key = segKeyOf(s);
    let start = i;
    while (start > 0 && shots[start - 1] && segKeyOf(shots[start - 1]) === key) start--;
    let end = i;
    while (end < shots.length - 1 && shots[end + 1] && segKeyOf(shots[end + 1]) === key) end++;
    return { total: end - start + 1, idx: i - start };
  }
  // ── 클럽(그룹) 단위 이동 ─────────────────────────────────────────────────
  // 슬라이드 = 클럽 간 이동, 탭 = 클럽 안 이동(끝이면 옆 클럽).
  // 클럽으로 들어갈 때는 "마지막으로 본 것 다음"(= 첫 미시청)부터 재생한다.
  const [viewedSet, setViewedSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setViewedSet(getViewedShotIds());
  }, [open]);

  // 보고 있는 shot은 본 것으로 기록 (재개 위치 계산에 필요)
  useEffect(() => {
    if (index === null || !shot) return;
    markShotViewed(shot.id);
    setViewedSet((prev) => {
      if (prev.has(shot.id)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(shot.id);
      return nextSet;
    });
  }, [index, shot]);

  /** i가 속한 그룹의 [시작, 끝] 인덱스 */
  function groupRange(i: number): [number, number] {
    const s0 = shots[i];
    if (!s0) return [i, i];
    const key = segKeyOf(s0);
    let start = i;
    while (start > 0 && shots[start - 1] && segKeyOf(shots[start - 1]) === key) start--;
    let end = i;
    while (end < shots.length - 1 && shots[end + 1] && segKeyOf(shots[end + 1]) === key) end++;
    return [start, end];
  }

  /** 그룹 안에서 재개할 위치 — 첫 미시청, 다 봤으면 그룹 첫 번째 */
  function resumeIn(start: number, end: number) {
    for (let i = start; i <= end; i++) {
      if (shots[i] && !viewedSet.has(shots[i].id)) return i;
    }
    return start;
  }

  /** 다음/이전 클럽의 재개 인덱스 (없으면 null) */
  function neighborGroupIndex(dir: 1 | -1): number | null {
    if (index === null) return null;
    const [gs, ge] = groupRange(index);
    const probe = dir === 1 ? ge + 1 : gs - 1;
    if (probe < 0 || probe >= shots.length) return null;
    const [ns, ne] = groupRange(probe);
    return resumeIn(ns, ne);
  }

  const nextGroupIdx = neighborGroupIndex(1);
  const prevGroupIdx = neighborGroupIndex(-1);

  const seg = index !== null && shot ? segFor(index) : { total: 1, idx: 0 };
  const segTotal = seg.total;
  const segIndex = seg.idx;

  // index가 배열 범위를 넘으면 닫지 말고 마지막으로 클램프 (그룹핑/필터로 length가
  // 순간 바뀔 때 뷰어가 통째로 닫히던 버그 방지).
  useEffect(() => {
    if (index !== null && shots.length > 0 && index >= shots.length) {
      onIndexChange(shots.length - 1);
    }
  }, [index, shots.length, onIndexChange]);

  // 뒤로가기로 SHOT 뷰어 닫기 (홈 이탈 방지)
  // 뷰어 열릴 때 history entry 하나 추가 → popstate 발생하면 자동으로 뷰어만 닫힘.
  // ⚠️ deps는 [open]만 — onIndexChange를 넣으면 넘길 때마다 재실행되며 cleanup의
  //    history.back()이 popstate를 유발해 스스로 닫힌다.
  const pushedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    window.history.pushState({ shotViewer: true }, "");
    pushedRef.current = true;
    function onPop() {
      pushedRef.current = false;
      onIndexChangeRef.current(null);
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // 뷰어가 정상 종료(현재 history state가 여전히 viewer 것)일 때만 dummy를 pop.
      // 클럽명 탭 등으로 router.push 이동한 경우엔 history.state가 바뀌므로 back()을
      // 호출하지 않는다 → 이동을 되돌리는 버그 방지.
      if (pushedRef.current && window.history.state?.shotViewer) {
        pushedRef.current = false;
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    onIndexChange(null);
  }

  /** 목표 각도까지 회전 → 애니메이션 끝에 인덱스 커밋 + 각도 0으로(트랜지션 없이) 리셋 */
  function rotateAndCommit(target: number, commit: () => void) {
    if (animatingRef.current) return; // 회전 중 중복 호출 차단 (두 칸 넘김 방지)
    animatingRef.current = true;
    setAnimating(true);
    setAngle(target);
    if (commitRef.current) clearTimeout(commitRef.current);
    commitRef.current = setTimeout(() => {
      animatingRef.current = false;
      setAnimating(false);
      setAngle(0);
      commit();
    }, CUBE_MS);
  }

  /** 임계값 미달/막다른 끝 → 원래 면으로 되돌림 */
  function rotateBack() {
    animatingRef.current = true;
    setAnimating(true);
    setAngle(0);
    if (commitRef.current) clearTimeout(commitRef.current);
    commitRef.current = setTimeout(() => {
      animatingRef.current = false;
      setAnimating(false);
    }, CUBE_MS);
  }

  /** 클럽 간 이동 — 큐브 회전 후 커밋 (슬라이드/그룹 경계 탭) */
  function goGroup(dir: 1 | -1) {
    const target = dir === 1 ? nextGroupIdx : prevGroupIdx;
    if (target === null) return rotateBack(); // 양 끝 — 닫지 않고 되돌림
    rotateAndCommit(dir === 1 ? -90 : 90, () => onIndexChange(target));
  }

  /** 탭 — 같은 클럽 안에서는 컷 전환, 클럽 경계면 옆 클럽으로(큐브) */
  function prev() {
    if (index === null || animating) return;
    const [gs] = groupRange(index);
    if (index > gs) {
      setAngle(0);
      onIndexChange(index - 1); // 같은 클럽 안 — 애니메이션 없음
      return;
    }
    goGroup(-1); // 그룹 첫 번째에서 왼쪽 탭 → 이전 클럽의 '마지막 본 것 다음'
  }
  function next() {
    if (index === null || animating) return;
    const [, ge] = groupRange(index);
    if (index < ge) {
      setAngle(0);
      onIndexChange(index + 1); // 같은 클럽 안 — 애니메이션 없음
      return;
    }
    goGroup(1); // 그룹 마지막에서 오른쪽 탭 → 다음 클럽
  }

  // 영상/이미지 재생이 '자연 종료'됐을 때 — 마지막이면 엔드카드(홈) 또는 닫기.
  function playbackEnd() {
    if (index === null) return;
    if (hasNext) next();
    else if (endCardTo) setEndCardOpen(true); // 홈: LIVE로 유도
    else onIndexChange(null);
  }

  /** 드래그 중 — 손가락 따라 큐브 회전 (다음/이전이 없으면 저항) */
  function handleDrag(dx: number) {
    if (animating || index === null) return;
    // 슬라이드는 클럽 간 이동 — 옆 클럽이 없으면 저항만 준다
    const blocked = (dx < 0 && nextGroupIdx === null) || (dx > 0 && prevGroupIdx === null);
    const eff = blocked ? dx * 0.2 : dx;
    // 오른쪽→왼쪽으로 밀면(dx<0) 각도가 음수 → 오른쪽 면(다음)이 앞으로 온다
    setAngle(Math.max(-90, Math.min(90, (eff / cubeW) * 90)));
  }

  /** 드래그 종료 — 임계값(22%) 넘으면 넘기고, 아니면 되돌림 */
  function handleDragEnd(dx: number) {
    if (animating) return;
    const r = dx / cubeW;
    // 슬라이드는 항상 '클럽 단위' 이동 (같은 클럽 내 이동은 탭으로)
    if (r < -0.22 && nextGroupIdx !== null) goGroup(1);
    else if (r > 0.22 && prevGroupIdx !== null) goGroup(-1);
    else rotateBack();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && close()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="bg-black border-none p-0 h-[100dvh] max-h-[100dvh] overflow-hidden"
        >
          {/* 큐브 뷰포트 — perspective로 3D 깊이 부여 */}
          <div
            ref={cubeRef}
            className="relative w-full h-full"
            style={{ perspective: "1400px" }}
          >
            {/* 큐브 본체 — translateZ(-w/2)로 앞면을 화면 평면에 맞춘 뒤 rotateY */}
            <div
              className="absolute inset-0"
              style={{
                transformStyle: "preserve-3d",
                transform: `translateZ(-${cubeW / 2}px) rotateY(${angle}deg)`,
                transition: animating
                  ? `transform ${CUBE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                  : "none",
              }}
            >
              {/* 3면 윈도우 — 각 면을 shot.id로 key 고정해 '위치만' 바뀌게 한다.
                  넘어갈 때 이웃 면 인스턴스가 그대로 앞면이 되므로 재마운트가 없고,
                  영상·진행바·헤더가 처음부터 다시 로딩되는 깜빡임이 사라진다. */}
              {index !== null &&
                ([
                  [prevGroupIdx, -1] as const,
                  [index, 0] as const,
                  [nextGroupIdx, 1] as const,
                ]
                  .filter(([i]) => i !== null && i >= 0 && i < shots.length)
                  .map(([i, offset]) => {
                    const si = i as number;
                    const sh = shots[si];
                    const isFront = offset === 0;
                    const fseg = segFor(si);
                    return (
                      <div
                        key={sh.id}
                        className="absolute inset-0"
                        style={{
                          transform: `rotateY(${offset * 90}deg) translateZ(${cubeW / 2}px)`,
                          pointerEvents: isFront ? "auto" : "none",
                        }}
                      >
                        <ShotViewerContent
                          shot={sh}
                          active={isFront}
                          onDrag={handleDrag}
                          onDragEnd={handleDragEnd}
                          segTotal={fseg.total}
                          segIndex={fseg.idx}
                          currentUserId={currentUserId}
                          paused={commentOpen}
                          nextVideoUrl={
                            nextGroupIdx !== null &&
                            shots[nextGroupIdx]?.media_type === "video"
                              ? shots[nextGroupIdx].media_url
                              : null
                          }
                          onPrev={prev}
                          onNext={next}
                          onPlaybackEnd={playbackEnd}
                          onClose={close}
                          onToggleLike={onToggleLike}
                          onOpenComments={() => setCommentOpen(true)}
                          onRequireLogin={onRequireLogin}
                        />
                      </div>
                    );
                  }))}
            </div>
          </div>

          {/* 엔드카드 — 홈에서 마지막까지 다 보면 와글로 유도 */}
          {endCardOpen && endCardTo && (
            <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center gap-7 px-8 text-center">
              <h2 className="text-white text-[21px] font-black leading-tight">
                LIVE를 다 봤어요
              </h2>

              {/* 가치 안내 — 거기 가면 뭘 할 수 있는지 */}
              <div className="flex items-center gap-3 text-white text-[15px] font-bold">
                <span className="text-[17px]">💬</span>
                지금 노는 사람들과 바로 대화
              </div>

              <div className="flex flex-col items-center gap-3 w-full max-w-[280px]">
                <button
                  type="button"
                  onClick={() => {
                    // onIndexChange(null)로 먼저 닫으면 뷰어 popstate 정리의 history.back()이
                    // 이 push를 되돌려버림 → 바로 push만. 네비 커밋 시 자연 언마운트되고
                    // history.state가 바뀌어 back() 가드에 걸려 이동이 유지됨.
                    router.push(endCardTo);
                  }}
                  className="w-full px-7 py-3.5 rounded-full bg-white text-black text-[15px] font-black active:scale-95 transition-transform"
                >
                  더보기 →
                </button>
                <button
                  type="button"
                  onClick={() => onIndexChange(null)}
                  className="text-neutral-500 text-[13px]"
                >
                  닫기
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ShotCommentSheet
        open={commentOpen}
        onOpenChange={setCommentOpen}
        shotId={shot?.id ?? null}
        currentUserId={currentUserId}
        onRequireLogin={onRequireLogin}
      />
    </>
  );
}

function ShotViewerContent({
  shot,
  active = true,
  onDrag,
  onDragEnd,
  segTotal,
  segIndex,
  currentUserId,
  paused,
  nextVideoUrl,
  onPrev,
  onNext,
  onPlaybackEnd,
  onClose,
  onToggleLike,
  onOpenComments,
  onRequireLogin,
}: {
  shot: ChatShot;
  /** 앞면(현재 보는 면)일 때만 true — 이웃 면은 재생/조회기록/키보드 비활성 */
  active?: boolean;
  /** 가로 드래그 중 실시간 이동량 (상위 큐브 회전용) */
  onDrag?: (dx: number) => void;
  /** 가로 드래그 종료 — 상위가 스냅/커밋 결정 */
  onDragEnd?: (dx: number) => void;
  segTotal: number;
  segIndex: number;
  currentUserId?: string;
  paused?: boolean;
  nextVideoUrl?: string | null;
  onPrev: () => void;
  onNext: () => void;
  onPlaybackEnd: () => void;
  onClose: () => void;
  onToggleLike?: (shotId: string) => void;
  onOpenComments: () => void;
  onRequireLogin?: () => void;
}) {
  const router = useRouter();
  const isMine = shot.author_id === currentUserId;
  const remaining = elapsedTimeText(shot.created_at);
  const [deleting, setDeleting] = useState(false);

  // swipe/탭 추적 (세로=닫기힌트/이동, 가로·탭=이전다음)
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragX, setDragX] = useState(0); // 가로 드래그 → 3D 큐브 회전각
  // 더블탭 좋아요 — 단일탭(넘김)과 구분
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 길게 누름 → 정지 판정
  const [likeBurst, setLikeBurst] = useState(0); // 값 바뀔 때마다 하트 애니메이션 재생
  // 낙관적 좋아요 — 서버 왕복을 기다리지 않고 즉시 하트/카운트/애니메이션 반영.
  // null이면 서버값(shot.liked_by_me) 사용. 서버값이 따라잡으면 자동 해제.
  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const liked = optimisticLiked ?? !!shot.liked_by_me;
  const likeCount =
    shot.like_count +
    (optimisticLiked === null || optimisticLiked === !!shot.liked_by_me
      ? 0
      : optimisticLiked
      ? 1
      : -1);

  const [soundOn, setSoundOn] = useState(false); // 영상 소리 (기본 음소거 — 자동재생 보장)
  const [activityOpen, setActivityOpen] = useState(false); // 활동(본 사람) 시트 — 본인 LIVE만
  const [dmOpen, setDmOpen] = useState(false); // 메시지 신청 시트 (유저 LIVE "나도 갈래")
  const [videoReady, setVideoReady] = useState(false); // 재생 시작 전 첫프레임(정지화면) 숨김용
  const [holdPaused, setHoldPaused] = useState(false); // 화면 누르고 있는 동안 일시정지 (인스타 스토리식)
  // 인라인 메시지 입력 (인스타식) — 시트 대신 뷰어 하단에서 바로 전송
  const [commentInput, setCommentInput] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // 댓글 입력(메시지 남기기) 중이거나 활동 시트가 열리면 재생+자동진행 일시정지.
  // (인스타처럼: 타이핑하는 동안 다음으로 안 넘어감)
  // holdPaused: 사용자가 화면을 누르고 있는 동안 정지 (떼면 재개)
  const isPaused =
    !!paused || activityOpen || dmOpen || holdPaused || inputFocused;

  // 인라인 1:1 메시지(DM) 전송 — 댓글(공개)과 다른 개인 메시지.
  //  신규 상대면 '메시지 신청'(pending) + 알림, 이미 스레드가 있으면 그 대화에 이어붙음.
  //  ※ 공개 댓글은 하단 💬 아이콘(ShotCommentSheet)에서 별도로 작성.
  async function sendInlineComment() {
    const trimmed = commentInput.trim();
    if (!trimmed || commentSending) return;
    if (!currentUserId) {
      onRequireLogin?.();
      return;
    }
    setCommentSending(true);
    const { error } = await createClient().rpc("request_dm", {
      p_recipient_id: shot.author_id,
      p_shot_id: shot.id,
      p_first_message: trimmed,
    });
    setCommentSending(false);
    if (error) {
      const msg = error.message || "";
      console.error("[ShotViewerSheet] inline dm error", error);
      if (msg.includes("request_declined")) {
        toast.error("이전에 거절된 상대예요");
      } else if (msg.includes("cannot_dm_self")) {
        toast.error("본인에게는 보낼 수 없어요");
      } else if (msg.includes("does not exist") || error.code === "42883") {
        toast.error("DM 마이그레이션 미적용 (465/469)");
      } else {
        toast.error(`전송 실패: ${error.message ?? ""}`);
      }
      return;
    }
    setCommentInput("");
    toast.success("메시지를 보냈어요 · 채팅 탭에서 확인");
  }

  // 본인 LIVE면 조회/좋아요 요약을 하단에 항상 노출 (인스타 스토리식)
  const { viewers: myViewers } = useShotActivity(shot.id, isMine);
  // RAF 루프 안에서 최신 active를 참조 (stale 클로저 방지)
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // 샷 바뀌면 페이드 리셋 (새 영상은 재생 시작 후 나타남)
  useEffect(() => {
    setVideoReady(false);
  }, [shot.id]);

  // 서버값이 낙관적 값을 따라잡으면 해제 (이후엔 서버값을 그대로 따름)
  useEffect(() => {
    setOptimisticLiked((cur) =>
      cur === null || cur === !!shot.liked_by_me ? null : cur
    );
  }, [shot.liked_by_me, shot.id]);

  // 숨긴 <video>의 프레임을 canvas에 object-cover로 그린다 (Samsung 네이티브 컨트롤 우회).
  useEffect(() => {
    if (shot.media_type !== "video") return;
    if (!active) return; // 이웃 면은 canvas 드로잉 안 함
    let raf = 0;
    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (video && canvas && ctx && video.videoWidth > 0) {
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (cw > 0 && ch > 0) {
          if (canvas.width !== cw) canvas.width = cw;
          if (canvas.height !== ch) canvas.height = ch;
          const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
          const dw = video.videoWidth * scale;
          const dh = video.videoHeight * scale;
          ctx.drawImage(video, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [shot.id, shot.media_type, active]);

  // onNext/onPlaybackEnd를 ref로 최신 유지 — 자동진행 raf가 stale 클로저를 잡지 않게.
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
  }, [onPlaybackEnd]);

  // 자동 진행 게이지 (인스타 스토리 패턴) — 이미지 5초, 동영상은 video duration.
  // requestAnimationFrame으로 활성 세그먼트 너비를 DOM에 직접 60fps 갱신 → 부드러움.
  // (progress state를 안 쓰므로 재생 중 뷰어 전체 리렌더 없음)
  const activeFillRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // 영상을 canvas에 그려 Samsung 네이티브 컨트롤 우회
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let imgElapsed = 0; // 이미지 누적 경과(ms) — 일시정지 중엔 안 쌓임
    // 새 shot으로 바뀌는 순간 활성 바를 0으로 리셋
    if (activeFillRef.current) activeFillRef.current.style.width = "0%";

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // 일시정지(댓글 입력/활동 시트) 중엔 게이지·자동넘김 정지. 영상은 pause로 currentTime 고정.
      if (!isPausedRef.current && activeRef.current) {
        let pct: number;
        if (shot.media_type === "video") {
          const v = videoRef.current;
          pct = v && v.duration ? Math.min((v.currentTime / v.duration) * 100, 100) : 0;
        } else {
          imgElapsed += dt;
          pct = Math.min((imgElapsed / IMAGE_AUTO_MS) * 100, 100);
        }
        if (activeFillRef.current) activeFillRef.current.style.width = `${pct}%`;
        // 이미지는 시간 기준 자동 넘김 (영상은 onEnded로 넘김). 마지막이면 닫힘.
        if (shot.media_type !== "video" && pct >= 100) {
          onPlaybackEndRef.current();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // active 포함 — 이웃 면에서 앞면이 되는 순간 루프를 새로 만들어
    // 게이지를 0부터 다시 시작시킨다 (안 하면 이웃 시절 루프가 남아 안 움직임).
  }, [shot.id, shot.media_type, active]);

  // 영상 자동재생 — 음소거 상태면 WebView에서도 무조건 재생됨(재생버튼 오버레이 방지).
  // 소리 켜진 상태(사용자가 스피커 탭)면 소리로 재생 시도, 막히면 조용히 무시.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || shot.media_type !== "video") return;
    if (!active) { try { v.pause(); } catch {} return; } // 이웃 면은 재생 안 함
    v.muted = !soundOn;
    v.play()
      .then(() => setVideoReady(true))
      .catch(() => {
        // 소리 재생이 막히면 음소거로라도 재생
        v.muted = true;
        v.play().then(() => setVideoReady(true)).catch(() => {});
      });
  }, [shot.id, shot.media_type, soundOn, active]);

  // 일시정지 토글 — 댓글 입력/활동 시트가 열리면 영상을 실제로 멈추고, 닫히면 재개.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || shot.media_type !== "video") return;
    // 이웃 면은 항상 정지 — 3면이 동시에 play()하면 모바일 디코더 한계로
    // 앞면 영상이 재생에 실패한다.
    if (!active || isPaused) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
  }, [isPaused, shot.id, shot.media_type, active]);

  function handleVideoEnded() {
    // 앞면일 때만 넘김 — 이웃 면의 ended 이벤트로 두 번 넘어가는 것 방지
    if (!activeRef.current) return;
    // 영상이 끝까지 재생됨 → 다음, 마지막이면 뷰어 닫기
    onPlaybackEnd();
  }

  // 키보드 (위/아래/Esc)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isPausedRef.current) return; // 시트(댓글/활동 등) 열렸을 때 키보드 넘김 차단
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    if (!active) return; // 이웃 면에서 중복 등록 방지
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, onClose, active]);

  // 마우스 휠 (throttle)
  const wheelLockRef = useRef(false);
  function handleWheel(e: React.WheelEvent) {
    if (isPausedRef.current) return; // 시트 열렸을 때 휠 넘김 차단
    if (wheelLockRef.current) return;
    if (Math.abs(e.deltaY) < 30) return;
    wheelLockRef.current = true;
    setTimeout(() => {
      wheelLockRef.current = false;
    }, 400);
    if (e.deltaY > 0) onNext();
    else onPrev();
  }

  function handlePointerDown(e: React.PointerEvent) {
    startYRef.current = e.clientY;
    startXRef.current = e.clientX;
    // 다른 시트(댓글/활동)로 이미 정지 상태면 hold-pause 개입 안 함
    if (!isPausedRef.current) {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      // 250ms 이상 누르고 있으면 정지 (짧은 탭은 넘김/좋아요 유지)
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        setHoldPaused(true);
      }, 250);
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    const dy = e.clientY - startYRef.current;
    const dx = e.clientX - (startXRef.current ?? e.clientX);
    // 스와이프로 판단되면 hold-pause 타이머 취소 (누름 정지 아님)
    if (holdTimerRef.current && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    // ⚠️ 임계값 필수 — 탭할 때 손가락이 1~2px만 흔들려도 드래그로 잡히면
    //    pointerUp이 드래그 분기로 빠져 좌/우 탭 넘김이 통째로 먹힌다.
    if (Math.abs(dx) < DRAG_ENGAGE_PX && Math.abs(dy) < DRAG_ENGAGE_PX) return;
    // 가로 우세 = 스토리 넘김 → 상위 큐브 컨테이너를 손가락 따라 회전시킨다.
    // 세로 우세 = 닫기 드래그 → 기존 translateY.
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(dx);
      setDragY(0);
      onDrag?.(dx);
    } else {
      if (dragX !== 0) {
        setDragX(0);
        onDrag?.(0);
      }
      setDragY(dy);
    }
  }
  function handlePointerUp(e: React.PointerEvent) {
    if (startYRef.current === null) return;
    const dy = e.clientY - startYRef.current;
    const dx = e.clientX - (startXRef.current ?? e.clientX);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    startYRef.current = null;
    startXRef.current = null;
    setDragY(0);
    const hadDragX = dragX !== 0;
    setDragX(0);

    // 길게 누름(정지) 상태였으면 → 떼는 순간 재개, 넘김 없음
    const wasHoldPause = holdPaused;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (wasHoldPause) {
      setHoldPaused(false);
      if (hadDragX) onDragEnd?.(0); // 큐브 원위치
      return;
    }

    // 가로로 큐브를 돌리고 있었다면 스냅/커밋은 상위 큐브가 처리 (여기선 넘김 X)
    if (hadDragX) {
      onDragEnd?.(dx);
      return;
    }

    // 메시지 입력에 포커스가 남아 있으면 탭이 전부 막히므로, 먼저 포커스만 해제.
    if (inputFocused) {
      setInputFocused(false);
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    // 시트(댓글/활동 등) 열렸을 때 탭/스와이프 넘김·좋아요 차단
    if (isPausedRef.current) return;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // 세로 스와이프(위로) = 다음, (아래로) = 이전
    if (absY > absX && absY > SWIPE_THRESHOLD) {
      if (dy < 0) onNext();
      else onPrev();
      return;
    }
    // 가로 스와이프 = 좌(다음) / 우(이전)
    if (absX > absY && absX > SWIPE_THRESHOLD) {
      if (dx < 0) onNext();
      else onPrev();
      return;
    }
    // 탭(거의 안 움직임)
    if (absX < DRAG_ENGAGE_PX && absY < DRAG_ENGAGE_PX) {
      const now = Date.now();
      // 더블탭(300ms 이내 두 번) = 좋아요. 대기 중이던 단일탭 넘김 취소.
      if (now - lastTapRef.current < 200) {
        lastTapRef.current = 0;
        if (tapTimerRef.current) {
          clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
        doDoubleTapLike();
        return;
      }
      // 단일탭 — 인스타식: 화면 오른쪽=다음, 왼쪽=이전. 단, 더블탭 대기 위해 300ms 지연.
      lastTapRef.current = now;
      const width = (e.currentTarget as HTMLElement).clientWidth;
      const clientX = e.clientX;
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        if (clientX > width / 2) onNext();
        else onPrev();
      }, 200);
    }
  }

  // 더블탭 좋아요 — 하트 애니메이션 + (남의 LIVE면) 좋아요 반영. 항상 like(취소 안 함).
  function doDoubleTapLike() {
    setLikeBurst((n) => n + 1);
    if (currentUserId && !isMine && !liked) {
      setOptimisticLiked(true); // 즉시 반영
      onToggleLike?.(shot.id);
    }
  }

  // 대기 중이던 단일탭 타이머 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // 조회 기록 (Migration 424) — 로그인 + 남의 LIVE일 때만. 본인 샷은 RPC가 스킵.
  useEffect(() => {
    if (!currentUserId || isMine) return;
    if (!active) return; // 앞면일 때만 조회 기록
    createClient().rpc("record_shot_view", { p_shot_id: shot.id });
  }, [shot.id, currentUserId, isMine, active]);

  async function handleDelete() {
    if (!confirm("이 LIVE를 삭제할까요?")) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_shots")
      .delete()
      .eq("id", shot.id);
    if (error) {
      toast.error("삭제 실패");
      setDeleting(false);
      return;
    }
    toast.success("삭제되었습니다");
    onClose();
  }

  async function handleReport() {
    if (!currentUserId) {
      onRequireLogin?.();
      return;
    }
    const reason = prompt("신고 사유를 적어주세요 (스팸/욕설/광고/허위위치/기타)");
    if (!reason || reason.trim().length < 2) return;
    const supabase = createClient();
    const { error } = await supabase.from("chat_shot_reports").insert({
      shot_id: shot.id,
      reporter_id: currentUserId,
      reason: "other",
      message: reason.trim(),
    });
    if (error) {
      if (error.code === "23505") toast.error("이미 신고하신 LIVE입니다");
      else if (error.code === "42P01" || error.code === "42703")
        toast.error("신고 마이그레이션 미적용 (322)");
      else toast.error("신고 처리에 실패했습니다");
      return;
    }
    toast.success("신고가 접수되었습니다");
  }

  return (
    <div
      className="relative w-full h-full max-w-md mx-auto flex flex-col overflow-hidden touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      style={{
        // 가로 회전은 상위 큐브 컨테이너가 담당. 여기선 세로(닫기) 드래그만.
        transform: `translateY(${dragY * 0.3}px)`,
        transition: dragY === 0 ? "transform 0.2s" : "none",
      }}
    >
      {/* 웹 전용 좌우 네비 버튼 (터치 기기엔 숨김 — 탭/스와이프로 이동) */}
      <button
        type="button"
        aria-label="이전"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (isPausedRef.current) return;
          onPrev();
        }}
        className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 items-center justify-center text-white transition-colors"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        type="button"
        aria-label="다음"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (isPausedRef.current) return;
          onPlaybackEnd(); // 다음, 마지막이면 닫힘 (인스타 웹 화살표와 동일)
        }}
        className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 items-center justify-center text-white transition-colors"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* 상단 헤더 — 영상 '위' 별도 영역 (인스타식): 게이지 + 프로필 + 클럽명 */}
      {/* safe-area(상태표시줄/노치) 만큼 위 여백 확보 */}
      <div
        className="relative shrink-0 z-20 pb-2 px-3 bg-black"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {/* 진행 게이지 — 유저 스토리 개수만큼 세그먼트 (인스타식) */}
        <div className="flex gap-1 mb-2.5">
          {Array.from({ length: segTotal }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
            >
              {/* key에 shot.id 포함 → shot 바뀔 때마다 새로 마운트해 정적 너비를 다시 적용.
                  (RAF가 imperative로 쓴 활성 세그먼트 너비가 뒤로 갈 때 남던 '찌꺼기' 방지) */}
              <div
                key={`${shot.id}-${i}`}
                ref={i === segIndex ? activeFillRef : undefined}
                className="h-full bg-white"
                style={{ width: i < segIndex ? "100%" : "0%" }}
              />
            </div>
          ))}
        </div>

        {/* 작성자 + 메뉴 */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/u/${shot.author_id}`);
            }}
            className="flex items-center gap-2 min-w-0 pointer-events-auto active:opacity-80 transition"
          >
            <div className="relative w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0 ring-2 ring-amber-500">
              {shot.author?.profile_image ? (
                <Image
                  src={shot.author.profile_image}
                  alt=""
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/60 text-[12px] font-black">
                  {(shot.author?.display_name ?? "익").charAt(0)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-white text-[13px] font-black truncate drop-shadow-lg">
                {shot.author?.display_name ?? "익명"}
              </span>
              {/* 파트너 배지 — role='md'면 항상 표시 (클럽 무관, '이 유저는 파트너'라는 표식).
                  ※ '나도 갈래요' 문의 버튼은 본인 클럽일 때만 (author_is_club_partner). */}
              {shot.author?.role === "md" && (
                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-black leading-none">
                  <BadgeCheck className="w-2.5 h-2.5" strokeWidth={2.5} />
                  파트너
                </span>
              )}
              <span className="text-[10px] text-white/60 drop-shadow-lg shrink-0">
                {remaining}
              </span>
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10"
                  aria-label="더보기"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-[#1C1C1E] border-neutral-800 text-white"
              >
                {isMine ? (
                  <DropdownMenuItem
                    onClick={handleDelete}
                    disabled={deleting}
                    className="cursor-pointer text-red-400 focus:bg-neutral-800 focus:text-red-400"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    삭제
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={handleReport}
                    className="cursor-pointer text-amber-400 focus:bg-neutral-800 focus:text-amber-400"
                  >
                    <Flag className="w-4 h-4 mr-2" />
                    신고
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 클럽명 — 프로필 아래, 가운데 정렬. 탭하면 그 클럽 페이지(그 클럽 LIVE 모음)로 */}
        {(shot.club || shot.club_id) && (
          <div className="mt-1.5 flex justify-center">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/clubs/${shot.club?.id ?? shot.club_id}`);
              }}
              className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white text-[12px] font-black active:scale-95 transition max-w-[85%]"
            >
              <Zap className="w-3 h-3 fill-red-400 text-red-400 shrink-0" />
              <span className="truncate">
                {shot.club
                  ? `${shot.club.area ? shot.club.area + " · " : ""}${shot.club.name}`
                  : "LIVE"}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-white/50 shrink-0" />
            </button>
          </div>
        )}
      </div>

      {/* 미디어 — 헤더 아래 남은 공간을 꽉 채움 (인스타 스토리식 edge-to-edge cover) */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black">
        {shot.media_type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot.media_url}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            {/* 실제 <video>는 화면 밖에 숨김 — Samsung WebView가 발견해 네이티브 컨트롤을
                씌우지 못하게. 재생/오디오/시간은 여기서, 화면 표시는 canvas가 담당. */}
            <video
              ref={videoRef}
              src={shot.media_url}
              className="pointer-events-none"
              style={{ position: "fixed", left: -99999, top: 0, width: 2, height: 2, opacity: 0.01 }}
              autoPlay={active}
              playsInline
              muted={!soundOn}
              preload={active ? "auto" : "metadata"}
              controls={false}
              disablePictureInPicture
              onPlaying={() => setVideoReady(true)}
              onEnded={handleVideoEnded}
            />
            {/* canvas — 숨긴 영상 프레임을 object-cover로 그림 (네이티브 컨트롤 없음).
                넘길 때 blackout 안 함: 새 영상 프레임이 그려질 때까지 직전 프레임 유지 → 검은 깜빡임 없음 */}
            <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />
            {/* 다음 영상 미리 로드 (캐시 워밍) → 넘겼을 때 즉시 재생 */}
            {active && nextVideoUrl && (
              <video
                key={nextVideoUrl}
                src={nextVideoUrl}
                preload="auto"
                muted
                playsInline
                className="pointer-events-none"
                style={{ position: "fixed", left: -99999, top: 0, width: 1, height: 1, opacity: 0 }}
              />
            )}
          </>
        )}

        {/* 이미지 오버레이 (Migration 422) — 텍스트보다 아래 레이어 */}
        {shot.image_overlays?.map((ov) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={ov.id}
            src={ov.url}
            alt=""
            draggable={false}
            className="absolute -translate-x-1/2 -translate-y-1/2 h-auto rounded-lg pointer-events-none z-[9]"
            style={{
              left: `${ov.xPct}%`,
              top: `${ov.yPct}%`,
              width: `${ov.widthPct}%`,
              transform: `translate(-50%, -50%) rotate(${ov.rotation ?? 0}deg)`,
            }}
          />
        ))}

        {/* 텍스트 오버레이 (Migration 415) — 저장된 좌표로 렌더 (사진·영상 공통) */}
        {shot.text_overlays?.map((ov) => (
          <div
            key={ov.id}
            className="absolute font-black leading-tight text-center whitespace-pre pointer-events-none z-10"
            style={{
              left: `${ov.xPct}%`,
              top: `${ov.yPct}%`,
              color: ov.color,
              fontSize: `${28 * ov.fontScale}px`,
              transform: `translate(-50%, -50%) rotate(${ov.rotation ?? 0}deg)`,
              textShadow:
                ov.color === "#000000"
                  ? "0 1px 4px rgba(255,255,255,0.4)"
                  : "0 1px 6px rgba(0,0,0,0.5)",
            }}
          >
            {ov.text}
          </div>
        ))}

        {/* 설문 (Migration 422) — 저장 좌표에 렌더, 탭하면 투표 */}
        {shot.poll && (
          <ShotPollWidget
            shot={shot}
            currentUserId={currentUserId}
            onRequireLogin={onRequireLogin}
          />
        )}

        {/* 캡션 — 미디어 하단(하단 바 위) 오버레이 */}
        {shot.caption && (
          <div className="absolute bottom-0 inset-x-0 z-10 p-4 pt-10 pr-14 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none">
            <p className="text-white text-[14px] leading-relaxed whitespace-pre-wrap drop-shadow-lg">
              {shot.caption}
            </p>
          </div>
        )}
      </div>

      {/* 더블탭 좋아요 하트 버스트 */}
      {likeBurst > 0 && (
        <div
          key={likeBurst}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        >
          <Heart
            className="w-28 h-28 fill-red-500 text-red-500 drop-shadow-2xl"
            style={{ animation: "shotLikeBurst 0.7s ease-out forwards" }}
          />
        </div>
      )}
      <style>{`
        @keyframes shotLikeBurst{0%{opacity:0;transform:scale(0.3)}20%{opacity:1;transform:scale(1.1)}40%{transform:scale(0.92)}60%{transform:scale(1)}100%{opacity:0;transform:scale(1)}}
        /* Samsung/Android WebView 네이티브 비디오 컨트롤(재생버튼/스크러버) 강제 제거 */
        video::-webkit-media-controls,
        video::-webkit-media-controls-enclosure,
        video::-webkit-media-controls-panel,
        video::-webkit-media-controls-panel-container,
        video::-webkit-media-controls-overlay-enclosure,
        video::-webkit-media-controls-overlay-play-button,
        video::-webkit-media-controls-start-playback-button,
        video::-webkit-media-controls-play-button,
        video::-webkit-media-controls-timeline,
        video::-webkit-media-controls-current-time-display,
        video::-webkit-media-controls-fullscreen-button {
          display: none !important;
          -webkit-appearance: none !important;
          appearance: none !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          pointer-events: none !important;
        }
        video::-webkit-media-controls { visibility: hidden !important; }
      `}</style>

      {/* 우측 액션 컬럼 (릴스 패턴) — 모바일은 중앙 우측, 웹은 위로(웹 다음 버튼과 겹침 방지) */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 md:top-[16%] md:translate-y-0 z-20 flex flex-col items-center gap-4 pointer-events-none">
        {/* 소리 토글 (영상만) */}
        {shot.media_type === "video" && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setSoundOn((v) => !v);
            }}
            className="pointer-events-auto w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
            aria-label={soundOn ? "음소거" : "소리 켜기"}
          >
            {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        )}

      </div>

      {/* 하단 검은 바 (인스타 스토리식) — 나도 갈래 + 메시지(댓글) + 하트 */}
      <div
        className="relative shrink-0 z-20 bg-black px-3 pt-2.5 flex flex-col gap-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {isMine ? (
          // 본인 LIVE — 조회/좋아요 요약 항상 노출 (탭하면 상세)
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActivityOpen(true)}
              className="flex-1 inline-flex items-center gap-4 px-4 py-2.5 text-white text-[14px] font-bold active:opacity-70 transition-opacity"
            >
              <span className="inline-flex items-center gap-1.5">
                <Eye className="w-5 h-5" />
                {myViewers.length}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Heart className={`w-5 h-5 ${shot.like_count > 0 ? "fill-red-500 text-red-500" : ""}`} />
                {shot.like_count}
              </span>
            </button>
          </div>
        ) : shot.author?.role === "md" && shot.author_is_club_partner ? (
          // 파트너(role='md')가 '본인 클럽'에 올린 LIVE — 문의 버튼'만' (댓글 없음).
          // 남의 클럽에서 놀며 올린 경우엔 이 버튼 대신 일반 유저 LIVE(댓글)로 처리.
          <button
            type="button"
            onClick={() => {
              const url = shot.author?.kakao_open_chat_url;
              if (url) window.open(url, "_blank");
              else toast("아직 연락 수단이 등록되지 않은 파트너예요");
            }}
            className="w-full flex flex-col items-center justify-center py-2.5 rounded-full bg-amber-500 text-black active:scale-[0.98] transition-transform"
          >
            <span className="text-[15px] font-black leading-tight">🎉 나도 갈래요</span>
            <span className="text-[11px] font-bold text-black/55 leading-tight mt-0.5">
              파트너에게 문의하기
            </span>
          </button>
        ) : (
          // 일반 유저 LIVE — 댓글'만' (메시지 남기기 + 하트 + 댓글)
          <div className="flex items-center gap-2">
            {/* 인스타식 인라인 메시지 입력 — 키보드 바로 위에 뜸(시트 안 열림) */}
            <input
              type="text"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onFocus={() => {
                if (!currentUserId) {
                  onRequireLogin?.();
                  return;
                }
                setInputFocused(true);
              }}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendInlineComment();
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              placeholder="메시지 보내기"
              maxLength={300}
              className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-transparent border border-white/40 text-white text-[14px] placeholder:text-white/60 focus:outline-none focus:border-white/70"
            />
            {commentInput.trim() && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={sendInlineComment}
                disabled={commentSending}
                className="shrink-0 px-3 py-2 text-[14px] font-black text-white disabled:text-white/40"
              >
                보내기
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!currentUserId) return onRequireLogin?.();
                const nextLiked = !liked;
                setOptimisticLiked(nextLiked); // 서버 응답 기다리지 않고 즉시 반영
                if (nextLiked) setLikeBurst((n) => n + 1); // 하트 애니메이션 즉시
                onToggleLike?.(shot.id);
              }}
              className="shrink-0 w-10 flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform"
              aria-label={liked ? "좋아요 취소" : "좋아요"}
            >
              <Heart
                className={`w-7 h-7 transition-transform duration-150 ${
                  liked ? "fill-red-500 text-red-500 scale-110" : "text-white"
                }`}
              />
              {likeCount > 0 && (
                <span className="text-[10px] font-bold text-white/80 leading-none">{likeCount}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onOpenComments?.()}
              className="shrink-0 w-10 flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform"
              aria-label="댓글"
            >
              <MessageCircle className="w-7 h-7 text-white" />
              {shot.comment_count > 0 && (
                <span className="text-[10px] font-bold text-white/80 leading-none">{shot.comment_count}</span>
              )}
            </button>
          </div>
        )}
      </div>

      <ShotActivitySheet open={activityOpen} onOpenChange={setActivityOpen} shotId={shot.id} />

      {/* 메시지 신청 (유저 LIVE "나도 갈래") */}
      <DmRequestSheet
        open={dmOpen}
        onOpenChange={setDmOpen}
        recipientId={shot.author_id}
        recipientName={shot.author?.display_name}
        shotId={shot.id}
        currentUserId={currentUserId}
        onRequireLogin={onRequireLogin}
      />
    </div>
  );
}

/** 올린지 경과 시간 (인스타 스타일: "방금", "N분", "N시간") */
function elapsedTimeText(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (ms < 60_000) return "방금";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}분 전`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}시간 전`;
}

/** 설문 투표 위젯 (Migration 422) — 저장 좌표에 배치, 탭하면 투표 + 결과 % 표시 */
function ShotPollWidget({
  shot,
  currentUserId,
  onRequireLogin,
}: {
  shot: ChatShot;
  currentUserId?: string;
  onRequireLogin?: () => void;
}) {
  const poll = shot.poll!;
  const [counts, setCounts] = useState<Record<string, number>>(shot.poll_counts ?? {});
  const [myVote, setMyVote] = useState<string | null>(shot.my_poll_vote ?? null);
  const [busy, setBusy] = useState(false);

  // 샷 전환 시 초기화
  useEffect(() => {
    setCounts(shot.poll_counts ?? {});
    setMyVote(shot.my_poll_vote ?? null);
  }, [shot.id, shot.poll_counts, shot.my_poll_vote]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const voted = myVote !== null;

  async function vote(optionId: string) {
    if (busy) return;
    if (!currentUserId) {
      onRequireLogin?.();
      return;
    }
    if (myVote === optionId) return;
    setBusy(true);
    // 옵티미스틱: 이전 표 감소, 새 표 증가
    setCounts((prev) => {
      const next = { ...prev };
      if (myVote) next[myVote] = Math.max((next[myVote] ?? 1) - 1, 0);
      next[optionId] = (next[optionId] ?? 0) + 1;
      return next;
    });
    const prevVote = myVote;
    setMyVote(optionId);

    const supabase = createClient();
    const { error } = await supabase.rpc("cast_poll_vote", {
      p_shot_id: shot.id,
      p_option_id: optionId,
    });
    if (error) {
      // 롤백
      setCounts((prev) => {
        const next = { ...prev };
        next[optionId] = Math.max((next[optionId] ?? 1) - 1, 0);
        if (prevVote) next[prevVote] = (next[prevVote] ?? 0) + 1;
        return next;
      });
      setMyVote(prevVote);
      if (error.code === "42883" || error.code === "42P01") {
        toast.error("설문 기능 준비 중 (마이그레이션 422 미적용)");
      } else {
        toast.error("투표 실패");
      }
    }
    setBusy(false);
  }

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute w-[74%] max-w-[320px] z-20 pointer-events-auto"
      style={{
        left: `${poll.xPct ?? 50}%`,
        top: `${poll.yPct ?? 70}%`,
        transform: `translate(-50%, -50%) scale(${poll.scale ?? 1})`,
      }}
    >
      <div className="rounded-2xl bg-black/55 backdrop-blur border border-white/15 p-3 space-y-2">
        <div className="text-white text-[14px] font-black text-center leading-tight break-words">
          {poll.question}
        </div>
        <div className="space-y-1.5">
          {poll.options.map((o) => {
            const c = counts[o.id] ?? 0;
            const pct = total > 0 ? Math.round((c / total) * 100) : 0;
            const mine = myVote === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => vote(o.id)}
                disabled={busy}
                className={`relative w-full overflow-hidden rounded-full text-left px-3 py-2 text-[13px] font-bold transition ${
                  mine ? "text-white" : "text-white/90"
                } ${voted ? "bg-white/10" : "bg-white/15 active:scale-[0.98]"}`}
              >
                {/* 결과 바 (투표 후에만) */}
                {voted && (
                  <span
                    className={`absolute inset-y-0 left-0 ${mine ? "bg-red-500/60" : "bg-white/20"}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative flex items-center justify-between gap-2">
                  <span className="truncate">{o.text}</span>
                  {voted && <span className="shrink-0 text-[12px] tabular-nums">{pct}%</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="text-center text-[10px] text-white/50">
          {voted ? `${total}명 참여` : "탭해서 투표"}
        </div>
      </div>
    </div>
  );
}
