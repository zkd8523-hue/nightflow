"use client";

import Link from "next/link";
import Image from "next/image";
import { DjPreviewButton } from "@/components/djs/DjPreviewButton";
import { Play } from "lucide-react";
import { NewsletterSignup } from "@/components/home/NewsletterSignup";
import { WeeklyShareRow } from "@/components/weekly/WeeklyShareRow";
import { ClubPeekRow } from "@/components/weekly/ClubPeekRow";
import { WeeklyVideoCard } from "@/components/weekly/WeeklyVideoCard";
import { ClubSheetProvider } from "@/components/weekly/ClubSheetProvider";

/**
 * 호 본문.
 *
 * 글은 사람이 쓴다 — 자동 생성이 아니다. 다만 **사실은 DB를 보고 쓴다**:
 * 출연 시간·입장료·미리듣기 유무는 club_lineups / lineup_sets / djs 에서
 * 확인한 값만 적는다. 초고에 "새벽 1시", "무료입장", "DILLINJA 듣기"를
 * 적었다가 DB 확인에서 셋 다 틀린 걸 발견했다(실제: 19:00 / 여성 무료 /
 * DILLINJA 는 등록된 음악 링크가 없음). 틀린 시간은 독자를 헛걸음시킨다.
 */

/** 큐레이션 한 줄 — 시간 + 이름 + 한 줄 설명 + (있을 때만) 듣기 */
function Act({
  time,
  name,
  slug,
  note,
  photo,
  soundcloudUrl,
  youtubeUrl,
  head = false,
}: {
  time: string;
  name: string;
  slug?: string;
  note?: string;
  photo?: string;
  /** 미리듣기는 밖으로 내보내지 않는다 — 라인업 표와 같은 인앱 플레이어로 연다 */
  soundcloudUrl?: string | null;
  youtubeUrl?: string | null;
  head?: boolean;
}) {
  return (
    <li
      className={`grid grid-cols-[38px_38px_1fr_auto] gap-2 items-center px-3 py-2.5 border-t border-border ${
        head ? "bg-[#1C1C14]" : ""
      }`}
    >
      <span className="font-mono text-[10px] font-semibold text-[#DFFF00] tabular-nums">
        {time}
      </span>
      {/* 얼굴이 있어야 "누가 오는지"가 읽힌다. 없으면 자리만 비워 정렬을 지킨다 */}
      {photo ? (
        <Image
          src={photo}
          alt={name}
          width={38}
          height={38}
          className="w-[38px] h-[38px] rounded-full object-cover bg-muted"
          loading="lazy"
        />
      ) : (
        <span className="w-[38px] h-[38px] rounded-full bg-muted" />
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
            <>
              <Play className="w-2.5 h-2.5 fill-current" />
              듣기
            </>
          }
        />
      ) : (
        <span />
      )}
    </li>
  );
}

function Band({ label, date }: { label: string; date: string }) {
  return (
    <div className="-mx-[14px] my-[18px] px-[14px] py-2.5 bg-card flex items-baseline gap-2">
      <b className="text-[15px] font-black tracking-tight text-[#DFFF00]">{label}</b>
      <span className="font-mono text-[10px] text-muted-foreground">{date}</span>
    </div>
  );
}

