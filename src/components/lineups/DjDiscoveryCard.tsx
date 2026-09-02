"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronsRight, Heart, Play } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBusinessMin } from "@/lib/lineups/time";
import { isLineupToday, formatLineupDate } from "@/lib/lineups/formatDate";
import { useDjFavoritesContext } from "@/components/providers";
import { DjPreviewButton, warmSoundcloud } from "@/components/djs/DjPreviewButton";
import { DjFavoriteButton } from "@/components/djs/DjFavoriteButton";
import Link from "next/link";
import { DjProfileSheet, type DjProfileTarget } from "@/components/djs/DjProfileSheet";
import { DjLedShowList, type DjShowRow } from "@/components/djs/DjLedShowList";
import { createClient } from "@/lib/supabase/client";
import { getBusinessDateISO } from "@/lib/lineups/time";

/**
 * 라인업 최상단 "DJ 발견" 카드 — 이름만 봐선 누군지 모르는 DJ를 귀로 먼저 만나는 자리.
 *
 * 왜 미리듣기 되는 DJ만 담는가:
 *   전체 DJ 중 사운드클라우드가 있는 건 라인업 줄 기준 약 24%다. 전체를 넣으면
 *   넘길 때마다 재생 버튼 없는 카드가 나와 "왜 어떤 건 안 되지"가 된다.
 *   들을 수 있는 사람만 모으면 카드는 항상 제 역할을 한다.
 *
 * 0명이면 아무것도 그리지 않는다 — 없는 기능을 광고하지 않는다
 * (LineupTicker가 데이터 없을 때 null을 내는 것과 같은 규약).
 */
export interface DiscoveryDj {
  dj: DjProfileTarget & { slug: string };
  club_id: string;
  club_name: string;
  club_area: string | null;
  event_date: string;
  start_min: number | null;
}

/** 화면에 보이는 순서 = 날짜 → 시간. 목록도 카드도 "다음 DJ"도 전부 이 순서를 쓴다.
 *  DB에서 온 등록순을 그대로 쓰면 "다음"이 화면상 다음 줄이 아니어서
 *  두 칸 건너뛴 것처럼 보인다(실측 확인). */
function sortForDisplay(list: DiscoveryDj[]): DiscoveryDj[] {
  return [...list].sort(
    (a, b) =>
      a.event_date.localeCompare(b.event_date) ||
      (a.start_min ?? Number.MAX_SAFE_INTEGER) - (b.start_min ?? Number.MAX_SAFE_INTEGER)
  );
}

