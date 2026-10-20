"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { NewsletterSignup } from "@/components/home/NewsletterSignup";
import { WeeklyShareRow } from "@/components/weekly/WeeklyShareRow";
import { WeeklyLineup, type WeeklyAct } from "@/components/weekly/WeeklyLineup";
import { WeeklyDayNav, WEEKLY_SCROLL_MARGIN } from "@/components/weekly/WeeklyDayNav";

/**
 * 아티클 VOL.03 — 2026-10-22 발행 (10/23 금 ~ 10/25 일).
 *
 * 2호가 두 밤을 깊게 팠다면 이 호는 **하루에 세 곳씩 아홉 곳**이다.
 * 대신 깊이를 차등한다 — 커버(Evian Christ) 하나만 길게 가고 나머지 여덟은
 * 한 단락 + 정보표로 끊는다. 전부 같은 분량으로 쓰면 아홉 개가 다 안 읽힌다.
 *
 * 문체는 2호와 같은 평서체 단문. "~합니다"체와 "~하는 밤입니다" 투는 쓰지
 * 않는다. 독자에게 "우리가 못 찾은 것"을 알리지 않는다 — 공지에 없는 값은
 * 그냥 적지 않는다.
 *
 * 모든 수치는 클럽 인스타 공지 원문 기준이다(출처는 글 맨 아래).
 */

const B = "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/weekly/2026-10-22";
/** 이 호를 위해 그린 오프닝 아트(칸예·스캇 뒤, Evian Christ 앞). 공연 포스터와
 *  역할이 다르다 — 이쪽은 기사의 주장을 그림으로 말하고, 공연 포스터는 날짜와
 *  라인업이 박힌 1차 자료다. 둘 다 쓰되 자리를 나눈다. */
const OPENING_ART = `${B}/art_ig_4x5.png`;

const POSTER = {
  evian: `${B}/evianchrist.jpg`,
  hertz: `${B}/hertz.jpg`,
  vurt: `${B}/vurt.jpg`,
  rosso: `${B}/rosso.jpg`,
  botl: `${B}/botl.jpg`,
  tamana: `${B}/tamana.jpg`,
};

/**
 * 요일마다 색을 다르게 준다. 아홉 개가 한 줄로 이어지면 지금 무슨 요일을
 * 읽고 있는지 잃어버린다. 라임(#DFFF00)은 브랜드 면(구독)에만 남긴다.
 */
const ACCENT = {
  fri: "#9FC3DC", // 금 — Evian Christ 포스터의 크롬
  sat: "#E8894A", // 토
  sun: "#A98BD9", // 일
} as const;

/* ── 조각들 ─────────────────────────────────────────────── */

function DayHead({ day, meta, color }: { day: string; meta: string; color: string }) {
  return (
    <div
      className="flex items-baseline gap-2.5 flex-wrap border-t-2 pt-3 mb-2"
      style={{ borderColor: color }}
    >
      <span className="text-[19px] font-black leading-none" style={{ color }}>
        {day}
      </span>
      <span className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
        {meta}
      </span>
    </div>
  );
}

/** 포스터는 화면 끝까지 뺀다. 이 글에서 색을 내는 건 사실상 포스터뿐이다. */
function Poster({
  src, alt, caption, position = "center 32%", priority, ratio = "3/2",
}: {
  src: string; alt: string; caption: string; position?: string; priority?: boolean;
  /** 기본 3:2 는 공연 포스터를 잘라 쓰는 값이다. 세로 그림은 "3/4" 로 넘겨
   *  원본 비율 그대로 둔다 — 자르면 머리나 손이 프레임 밖으로 나간다. */
  ratio?: string;
}) {
  return (
    <figure className="mt-5 -mx-4">
      <Image
        src={src}
        alt={alt}
        width={900}
        height={600}
        priority={priority}
        className="w-full object-cover"
        style={{ objectPosition: position, aspectRatio: ratio }}
      />
      <figcaption className="mt-2 px-4 font-mono text-[10.5px] text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-mono text-[11.5px] text-muted-foreground py-3 pr-4 border-b border-border whitespace-nowrap">
        {k}
      </dt>
      <dd className="py-3 border-b border-border text-[14.5px] font-medium leading-[1.6] min-w-0 break-keep">
        {v}
      </dd>
    </>
  );
}

/**
 * 커버가 아닌 여덟 곳. 제목 + 한 단락 + 정보표로 끝낸다.
 * 여기서 길어지면 커버와 구분이 없어지고, 아홉 개가 전부 중간 크기가 된다.
 */
