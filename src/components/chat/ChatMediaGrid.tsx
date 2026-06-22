"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Play, Volume2, VolumeX } from "lucide-react";
import type { ChatMediaItem } from "@/types/database";

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
  if (!items || items.length === 0) return null;

  const count = Math.min(items.length, 4);

  if (count === 1) {
    const item = items[0];
    // 가로형(width/height >= 16/9)은 원본 비율 유지, 그 외는 16:9 crop
    const isLandscape =
      item.width && item.height
        ? item.width / item.height >= 16 / 9
        : false;

    if (isLandscape && item.width && item.height) {
      return (
        <div
          className="mt-2 rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900"
          style={{ aspectRatio: `${item.width} / ${item.height}` }}
        >
          <MediaCell item={item} aspect="cover" />
        </div>
      );
    }

    return (
      <div className="mt-2 rounded-2xl overflow-hidden border border-neutral-800 aspect-[16/9] bg-neutral-900">
        <MediaCell item={item} aspect="cover" />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-neutral-800">
        <MediaCell item={items[0]} aspect="square" />
        <MediaCell item={items[1]} aspect="square" />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-neutral-800 aspect-[4/3]">
        <MediaCell item={items[0]} aspect="cover" />
        <div className="grid grid-rows-2 gap-0.5">
          <MediaCell item={items[1]} aspect="cover" />
          <MediaCell item={items[2]} aspect="cover" />
        </div>
      </div>
    );
  }

  // 4개
  return (
    <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden border border-neutral-800">
      {items.slice(0, 4).map((it, i) => (
        <MediaCell key={i} item={it} aspect="square" />
      ))}
    </div>
  );
}

interface CellProps {
  item: ChatMediaItem;
  aspect: "square" | "cover";
}

function MediaCell({ item, aspect }: CellProps) {
  const containerClass =
    aspect === "square"
      ? "relative aspect-square w-full bg-neutral-900"
      : "relative w-full h-full bg-neutral-900";

  if (item.type === "image") {
    return (
      <div className={containerClass}>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block absolute inset-0"
        >
          <Image
            src={item.url}
            alt=""
            fill
            sizes="(max-width: 512px) 100vw, 512px"
            className="object-cover"
          />
        </a>
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