export function DjDiscoveryCard({ items: rawItems }: { items: DiscoveryDj[] }) {
  const items = useMemo(() => sortForDisplay(rawItems), [rawItems]);
  const [idx, setIdx] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  // 재생 시트는 카드가 하나만 소유한다 — 슬라이드마다 두면 "다음 DJ"가
  // 뒤 카드만 넘기고 시트는 그대로라 재생이 끊긴다.
  const [playing, setPlaying] = useState<DiscoveryDj | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // 드래그 상태는 리렌더와 무관하므로 ref에 둔다(움직일 때마다 setState하면 끊긴다)
  const drag = useRef<{ x: number; y: number; lock: "x" | "y" | null } | null>(null);
  /* 카드가 도는 동안 앞으로 나올 DJ 들을 미리 데운다 — 사클 iframe 은
     CloudFront 히트면 50ms, 미스면 1.4초다(실측 20배 차이). 캐시가 URL 단위라
     "그 DJ 의 주소"를 미리 한 번 찔러둬야 그 DJ 가 빨라진다. */
  useEffect(() => {
    if (items.length === 0) return;
    warmSoundcloud(
      [at(idx), at(idx + 1), at(idx + 2)].map((x) => x?.dj.soundcloud_url)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, items]);

  /* 마지막으로 카드가 넘어간 시각(손·자동 공통). 두 가지 일을 한다:
     1) 스와이프 직후의 click 을 무시한다(밀고 손 떼면 재생이 열리던 버그)
     2) 자동 넘김이 이 시각부터 3초를 다시 세게 한다 — 2초째에 밀었는데
        1초 뒤 또 넘어가지 않도록 */
  const swipedAt = useRef(0);
  /** 트랙이 움직이는 중인지 — 겹쳐 호출되면 두 칸 넘어간다 */
  const movingRef = useRef(false);

  const at = (k: number) => items[((k % items.length) + items.length) % items.length];
  const cur = items.length > 0 ? at(idx) : null;

  /** 트랙을 한 칸 밀고, 애니메이션이 끝나면 인덱스를 옮겨 가운데로 되돌린다.
   *  움직이는 중에 또 부르면 transitionend 리스너가 겹쳐 두 칸이 넘어간다 —
   *  자동 넘김과 스와이프가 맞물릴 때 실제로 날 수 있어 잠금을 둔다. */
  const go = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track || items.length < 2 || movingRef.current) return;
    movingRef.current = true;
    track.style.transition = "transform .26s cubic-bezier(.22,.61,.36,1)";
    track.style.transform = `translateX(${dir > 0 ? "-66.6666%" : "0%"})`;
    const done = () => {
      track.removeEventListener("transitionend", done);
      /* idx 만 바꾸고 위치 복귀는 useLayoutEffect 가 맡는다.
         여기서 rAF 로 되돌리면 React 가 새 슬라이드를 그리기 전에 위치가 먼저
         가운데로 가서, 한 프레임 동안 "옛 슬라이드가 새 위치에" 놓인다
         — 그게 이전 DJ 이름이 번쩍이는 원인이었다.
         useLayoutEffect 는 DOM 갱신 직후·페인트 직전에 돌아 그 틈이 없다. */
      setIdx((v) => v + dir);
    };
    track.addEventListener("transitionend", done);
  };

  /* 슬라이드 내용이 새 idx 로 갱신된 직후, 화면에 그려지기 전에 트랙을 가운데로
     되돌린다. 사람 눈에는 위치 변화가 보이지 않는다(같은 프레임에서 일어남). */
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || !movingRef.current) return;
    track.style.transition = "";
    track.style.transform = "translateX(-33.3333%)";
    movingRef.current = false;
  }, [idx]);

  const onDown = (x: number, y: number) => {
    drag.current = { x, y, lock: null };
    movingRef.current = false; // 사람이 잡으면 진행 중이던 넘김은 없던 일로
    if (trackRef.current) trackRef.current.style.transition = "";
  };

  /**
   * 세로 스크롤과 충돌하지 않게, 가로 움직임이 우세할 때만 카드가 반응한다.
   *
   * 방향을 첫 픽셀에서 정하면 앱(WebView)에서 스와이프가 자꾸 실패한다 —
   * 손가락은 늘 조금 비스듬히 출발하므로 1px 차이로 "세로"가 찍히고, 한 번
   * 찍히면 되돌릴 수 없다. 8px 이상 움직인 뒤에 판정하고, 가로가 세로보다
   * 확실히 클 때만(1.2배) 가로로 잠근다.
   */
  const onMove = (x: number, y: number, preventDefault?: () => void) => {
    const d = drag.current;
    if (!d || items.length < 2) return;
    const dx = x - d.x;
    const dy = y - d.y;
    if (d.lock === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return; // 아직 방향을 못 정함
      d.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
    }
    if (d.lock !== "x") return;
    preventDefault?.();
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(calc(-33.3333% + ${dx}px))`;
    }
  };

  // 훅에서 최신 onMove/go 를 쓰되 선언 순서에 걸리지 않게 ref 로 건넨다
  const onMoveRef = useRef(onMove);
  const goRef = useRef(go);
  useEffect(() => {
    onMoveRef.current = onMove;
    goRef.current = go;
  });

  /**
   * 3초마다 다음 DJ로 — 가만히 둬도 여러 사람을 스쳐 지나가게 한다.
   *
   * 멈추는 조건이 중요하다:
   *   - 재생 중(playing)이면 멈춘다. 듣는 중에 뒤 카드가 바뀌면 "다음 DJ"가
   *     엉뚱한 사람을 가리키고, 시트를 닫았을 때 방금 들은 DJ가 아닌 게 떠 있다.
   *   - 목록 시트가 열려 있어도 멈춘다(뒤에서 혼자 도는 건 낭비).
   *   - 손을 대고 있는 동안(drag)도 멈춘다 — 미는 중에 자동으로 넘어가면 튄다.
   *   - 사람이 화면을 안 보고 있으면(문서 숨김) 멈춘다.
   *
   * 스와이프하면 3초를 처음부터 다시 센다(nudge). setInterval 은 계속 돌기 때문에
   * 2초째에 밀면 1초 뒤 또 넘어가 버린다 — 손으로 넘긴 직후엔 온전히 3초를 준다.
   */
  useEffect(() => {
    if (items.length < 2 || playing || listOpen) return;
    const timer = setInterval(() => {
      if (drag.current || document.hidden) return;
      // 마지막으로 넘어간 지 3초가 안 됐으면 건너뛴다(손으로 넘긴 것도 포함)
      if (Date.now() - swipedAt.current < 3000) return;
      swipedAt.current = Date.now();
      goRef.current(1);
    }, 500);
    return () => clearInterval(timer);
  }, [items.length, playing, listOpen]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    /* React 19 는 touchmove 를 passive 로 붙여 preventDefault 가 조용히 무시된다 —
       앱(WebView)에서 가로로 밀어도 세로 스크롤이 먼저 먹던 원인. 직접 단다. */
    const handler = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      onMoveRef.current(t.clientX, t.clientY, () => {
        if (e.cancelable) e.preventDefault();
      });
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, []);

  const onUp = (x: number) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.lock !== "x" || !trackRef.current) return;
    const dx = x - d.x;
    const w = viewportRef.current?.offsetWidth ?? 320;
    swipedAt.current = Date.now();
    if (Math.abs(dx) > Math.min(40, w * 0.12)) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    trackRef.current.style.transition = "transform .2s ease";
    trackRef.current.style.transform = "translateX(-33.3333%)";
  };

  // 미리듣기 되는 DJ가 없는 날은 아무것도 그리지 않는다 — 없는 기능을 광고하지
  // 않는다(LineupTicker 와 같은 규약). 훅은 이 위에서 전부 호출된 뒤다.
  if (!cur) return null;

  return (
    <section aria-label="DJ 미리듣기">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h2 className="text-[13.5px] font-black text-foreground tracking-tight">
          이번 주말, 당신을 뛰게 할 DJ는?
        </h2>
      </div>

      <div className="bg-[#1C1C1E] border border-border rounded-2xl overflow-hidden select-none">
        {/* 이전·현재·다음 세 장을 가로로 붙여 통째로 민다 — 페이드로 바꾸면
            미는 동안 다음 DJ가 안 보여 "넘긴다"는 느낌이 사라진다. */}
        <div
          ref={viewportRef}
          className="overflow-hidden cursor-grab active:cursor-grabbing"
          /* WebView 에서 클래스만으로는 안 먹는 경우가 있어 스타일로 못박는다 */
          style={{ touchAction: "pan-y" }}
          onTouchStart={(e) => onDown(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={(e) => onUp(e.changedTouches[0].clientX)}
          onMouseDown={(e) => {
            e.preventDefault();
            onDown(e.clientX, e.clientY);
          }}
          onMouseMove={(e) => onMove(e.clientX, e.clientY)}
          onMouseUp={(e) => onUp(e.clientX)}
          onMouseLeave={(e) => drag.current && onUp(e.clientX)}
        >
          <div
            ref={trackRef}
            className="flex w-[300%]"
            style={{ transform: "translateX(-33.3333%)" }}
          >
            {/* key 는 자리(i)로 고정한다 — idx 를 섞으면 넘길 때마다 세 장이
                통째로 언마운트/재마운트돼 이름이 한 번 깜빡인다.
                내용만 갈아끼우면 DOM 은 그대로 남는다. */}
            {[idx - 1, idx, idx + 1].map((k, i) => (
              <Slide
                key={i}
                item={at(k)}
                swipedAt={swipedAt}
                onPlay={() => setPlaying(at(k))}
              />
            ))}
          </div>
        </div>

        {/* 카드 아래 "더 많은 DJ" 줄은 두지 않는다 — 이 카드의 일은 듣게 만드는 것
            하나다. 목록은 듣고 난 시트 안(PreviewFooter)에서 연다. */}
      </div>

      <DiscoveryListSheet open={listOpen} onClose={() => setListOpen(false)} items={items} />

      {/* 카드에서 연 재생 시트 — 여기서 "다음 DJ"를 누르면 시트를 유지한 채
          다음 사람으로 바뀌고, 뒤 카드도 같이 따라간다. */}
      <Sheet open={!!playing} onOpenChange={(next) => !next && setPlaying(null)}>
        <SheetContent
          side="bottom"
          className="bg-card border-border rounded-t-3xl gap-0 px-4 pt-5 pb-8 max-w-lg mx-auto"
          data-no-pull-refresh="strict"
        >
          <SheetHeader className="p-0">
            {/* 찜은 이름 바로 옆 하트 하나로 — 오른쪽 끝에 두면 X와 붙는다 */}
            <div className="flex items-center gap-2 pr-10">
              {/* 이름이 곧 전체 프로필로 가는 문이다(시트 안 다른 화면과 같은 규칙) */}
              <SheetTitle className="min-w-0 text-left text-2xl font-black text-foreground tracking-tight truncate">
                {playing && (
                  <Link
                    href={`/dj/${playing.dj.slug}`}
                    className="hover:text-amber-400 transition-colors"
                  >
                    {playing.dj.display_name}
                  </Link>
                )}
              </SheetTitle>
              {playing && (
                <DjFavoriteButton
                  djId={playing.dj.id}
                  djName={playing.dj.display_name}
                  size="lg"
                />
              )}
            </div>
          </SheetHeader>
          {playing && (
            <DjPreviewButton
              variant="inline"
              key={playing.dj.id}
              autoOpen
              soundcloudUrl={playing.dj.soundcloud_url}
              youtubeUrl={playing.dj.youtube_url}
              djName={playing.dj.display_name}
              footer={
                <PreviewFooter
                  item={playing}
                  onMore={
                    items.length > 1
                      ? () => {
                          setPlaying(null);
                          setListOpen(true);
                        }
                      : undefined
                  }
                />
              }
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

/** 그 DJ 일정만 겹쳐 띄운다 — 목록 시트에서 쓴다(예정 라인업을 펴면 중복이라). */
function ScheduleButton({ dj }: { dj: DjProfileTarget & { slug: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full h-10 rounded-xl border border-border text-muted-foreground hover:text-foreground text-[12.5px] font-black inline-flex items-center justify-center transition-colors"
      >
        이 DJ 일정
      </button>
      {/* 이미 이 DJ를 듣고 있으므로 프로필 안의 "음악 미리듣기"는 숨긴다 */}
      <DjProfileSheet dj={open ? dj : null} onClose={() => setOpen(false)} hidePreview />
    </>
  );
}

/**
 * "더 알아보기" — 미리듣기 되는 DJ 전체를 날짜별로 묶어 보여주는 시트.
 *
 * 페이지 아래 라인업 목록(전체 DJ)과는 다른 화면이다. 여긴 들을 수 있는 사람만
 * 모여 있어 빈 줄이 없다 — 커버리지가 낮아도 티가 나지 않는 게 이 화면의 값이다.
 * 줄 UI(이름 → 프로필 시트, ▶ 미리듣기, 찜 하트)는 라인업 표와 같은 문법을 쓴다.
 */
function DiscoveryListSheet({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  /** 이미 sortForDisplay 로 정렬돼 들어온다 — 여기서 다시 정렬하지 않는다 */
  items: DiscoveryDj[];
}) {
  const { isFavoritedDj } = useDjFavoritesContext();

  // 날짜별로 묶는다 — "언제 갈지"가 이 화면에서 해결돼야 한다
  const groups = useMemo(() => {
    const m = new Map<string, DiscoveryDj[]>();
    for (const it of items) {
      const list = m.get(it.event_date);
      if (list) list.push(it);
      else m.set(it.event_date, [it]);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        date,
        list: list.sort(
          (a, b) => (a.start_min ?? Number.MAX_SAFE_INTEGER) - (b.start_min ?? Number.MAX_SAFE_INTEGER)
        ),
      }));
  }, [items]);

  // 지금 재생 중인 DJ — 줄을 누르면 이것만 바뀐다.
  // 줄마다 시트를 새로 띄우면 "열기 → 로딩 → 재생 → 닫기"를 사람마다 반복하게 되고,
  // 여러 DJ를 듣는 게 목적인 화면에서 그건 못 쓴다.
  const [playing, setPlaying] = useState<DiscoveryDj | null>(null);

  // 시트를 닫으면 재생도 끝난다 — 안 그러면 닫은 뒤에도 소리가 남는다
  const close = () => {
    setPlaying(null);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent
        side="bottom"
        /* 제목·목록·플레이어를 세로로 쌓고 목록만 스크롤시킨다.
           플레이어를 sticky 로 목록 위에 얹었더니 스크롤 때 제목과 겹쳐 비쳤고,
           스크롤 전에도 목록이 볼 수 있는 세로를 크게 깎았다. */
        className="h-[80vh] bg-card border-border rounded-t-3xl gap-0 px-0 pt-5 pb-0 max-w-lg mx-auto flex flex-col"
        data-no-pull-refresh="strict"
      >
        <SheetHeader className="p-0 px-4 shrink-0">
          {/* 재생 중이면 그 DJ 이름이 제목이 된다 — 지금 누구를 듣고 있는지가
              화면 맨 위에 오고, 찜도 그 옆에서 바로 된다. */}
          {/* 하트는 이름 바로 옆 — 오른쪽 끝에 두면 시트 닫기(X)와 붙어 오탭이 난다.
              pr-10 은 X 버튼 자리를 비워둔다. */}
          <div className="flex items-center gap-1.5 pr-10">
            <SheetTitle className="min-w-0 text-left text-2xl font-black text-foreground tracking-tight truncate">
              {playing ? (
                <Link
                  href={`/dj/${playing.dj.slug}`}
                  className="hover:text-amber-400 transition-colors"
                >
                  {playing.dj.display_name}
                </Link>
              ) : (
                "곧 만날 수 있는 DJ"
              )}
            </SheetTitle>
            {playing && (
              <DjFavoriteButton
                djId={playing.dj.id}
                djName={playing.dj.display_name}
              />
            )}
          </div>
        </SheetHeader>

        {/* 재생 중인 것은 목록 위에 고정 — sticky 로 목록에 얹으면 스크롤할 때
            제목과 겹쳐 비친다. 아예 형제로 두고 목록만 스크롤시킨다. */}
        {playing && (
          <div className="shrink-0 px-4 pt-2 pb-3 border-b border-border">
            <DjPreviewButton
              variant="inline"
              soundcloudUrl={playing.dj.soundcloud_url}
              youtubeUrl={playing.dj.youtube_url}
              djName={playing.dj.display_name}
              autoOpen
              key={playing.dj.id}
              /* 여기선 예정 라인업을 통째로 펴지 않는다 — 아래에 날짜별 목록이
                 이미 있어 같은 정보가 두 번이 되고 목록을 가린다.
                 대신 그 DJ 일정만 따로 보고 싶은 사람을 위해 버튼으로 둔다. */
              footer={<ScheduleButton dj={playing.dj} />}
              onNextDj={() => {
                const i = items.findIndex((x) => x.dj.id === playing.dj.id);
                setPlaying(items[(i + 1) % items.length]);
              }}
            />
          </div>
        )}

        {/* 목록만 스크롤 — min-h-0 이 없으면 flex 자식이 안 줄어들어 스크롤이 죽는다 */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4"
          /* 시트 안 목록을 세로로 스크롤할 때 뒤 페이지가 당겨져
             새로고침이 걸리던 문제 차단 (홈은 당겨서 새로고침 허용 화면) */
          data-no-pull-refresh="strict"
        >
          <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
            {groups.map((g) => (
              <div key={g.date}>
                <p
                  className={`px-4 pt-3 pb-1.5 text-[10px] font-bold tracking-wide ${
                    isLineupToday(g.date) ? "text-[#39ff6a]" : "text-muted-foreground"
                  }`}
                >
                  {isLineupToday(g.date) ? "오늘" : formatLineupDate(g.date)}
                </p>
                {g.list.map((it) => (
                  <SheetRow
                    key={`${g.date}-${it.dj.id}`}
                    item={it}
                    faved={isFavoritedDj(it.dj.id)}
                    active={playing?.dj.id === it.dj.id}
                    onPlay={() => setPlaying(it)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

      </SheetContent>
    </Sheet>
  );
}

/**
 * 시트의 한 줄 — 줄을 누르면 위 플레이어가 그 DJ로 바뀌고, 하트는 우리 찜이다.
 *
 * 위젯 안의 하트는 사운드클라우드 계정 것이라 로그인 없이는 눌러도 아무 일이
 * 없다(우리가 어쩔 수 없는 영역). 여기 하트는 user_favorite_djs 로, 찜해두면
 * 그 DJ가 뜨는 날 알림을 받는다 — 실제로 값이 있는 쪽은 이거다.
 *
 * <button> 안에 <button>을 넣을 수 없으므로 줄은 div로 두고,
 * 재생 영역과 하트를 형제로 나란히 둔다.
 */
function SheetRow({
  item: it,
  faved,
  active,
  onPlay,
}: {
  item: DiscoveryDj;
  faved: boolean;
  active: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`w-full text-left flex items-center gap-2.5 px-4 py-2.5 border-b border-white/5 last:border-0 transition-colors ${
        active ? "bg-[#FF5500]/10" : "active:bg-white/[0.03]"
      }`}
    >
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            {/* 찜은 듣고 난 뒤 헤더에서 한다 — 여기선 이미 찜한 DJ만 표시 */}
            {faved && (
              <Heart className="w-3 h-3 text-red-500 fill-red-500 shrink-0" aria-hidden="true" />
            )}
            <span
              className={`text-[13px] font-bold truncate ${
                active ? "text-[#FF5500]" : "text-foreground"
              }`}
            >
              {it.dj.display_name}
            </span>
          </span>
          {/* 시간은 클럽명 오른쪽에 붙인다(홈 전광판과 같은 규칙) — 왼쪽에 열을 따로
              두면 시간 없는 DJ(캡션 수집분)가 많아 빈칸만 남는다. */}
          <span className="block text-[10px] font-bold text-[#39ff6a] truncate mt-0.5">
            {it.club_name}
            {it.club_area ? ` ${it.club_area}` : ""}
            {it.start_min !== null && (
              <span className="font-mono text-white/60 ml-1.5">
                {formatBusinessMin(it.start_min)}
              </span>
            )}
          </span>
        </span>
        <Play
          className={`w-3.5 h-3.5 shrink-0 fill-current ${
            active ? "text-[#FF5500]" : "text-muted-foreground"
          }`}
          aria-hidden="true"
        />
    </button>
  );
}

/** 미리듣기 시트 하단 — 기본은 사운드클라우드로 나가는 링크지만, 듣다가 앱 밖으로
 *  빠지면 다음 DJ로 이어지지 않는다. 찜과 일정 보기로 바꿔 앱 안에 남긴다. */
/**
 * 미리듣기 시트 하단 — 그 DJ의 예정 일정을 바로 펼쳐둔다.
 *
 * 예전엔 "이 DJ 일정" 버튼으로 프로필 시트를 겹쳐 띄웠는데, 시트 아래가 어차피
 * 비어 있어서 한 번 더 누르게 할 이유가 없었다. 여기서 바로 보여주고,
 * 더 볼 사람만 "더 많은 DJ"로 목록을 편다.
 */
function PreviewFooter({ item, onMore }: { item: DiscoveryDj; onMore?: () => void }) {
  const [plays, setPlays] = useState<DjShowRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("lineup_sets")
        .select("start_min, club_lineups!inner(event_date, clubs!inner(id, name, area, thumbnail_url))")
        .eq("dj_id", item.dj.id)
        .gte("club_lineups.event_date", getBusinessDateISO())
        .limit(20);
      if (cancelled) return;

      type ClubRef = { id: string; name: string; area: string | null; thumbnail_url: string | null };
      type Raw = {
        start_min: number | null;
        club_lineups:
          | { event_date: string; clubs: ClubRef | ClubRef[] }
          | { event_date: string; clubs: ClubRef | ClubRef[] }[]
          | null;
      };

      const rows: DjShowRow[] = [];
      for (const r of (data ?? []) as unknown as Raw[]) {
        // PostgREST 조인은 배열/객체 양쪽으로 온다 (라인업 화면 공통 규약)
        const lineup = Array.isArray(r.club_lineups) ? r.club_lineups[0] : r.club_lineups;
        if (!lineup) continue;
        const club = Array.isArray(lineup.clubs) ? lineup.clubs[0] : lineup.clubs;
        if (!club) continue;
        rows.push({
          club_id: club.id,
          club_name: club.name,
          club_area: club.area,
          club_thumbnail: club.thumbnail_url ?? null,
          event_date: lineup.event_date,
          start_min: r.start_min,
        });
      }
      rows.sort(
        (a, b) =>
          a.event_date.localeCompare(b.event_date) ||
          (a.start_min ?? Number.MAX_SAFE_INTEGER) - (b.start_min ?? Number.MAX_SAFE_INTEGER)
      );
      setPlays(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [item.dj.id]);

  return (
    <div className="mt-4">
      <p className="text-[11px] font-bold text-muted-foreground mb-2">예정된 라인업</p>
      {plays === null ? (
        <div className="py-6 flex justify-center">
          <div className="w-5 h-5 border-2 border-border border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <DjLedShowList rows={plays} emptyLabel="예정된 라인업이 없어요" />
      )}

      {onMore && (
        <button
          type="button"
          onClick={onMore}
          className="mt-3 w-full h-10 rounded-xl border border-border text-muted-foreground hover:text-foreground text-[12.5px] font-black inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          더 많은 DJ
          <ChevronsRight className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Slide({
  item,
  swipedAt,
  onPlay,
}: {
  item: DiscoveryDj;
  swipedAt: React.MutableRefObject<number>;
  onPlay: () => void;
}) {
  const when = isLineupToday(item.event_date) ? "오늘" : formatLineupDate(item.event_date);

  /** 카드 어디를 눌러도 미리듣기가 열린다 — 이름만 글씨로 두면 눌러도 반응이 없다.
   *  단 밀어서 넘긴 직후에는 열지 않는다(스와이프 끝의 손 뗌이 탭으로 오인된다). */
  const openPreview = () => {
    if (Date.now() - swipedAt.current < 300) return;
    onPlay();
  };

  return (
    <div
      onClick={openPreview}
      className="basis-1/3 shrink-0 grow-0 relative flex items-center gap-2.5 px-3 py-3.5 cursor-pointer"
      style={{
        background:
          "radial-gradient(120% 90% at 78% 15%, rgba(255,85,0,.5), transparent 62%)," +
          "radial-gradient(95% 85% at 12% 92%, rgba(57,255,106,.28), transparent 58%)," +
          "linear-gradient(160deg,#231a16,#121214)",
      }}
    >
      {/* 홈 전광판과 같은 도트매트릭스 질감 */}
      <span
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,.07) 1px, transparent 1.3px)",
          backgroundSize: "5px 5px",
        }}
        aria-hidden="true"
      />

      <div className="relative z-[1] flex-1 min-w-0">
        <p className="text-[22px] font-black text-white tracking-[-0.035em] leading-[1.05] truncate drop-shadow-[0_2px_14px_rgba(0,0,0,.6)]">
          {item.dj.display_name}
        </p>
        {/* 클럽명은 형광 초록(라인업 화면 공통), 날짜·시간은 흰색 계열로 눌러 구분한다 */}
        <p className="text-[11.5px] font-extrabold mt-1 truncate">
          <span className="text-white/90">{when}</span>{" "}
          <span
            className="text-[#39ff6a]"
            style={{ textShadow: "0 0 8px rgba(57,255,106,.55)" }}
          >
            {item.club_name}
            {item.club_area ? ` ${item.club_area}` : ""}
          </span>
          {item.start_min !== null && (
            <span className="text-white/70 font-bold"> {formatBusinessMin(item.start_min)}</span>
          )}
        </p>
      </div>

      {/* 시트는 카드가 소유한다 — 슬라이드마다 시트를 두면 "다음 DJ"를 눌러도
          뒤 카드만 넘어가고 열려 있는 시트는 그대로라 재생이 끊긴다. */}
      <div className="relative z-[1] shrink-0">
        <span
          aria-hidden="true"
          className="w-11 h-11 rounded-full bg-[#FF5500] text-white shadow-[0_0_22px_rgba(255,85,0,.7)] inline-flex items-center justify-center"
        >
          <Play className="w-[17px] h-[17px] fill-current translate-x-[1px]" />
        </span>
      </div>
    </div>
  );
}
