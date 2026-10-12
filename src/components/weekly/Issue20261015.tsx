"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { NewsletterSignup } from "@/components/home/NewsletterSignup";
import { WeeklyShareRow } from "@/components/weekly/WeeklyShareRow";

/**
 * 아티클 VOL.02 — 10월 셋째 주 (2026-10-15).
 *
 * 1호와 달리 캐러셀 대본이 아니라 **스크롤 기사**다. 해설·조건·비교는 카드로
 * 쪼개면 계속 어색해져서 한 편의 글로 짰다.
 *
 * 문체는 평서체 단문(하드보일드)로 고정한다. "~합니다"체와 "~하는 밤입니다"
 * 같은 투는 쓰지 않는다(사용자 확정, 2026-10-12).
 *
 * ⚠️ 독자에게 "우리가 못 찾은 것"을 알리지 않는다. 공지에 없는 값은 그냥
 * 적지 않는다. "공지 안 됨 / 4명 중 1명만 미리듣기" 같은 문장을 넣었다가
 * 전부 걷어냈다 — 매체가 자기 구멍을 변명하는 것으로 읽힌다.
 */

const POSTER_MODECI =
  "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/weekly/2026-10-15/modeci.jpg";
const POSTER_JEJE =
  "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/weekly/2026-10-15/jeje.png";

/* ── 조각들 ─────────────────────────────────────────────── */

/**
 * 섹션 강조색은 그 호 포스터에서 뽑는다 — 목요일은 DMX Krew 포스터의 적갈색,
 * 금요일은 BOBBY 포스터의 크롬 블루. 라임(#DFFF00)은 브랜드 면(구독)에만 남긴다.
 * 전부 라임으로 칠하면 두 밤이 같은 밤처럼 보인다.
 */
const ACCENT = {
  thu: "#E0685A",
  fri: "#A8C4E8",
} as const;

function PickHead({ day, meta, color }: { day: string; meta: string; color: string }) {
  return (
    <div
      className="flex items-baseline gap-2.5 flex-wrap border-t-2 pt-3 mb-2"
      style={{ borderColor: color }}
    >
      {day && (
        <span className="text-[19px] font-black leading-none" style={{ color }}>
          {day}
        </span>
      )}
      <span className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
        {meta}
      </span>
    </div>
  );
}

