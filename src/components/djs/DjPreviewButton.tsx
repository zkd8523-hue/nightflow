"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsRight, Play, SkipBack, SkipForward } from "lucide-react";
import { SoundcloudIcon } from "@/components/icons/SoundcloudIcon";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * DJ 미리듣기 — 이름만 봐서는 "어떤" DJ인지 모르는 문제를 푸는 자리.
 *
 * 사운드클라우드 위젯을 쓰는 이유: API 키·등록·쿼터가 전부 없다(oEmbed/위젯은
 * 닫힌 REST API 바깥이다). 유튜브는 검색 API가 하루 100회라 620명을 못 훑고,
 * 스포티파이는 비로그인 유저에게 30초만 들려준다.
 *
 * soundcloud_url 이 없는 DJ에겐 아무것도 그리지 않는다 — 눌러도 안 되는 회색
 * 버튼이 라인업 12줄에 늘어서면 서비스가 비어 보인다(LineupLikeButton 이 0건일 때
 * 카드에 안 그리는 것과 같은 판단).
 *
 * ⚠️ 모바일 브라우저는 자동재생을 막는다(사운드클라우드 공식 문서 + 브라우저 정책).
 * auto_play=true 를 넣어도 무시되므로 탭해서 듣는 흐름을 전제로 만든다.
 * 클럽 라인업을 훑는 맥락에선 소리가 갑자기 나지 않는 편이 오히려 맞다.
 */
