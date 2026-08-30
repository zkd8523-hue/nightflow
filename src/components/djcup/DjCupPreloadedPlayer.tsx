"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SkipBack, SkipForward } from "lucide-react";
import { DjPreviewButton } from "@/components/djs/DjPreviewButton";
import type { DjCupCandidate } from "@/lib/djCup/types";

/**
 * DJ컵 전용 "완전 예열" 재생 시스템.
 *
 * ⚠️ 왜 DjPreviewButton을 재사용하지 않는가: 그 컴포넌트는 재생할 URL이
 * 바뀔 때마다(key prop) iframe을 새로 마운트한다. 사클 위젯은 URL 단위
 * HTML 캐시(CloudFront)와 브라우저 스크립트 캐시는 재사용되지만, iframe
 * 자체의 내부 상태(연결·트랙 로드 진행도)는 iframe이 바뀌면 처음부터
 * 다시 시작된다 — 그래서 "미리 로딩해둔" 효과가 실제 재생 시점까지
 * 이어지지 않았다.
 *
 * ⚠️ 실패한 접근들(순서대로):
 *  1) fetch(no-cors) 예열 — 위젯 스크립트가 파싱·실행되지 않아 무의미.
 *  2) 화면 밖 숨김 iframe을 예열 후 화면 슬롯으로 appendChild 이동 —
 *     <iframe>은 DOM 부모가 바뀌면(reparenting) 브라우저가 강제로
 *     다시 로드한다.
 *  3) iframe을 고정 위치에 두고 좌표만 이동(position:absolute) —
 *     getBoundingClientRect 타이밍·querySelector 전역 조회가 불안정해
 *     "아예 안 보임"으로 이어졌다.
 *  4) 참가자 전원의 iframe을 처음부터 다 렌더 + src도 전원 즉시 설정 —
 *     reparenting 문제는 해결됐지만 "예열 자체가 안 느껴진다"는 반응이
 *     나왔다. 원인: 순차 로딩(첫 곡만 즉시, 나머지는 유휴 시간마다 하나씩)
 *     을 이 리라이트에서 빠뜨렸다 — 전원이 마운트와 동시에 src를 받아
 *     동시 로딩되면서 오히려 네트워크 큐가 밀리는 예전 문제로 되돌아갔다.
 *
 * 이 버전은 4)의 DOM 구조(전원 렌더 + display 대신 position:absolute로
 * 화면 밖 배치, 언마운트 없음)는 유지하되, src를 처음부터 채우지 않는다 —
 * 첫 곡만 즉시 로드하고 나머지는 순번이 올 때(또는 유저가 먼저 그 카드를
 * 눌렀을 때) src를 채운다. src가 비어 있는 동안은 그 iframe에 아무 요청도
 * 나가지 않는다(about:blank 상태).
 *
 * auto_play=false로 고정한다 — 화면에 안 보이는 곡들이 백그라운드에서
 * 동시에 소리를 내면 안 되므로, 대신 화면에 나타나는 시점에 Widget API로
 * 명시적 play()를 호출한다.
 */

interface PlayerHandle {
  iframeRef: HTMLIFrameElement | null;
  widget: {
    play: () => void;
    pause: () => void;
    next: () => void;
    prev: () => void;
    getSounds: (cb: (sounds: unknown[]) => void) => void;
  } | null;
  ready: boolean;
  hasQueue: boolean;
  /** src가 아직 안 채워진 iframe인지 — true면 about:blank로 대기 중. */
  loadStarted: boolean;
}

interface ManagerApiInternal {
  getHandle: (djId: string) => PlayerHandle | undefined;
  /** 이 djId의 로드를 지금 당장 시작한다(순번을 기다리지 않고 새치기). */
  startLoading: (djId: string) => void;
  activeDjId: string | null;
  setActiveDjId: (id: string | null) => void;
  urls: Array<{ djId: string; url: string }>;
  registerIframe: (djId: string, iframe: HTMLIFrameElement) => void;
  /** djId → 후보 원본. 사클 없는 DJ의 유튜브 폴백 렌더에 필요하다. */
  candidatesById: Map<string, DjCupCandidate>;
}

const ManagerContext = createContext<ManagerApiInternal | null>(null);

export function useDjCupPlayerManager() {
  const ctx = useContext(ManagerContext);
  if (!ctx) throw new Error("DjCupPreloadProvider 안에서만 쓸 수 있다");
  return ctx;
}

// Window.SC 전역 타입은 DjPreviewButton.tsx에서 선언한다(같은 전역을 두 번
// 선언하면 구조가 조금만 달라도 TS2717 충돌이 난다) — 여기서는 재사용만 한다.