function Pick({
  name, meta, color, poster, posterAlt, posterCaption, posterPos, children, facts, acts, note,
}: {
  name: string;
  meta: string;
  color: string;
  poster?: string;
  posterAlt?: string;
  posterCaption?: string;
  posterPos?: string;
  children: React.ReactNode;
  facts: [string, string][];
  /** 정보표 아래에 붙는 듣기 줄. 재생원이 하나도 없으면 넘기지 않는다 */
  acts?: WeeklyAct[];
  note?: string;
}) {
  return (
    <section className="mt-10">
      <h3 className="text-[21px] font-black leading-[1.32] tracking-[-0.022em]">{name}</h3>
      <p className="mt-1.5 font-mono text-[11px] tracking-[0.06em]" style={{ color }}>
        {meta}
      </p>
      {poster && (
        <Poster
          src={poster}
          alt={posterAlt ?? `${name} 포스터`}
          caption={posterCaption ?? ""}
          position={posterPos}
        />
      )}
      <div className="mt-4 text-[15.5px] leading-[1.78] space-y-3.5">{children}</div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] border-t border-border">
        {facts.map(([k, v]) => (
          <Fact key={k} k={k} v={v} />
        ))}
      </dl>
      {acts && <WeeklyLineup acts={acts} />}
      {note && <p className="mt-3 text-[13px] text-muted-foreground">{note}</p>}
    </section>
  );
}

/**
 * 트랜스와 테크노를 직접 들려준다.
 *
 * 외부 플레이어(사운드클라우드·유튜브)를 안 쓰는 이유는 2호와 같다 — 한 마디
 * 차이를 보여주려고 임베드를 띄우면 로딩·광고·추적이 따라오고 정작 비교가
 * 안 된다. 킥·스네어·하이햇·베이스를 직접 합성해 16스텝 한 마디만 돌린다.
 *
 * 두 장르 모두 킥은 정박 네 번으로 같다. 다른 건 **엇박 베이스**다 —
 * 트랜스는 킥 사이마다 베이스가 한 번씩 밀려 들어와 끌어올리는 느낌을 만들고,
 * 테크노는 그 자리를 비워 둔다. 그래서 같은 BPM인데 체감 속도가 다르다.
 */
type Kit = "trance" | "techno";

const KITS: Record<Kit, { kick: number[]; snare: number[]; hat: number[]; bass: number[] }> = {
  trance: {
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    bass: [2, 6, 10, 14], // 엇박 — 트랜스를 트랜스로 만드는 자리
  },
  techno: {
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    bass: [],
  },
};

/**
 * 버튼 한 줄.
 *
 * ⚠️ 반드시 모듈 최상단에 둔다. RhythmPlayer 안에서 정의하면 cue 가 바뀔 때마다
 * (100ms 주기) 새 컴포넌트 타입이 되어 React 가 버튼을 언마운트·리마운트하고,
 * 그 틈에 누른 클릭이 통째로 삼켜진다. "정지가 안 눌린다"의 원인이었다.
 */
