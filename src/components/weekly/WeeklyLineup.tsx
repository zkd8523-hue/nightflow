"use client";

import Link from "next/link";
import { Play, Youtube } from "lucide-react";
import { DjPreviewButton } from "@/components/djs/DjPreviewButton";

/**
 * 호 안에 들어가는 라인업 블록.
 *
 * 1호(WeeklyIssueBody 의 Act)에 있던 "듣기" 줄을 2·3호에서 빠뜨렸다. 글로
 * 아무리 설명해도 그 사람 음악이 어떤지는 들어봐야 안다는 지적을 받고
 * 공용으로 빼냈다. 생김새는 1호와 같게 둔다 — 같은 매체 안에서 같은 기능이
 * 호마다 다르게 생기면 매번 다시 익혀야 한다.
 *
 * 재생원이 없는 사람은 버튼 자리를 비운다(DjPreviewButton 이 알아서 null 을
 * 반환한다). 눌러도 안 되는 회색 버튼을 줄줄이 세우면 서비스가 비어 보인다.
 */
export type WeeklyAct = {
  /** "02:00" 처럼. 공지에 시간이 없으면 생략한다 */
  time?: string;
  name: string;
  /** /dj/{slug} 로 보낼 때만 */
  slug?: string;
  /** 이름 밑 한 줄 */
  note?: string;
  soundcloudUrl?: string | null;
  youtubeUrl?: string | null;
  /** 그날의 중심 — 배경을 깔아 구분한다 */
  head?: boolean;
};

function Act({ act, showTime }: { act: WeeklyAct; showTime: boolean }) {
  const { time, name, slug, note, soundcloudUrl, youtubeUrl, head } = act;
  // 사클이 없고 영상만 있으면 열리는 것도 영상이다 — "듣기"라고 적어 두면
  // 소리만 나올 줄 알고 안 누른다(DjPreviewButton 도 사클을 먼저 쓴다).
  const videoOnly = !soundcloudUrl && !!youtubeUrl;
  return (
    <li
      className={`grid gap-2 items-center px-3 py-2.5 border-t border-border ${
        head ? "bg-[#1C1C14]" : ""
      }`}
      style={{ gridTemplateColumns: showTime ? "46px 1fr auto" : "1fr auto" }}
    >
      {showTime && (
        <span className="font-mono text-[10px] font-semibold text-[#DFFF00] tabular-nums">
          {time ?? ""}
        </span>
      )}
      <span className="min-w-0 text-[12.5px] font-bold tracking-tight">
        {slug ? (
          <Link href={`/dj/${slug}`} className="hover:underline underline-offset-2">
            {name}
          </Link>
        ) : (
          name
        )}
        {note && (
          <span className="block text-[10px] font-normal text-muted-foreground mt-px">
            {note}
          </span>
        )}
      </span>
      {soundcloudUrl || youtubeUrl ? (
        <DjPreviewButton
          soundcloudUrl={soundcloudUrl}
          youtubeUrl={youtubeUrl}
          djName={name}
          className="font-mono text-[9px] font-bold bg-[#DFFF00] text-[#0A0A0A] px-2.5 py-1.5
                     rounded-full whitespace-nowrap inline-flex items-center gap-1
                     active:scale-95 transition-transform"
          icon={
            videoOnly ? (
              <>
                <Youtube className="w-3 h-3" />
                영상
              </>
            ) : (
              <>
                <Play className="w-2.5 h-2.5 fill-current" />
                듣기
              </>
            )
          }
        />
      ) : (
        <span />
      )}
    </li>
  );
}

export function WeeklyLineup({ acts, label = "라인업" }: { acts: WeeklyAct[]; label?: string }) {
  // 한 명도 시간이 없으면 시간 열을 통째로 뺀다 — 빈 칸만 남은 열은 정렬을
  // 흐트러뜨리기만 한다(공지에 러닝오더가 없는 클럽이 더 많다).
  const showTime = acts.some((a) => a.time);
  const playable = acts.filter((a) => a.soundcloudUrl || a.youtubeUrl).length;
  const videos = acts.filter((a) => !a.soundcloudUrl && a.youtubeUrl).length;

  return (
    <div className="mt-5 border border-border rounded-xl overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 px-3 py-2.5 bg-card">
        <span className="text-[12px] font-black tracking-tight">{label}</span>
        {playable > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {videos > 0 && playable === videos
              ? `영상 ${videos}`
              : videos > 0
                ? `미리듣기 ${playable - videos} · 영상 ${videos}`
                : `미리듣기 ${playable}`}
          </span>
        )}
      </div>
      <ul className="list-none m-0 p-0">
        {acts.map((a) => (
          <Act key={a.name} act={a} showTime={showTime} />
        ))}
      </ul>
    </div>
  );
}