/** 포스터는 화면 끝까지 뺀다. 이 글에서 색을 내는 건 사실상 포스터뿐이다. */
function Poster({
  src, alt, caption, position, priority,
}: {
  src: string; alt: string; caption: string; position: string; priority?: boolean;
}) {
  return (
    <figure className="mt-5 -mx-4">
      <Image
        src={src}
        alt={alt}
        width={900}
        height={600}
        priority={priority}
        className="w-full aspect-[3/2] object-cover"
        style={{ objectPosition: position }}
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
 * 일렉트로와 하우스를 직접 들려준다.
 *
 * 사운드클라우드·유튜브 임베드를 쓰지 않는 이유: 한 마디 리듬 차이를 보여주려고
 * 외부 플레이어를 띄우면 로딩·광고·추적이 따라오고, 정작 비교가 안 된다.
 * 킥·스네어·하이햇을 직접 합성해 16스텝 한 마디만 돌린다.
 */
function RhythmPlayer() {
  const [playing, setPlaying] = useState<"house" | "electro" | null>(null);
  const [cue, setCue] = useState(-1);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  const KITS = {
    house: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] },
    electro: {
      kick: [0, 3, 6, 10],
      snare: [4, 12],
      hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    },
  } as const;

  // 언마운트·화면 이탈 시 소리가 남지 않게 한다
  useEffect(() => {
    const onHide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timerRef.current) window.clearInterval(timerRef.current);
      ctxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    setPlaying(null);
    setCue(-1);
  }

  function start(kit: "house" | "electro") {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;                               // 미지원 브라우저는 조용히 둔다
    if (!ctxRef.current) ctxRef.current = new AC();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    const STEP = 60 / 130 / 4;                      // 130 BPM 16분음표
    let step = 0;
    let nextAt = ctx.currentTime + 0.06;

    const kick = (t: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(47, t + 0.11);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.18);
    };
    const noise = (t: number, dur: number, hz: number, type: BiquadFilterType, vol: number) => {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + dur);
    };

    const pat = KITS[kit];
    const tick = () => {
      while (nextAt < ctx.currentTime + 0.12) {
        if ((pat.kick as readonly number[]).includes(step)) kick(nextAt);
        if ((pat.snare as readonly number[]).includes(step)) noise(nextAt, 0.13, 1900, "bandpass", 0.42);
        if ((pat.hat as readonly number[]).includes(step)) noise(nextAt, 0.035, 8200, "highpass", 0.12);
        const s = step;
        const delay = Math.max(0, (nextAt - ctx.currentTime) * 1000);
        window.setTimeout(() => setCue(s), delay);
        step = (step + 1) % 16;
        nextAt += STEP;
      }
    };

    setPlaying(kit);
    timerRef.current = window.setInterval(tick, 25);
    tick();
  }

  const Row = ({ kit, label }: { kit: "house" | "electro"; label: string }) => {
    const on = playing === kit;
    const hits = KITS[kit].kick as readonly number[];
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => { const was = on; stop(); if (!was) start(kit); }}
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
            const hit = hits.includes(i);
            const lit = on && cue === i;
            return (
              <span
                key={i}
                className={`flex-1 rounded-[1px] ${
                  lit ? "bg-foreground" : hit ? "bg-[#DFFF00]" : "bg-border"
                }`}
                style={{ height: hit ? "100%" : "26%" }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-5 p-5 bg-card border border-border rounded-xl space-y-4">
      <Row kit="house" label="하우스" />
      <Row kit="electro" label="일렉트로" />
      <p className="font-mono text-[10.5px] leading-[1.7] text-muted-foreground">
        130 BPM 한 마디를 합성해 반복한다. 장르의 일반 패턴이고 당일 세트의 실제 구성은 아니다.
      </p>
    </div>
  );
}

/* ── 본문 ───────────────────────────────────────────────── */