export function WeeklyIssueBody({
  slug,
  benefits,
}: {
  slug: string;
  /** 쿠폰·게스트 간판 섹션(서버에서 읽어 페이지가 넘긴다) */
  benefits?: React.ReactNode;
}) {
  if (slug !== "2026-10-06") return null;

  return (
    <ClubSheetProvider>
    <article>
      {/* 표지 — 홈 카드와 같은 사진을 쓴다. 눌러서 들어온 사람이 "그 호가 맞다"를
          바로 알아야 한다. */}
      <div className="relative">
        <Image
          src="https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/admin/0b95bc54-7c74-4098-90b8-52747240bde5/1782569186128.jpg"
          alt="케이크샵"
          width={520}
          height={325}
          priority
          className="w-full aspect-[16/10] object-cover"
        />
        <span
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(transparent 18%, rgba(8,8,10,.8) 60%, var(--background) 100%)",
          }}
        />
        <span className="absolute left-[14px] right-[14px] bottom-[13px]">
          <span className="block font-mono text-[8px] font-bold tracking-[0.16em] text-[#DFFF00]">
            10월 첫째 주
          </span>
          <span className="block text-[25px] font-black leading-[1.16] tracking-[-0.03em] text-[#FAF9F7] mt-1.5">
            스피커를 직접 만든
            <br />
            남자가 온다
          </span>
        </span>
      </div>

      <div className="px-[14px] pt-4">
      {/* ── 금요일 ── */}
      <Band label="이번 주 금요일" date="10.09 FRI" />

      <p className="text-[13.5px] leading-[1.8] text-muted-foreground mb-3">
        대구 <b className="text-foreground font-bold">클럽 루피</b>가 여덟 번째 생일을
        엽니다. 그 자리에 <b className="text-foreground font-bold">NO:EL</b>이 섭니다 —
        쇼미더머니 6 출연으로 이름을 알린 래퍼입니다.
      </p>

      <p className="text-[13.5px] leading-[1.8] text-muted-foreground mb-3">
        입장 조건을 그대로 옮기면{" "}
        <span className="bg-[#DFFF00] text-[#0A0A0A] px-1 rounded-sm font-bold">
          여성 고객 무료입장
        </span>
        , 자정 이전 입장 시 프리드링크 한 잔, 1층 바틀 50% 할인입니다. 남성 입장료는
        공지에 없어 현장 확인이 필요합니다.
      </p>

      <div className="rounded-[10px] border border-border overflow-hidden mb-3.5">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Image
          src="https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/dj-photos/noel-official-yt.jpg"
          alt="NO:EL"
          width={44}
          height={44}
          className="w-11 h-11 rounded-full object-cover shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-[15px] font-black tracking-tight leading-tight">
            NO:EL
          </span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">
            <span className="font-mono text-[#DFFF00] font-semibold">GUEST</span>
            {" · "}래퍼 · 쇼미더머니 6
          </span>
        </span>
      </div>

      <WeeklyVideoCard
        url="https://www.youtube.com/watch?v=jXea-3QPZp8"
        title="노엘 NO:EL - 할 말이 없어"
        caption="공식 채널 · 할 말이 없어"
      />
      </div>


      <ClubPeekRow
        clubId="366967c8-13cc-46a0-974d-af49d95115a9"
        name="클럽 루피"
        area="대구"
        photo="https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/admin/366967c8-13cc-46a0-974d-af49d95115a9/1780078080000.jpg"
      />

      {/* ── 토요일 ── */}
      <Band label="이번 주 토요일" date="10.10 SAT" />

      <p className="text-[13.5px] leading-[1.8] text-muted-foreground mb-3">
        <span className="bg-[#DFFF00] text-[#0A0A0A] px-1 rounded-sm font-bold">
          세계에서 가장 시끄러운
        </span>{" "}
        드럼앤베이스 사운드시스템으로 불리는 Valve를 만든 사람이 토요일 이태원{" "}
        <b className="text-foreground font-bold">케이크샵</b>에 섭니다.
      </p>

      <p className="text-[13.5px] leading-[1.8] text-muted-foreground mb-3">
        이름은 <b className="text-foreground font-bold">DILLINJA</b>. 1991년부터 음악을
        만들었고 데이비드 보위와 뷰욕의 곡을 리믹스했습니다.
      </p>

      <div className="rounded-[10px] border border-border overflow-hidden mb-3.5">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Image
          src="https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/dj-photos/c1ec14c1-6ae4-4801-b697-14a37fe5e31f.jpg"
          alt="DILLINJA"
          width={44}
          height={44}
          className="w-11 h-11 rounded-full object-cover shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-[15px] font-black tracking-tight leading-tight">
            DILLINJA
          </span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">
            <span className="font-mono text-[#DFFF00] font-semibold">01:00</span>
            {" · "}헤드라이너 · Valve Sound System
          </span>
        </span>
      </div>

      <WeeklyVideoCard
        url="https://www.youtube.com/watch?v=5vS50pPKv-U"
        title="Dillinja - The Angels Fell"
        caption="공식 채널 · The Angels Fell"
      />
      </div>

      <div className="rounded-[10px] border border-border overflow-hidden mb-3.5">
        <div className="bg-card px-3 py-2 font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground flex justify-between">
          <span>함께하는 DJ</span>
          <span>외 5명</span>
        </div>
        <ul className="list-none m-0 p-0">
          <Act
            time="21:00"
            name="BIG DOG"
            slug="bigdog"
            photo="https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/dj-photos/f69d4447-1aee-401c-a8ac-5fb23f422767.jpg"
            note="문을 연다 · 드럼앤베이스"
            soundcloudUrl="https://soundcloud.com/igxwwi8atrf0"
          />
          <Act
            time="22:20"
            name="D.YANA"
            slug="dyana"
            photo="https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/dj-photos/367708ac-8c77-4481-8c2f-c6983c5e4dc9.jpg"
            note="DNB SEOUL 파트너"
            soundcloudUrl="https://soundcloud.com/dj-d-yana"
            youtubeUrl="https://www.youtube.com/watch?v=Z2R5GdJXNCI"
          />
          <Act
            time="02:30"
            name="BAGAGEE VIPHEX 13"
            slug="bagageeviphex13"
            photo="https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/dj-photos/1f7df740-e9c9-4f70-bf1b-e68573d6feb7.jpg"
            note="Davota Records 설립자"
            soundcloudUrl="https://soundcloud.com/bagagee"
          />
        </ul>
      </div>

      <ClubPeekRow
        clubId="0b95bc54-7c74-4098-90b8-52747240bde5"
        name="케이크샵"
        area="이태원"
        photo="https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/admin/0b95bc54-7c74-4098-90b8-52747240bde5/1782569186128.jpg"
      />

      {benefits}

      {/* ── 구독 ── */}
      <div className="mt-[18px]">
        <NewsletterSignup source="weekly_2026-10-06" />
      </div>

      <WeeklyShareRow
        url="https://nightflow.kr/weekly/2026-10-06"
        title="스피커를 직접 만든 남자가 온다 - 클러빙 뉴스"
      />

      <div className="mt-[15px] rounded-[11px] bg-card border border-border px-3.5 py-3 flex justify-between items-center gap-2.5 flex-wrap">
        <span className="text-[12px] font-bold text-muted-foreground whitespace-nowrap">
          제보 / 광고 문의
        </span>
        <a
          href="mailto:maddawids@gmail.com"
          className="font-mono text-[12px] font-bold text-[#DFFF00]"
        >
          maddawids@gmail.com
        </a>
      </div>
      </div>
    </article>
    </ClubSheetProvider>
  );
}