let scApiPromise: Promise<void> | null = null;
function loadScApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.SC?.Widget) return Promise.resolve();
  if (!scApiPromise) {
    scApiPromise = new Promise((resolve) => {
      const sc = document.createElement("script");
      sc.src = "https://w.soundcloud.com/player/api.js";
      sc.async = true;
      sc.onload = () => resolve();
      sc.onerror = () => resolve();
      document.body.appendChild(sc);
    });
  }
  return scApiPromise;
}

/** auto_play=false 고정 — 화면에 안 보이는 곡이 백그라운드에서 소리를 내면 안 된다. */
function playerSrcNoAutoplay(url: string): string {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(
    url
  )}&color=%23ff5500&theme=dark&auto_play=false&visual=false&show_artwork=true&show_comments=false&show_teaser=false&sharing=false&buying=false&download=false&show_user=false`;
}

export function DjCupPreloadProvider({
  candidates,
  children,
}: {
  candidates: DjCupCandidate[];
  children: React.ReactNode;
}) {
  // ⚠️ useMemo 없이 매 렌더마다 새 배열을 만들면 안 된다 — 아래 백그라운드
  // 순차 로딩 effect가 [urls]에 의존하는데, 새 참조가 매번 들어오면
  // forceRender(READY 이벤트마다)나 setActiveDjId(매치 전환마다) 호출로
  // 리렌더될 때마다 그 effect가 처음부터 다시 시작돼 큐가 계속 리셋됐다
  // (2매치 이후 회색 빈 박스가 계속 나오던 진짜 원인 — 앞선 수정들은
  // 전부 다른 버그를 고쳤을 뿐 이 리셋 루프는 그대로 남아 있었다).
  const urls = useMemo(
    () =>
      candidates
        .filter((c) => c.soundcloud_url)
        .map((c) => ({ djId: c.id, url: c.soundcloud_url as string })),
    [candidates]
  );
  const candidatesById = useMemo(
    () => new Map(candidates.map((c) => [c.id, c])),
    [candidates]
  );
  const handlesRef = useRef<Map<string, PlayerHandle>>(new Map());
  const urlsByIdRef = useRef<Map<string, string>>(new Map());
  const [activeDjId, setActiveDjIdState] = useState<string | null>(null);
  const activeDjIdRef = useRef<string | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    urlsByIdRef.current = new Map(urls.map((u) => [u.djId, u.url]));
  }, [urls]);

  const ensureHandle = (djId: string): PlayerHandle => {
    let handle = handlesRef.current.get(djId);
    if (!handle) {
      handle = { iframeRef: null, widget: null, ready: false, hasQueue: false, loadStarted: false };
      handlesRef.current.set(djId, handle);
    }
    return handle;
  };

  /** 이 djId의 iframe에 src를 채워 실제 로드를 시작한다. 이미 시작했으면
   *  아무 것도 안 한다 — 백그라운드 큐와 "클릭해서 새치기"가 같은 djId를
   *  중복 요청해도 안전하다. */
  const startLoading = (djId: string) => {
    const handle = ensureHandle(djId);
    if (handle.loadStarted || !handle.iframeRef) return;
    const url = urlsByIdRef.current.get(djId);
    if (!url) return; // 사클 없는 DJ(유튜브 폴백 대상)
    handle.loadStarted = true;
    const iframe = handle.iframeRef;
    iframe.src = playerSrcNoAutoplay(url);

    loadScApi().then(() => {
      const SC = window.SC;
      if (!SC?.Widget || handlesRef.current.get(djId)?.iframeRef !== iframe) return;
      const w = SC.Widget(iframe);

      let queueKnown = false;
      const checkQueue = () => {
        if (queueKnown) return;
        try {
          w.getSounds((sounds) => {
            if (Array.isArray(sounds) && sounds.length > 1) {
              queueKnown = true;
              handle.hasQueue = true;
              forceRender((n) => n + 1);
            }
          });
        } catch {
          /* 큐 판별 실패는 무시 */
        }
      };

      w.bind(SC.Widget.Events.READY, () => {
        handle.widget = w;
        handle.ready = true;
        forceRender((n) => n + 1);
        checkQueue();
        // setActiveDjId(djId)가 이 iframe의 READY보다 먼저 호출됐다면
        // (매치 마운트 시점엔 위젯이 아직 안 뜬다) 그때는 widget이 null이라
        // play()가 조용히 씹혔다 — READY가 온 지금 "그때 원했던 게 나였다"면 튼다.
        if (activeDjIdRef.current === djId) {
          try {
            w.play();
          } catch {
            /* 자동재생 차단 환경 — 위젯 안 버튼으로 대체 */
          }
        }
      });
      w.bind(SC.Widget.Events.LOAD_PROGRESS, checkQueue);
      w.bind(SC.Widget.Events.PLAY, checkQueue);
    });
  };

  const registerIframe = (djId: string, iframe: HTMLIFrameElement) => {
    const handle = ensureHandle(djId);
    // ⚠️ 같은 djId인데 <iframe> DOM 노드가 바뀌었다면(= 슬롯이 언마운트됐다가
    // 다시 마운트됨) 그 새 노드는 src가 비어 있다. handle에 남아 있는
    // loadStarted=true를 그대로 두면 startLoading이 맨 앞에서 조용히 리턴해
    // 아무도 src를 채우지 않는다 → 영원히 회색 빈 박스.
    //
    // 재현: 재생 중인 카드를 한 번 더 눌러 끄면(setActiveDjId(null)) 슬롯이
    // 통째로 언마운트되고, 다시 켜면 새 iframe이 src 없이 남는다.
    // ("B를 껐다 켜면 로딩이 안 된다"의 원인)
    if (handle.iframeRef && handle.iframeRef !== iframe) {
      handle.loadStarted = false;
      handle.ready = false;
      handle.widget = null;
      handle.hasQueue = false;
    }
    handle.iframeRef = iframe;
    // startLoading이 iframeRef가 아직 없어서 조용히 포기했을 수 있다
    // (2매치부터 회색 빈 박스로만 뜨던 버그의 원인 — DjCupMatch의 effect가
    // setActiveDjId를 부르는 시점에 이 djId의 <iframe>이 아직 마운트/등록
    // 전이면 startLoading이 그냥 리턴하고, 그 뒤로 아무도 재시도하지 않았다).
    // 이제 iframe이 막 등록된 djId가 활성 상태로 지정돼 있었다면 지금 로드한다.
    if (activeDjIdRef.current === djId) startLoading(djId);
  };

  // 백그라운드 순차 로딩 — 첫 곡은 경쟁 없이 즉시, 나머지는 유휴 시간마다
  // 하나씩(동시에 다 로드하면 브라우저 네트워크 큐가 밀려 첫 곡까지
  // 늦어진다, 실측). iframe DOM 자체는 이미 다 마운트돼 있으므로(전원
  // 렌더 + position:absolute로 숨김) src만 순서대로 채운다.
  useEffect(() => {
    if (urls.length === 0) return;
    let cancelled = false;

    const kickoff = () => {
      if (cancelled) return;
      if (urls[0]) startLoading(urls[0].djId);

      let idx = 1;
      const idle = (
        window as unknown as {
          requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void;
        }
      ).requestIdleCallback;
      const loadNext = () => {
        if (cancelled || idx >= urls.length) return;
        const { djId } = urls[idx];
        idx++;
        startLoading(djId);
        if (idle) idle(loadNext, { timeout: 3000 });
        else window.setTimeout(loadNext, 800);
      };
      if (idle) idle(loadNext, { timeout: 3000 });
      else window.setTimeout(loadNext, 800);
    };

    // registerIframe이 이 effect보다 먼저(자식 effect가 부모보다 먼저 실행)
    // 돌아 iframeRef가 채워져 있어야 startLoading이 src를 넣을 수 있다.
    // 혹시 순서가 어긋나는 경우를 대비해 한 틱 미룬다.
    const t = window.setTimeout(kickoff, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls]);

  const setActiveDjId = (id: string | null) => {
    if (activeDjIdRef.current && activeDjIdRef.current !== id) {
      const prev = handlesRef.current.get(activeDjIdRef.current);
      try {
        prev?.widget?.pause();
      } catch {
        /* 무시 */
      }
    }
    activeDjIdRef.current = id;
    setActiveDjIdState(id);
    if (id) {
      // 큐 순번이 아직 안 돌아온 DJ를 클릭했을 수 있다 — 지금 당장 새치기.
      startLoading(id);
      const handle = handlesRef.current.get(id);
      try {
        handle?.widget?.play();
      } catch {
        /* 자동재생 차단 환경 또는 위젯 아직 준비 전 — READY 콜백이 재시도한다 */
      }
    }
  };

  const api: ManagerApiInternal = {
    getHandle: (djId) => handlesRef.current.get(djId),
    startLoading,
    activeDjId,
    setActiveDjId,
    urls,
    registerIframe,
    candidatesById,
  };

  return <ManagerContext.Provider value={api}>{children}</ManagerContext.Provider>;
}

/**
 * "재생 위젯 자리" — 라운드 참가자 전원의 iframe을 이 위치에 전부
 * 렌더하되(마운트는 한 번뿐, 언마운트 없음), activeDjId가 아닌 것은
 * position:absolute로 화면 밖에 둔다. src는 각자 자기 차례가 되거나
 * 활성으로 지정될 때만 채워진다(마운트 시 전원이 한꺼번에 로드를
 * 시작하지 않는다).
 *
 * ⚠️ djId prop을 받지 않는다 — 예전엔 매치 컴포넌트가 "지금 보여줄 DJ"를
 * prop으로 넘겼는데, 그 매치 컴포넌트 자체가 조건부 렌더링(사클/유튜브
 * 폴백 분기) 때문에 리마운트될 수 있어, 이 컴포넌트가 함께 리마운트되며
 * 안에 있던 모든 <iframe>이 통째로 새로 만들어졌다(2매치부터 회색 빈
 * 박스로만 뜨던 버그의 원인). 그래서 이 컴포넌트는 매치 트리 바깥
 * (DjCupClient)에 단 하나만 두고, activeDjId를 매니저에서 직접 읽는다 —
 * 매치가 몇 번을 바뀌어도 이 컴포넌트 자신은 리마운트되지 않는다.
 */
export function DjCupPlayerSlot() {
  const { activeDjId, urls, registerIframe, getHandle, candidatesById } = useDjCupPlayerManager();

  // ⚠️ activeDjId가 없다고 해서 return null 하면 안 된다 — 그 순간 아래
  // <PreloadedIframe> 전부가 언마운트되고, 다시 활성화될 때 src가 비어 있는
  // 새 iframe으로 되살아난다(= 회색 빈 박스). 활성이 없을 때도 iframe 목록은
  // 그대로 두고 화면에 보이는 것만 없앤다.
  const activeCandidate = activeDjId ? candidatesById.get(activeDjId) : undefined;
  // 사클 없는 DJ(유튜브 폴백 대상)는 애초에 urls(프리로드 대상)에 없다.
  //
  // ⚠️ 여기서 early return 하면 안 된다 — 유튜브 DJ가 활성인 동안 아래
  // 사클 iframe 목록이 통째로 언마운트되고, 다음 사클 매치에서 src 없는
  // 빈 iframe으로 되살아난다(회색 빈 박스의 또 다른 경로). 그래서 유튜브
  // 폴백은 iframe 목록을 "대체"하지 않고 그 옆에 함께 렌더한다.
  const youtubeFallback =
    activeCandidate && !activeCandidate.soundcloud_url ? (
      <DjPreviewButton
        key={activeCandidate.id}
        variant="inline"
        soundcloudUrl={activeCandidate.soundcloud_url}
        youtubeUrl={activeCandidate.youtube_url}
        djName={activeCandidate.display_name}
        autoOpen
        footer={<></>}
      />
    ) : null;

  return (
    <div>
      {youtubeFallback}
      {urls.map(({ djId: candidateId }) => (
        <PreloadedIframe
          key={candidateId}
          djId={candidateId}
          visible={activeDjId === candidateId}
          registerIframe={registerIframe}
        />
      ))}
      {(() => {
        const handle = activeDjId ? getHandle(activeDjId) : undefined;
        if (!(handle?.ready && handle.hasQueue)) return null;
        return (
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => handle.widget?.prev()}
              aria-label="이전 곡"
              className="h-9 px-4 rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95 transition-all inline-flex items-center gap-1.5 text-[12px] font-bold"
            >
              <SkipBack className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              이전곡
            </button>
            <button
              type="button"
              onClick={() => handle.widget?.next()}
              aria-label="다음 곡"
              className="h-9 px-4 rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95 transition-all inline-flex items-center gap-1.5 text-[12px] font-bold"
            >
              다음곡
              <SkipForward className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            </button>
          </div>
        );
      })()}
    </div>
  );
}

/** urls 배열 하나(=한 명)에 대응하는 실제 <iframe>. src는 처음엔 비워두고
 *  (about:blank) startLoading이 호출될 때만 채운다 — 마운트와 동시에 전원이
 *  로드를 시작하면 네트워크 큐가 밀려 오히려 느려진다(실측). visible이
 *  아니면 position:absolute로 화면 밖 — 언마운트하지 않는다(다시 마운트하면
 *  iframe이 새로 만들어져 로드가 처음부터 다시 시작된다). */
function PreloadedIframe({
  djId,
  visible,
  registerIframe,
}: {
  djId: string;
  visible: boolean;
  registerIframe: (djId: string, iframe: HTMLIFrameElement) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (ref.current) registerIframe(djId, ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [djId]);

  return (
    <div
      style={
        visible
          ? { position: "relative", height: 166 }
          : { position: "absolute", left: -9999, top: -9999, width: "100%", height: 166 }
      }
    >
      <iframe
        ref={ref}
        title={djId}
        width="100%"
        height={166}
        frameBorder="no"
        scrolling="no"
        allow="autoplay; encrypted-media"
        className="rounded-xl overflow-hidden"
      />
    </div>
  );
}
