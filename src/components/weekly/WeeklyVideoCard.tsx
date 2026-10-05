"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { youtubeVideoId } from "@/lib/lineups/youtubeUrl";
import { youtubeThumbnailUrl } from "@/lib/djCup/types";
import { trackEvent } from "@/lib/analytics/events";

/**
 * 본문에 펼쳐두는 영상 카드.
 *
 * 작은 "듣기" 버튼과 다른 자리다 — 표 안에서는 줄마다 버튼이지만, 여기서는
 * 썸네일을 크게 깔아두고 그 자리에서 재생한다. 누구인지 모르는 사람을
 * 소개하는 자리라 얼굴·화면이 먼저 보여야 "볼까" 하는 마음이 생긴다.
 *
 * 처음부터 iframe 을 심지 않는 이유: 유튜브 임베드는 한 개당 수백 KB를 끌고
 * 온다. 본문에 둘만 깔려도 페이지가 무거워진다. 썸네일(1장)만 두고 누를 때
 * iframe 을 만든다.
 */
export function WeeklyVideoCard({
  url,
  title,
  caption,
}: {
  url: string;
  title: string;
  caption?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const videoId = youtubeVideoId(url);
  if (!videoId) return null;

  return (
    <figure className="m-0">
      <div className="relative overflow-hidden bg-card">
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full aspect-video block border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setPlaying(true);
              trackEvent("weekly_video_play", { videoId, title });
            }}
            aria-label={`${title} 재생`}
            className="relative block w-full active:scale-[0.99] transition-transform"
          >
            <Image
              src={youtubeThumbnailUrl(videoId)}
              alt={title}
              width={480}
              height={270}
              className="w-full aspect-video object-cover"
              loading="lazy"
            />
            <span className="absolute inset-0 bg-black/25" />
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                         w-14 h-14 rounded-full bg-[#DFFF00] flex items-center justify-center"
            >
              <Play className="w-6 h-6 fill-[#0A0A0A] text-[#0A0A0A] ml-0.5" />
            </span>
          </button>
        )}
      </div>
      {caption && (
        <figcaption className="text-[11px] text-muted-foreground px-3 py-2 bg-card">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