export function DjPreviewButton({
  soundcloudUrl,
  djName,
  className = "",
  variant = "icon",
  icon,
  buttonRef,
  autoOpen = false,
  footer,
  onNextDj,
  nextLabel = "다음 DJ",
}: {
  soundcloudUrl: string | null | undefined;
  djName: string;
  className?: string;
  /** 아이콘을 갈아끼운다 — 라인업 발견 카드는 큰 주황 원형 버튼을 쓴다.
   *  안 넘기면 표 안에서 쓰는 작은 회색 삼각형 그대로. */
  icon?: React.ReactNode;
  /** icon: ▶ 아이콘 → 시트로 연다(라인업 표처럼 자리가 좁은 곳).
   *  inline: 그 자리에 플레이어를 편다(이미 시트 안이라 또 시트를 겹치면
   *  어두운 오버레이가 두 겹으로 깔려 탁해진다). */
  variant?: "icon" | "inline";
  /** 바깥에서 이 버튼을 대신 눌러줄 때 쓴다 — 발견 카드는 카드 아무데나 눌러도
   *  미리듣기가 열려야 해서 카드 클릭이 이 버튼의 click()을 호출한다. */
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  /** inline 에서 버튼 단계를 건너뛰고 바로 플레이어를 편다 — 이미 다른 곳에서
   *  "재생"을 눌러 여기까지 온 경우(발견 시트) 한 번 더 누르게 하면 헛걸음이다. */
  autoOpen?: boolean;
  /** 시트 하단 링크를 갈아끼운다. 기본은 사운드클라우드로 나가는 링크인데,
   *  발견 카드처럼 "앱 안에서 계속 듣게" 하는 자리에서는 밖으로 내보내면 안 된다. */
  footer?: React.ReactNode;
  /** 곡 이동(이전/다음) 오른쪽에 "다음 DJ" 버튼을 낸다 — 발견 흐름에서
   *  같은 DJ의 다른 곡보다 다음 사람으로 넘어가는 쪽이 잦다. */
  onNextDj?: () => void;
  /** 그 버튼의 문구. 카드 시트는 "더 많은 DJ"(목록 열기)로 쓴다. */
  nextLabel?: string;
}) {
  const [open, setOpen] = useState(autoOpen);

  /* 버튼이 그려진 시점에 연결을 미리 열고 api.js(5.5KB)도 받아둔다 —
     탭한 뒤에 시작하면 DNS→TLS→api.js→iframe 이 직렬로 붙어 체감이 느리다.
     이미 받아둔 스크립트는 재사용되므로 탭 순간엔 iframe 만 남는다. */
  useEffect(() => {
    if (!soundcloudUrl) return;
    preconnectSoundcloud();
    void loadScApi();
  }, [soundcloudUrl]);

  if (!soundcloudUrl) return null;

  if (variant === "inline") {
    return open ? (
      <>
        <SoundcloudPlayer
          url={soundcloudUrl}
          djName={djName}
          onNextDj={onNextDj}
          nextLabel={nextLabel}
        />
        {footer}
      </>
    ) : (
      /* 시트 안에서 이건 주 액션이다("이 DJ 어떤 사람인지"를 바로 푸는 유일한 버튼).
         아래 "전체 프로필 보기"와 같은 외곽선 버튼이면 위계가 없어 눈에 안 들어온다.
         채운 버튼 + 아이콘을 키워 확실히 1순위로 올린다. */
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full h-11 rounded-xl bg-white text-black font-black text-[14px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <SoundcloudIcon size={18} aria-hidden="true" />
        음악 미리듣기
      </button>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          // 행 전체가 프로필 시트를 여는 자리라 부모로 이벤트가 새면 두 개가 같이 뜬다
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`${djName} 음악 미리듣기`}
        /* 행 오른쪽 끝 열에 단독으로 서므로 색으로 튀게 할 필요가 없다 —
           표 상단 "눌러서 미리듣기" 라벨이 의미를 설명하고, 아이콘은 그 라벨과
           같은 모양·같은 색이라 서로를 가리킨다.
           채운 삼각형이라 빈 외곽선일 때보다 재생 뜻은 그대로 살아 있다.
           바깥 패딩(-my-2)은 터치 영역 확보용. */
        className={`shrink-0 inline-flex items-center justify-center px-1 py-2 -my-2 text-muted-foreground hover:text-foreground active:scale-90 transition-all ${className}`}
      >
        {/* 표 안 작은 자리에서는 사클 구름 로고가 뭉개져 안 읽힌다 —
            여기만 재생 삼각형을 쓴다(로고는 시트 안에서 크게 보여준다). */}
        {icon ?? <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="bg-card border-border rounded-t-3xl gap-0 px-4 pt-9 pb-8 max-w-lg mx-auto"
        >
          <SheetHeader className="p-0">
            <SheetTitle className="text-left text-lg font-black text-foreground inline-flex items-center gap-2">
              {djName}
              <SoundcloudIcon size={16} className="text-[#FF5500]" />
            </SheetTitle>
          </SheetHeader>

          {/* 시트가 닫히면 iframe 을 DOM 에서 없앤다 — 안 그러면 닫은 뒤에도
              소리가 계속 난다(위젯은 언마운트로만 확실히 멈춘다). */}
          {open && (
            <SoundcloudPlayer
              url={soundcloudUrl}
              djName={djName}
              onNextDj={onNextDj}
              nextLabel={nextLabel}
            />
          )}

          {footer ?? (
            <a
              href={soundcloudUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block text-center text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              사운드클라우드에서 더 듣기 →
            </a>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * 위젯 iframe + 곡 넘기기 컨트롤.
 *
 * theme=dark 를 준다 — 기본값은 흰 배경이라 앱 다크 테마 위에서 혼자 밝게 떠 보인다.
 *
 * 다음/이전 곡은 사클 Widget API(w.soundcloud.com/player/api.js)로 제어한다.
 * 이것도 키·등록 없이 열려 있다(5.5KB). 위젯 자체에는 넘기기 버튼이 없어서
 * 프로필 URL로 여러 곡이 큐에 들어와도 유저가 다음 곡으로 갈 방법이 없었다.
 *
 * 스크립트는 한 번만 로드하고 여러 플레이어가 공유한다(시트를 여닫을 때마다
 * 5.5KB를 다시 받을 이유가 없다).
 */
declare global {
  interface Window {
    SC?: {
      Widget: ((el: HTMLIFrameElement) => {
        bind: (ev: string, cb: () => void) => void;
        play: () => void;
        next: () => void;
        prev: () => void;
        getSounds: (cb: (sounds: unknown[]) => void) => void;
      }) & { Events: { READY: string; PLAY: string; LOAD_PROGRESS: string } };
    };
  }
}

/**
 * 사클 호스트에 DNS+TLS 를 미리 끝내둔다.
 *
 * 실측(따뜻한 상태에서도): 위젯 iframe 첫 바이트 930ms, api.js 820ms.
 * 서버 응답 자체는 우리가 못 줄이지만, 그 앞의 핸드셰이크는 미리 할 수 있다.
 * 탭한 뒤에야 DNS→TLS→요청이 줄줄이 붙는 걸 없앤다.
 *
 * 레이아웃(전역)이 아니라 여기서 하는 이유: 미리듣기가 없는 화면까지
 * 사클에 연결을 열 이유가 없다.
 */
let hinted = false;
function preconnectSoundcloud() {
  if (typeof document === "undefined" || hinted) return;
  hinted = true;
  for (const [rel, href] of [
    ["preconnect", "https://w.soundcloud.com"],
    ["preconnect", "https://api.soundcloud.com"],
    ["dns-prefetch", "https://i1.sndcdn.com"],
  ] as const) {
    const l = document.createElement("link");
    l.rel = rel;
    l.href = href;
    if (rel === "preconnect") l.crossOrigin = "anonymous";
    document.head.appendChild(l);
  }
}

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
      // 실패해도 플레이어 자체는 동작한다 — 넘기기 버튼만 안 뜨게 두고 넘어간다
      sc.onerror = () => resolve();
      document.body.appendChild(sc);
    });
  }
  return scApiPromise;
}

function SoundcloudPlayer({
  url,
  djName,
  onNextDj,
  nextLabel = "다음 DJ",
}: {
  url: string;
  djName: string;
  onNextDj?: () => void;
  /** 그 버튼의 문구. 카드 시트는 "더 많은 DJ"(목록 열기)로 쓴다. */
  nextLabel?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const widgetRef = useRef<{ play: () => void; next: () => void; prev: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  /* 큐에 곡이 하나뿐이면 "이전곡/다음곡"은 눌러도 아무 일이 없다 —
     반응 없는 버튼을 두느니 안 그린다. */
  const [hasQueue, setHasQueue] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadScApi().then(() => {
      if (cancelled || !iframeRef.current || !window.SC?.Widget) return;
      const w = window.SC.Widget(iframeRef.current);
      const SC = window.SC;
      let started = false;
      /* READY 시점엔 아직 트랙이 안 실려 getSounds 가 0~1건을 준다 —
         거기서 한 번만 물으면 곡이 여러 개인 DJ도 "이전곡/다음곡"이 사라진다.
         로드가 진행될 때마다 다시 물어보고, 한 번이라도 2건 이상이면 확정한다. */
      let queueKnown = false;
      const checkQueue = () => {
        if (cancelled || queueKnown) return;
        try {
          w.getSounds((sounds) => {
            if (cancelled) return;
            if (Array.isArray(sounds) && sounds.length > 1) {
              queueKnown = true;
              setHasQueue(true);
            }
          });
        } catch {
          /* 큐를 못 읽으면 곡 이동 버튼은 안 그린다 */
        }
      };

      const kick = () => {
        if (cancelled || started) return;
        try {
          w.play();
        } catch {
          /* 자동재생 차단 — 위젯 안에서 직접 누르면 된다 */
        }
      };

      w.bind(SC.Widget.Events.READY, () => {
        if (cancelled) return;
        widgetRef.current = w;
        setReady(true);
        checkQueue();
        // READY 는 "위젯 껍데기가 준비됨"이지 "음원이 로드됨"이 아니다.
        // 여기서만 play() 를 부르면 아직 트랙이 없어 무시되고, 유저 눈에는
        // "재생 → 로딩 → 다시 재생"으로 보인다. 로드가 진행될 때 한 번 더 민다.
        kick();
      });
      w.bind(SC.Widget.Events.LOAD_PROGRESS, () => {
        kick();
        checkQueue();
      });
      // 실제로 재생이 시작되면 더 밀지 않는다(유저가 일시정지한 걸 되살리면 안 된다)
      w.bind(SC.Widget.Events.PLAY, () => {
        started = true;
        checkQueue(); // 재생이 시작되면 큐가 확실히 채워져 있다
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-3">
      <iframe
        ref={iframeRef}
        title={`${djName} 사운드클라우드`}
        src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(
          url
        )}&color=%23ff5500&theme=dark&auto_play=true&visual=false&show_artwork=true&show_comments=false&show_teaser=false&sharing=false&buying=false&download=false&show_user=false`}
        width="100%"
        height={166}
        frameBorder="no"
        scrolling="no"
        allow="autoplay; encrypted-media"
        className="rounded-xl overflow-hidden"
      />

      {/* API 준비 전에는 안 그린다 — 눌러도 반응 없는 버튼을 보여주지 않기 위함 */}
      {ready && (
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
          <span aria-hidden="true" />
          <span className="flex items-center gap-1.5">
          {hasQueue && (
            <>
          <button
            type="button"
            onClick={() => widgetRef.current?.prev()}
            aria-label="이전 곡"
            className="h-9 px-4 rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95 transition-all inline-flex items-center gap-1.5 text-[12px] font-bold"
          >
            <SkipBack className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            이전곡
          </button>
          <button
            type="button"
            onClick={() => widgetRef.current?.next()}
            aria-label="다음 곡"
            className="h-9 px-4 rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95 transition-all inline-flex items-center gap-1.5 text-[12px] font-bold"
          >
            다음곡
            <SkipForward className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
          </button>
            </>
          )}
          </span>

          {/* 곡 이동(이전곡/다음곡)과 사람 이동을 한 줄에 두되, 색으로 구분한다 —
              발견 흐름에서는 같은 DJ의 다른 곡보다 다음 사람으로 넘어가는 쪽이 잦다. */}
          {/* 이전곡·다음곡은 진짜 가운데, 다음 DJ는 오른쪽 칸.
              absolute 로 겹쳐 두면 390px 폰에서 가운데 버튼과 부딪힌다(실측). */}
          <span className="justify-self-end">
            {onNextDj && (
              <button
                type="button"
                onClick={onNextDj}
                aria-label={nextLabel}
                className="h-9 px-3 rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95 transition-all inline-flex items-center gap-1 text-[12px] font-bold whitespace-nowrap"
              >
                {nextLabel}
                <ChevronsRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