export function Issue20261015({ benefits }: { benefits?: React.ReactNode }) {
  return (
    <article className="px-4 pt-6 break-keep">
      {/* 헤드 */}
      <h1 className="text-[32px] font-black leading-[1.22] tracking-[-0.03em]">
        목요일 홍대 <span style={{ color: ACCENT.thu }}>DMX Krew</span>
        <br />
        금요일 서면 <span style={{ color: ACCENT.fri }}>BOBBY</span>
      </h1>
      <p className="mt-4 text-[16px] leading-[1.75] text-muted-foreground font-medium">
        금·토만 여는 모데시가, 15일 목요일엔 문을 연다. 바로, <strong className="font-black" style={{ color: ACCENT.thu }}>DMX Krew</strong> 때문.
        <br />
        다음 날, 부산 서면에는 <strong className="font-black" style={{ color: ACCENT.fri }}>BOBBY</strong>가 뜬다.
      </p>
      <p className="mt-5 pt-4 border-t border-border font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
        편집자 · 나이트플로우
      </p>

      {/* ── 목요일 ── */}
      <section className="mt-12">
        <PickHead day="목요일" meta="10.15 · 모데시 · 홍대" color={ACCENT.thu} />
        <h2 className="text-[25px] font-black leading-[1.3] tracking-[-0.025em] mt-2">
          DMX Krew in 홍대
        </h2>

        <Poster
          src={POSTER_MODECI}
          alt="10월 15일 모데시 공연 포스터"
          caption="10.15 모데시 공연 포스터 · @modeci_seoul"
          position="center 30%"
          priority
        />

        <h3 className="mt-6 text-[17px] font-black leading-[1.5]">DMX Krew란?</h3>
        <p className="mt-3 text-[16px] leading-[1.78] font-medium">
          DMX Krew는 30년 동안 일렉트로만 판 사람이다. 영국인 에드워드 업턴. 1994년 첫 EP를 냈고, 에이펙스 트윈의 레이블 Rephlex에 정규 앨범 여섯 장을 남겼다.
          1997년엔 자기 레이블 Breakin&rsquo;을 세웠다.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          유행이 몇 번 바뀌는 동안 내려온 적이 없다. 이 사람 셋은 &lsquo;요즘 소리&rsquo;가 아니라
          한 사람이 30년 쌓은 소리다.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          모데시는 금·토에만 연다. 10월 15일은 목요일이다.{" "}
          <strong className="font-black" style={{ color: ACCENT.thu }}>한 사람 때문에 없던 영업일이 생겼다.</strong>
        </p>

        <h3 className="mt-9 text-[17px] font-black leading-[1.5]">
          일렉트로와 하우스의 차이, 직접 들어보세요
        </h3>
        <p className="mt-3 text-[15.5px] leading-[1.78]">
          속도는 하우스와 비슷하다. 125~135 BPM. 다른 건 킥이다. 네 번 균등하게 떨어지지 않는다.
          808 드럼머신의 딱딱한 스네어가 박자를 쪼개 엇갈리게 놓는다. 걷는 리듬이 아니라 끊어 밟는 리듬이다.
        </p>
        <RhythmPlayer />
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          DJ 셋이 아니다. <strong className="font-black" style={{ color: ACCENT.thu }}>라이브 셋</strong>이다.
          남의 레코드를 고르는 게 아니라 자기 기계를 돌린다.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          같은 날 서는{" "}
          <a
            href="https://soundcloud.com/jesseyou"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-[3px]" style={{ color: ACCENT.thu }}
          >
            Jesse You의 사운드클라우드
          </a>
          를 들어보면 그날 플로어의 온도가 가늠된다.
        </p>

        <h3 className="mt-9 text-[17px] font-black leading-[1.5]">모데시는 예매가 1만 원 싸다</h3>
        <dl className="mt-4 grid grid-cols-[auto_1fr] border-t border-border">
          <Fact k="언제" v="10월 15일 (목) · 오픈 밤 10시" />
          <Fact k="어디" v="모데시 · 홍대 와우산로 64" />
          <Fact k="얼마" v="예매 15,000원 (프리드링크 1잔) / 도어 25,000원" />
          <Fact k="라인업" v="DMX Krew · Mogwaa · 2ndfloor · Jesse You" />
          <Fact k="예매" v="@modeci_seoul 프로필 링크" />
        </dl>
        <p className="mt-3 text-[13px] text-muted-foreground">
          인스타 공지 기준이다. 가기 전에 확인할 것.
        </p>
      </section>

      {/* ── 금요일 ── */}
      <section className="mt-14">
        <PickHead day="금요일" meta="10.16 · 제제 · 부산 서면" color={ACCENT.fri} />
        <h2 className="text-[25px] font-black leading-[1.3] tracking-[-0.025em] mt-2">
          BOBBY in 서면
        </h2>

        <Poster
          src={POSTER_JEJE}
          alt="10월 16일 제제 BOBBY 공연 포스터"
          caption="10.16 제제 공연 포스터 · @jeje_busan"
          position="center 46%"
        />

        <p className="mt-6 text-[16px] leading-[1.78] font-medium">
          바비가 제제1 무대에 선다. 쇼미더머니3 우승자, iKON 멤버. 10월 16일 금요일 새벽 1시. 한 타임이다.
        </p>

        <blockquote style={{ borderColor: ACCENT.fri }} className="mt-6 pl-5 border-l-[3px] text-[18px] font-bold leading-[1.66] tracking-[-0.01em]">
          아이돌 출신이라는 편견을 정면으로 받아친 결승곡을 본인이 썼다.
        </blockquote>

        <p className="mt-6 text-[15.5px] leading-[1.78]">
          제제는 이걸 꾸준히 하는 클럽이다. 올해만 이렇다.
        </p>

        <ul className="mt-4 border-t border-border">
          {[
            ["05월", "허성현", false],
            ["07월", "식케이 · 팔로알토", false],
            ["08월", "콜드", false],
            ["10.03", "키스에이프", false],
            ["10.16", "바비", true],
          ].map(([t, who, now]) => (
            <li
              key={t as string}
              className={`flex gap-4 py-2.5 border-b border-border text-[15px] ${
                now ? "font-bold" : ""
              }`}
            >
              <time
                className="font-mono text-[12.5px] w-[58px] flex-none"
                style={{ color: now ? ACCENT.fri : "var(--muted-foreground)" }}
              >
                {t}
              </time>
              {who}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[15.5px] leading-[1.78]">
          서울 밖에서 이 간격으로 래퍼를 세우는 클럽은 흔치 않다.
        </p>

        <h3 className="mt-9 text-[17px] font-black leading-[1.5]">바비에겐 모드가 두 개 있다</h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 bg-card border border-border rounded-xl min-w-0">
            <div className="font-mono text-[10.5px] tracking-[0.1em] uppercase" style={{ color: ACCENT.thu }}>거친 쪽</div>
            <div className="mt-2 text-[16px] font-black leading-[1.4]">&lsquo;가드올리고 Bounce&rsquo;</div>
            <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">쇼미더머니3 결승 · 2014</div>
            <p className="mt-3 text-[14px] leading-[1.72]">
              결승곡을 직접 썼다. 아이돌 출신이라는 편견을 정면으로 받아치는 가사였다.
              2차 예선에서 &ldquo;인위적이었다&rdquo;는 혹평을 들었던 사람이 그걸로 뒤집었다.
            </p>
          </div>
          <div className="p-5 bg-card border border-border rounded-xl min-w-0">
            <div className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">부드러운 쪽</div>
            <div className="mt-2 text-[16px] font-black leading-[1.4]">『LOVE AND FALL』</div>
            <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">솔로 1집 · 2017</div>
            <p className="mt-3 text-[14px] leading-[1.72]">
              랩보다 보컬 비중을 키워 R&amp;B·발라드·댄스홀까지 넓혔다. 열 곡 중 절반 이상이 사랑 노래다.
              본인 말로는 &ldquo;세고 거친 모습만 보여줬으니 부드러운 면도 알리고 싶었다&rdquo;.
            </p>
          </div>
        </div>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          2014년의 바비와 2017년의 바비는 다른 사람처럼 들린다. 이번 주엔 과연 어떤 바비를 듣게 될까.
        </p>

        <h3 className="mt-9 text-[17px] font-black leading-[1.5]">제제는 새벽 1시 한 타임이다</h3>
        <p className="mt-3 text-[15.5px] leading-[1.78]">
          모데시는 10시부터 플로어가 흐른다. 언제 들어가도 음악이 있다. 제제는 다르다.{" "}
          <strong className="font-black" style={{ color: ACCENT.fri }}>새벽 1시 한 타임</strong>. 입장은 선착순이고, 혼잡하면 신규 입장이 막힌다.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.78]">
          1시에 맞춰 가면 늦는다. 그 전에 들어가 자리를 잡아야 한다.
        </p>

        <h3 className="mt-9 text-[17px] font-black leading-[1.5]">
          제제1과 제제2는 다르다. 모르고 가면 못 본다
        </h3>
        <dl className="mt-4 grid grid-cols-[auto_1fr] border-t border-border">
          <Fact k="언제" v="10월 16일 (금) · 오픈 21:30 — 06:00" />
          <Fact k="공연" v="예정 1:00 AM" />
          <Fact k="어디" v="제제 · 부산진구 중앙대로702번길 33 지하1층" />
          <Fact k="얼마" v="30,000원 (원 프리 — 룩벨 럭스 샴페인 또는 제임슨 진저에일 1잔)" />
          <Fact k="문의" v="010-9791-8284" />
        </dl>

        <p className="mt-6 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground">공지 그대로 옮긴다</p>
        <ul className="mt-3 space-y-2.5">
          {[
            ["입장 선착순 · 혼잡 시 신규 입장 제한", false],
            ["공연 중 퇴장하면 재입장 제한", true],
            ["티켓팅 안 하면 제제2 이용 · 공연 종료 전까지 제제2에서 제제1로 이동 어려움", false],
            ["미성년자 절대 출입 금지", true],
          ].map(([t, hard]) => (
            <li
              key={t as string}
              className={`flex gap-3 text-[15px] leading-[1.62] ${hard ? "font-black" : ""}`}
              style={hard ? { color: ACCENT.fri } : undefined}
            >
              <span
                className="w-[7px] h-[7px] mt-2 flex-none"
                style={{ background: hard ? ACCENT.fri : "var(--muted-foreground)" }}
              />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-muted-foreground">인스타 공지 기준이다. 가기 전에 확인할 것.</p>
      </section>

      {/* ── 둘 중 어디 ── */}
      <section className="mt-14">
        <PickHead day="" meta="10.15 vs 10.16" color="var(--border)" />
        <h2 className="text-[25px] font-black leading-[1.3] tracking-[-0.025em] mt-2">
          둘 중 어디를 가면 좋을까?
        </h2>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            {
              head: "10.15 목 · 홍대 모데시",
              tone: ACCENT.thu,
              yes: [
                "가사 없는 음악으로 세 시간을 보낼 수 있는 사람",
                "누가 언제 나오는지 몰라도 괜찮은 사람",
                "금요일 아침 출근을 감당할 수 있는 사람",
              ],
              no: ["아는 노래가 나와야 흥이 붙는 사람", "목표 시간이 정해져야 움직이는 사람"],
            },
            {
              head: "10.16 금 · 서면 제제",
              tone: ACCENT.fri,
              yes: ["바비의 가사를 아는 사람", "한 타임을 위해 몇 시간 먼저 가서 기다릴 수 있는 사람"],
              no: ["들락날락하고 싶은 사람 (재입장 제한)", "새벽 1시까지 못 버티는 사람"],
            },
          ].map((c) => (
            <div key={c.head} className="min-w-0">
              <h4 className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase pb-2 border-b border-border">
                {c.head}
              </h4>
              <ul className="mt-3 space-y-2.5">
                {c.yes.map((t) => (
                  <li key={t} className="text-[14.5px] leading-[1.6] pl-3.5 border-l-2" style={{ borderColor: c.tone }}>{t}</li>
                ))}
                {c.no.map((t) => (
                  <li key={t} className="text-[14.5px] leading-[1.6] pl-3.5 border-l-2 border-border text-muted-foreground">{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[15.5px] leading-[1.78]">
          이번 주 라인업과 미리듣기는{" "}
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
          url="https://nightflow.kr/weekly/2026-10-15"
          title="목요일 홍대 DMX Krew, 금요일 서면 BOBBY - 아티클 VOL.02"
        />
      </div>

      <div className="mt-6">
        <NewsletterSignup
          source="weekly_2026-10-15"
          headline={"아티클 구독"}
          subline="가장 핫한 국내소식, 매주 정리해서 보내드려요"
        />
      </div>

      <div className="mt-8 pt-4 border-t border-border font-mono text-[10.5px] leading-[2] text-muted-foreground">
        출처 — 공연 정보: @modeci_seoul · @jeje_busan 공지 원문
        <br />
        인물: DMX Krew (Wikipedia) · RA.922 Mogwaa · 텐아시아 · 노컷뉴스 · 아주경제
        <br />
        제제 초청 이력: 나이트플로우 DB
      </div>
    </article>
  );
}