function RhythmRow({
  kit, label, on, cue, onToggle,
}: {
  kit: Kit; label: string; on: boolean; cue: number; onToggle: (kit: Kit) => void;
}) {
  const { kick, bass } = KITS[kit];
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onToggle(kit)}
        className={`flex items-center gap-2 flex-none w-[116px] min-h-[44px] px-3 py-2.5
                    text-[13px] font-black border-[1.5px] rounded-lg transition-colors
                    ${on
                      ? "bg-foreground text-background border-foreground"
                      : "border-foreground text-foreground"}`}
      >
        {on ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        {label}
      </button>
      <div className="flex gap-[3px] items-end h-9 flex-1 min-w-0">
        {Array.from({ length: 16 }, (_, i) => {
          const isKick = kick.includes(i);
          const isBass = bass.includes(i);
          const lit = on && cue === i;
          return (
            <span
              key={i}
              className={`flex-1 rounded-[1px] ${
                lit ? "bg-foreground" : isKick ? "bg-[#DFFF00]" : isBass ? "bg-[#9FC3DC]" : "bg-border"
              }`}
              style={{ height: isKick ? "100%" : isBass ? "58%" : "26%" }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * 트랜스와 테크노를 직접 들려준다.
 *
 * 외부 플레이어(사운드클라우드·유튜브)를 안 쓰는 이유는 2호와 같다 — 한 마디
 * 차이를 보여주려고 임베드를 띄우면 로딩·광고·추적이 따라오고 정작 비교가
 * 안 된다. 킥·스네어·하이햇·베이스를 직접 합성해 16스텝 한 마디만 돌린다.
 *
 * 두 장르 모두 킥은 정박 네 번으로 같다. 다른 건 **엇박 베이스**다 —
 * 트랜스는 킥 사이마다 베이스가 한 번씩 밀려 들어와 끌어올리는 느낌을 만들고,
 * 테크노는 그 자리를 비워 둔다. 그래서 같은 BPM인데 체감 속도가 다르다.
 *
 * 끄는 쪽이 켜는 쪽보다 까다롭다. 스케줄러가 0.12초 앞까지 미리 예약해 두기
 * 때문에 인터벌만 끊으면 소리가 남고, setCue 예약분이 남아 막대가 계속 뛴다.
 * 그래서 (1) 모든 소리를 마스터 게인 하나로 모아 그걸 0으로 끊고,
 * (2) 예약해 둔 setCue 타이머를 전부 취소한다.
 */
function RhythmPlayer() {
  const [playing, setPlaying] = useState<Kit | null>(null);
  const [cue, setCue] = useState(-1);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const cueTimersRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    for (const t of cueTimersRef.current) window.clearTimeout(t);
    cueTimersRef.current = [];
    const m = masterRef.current;
    if (m) {
      // 이미 예약된 소리까지 즉시 끊는다. 뚝 끊으면 '틱' 소리가 나서 15ms 로 내린다.
      const now = m.context.currentTime;
      m.gain.cancelScheduledValues(now);
      m.gain.setValueAtTime(m.gain.value, now);
      m.gain.linearRampToValueAtTime(0, now + 0.015);
      masterRef.current = null;
      window.setTimeout(() => { try { m.disconnect(); } catch {} }, 120);
    }
    setPlaying(null);
    setCue(-1);
  }, []);

  // 언마운트·화면 이탈 시 소리가 남지 않게 한다
  useEffect(() => {
    const onHide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stop();
      ctxRef.current?.close().catch(() => {});
    };
  }, [stop]);

  const start = useCallback((kit: Kit) => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;                               // 미지원 브라우저는 조용히 둔다
    if (!ctxRef.current) ctxRef.current = new AC();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    masterRef.current = master;

    const STEP = 60 / 138 / 4;                      // 138 BPM 16분음표
    let step = 0;
    let nextAt = ctx.currentTime + 0.06;

    const kick = (t: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(47, t + 0.11);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.18);
    };
    const bass = (t: number) => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(82, t);            // E2
      f.type = "lowpass"; f.frequency.value = 520; f.Q.value = 7;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.17);
    };
    const noise = (t: number, dur: number, hz: number, type: BiquadFilterType, vol: number) => {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = buf;
      const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(bq); bq.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
    };

    const pat = KITS[kit];
    const tick = () => {
      while (nextAt < ctx.currentTime + 0.12) {
        if (pat.kick.includes(step)) kick(nextAt);
        if (pat.bass.includes(step)) bass(nextAt);
        if (pat.snare.includes(step)) noise(nextAt, 0.13, 1900, "bandpass", 0.38);
        if (pat.hat.includes(step)) noise(nextAt, 0.035, 8200, "highpass", 0.12);
        const s = step;
        const delay = Math.max(0, (nextAt - ctx.currentTime) * 1000);
        const id = window.setTimeout(() => {
          setCue(s);
          cueTimersRef.current = cueTimersRef.current.filter((x) => x !== id);
        }, delay);
        cueTimersRef.current.push(id);
        step = (step + 1) % 16;
        nextAt += STEP;
      }
    };

    setPlaying(kit);
    timerRef.current = window.setInterval(tick, 25);
    tick();
  }, []);

  const toggle = useCallback((kit: Kit) => {
    // playing 을 ref 가 아닌 setState 콜백으로 읽어 직전 클릭과 엇갈리지 않게 한다
    setPlaying((cur) => {
      stop();
      if (cur !== kit) window.setTimeout(() => start(kit), 0);
      return null;
    });
  }, [start, stop]);

  return (
    <div className="mt-5 p-5 bg-card border border-border rounded-xl space-y-4">
      <RhythmRow kit="trance" label="트랜스" on={playing === "trance"} cue={cue} onToggle={toggle} />
      <RhythmRow kit="techno" label="테크노" on={playing === "techno"} cue={cue} onToggle={toggle} />
      <p className="font-mono text-[10.5px] leading-[1.7] text-muted-foreground">
        138 BPM 한 마디를 합성해 반복한다. 노랑이 킥, 파랑이 엇박 베이스다.
        장르의 일반 패턴이고 당일 세트의 실제 구성은 아니다.
      </p>
    </div>
  );
}

