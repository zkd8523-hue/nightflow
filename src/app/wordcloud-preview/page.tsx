"use client";

/**
 * 워드클라우드 UI 맛보기 (프리뷰 전용, 임시 페이지)
 * - DB/마이그레이션/기존 코드 연결 없음. 전부 클라 state mock.
 * - 확인 경로: npm run dev → http://localhost:3000/wordcloud-preview
 * - 마음에 들면 이 화면을 WordCloud/Composer/Section으로 분해해 실제 배선.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

// ── mock: 다른 유저들이 남긴 5자 리뷰 (정규화 전 원본) ──────────────
const MOCK_ROWS: string[][] = [
  ["수질", "EDM"],
  ["수질", "성비좋음"],
  ["edm", "디제이굿"],
  ["수질", "텐션"],
  ["EDM", "화장실"],
  ["수질"],
  ["디제이굿", "분위기"],
  ["성비좋음", "edm"],
  ["수질", "웨이팅김"],
  ["텐션", "EDM"],
];

const MAX_WORD_LEN = 5;
const MAX_WORDS = 2;

// placeholder 예시 — 감성 멘트 + ex)단어. 새로고침/클럽마다 랜덤 노출
const PLACEHOLDER_HINTS: { mood: string; ex: string }[] = [
  { mood: "디제이가 미쳤어요", ex: "디제이맛집" },
  { mood: "성비 실화냐", ex: "성비깡패" },
  { mood: "입장만 한세월", ex: "웨이팅필수" },
  { mood: "춤추다 날 샜다", ex: "광질" },
  { mood: "여기 인테리어 좋지", ex: "인스타맛집" },
  { mood: "여기 언제 또 가지?", ex: "또갈집" },
  { mood: "하우스 노래 잘틀잖아", ex: "하우스성지" },
];

// 집계용 정규화 키
function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

// 순서만 섞기 (크기/색은 빈도 유지 — 위치만 흩뿌려 "구름" 느낌)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Entry = { label: string; normalized: string; count: number };

function aggregate(rows: string[][]): Entry[] {
  const map = new Map<
    string,
    { count: number; labels: Map<string, number> }
  >();
  for (const row of rows) {
    for (const raw of row) {
      const norm = normalizeWord(raw);
      if (!norm) continue;
      const cur = map.get(norm) ?? { count: 0, labels: new Map() };
      cur.count += 1;
      cur.labels.set(raw, (cur.labels.get(raw) ?? 0) + 1);
      map.set(norm, cur);
    }
  }
  const entries: Entry[] = [];
  for (const [normalized, v] of map) {
    // 최빈 원본 표기를 label로
    let label = normalized;
    let best = -1;
    for (const [orig, c] of v.labels) {
      if (c > best) {
        best = c;
        label = orig;
      }
    }
    entries.push({ label, normalized, count: v.count });
  }
  return entries.sort((a, b) => b.count - a.count);
}

export default function WordCloudPreviewPage() {
  const [rows, setRows] = useState<string[][]>(MOCK_ROWS);
  const [myWords, setMyWords] = useState<string[]>([]); // 내가 등록한 단어
  const [current, setCurrent] = useState(""); // 현재 입력 중인 글자
  const [justAdded, setJustAdded] = useState<string | null>(null); // 등장 애니 대상(normalized)
  const isComposingRef = useRef(false); // 한글 IME 조합 여부
  const inputRef = useRef<HTMLInputElement>(null);

  const full = myWords.length >= MAX_WORDS;

  const entries = useMemo(() => aggregate(rows), [rows]);

  // 섞기: 서버/첫 렌더는 원본 순서 유지(하이드레이션 안전),
  // 클라 마운트 후에만 섞고 10초마다 재배치
  const [mounted, setMounted] = useState(false);
  const [shuffleTick, setShuffleTick] = useState(0);
  // placeholder 힌트 — 마운트(새로고침) 시 랜덤 1개. 초기값 0번은 하이드레이션 안전용
  const [hintIdx, setHintIdx] = useState(0);
  useEffect(() => {
    setMounted(true);
    setHintIdx(Math.floor(Math.random() * PLACEHOLDER_HINTS.length));
    const t = setInterval(() => setShuffleTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);
  const hint = PLACEHOLDER_HINTS[hintIdx];

  // 표시용: 순서만 섞음 (크기/색은 빈도 그대로). 마운트 전엔 원본.
  const shuffledEntries = useMemo(
    () => (mounted ? shuffle(entries) : entries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, mounted, shuffleTick]
  );

  // ── FLIP: 단어가 자리 바꿀 때 슁슁 미끄러지게 ──
  const wordRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const refs = wordRefs.current;
    refs.forEach((el, key) => {
      const prev = prevRects.current.get(key);
      const next = el.getBoundingClientRect();
      if (prev) {
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (dx || dy) {
          // First: 옛 위치로 순간 이동(애니 끄고)
          el.style.transition = "none";
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          // Last: 다음 프레임에 제자리로 미끄러짐
          requestAnimationFrame(() => {
            el.style.transition = "transform 1.4s cubic-bezier(0.22,1,0.36,1)";
            el.style.transform = "";
          });
        }
      }
      prevRects.current.set(key, next);
    });
    // 사라진 단어 정리
    prevRects.current.forEach((_, key) => {
      if (!refs.has(key)) prevRects.current.delete(key);
    });
  }, [shuffledEntries]);

  const myNormalized = useMemo(
    () => new Set(myWords.map(normalizeWord)),
    [myWords]
  );

  // ── 크기/밝기: 빈도 절대값 기준 로그 스케일 + clamp ──
  // 1명=15px, 2명=22, 4명=29, 8명=36 … 40에서 멈춤 (한 단어 독주 방지)
  const MIN_PX = 15;
  const MAX_PX = 40;
  const STEP = 7; // log2 한 칸당 px
  const fontSize = (c: number) =>
    Math.round(Math.min(MAX_PX, MIN_PX + Math.log2(Math.max(c, 1)) * STEP));

  // 엔터/추가 → 단어 하나를 바로 클라우드에 반영 (뚜웅~)
  function addCurrent() {
    const trimmed = current.trim();
    if (!trimmed || full) return;
    const norm = normalizeWord(trimmed);
    if (myWords.some((w) => normalizeWord(w) === norm)) {
      setCurrent("");
      return; // 내가 이미 넣은 단어 중복 방지
    }
    setMyWords((prev) => [...prev, trimmed]);
    // mock: 내 리뷰를 rows에 한 row로 누적 (실제론 upsert)
    setRows((prev) => {
      const others = prev.slice(0, prev.length); // 단순화: 매번 새 row 추가 대신
      return [...others, [trimmed]];
    });
    setJustAdded(norm);
    setCurrent("");
    inputRef.current?.focus();
    window.setTimeout(() => setJustAdded(null), 700);
  }

  function removeMyWord(idx: number) {
    const target = myWords[idx];
    const norm = normalizeWord(target);
    setMyWords((prev) => prev.filter((_, i) => i !== idx));
    // mock: 해당 단어 row 하나 제거
    setRows((prev) => {
      const i = prev.findIndex(
        (r) => r.length === 1 && normalizeWord(r[0]) === norm
      );
      if (i === -1) return prev;
      return prev.filter((_, j) => j !== i);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isComposingRef.current || e.nativeEvent.isComposing) return; // IME 가드
    if (e.key === "Enter") {
      e.preventDefault();
      addCurrent();
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-white">
      <style>{`
        @keyframes word-pop {
          0%   { opacity: 0; transform: translateY(20px) scale(0.3); }
          60%  { opacity: 1; transform: translateY(-4px) scale(1.15); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .word-pop { animation: word-pop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      <div className="max-w-lg mx-auto px-4 py-8">
        <p className="text-[11px] text-neutral-600 mb-4">
          🧪 UI 맛보기 — 실제 저장 안 됨 (mock)
        </p>

        {/* ── 헤더 (테두리/카드 없음, 단어만) ── */}
        <header className="mb-6">
          <h2 className="text-[19px] font-black text-white leading-tight">
            이 장소 하면 떠오르는 단어?
          </h2>
          <p className="text-[13px] text-neutral-500 mt-1">
            5자 리뷰를 남겨보세요!
          </p>
        </header>

        {/* ── 워드클라우드 (배경 없이 단어만) ── */}
        <div className="flex flex-wrap gap-x-3 gap-y-2 items-baseline justify-center py-6 min-h-[160px] content-center mb-6">
          {shuffledEntries.map((e) => {
            const c = e.count;
            const isMine = myNormalized.has(e.normalized);
            const isJust = justAdded === e.normalized;

            // 밝기/굵기: 빈도 절대값 기준 (5명+ 강조 / 2~4명 중간 / 1명 약하게)
            const color = isMine
              ? "text-amber-300"
              : c >= 5
                ? "text-white"
                : c >= 2
                  ? "text-neutral-200"
                  : "text-neutral-500";
            const weight =
              isMine || c >= 5 ? "font-black" : c >= 2 ? "font-bold" : "font-medium";

            // 글로우: 빈도 클수록 강하게, 상한 둠
            const glowStrength = Math.min(20, 6 + Math.log2(Math.max(c, 1)) * 5);
            const glowAlpha = Math.min(0.8, 0.3 + Math.log2(Math.max(c, 1)) * 0.18);
            const glow = isMine
              ? "0 0 16px rgba(251,191,36,.7)"
              : c >= 2
                ? `0 0 ${Math.round(glowStrength)}px rgba(236,72,153,${glowAlpha.toFixed(2)})`
                : "none";

            return (
              <span
                key={e.normalized}
                ref={(el) => {
                  // 방금 등장한 단어(word-pop)는 FLIP에서 제외 — 애니 충돌 방지
                  if (el && !isJust) wordRefs.current.set(e.normalized, el);
                  else wordRefs.current.delete(e.normalized);
                }}
                className={`${color} ${weight} leading-none inline-block will-change-transform ${isJust ? "word-pop" : ""}`}
                style={{ fontSize: fontSize(e.count), textShadow: glow }}
                title={`${e.count}명`}
              >
                {e.label}
              </span>
            );
          })}
        </div>

        {/* ── 항상 떠있는 인라인 입력 ── */}
        <div className="mt-2">
          {/* 내가 남긴 단어 칩 */}
          {myWords.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 justify-center">
              {myWords.map((w, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-300 text-[13px] font-bold"
                >
                  {w}
                  <button
                    onClick={() => removeMyWord(i)}
                    className="text-amber-400/60 hover:text-amber-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 입력칸 (2개 다 채우기 전까지 항상 노출) */}
          {!full ? (
            <div className="flex items-center gap-2 rounded-full bg-[#1C1C1E] border border-neutral-700 focus-within:border-white/60 px-4 py-3 transition-colors">
              <Plus className="w-4 h-4 shrink-0 text-neutral-500" />
              <input
                ref={inputRef}
                value={current}
                maxLength={MAX_WORD_LEN}
                onChange={(e) => setCurrent(e.target.value)}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  myWords.length === 0
                    ? `'${hint.mood}'  ex) ${hint.ex}`
                    : "하나 더 남기기"
                }
                className="flex-1 bg-transparent text-white text-[15px] placeholder:text-neutral-600 focus:outline-none"
              />
              <span className="text-[11px] text-neutral-600 tabular-nums">
                {current.length}/{MAX_WORD_LEN}
              </span>
              <button
                onClick={addCurrent}
                disabled={!current.trim()}
                className="text-[13px] font-black text-white disabled:text-neutral-700 transition-colors"
              >
                띄우기
              </button>
            </div>
          ) : (
            <p className="text-center text-[12px] text-neutral-600 py-2">
              최대 {MAX_WORDS}개까지 남겼어요 ✨
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
