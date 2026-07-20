"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ExternalLink, MapPin, Play, Volume2, VolumeX } from "lucide-react";
import type { ChatMediaItem } from "@/types/database";
import { ChatImageViewer } from "./ChatImageViewer";

/** 셀에서 그리드 루트의 뷰어를 열기 위한 통로 (props 드릴링 회피) */
const ViewerContext = createContext<((index: number) => void) | null>(null);

interface Props {
  items: ChatMediaItem[];
}

/**
 * 채팅 메시지 미디어 그리드 (최대 4개)
 * - 1개: full width
 * - 2개: 가로 2등분
 * - 3개: 좌측 큰 1 + 우측 세로 2
 * - 4개: 2x2 그리드
 * 동영상: 음소거 자동재생 (IntersectionObserver, 보일 때만)
 */
export function ChatMediaGrid({ items }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (!items || items.length === 0) return null;

  const files = items.filter((i) => i.type !== "location");
  return (
    <ViewerContext.Provider value={(i) => setViewerIndex(i)}>
      <GridBody items={items} />
      {viewerIndex !== null && files.length > 0 && (
        <ChatImageViewer
          items={files}
          index={Math.min(viewerIndex, files.length - 1)}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </ViewerContext.Provider>
  );
}

function GridBody({ items }: Props) {

  // 위치 공유는 사진 그리드와 성격이 달라 카드로 따로 렌더
  const locations = items.filter((i) => i.type === "location");
  const files = items.filter((i) => i.type !== "location");
  if (locations.length > 0) {
    return (
      <>
        {locations.map((loc, i) => (
          <LocationCard key={`loc-${i}`} item={loc} />
        ))}
        {files.length > 0 && <GridBody items={files} />}
      </>
    );
  }

  const count = Math.min(items.length, 4);

  if (count === 1) {
    const item = items[0];
    // 원본 비율 그대로 (카톡식). 예전엔 16:9로 강제 크롭해서
    // 세로 스크린샷이 위아래로 잘려 나갔다.
    // 극단적인 세로 이미지만 3:4로 제한해 채팅이 한 장에 먹히지 않게 한다.
    const ratio =
      item.width && item.height ? item.width / item.height : 4 / 3;
    const aspect = Math.max(ratio, 3 / 4);

    return (
      <div
        className="mt-2 rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 w-[200px] max-w-full"
        style={{ aspectRatio: String(aspect) }}
      >
        <MediaCell item={item} aspect="cover" index={0} />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-neutral-800 w-[200px] max-w-full">
        <MediaCell item={items[0]} aspect="square" index={0} />
        <MediaCell item={items[1]} aspect="square" index={1} />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-neutral-800 aspect-[4/3] w-[200px] max-w-full">
        <MediaCell item={items[0]} aspect="cover" index={0} />
        <div className="grid grid-rows-2 gap-0.5">
          <MediaCell item={items[1]} aspect="cover" index={1} />
          <MediaCell item={items[2]} aspect="cover" index={2} />
        </div>
      </div>
    );
  }

  // 4개
  return (
    <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-neutral-800 w-[200px] max-w-full">
      {items.slice(0, 4).map((it, i) => (
        <MediaCell key={i} item={it} aspect="square" index={i} />
      ))}
    </div>
  );
}

interface CellProps {
  item: ChatMediaItem;
  aspect: "square" | "cover";
  index: number;
}

function MediaCell({ item, aspect, index }: CellProps) {
  const openViewer = useContext(ViewerContext);
  const containerClass =
    aspect === "square"
      ? "relative aspect-square w-full bg-neutral-900"
      : "relative w-full h-full bg-neutral-900";

  if (item.type === "image") {
    return (
      <div className={containerClass}>
        {/* 인앱 뷰어로 열기 — 예전엔 target="_blank"라 외부 브라우저가 떴다 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openViewer?.(index);
          }}
          className="block absolute inset-0"
          aria-label="사진 크게 보기"
        >
          <Image
            src={item.url}
            alt=""
            fill
            sizes="(max-width: 512px) 100vw, 512px"
            className="object-cover"
          />
        </button>
      </div>
    );
  }

  // video
  return (
    <div className={containerClass}>
      <ChatVideo item={item} aspect={aspect} />
    </div>
  );
}

function ChatVideo({ item }: { item: ChatMediaItem; aspect: CellProps["aspect"] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  // 화면에 보일 때만 자동재생, 안 보이면 정지
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.5 }
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  const videoClass = "absolute inset-0 w-full h-full object-cover bg-black";

  return (
    <>
      <video
        ref={ref}
        src={item.url}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className={videoClass}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={(e) => {
          e.stopPropagation();
          const v = ref.current;
          if (!v) return;
          if (v.paused) v.play().catch(() => {});
          else v.pause();
        }}
      />
      {/* 음소거 토글 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMuted((m) => !m);
        }}
        className="absolute bottom-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white"
        aria-label={muted ? "음소거 해제" : "음소거"}
      >
        {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>
      {/* 일시정지 상태일 때 재생 아이콘 오버레이 */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>
        </div>
      )}
      {/* 동영상 길이 배지 */}
      {item.duration && (
        <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
          {Math.round(item.duration)}초
        </div>
      )}
    </>
  );
}

/**
 * 위치 공유 카드 — 지도 썸네일 없이 주소 + 지도 앱 링크.
 * (Static Map API를 새로 붙이지 않기로 한 결정. 링크는 카카오맵으로 연다)
 */
function LocationCard({ item }: { item: ChatMediaItem }) {
  const href =
    item.url ||
    (item.lat != null && item.lng != null
      ? `https://map.kakao.com/link/map/${encodeURIComponent(
          item.label || "공유된 위치"
        )},${item.lat},${item.lng}`
      : undefined);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-2.5 rounded-2xl border border-neutral-700 bg-neutral-900/60 px-3 py-2.5 hover:bg-neutral-900 transition-colors"
    >
      <span className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
        <MapPin className="w-4 h-4 text-red-400" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-black text-white">위치 공유</span>
        <span className="block text-[12px] text-neutral-400 truncate">
          {item.label ?? "지도에서 보기"}
        </span>
      </span>
      <ExternalLink className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
    </a>
  );
}