/* ── 본문 ───────────────────────────────────────────────── */

export function Issue20261022({ benefits }: { benefits?: React.ReactNode }) {
  return (
    <article className="px-4 pt-6 break-keep">
      {/* 헤드 — 제목은 오프닝 아트가 직접 들고 있다("칸예 · 스캇 앨범 만든 DJ가
          온다"가 그림 아래 띠에 박혀 있다). 같은 말을 글자로 또 쓰면 두 번
          읽힌다. 다만 문서에 h1 은 있어야 하므로(검색·스크린리더) 화면에서만
          감춘다. */}
      <h1 className="sr-only">칸예 · 스캇 앨범 만든 DJ가 온다 — 다가올 금토일, 하루 세 곳씩</h1>

      <Poster
        src={OPENING_ART}
        alt="칸예 웨스트와 트래비스 스캇을 뒤에 두고 디제잉하는 Evian Christ 일러스트"
        caption="일러스트 · 나이트플로우"
        ratio="4/5"
        position="center center"
        priority
      />
      <p className="mt-5 pt-4 border-t border-border font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
        편집자 · 나이트플로우 · 다가올 금토일, 하루 세 곳씩
      </p>

      {/* 요일 바로가기 — 아홉 곳이라 하루만 볼 사람이 전부 스크롤하면 안 된다.
          색은 각 요일 섹션 머리와 같은 걸 쓴다(어디로 가는지 미리 보인다) */}
      <WeeklyDayNav
        days={[
          { id: "fri", label: "금", sub: "10.23", color: ACCENT.fri },
          { id: "sat", label: "토", sub: "10.24", color: ACCENT.sat },
          { id: "sun", label: "일", sub: "10.25", color: ACCENT.sun },
        ]}
      />

      {/* ── 금요일 ── */}
      <section id="fri" style={{ scrollMarginTop: WEEKLY_SCROLL_MARGIN }} className="mt-10">
        <DayHead day="금요일" meta="10.23 · 이태원 2 · 홍대 1" color={ACCENT.fri} />

        {/* 커버 — 여기만 길게 간다 */}
        <h2 className="text-[25px] font-black leading-[1.3] tracking-[-0.025em] mt-2">
          Evian Christ in 이태원
        </h2>

        <Poster
          src={POSTER.evian}
          alt="10월 23일 케이크샵 Evian Christ 공연 포스터"
          caption="10.23 케이크샵 공연 포스터 · @cakeshopseoul"
          position="center 22%"
        />

        <h3 className="mt-6 text-[17px] font-black leading-[1.5]">Evian Christ란?</h3>
        <p className="mt-3 text-[16px] leading-[1.78] font-medium">
          조슈아 리어리. 영국 엘즈미어포트 출신이다. Warp Records 소속이고,
          칸예 웨스트의 레이블 Donda와 소니 ATV에도 이름이 올라 있다.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          이름을 알린 건 프로듀서로서다. 칸예 웨스트 『Yeezus』의{" "}
          <strong className="font-black" style={{ color: ACCENT.fri }}>&lsquo;I&rsquo;m In It&rsquo;</strong>을 공동
          프로듀싱했고, 트래비스 스콧의 빌보드 1위 앨범에도 참여했다. 대니 브라운 작업도 있다.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          그다음이 이상하다. 힙합 최전선에 있던 사람이 2013년{" "}
          <strong className="font-black">TranceParty</strong>라는 클럽 나이트를 직접 차렸다. 트랜스다.
          2000년대 초에 한 번 유행하고 조롱거리로 밀려났던 그 장르다.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          2023년 Warp에서 낸 데뷔 앨범 『Revanchist』가 그 답이다. 여덟 곡으로
          트랜스가 환희 너머의 숭고까지 갈 수 있는지를 밀어붙인 앨범이다.
          제목을 직역하면 &lsquo;복수주의자&rsquo;다.
        </p>

        <h3 className="mt-9 text-[17px] font-black leading-[1.5]">TranceParty가 어떤 자리냐면</h3>
        <p className="mt-3 text-[15.5px] leading-[1.78]">
          본인이 차린 그 파티를 보일러룸이 런던에서 찍었다. 한 시간짜리다.
        </p>
        <figure className="mt-4 -mx-4">
          <iframe
            title="Evian Christ | Boiler Room London: TranceParty"
            src="https://www.youtube-nocookie.com/embed/5DmCnR7r8B0?rel=0&modestbranding=1&playsinline=1"
            className="w-full aspect-video"
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
          <figcaption className="mt-2 px-4 font-mono text-[10.5px] text-muted-foreground">
            Evian Christ | Boiler Room London: TranceParty
          </figcaption>
        </figure>

        <h3 className="mt-9 text-[17px] font-black leading-[1.5]">
          트랜스와 테크노의 차이, 직접 들어보세요
        </h3>
        <p className="mt-3 text-[15.5px] leading-[1.78]">
          둘 다 킥은 정박 네 번으로 같다. 다른 건 킥과 킥 사이다. 트랜스는 그 자리에
          베이스를 한 번씩 밀어 넣어 계속 끌어올리고, 테크노는 비워 둔다.
          같은 138 BPM인데 체감 속도가 다른 이유다.
        </p>
        <RhythmPlayer />

        <h3 className="mt-9 text-[17px] font-black leading-[1.5]">자정 전에 들어가면 5천 원 싸다</h3>
        <dl className="mt-4 grid grid-cols-[auto_1fr] border-t border-border">
          <Fact k="날짜" v="10월 23일 (금)" />
          <Fact k="위치" v="케이크샵 · 서울 용산구 이태원로 134" />
          <Fact k="가격" v="자정 전 25,000원 / 자정 후 30,000원 (도어)" />
        </dl>
        <WeeklyLineup
          acts={[
            // 헤드라이너만 유튜브로 건다 — 사운드클라우드도 있지만, 이 사람은
            // 라이브 영상으로 봐야 TranceParty 가 어떤 현장인지 전해진다.
            { name: "Evian Christ", slug: "evianchrist", note: "헤드라이너 · 보일러룸 TranceParty", head: true,
              youtubeUrl: "https://www.youtube.com/watch?v=5DmCnR7r8B0" },
            { name: "Winter Back", slug: "winterback" },
            { name: "Simo", slug: "simo", soundcloudUrl: "https://soundcloud.com/3dsex" },
            { name: "Paola Laf", slug: "paolalaf", soundcloudUrl: "https://soundcloud.com/paolalaf" },
            { name: "Tabris", slug: "tabris", soundcloudUrl: "https://soundcloud.com/tabrisnet" },
            { name: "Moon Go America", slug: "moongoamerica", soundcloudUrl: "https://soundcloud.com/user-191751650" },
            { name: "Audiogothh", slug: "audiogothh", youtubeUrl: "https://www.youtube.com/@audiogothh" },
          ]}
        />
        <p className="mt-3 text-[13px] text-muted-foreground">
          인스타 공지 기준이다. 가기 전에 확인할 것.
        </p>

        <Pick
          name="Elias Sternin in 이태원"
          meta="헤르츠 · 우루과이"
          color={ACCENT.fri}
          poster={POSTER.hertz}
          posterAlt="헤르츠 Origin Hotel 공연 포스터"
          posterCaption="Origin Hotel w/ Elias Sternin · @hertz.sound"
          posterPos="center 30%"
          facts={[
            ["날짜", "10월 23일 (금) 밤 — 러닝오더 00:00 — 07:00"],
            ["위치", "헤르츠 · 서울 용산구 이태원동 126-1 1F"],
            ["가격", "예매 20,000원 (RA) / 도어 25,000원"],
          ]}
          acts={[
            { time: "00:00", name: "RAILROADMAN", slug: "railroadman" },
            { time: "02:00", name: "Elias Sternin", slug: "eliassternin", note: "본 세트 · 3시간", head: true,
              soundcloudUrl: "https://soundcloud.com/eliassternin" },
            { time: "05:00", name: "Jucid B2B Chani", slug: "jucidb2bchani" },
          ]}
          note="클럽 공지에 요일이 'Sat'으로 적혀 있다. 날짜(10.23)를 기준으로 옮겼다."
        >
          <p>
            우루과이 몬테비데오를 대표하는 클럽 <strong className="font-black">Phonotheque</strong>의
            레지던트다. 서울에서 남미 테크노를 듣는 일은 흔치 않다.
          </p>
          <p>
            런던 Fold, 베를린 Club Der Visionaere를 돌았고 레이블 Ratiug Recordings와
            Teknica를 직접 굴린다. 2020년부터 EP만 열 장을 넘게 냈다.
          </p>
          <p>
            본 세트가 <strong className="font-black" style={{ color: ACCENT.fri }}>새벽 2시부터 5시</strong>다.
            케이크샵에서 넘어오기엔 그쪽이 먼저 끝나야 한다.
          </p>
        </Pick>

        <Pick
          name="PGMNT in 홍대"
          meta="헨즈클럽 · 라이브 2팀 + DJ 7명"
          color={ACCENT.fri}
          facts={[
            ["날짜", "10월 23일 (금) · 오픈 밤 10시"],
            ["위치", "헨즈클럽 · 마포구 상수동 86-22 B1"],
            ["가격", "20,000원 (프리드링크 1잔)"],
            ["라이브", "a 9uy · ODEE"],
          ]}
          acts={[
            { name: "Baekho", slug: "baekho", soundcloudUrl: "https://soundcloud.com/baekh0" },
            { name: "CHANXER", slug: "chanxer", soundcloudUrl: "https://soundcloud.com/fdwv0wmukqeu" },
            { name: "Hanmandogi", slug: "hanmandogi", youtubeUrl: "https://www.youtube.com/watch?v=pPF2FrenzFA" },
            { name: "KIHU", slug: "kihu-6fe6", soundcloudUrl: "https://soundcloud.com/kihuu" },
            { name: "KWAKSEUNGEON", slug: "kwakseungeon" },
            { name: "QUAN", slug: "quan", youtubeUrl: "https://www.youtube.com/watch?v=PcrtqRvD55A" },
            { name: "SIM", slug: "sim" },
          ]}
          note="미성년자 출입 금지. 현장 사진·영상 촬영이 있다."
        >
          <p>
            금요일 셋 중 유일하게 이태원이 아니다. 홍대에서 끝낼 사람에게 남는 선택지다.
          </p>
          <p>
            파티 이름 PGMNT는 안료(pigment)다.{" "}
            <strong className="font-black">물에 녹는 염료와 달리 안료는 녹지 않는다</strong>는 게
            주최 측이 내건 컨셉이다. 섞여 사라지지 않고 색으로 남는 쪽.
          </p>
          <p>라이브 두 팀이 붙는다. DJ만 도는 밤과는 다르다.</p>
        </Pick>
      </section>

      {/* ── 토요일 ── */}
      <section id="sat" style={{ scrollMarginTop: WEEKLY_SCROLL_MARGIN }} className="mt-14">
        <DayHead day="토요일" meta="10.24 · 홍대 1 · 이태원 1 · 강남 1" color={ACCENT.sat} />

        <Pick
          name="IMMEDIATE PROXIMITY in 홍대"
          meta="vurt. · 네덜란드 + 조지아"
          color={ACCENT.sat}
          poster={POSTER.vurt}
          posterAlt="vurt. Delta Funktionen & Napirelly 공연 포스터"
          posterCaption="vurtnight with Delta Funktionen & Napirelly · @vurt_seoul"
          posterPos="center 34%"
          facts={[
            ["날짜", "10월 24일 (토) 밤 11시 — 아침 8시"],
            ["위치", "vurt. · 서울 마포구 양화로6길 57 B1"],
            ["가격", "25,000원 (도어 / RA) · 새벽 4시 이후 10,000원"],
          ]}
          acts={[
            { time: "23:00", name: "Jama", slug: "jama", note: "TRICO 레이브 설립자" },
            // 둘 다 사클보다 영상이 낫다 — 베를린 보일러룸·HÖR 은 플로어까지 같이 보인다
            { time: "01:00", name: "Delta Funktionen", note: "네덜란드 · 보일러룸 베를린", head: true,
              youtubeUrl: "https://www.youtube.com/watch?v=mzLGbluO83I" },
            { time: "01:00", name: "Napirelly", note: "조지아 · HÖR 베를린", head: true,
              youtubeUrl: "https://www.youtube.com/watch?v=k60Z7OylYII" },
            { time: "06:00", name: "SJK", slug: "sjk", note: "벌트 레지던트" },
          ]}
        >
          <p>
            둘이 온다. <strong className="font-black">Delta Funktionen</strong>은 암스테르담 출신
            딥테크노 프로듀서다. 2008년 Delsin과 그 산하 Ann Aimée로 데뷔해 지금은 베를린
            트레조어 레지던트다. <strong className="font-black">Napirelly</strong>는 시베리아에
            뿌리를 둔 조지아 출신이다.
          </p>
          <p>
            둘은 2019년부터 IMMEDIATE PROXIMITY라는 듀오로 묶여 일렉트로·테크노·베이스·브레이크가
            만나는 자리를 파 왔다.
          </p>
          <p>
            이 밤의 핵심은 길이다.{" "}
            <strong className="font-black" style={{ color: ACCENT.sat }}>새벽 1시부터 6시까지 다섯 시간</strong>,
            따로 또 같이 돈다. 한 곡 듣고 나올 세트가 아니다.
          </p>
        </Pick>

        <Pick
          name="JADALAREIGN in 이태원"
          meta="로쏘 · 뉴욕"
          color={ACCENT.sat}
          poster={POSTER.rosso}
          posterAlt="로쏘 Patina Sound System with JADALAREIGN 포스터"
          posterCaption="Patina Sound System with JADALAREIGN · @rosso_seoul"
          posterPos="center 36%"
          facts={[
            ["날짜", "10월 24일 (토)"],
            ["위치", "로쏘 · 서울 용산구 대사관로31길 17 B1"],
            ["가격", "20,000원 (프리드링크 1잔)"],
          ]}
          acts={[
            { name: "JADALAREIGN", slug: "jadalareign", note: "뉴욕 · Sistaspin x 보일러룸", head: true,
              youtubeUrl: "https://www.youtube.com/watch?v=iCyDSqPeKrI" },
            { name: "SERA", slug: "sera" },
            { name: "GIO", slug: "gio" },
            { name: "Youngisland", slug: "youngisland", youtubeUrl: "https://www.youtube.com/watch?v=rkuwpwyrEjU" },
            { name: "cityboyfromseoul", slug: "cityboyfromseoul", soundcloudUrl: "https://soundcloud.com/cityboyfromseoul" },
          ]}
          note="미성년자 출입 금지. 테이블은 @rosso_seoul DM."
        >
          <p>
            뉴욕에서 온다. 브루클린 클럽 Nowadays의{" "}
            <strong className="font-black">금요일 라인업을 짜는 부커</strong>다.
            누구를 세울지 고르는 사람이 직접 트는 밤이다.
          </p>
          <p>
            재즈·소울·펑크·디스코에서 하우스와 테크노까지 끌고 간다. 2020년
            &lsquo;Floydian Slip&rsquo;으로 이름이 퍼졌고, 유색인·퀴어·논바이너리·트랜스를 위한
            워크숍 SKILLSHARE를 따로 운영한다.
          </p>
        </Pick>

        <Pick
          name="BOTL in 강남"
          meta="루카 · 하드테크노"
          color={ACCENT.sat}
          poster={POSTER.botl}
          posterAlt="루카 BOTL RETURNS TO SEOUL 포스터"
          posterCaption="BOTL RETURNS TO SEOUL — SECOND DEBUT · @luka.seoul"
          posterPos="center 30%"
          facts={[
            ["날짜", "10월 24일 (토) 밤 11시 — 아침 7시"],
            ["위치", "루카 · 서울 강남구 강남대로152길 46 B1"],
            ["가격", "15,000 / 20,000 / 26,000 / 30,000 / 35,000 / 38,000원"],
          ]}
          acts={[
            { time: "23:00", name: "BOTL", slug: "botl", note: "Egg London · Hostile Takeover", head: true,
              youtubeUrl: "https://www.youtube.com/watch?v=QdquvwfnE88" },
          ]}
          note="미성년자 출입 금지. 입장 시 신분증."
        >
          <p>
            인더스트리얼 질감에 때리는 퍼커션, 거기에 우울이 얹힌 하드테크노. 옛날
            레이브 쪽에 뿌리를 두고 아침까지 가는 세트라고 본인들이 적었다.
          </p>
          <p>
            정작 눈에 띄는 건 <strong className="font-black" style={{ color: ACCENT.sat }}>티켓이 여섯 단계</strong>라는
            점이다. 슈퍼얼리버드 15,000원(공지 기준 거의 매진)부터 자정 이후 도어 38,000원까지.
            가장 싼 표와 가장 비싼 표가 <strong className="font-black">23,000원, 2.5배</strong> 차이다.
          </p>
          <p>갈 거면 지금 끊는 게 싸다. 이건 취향 문제가 아니라 산수다.</p>
        </Pick>
      </section>

      {/* ── 일요일 ── */}
      <section id="sun" style={{ scrollMarginTop: WEEKLY_SCROLL_MARGIN }} className="mt-14">
        <DayHead day="일요일" meta="10.25 · 을지로 · 홍대 · 중구" color={ACCENT.sun} />

        <Pick
          name="Tamanaramen in 축제"
          meta="중구 · 도쿄 + 런던"
          color={ACCENT.sun}
          poster={POSTER.tamana}
          posterAlt="축제 Tamanaramen 공연 포스터"
          posterCaption="10.25 축제 공연 포스터 · @c_bong_sae"
          posterPos="center 34%"
          facts={[
            ["날짜", "10월 25일 (일) 저녁 7시 30분"],
            ["위치", "축제 · 서울 중구 수표로6길 10"],
            ["가격", "빠른예매 15,000원 / 늦은현매 20,000원"],
          ]}
          acts={[
            // 본문에서 말한 라멘 레이브가 실제로 어떤 자리인지 그대로 찍힌 영상
            { name: "Tamanaramen", note: "도쿄 라멘 레이브 현장", head: true,
              youtubeUrl: "https://www.youtube.com/watch?v=MJZm9H4xwvI" },
            { name: "kirin & jinnin", note: "라이브" },
            { name: "PEN:KEY" },
            { name: "BBBT" },
            { name: "DDD" },
          ]}
          note="현장 인원에 따라 현매가 제한될 수 있다."
        >
          <p>
            자매다. 언니 하나(Hana)가 비주얼, 동생 피캄(Pikam)이 보컬과 프로듀싱을 맡는다.
            도쿄와 런던을 오가며 활동한다.
          </p>
          <p>
            팀 이름은{" "}
            <strong className="font-black" style={{ color: ACCENT.sun }}>
              동생이 고등학생 때 일본어 자판을 아무렇게나 두드려 나온 글자
            </strong>
            다. 그걸 그대로 쓰고 있다. 이름 따라 도쿄에서는 실제로 라멘을 먹으며 노는
            &lsquo;Ramen Rave&rsquo;라는 파티도 굴린다.
          </p>
          <p>
            음악은 오타쿠 문화에서 끌어온 앰비언트 팝, IDM, 테크노, 트랩, 베이스가 섞인다.
            몽환적인 앰비언트 위에 영국식 묵직한 베이스를 얹는 쪽이다.
          </p>
        </Pick>

        <Pick
          name="METHOD 20주년 in 홍대"
          meta="롤링홀 · 메탈"
          color={ACCENT.sun}
          facts={[
            ["날짜", "10월 25일 (일) 저녁 6시"],
            ["위치", "롤링홀 · 홍대"],
            ["출연", "메써드(METHOD) · KILLKAISER"],
            ["예매", "멜론티켓"],
          ]}
        >
          <p>
            메써드가 20년을 채웠다. 클럽이 아니라 공연장이고, 시작도 저녁 6시다.
            이날 밤을 어디서 시작할지 정하는 데 영향을 준다.
          </p>
        </Pick>

        <Pick
          name="Fake Product vol.5 in 을지로"
          meta="신도시 별관 · 실험"
          color={ACCENT.sun}
          facts={[
            ["날짜", "10월 25일 (일) 저녁 6시"],
            ["위치", "신도시 별관 · 서울 중구 을지로11길 31 4층"],
            ["가격", "예매 30,000원 / 현매 35,000원"],
            ["출연", "stego · NokENok · Hellivision"],
          ]}
          note="순서마다 인터미션 10분이 들어간다."
        >
          <p>
            일요일 셋 중 제일 비싸고 제일 좁다. 세 팀이 순서대로 하고 사이사이 10분씩 쉰다.
            춤추러 가는 자리가 아니라 보러 가는 자리다.
          </p>
        </Pick>
      </section>

      {/* ── 마무리 ── */}
      <section className="mt-14">
        <DayHead day="" meta="다음 호" color="var(--border)" />
        <p className="mt-3 text-[15.5px] leading-[1.78]">
          다음 주는 핼러윈이다. 아직 공지를 안 올린 곳이 많아 다음 호에서 몰아 정리한다.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          이번 주 전체 라인업과 미리듣기는{" "}
          <a href="/lineups" className="text-foreground font-bold underline underline-offset-[3px]">
            나플 라인업
          </a>
          에 모아 둔다.
        </p>
      </section>

      {/* 쿠폰·게스트 간판 (서버에서 읽어 넘긴 것) */}
      {benefits}

      <div className="mt-10">
        <WeeklyShareRow
          url="https://nightflow.kr/weekly/2026-10-22"
          title="칸예 · 스캇 앨범 만든 DJ가 온다 - 아티클 VOL.03"
        />
      </div>

      <div className="mt-6">
        <NewsletterSignup
          source="weekly_2026-10-22"
          headline={"아티클 구독"}
          subline="가장 핫한 국내소식, 매주 정리해서 보내드려요"
        />
      </div>

      <div className="mt-8 pt-4 border-t border-border font-mono text-[10.5px] leading-[2] text-muted-foreground">
        출처 — 공연 정보: @cakeshopseoul · @hertz.sound · @thehenzclub · @vurt_seoul ·
        @rosso_seoul · @luka.seoul · @c_bong_sae · 롤링홀 · @bandnokenok 공지 원문
        <br />
        인물: Warp Records · Mixmag · Resident Advisor · DJ Mag · Delsin
        <br />
        라인업·요금: 나이트플로우 DB
      </div>
    </article>
  );
}
