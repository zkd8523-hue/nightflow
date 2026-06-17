"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ArrowUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import {
  MAX_WORD_LEN,
  MAX_WORDS,
  PLACEHOLDER_HINTS,
  aggregateWords,
  clampByNonSpace,
  containsProfanity,
  nonSpaceLen,
  normalizeWord,
  shuffle,
  validateWords,
} from "@/lib/clubs/wordCloud";

interface Props {
  clubId: string;
  clubName?: string;
}

export function WordCloudSection({ clubId }: Props) {
  const router = useRouter();
  const { user, isLoading: userLoading } = useCurrentUser();

  const [rows, setRows] = useState<{ author_id: string; words: string[] }[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [myWords, setMyWords] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const isComposingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const full = myWords.length >= MAX_WORDS;

  // ── 데이터 로드 ──
  const fetchData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    const { data, error } = await supabase
      .from("club_word_clouds")
      .select("author_id, words")
      .eq("club_id", clubId);

    if (error) {
      console.error("[WordCloudSection] fetch error", error);
      setRows([]);
      setLoading(false);
      return;
    }
    const fetched = (data ?? []) as { author_id: string; words: string[] }[];
    setRows(fetched);
    // 내 row 반영
    const mine = user ? fetched.find((r) => r.author_id === user.id) : null;
    setMyWords(mine?.words ?? []);
    setLoading(false);
  }, [clubId, user]);

  useEffect(() => {
    if (userLoading) return;
    fetchData();
  }, [fetchData, userLoading]);

  const entries = useMemo(() => aggregateWords(rows), [rows]);
  const myNormalized = useMemo(
    () => new Set(myWords.map(normalizeWord)),
    [myWords]
  );

  // ── 셔플 (마운트 후 + 10초마다, 하이드레이션 안전) ──
  const [mounted, setMounted] = useState(false);
  const [shuffleTick, setShuffleTick] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);
  useEffect(() => {
    setMounted(true);
    setHintIdx(Math.floor(Math.random() * PLACEHOLDER_HINTS.length));
    const t = setInterval(() => setShuffleTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);
  const hint = PLACEHOLDER_HINTS[hintIdx];

  const shuffledEntries = useMemo(
    () => (mounted ? shuffle(entries) : entries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, mounted, shuffleTick]
  );

  // ── 크기/밝기: 빈도 절대값 로그 스케일 ──
  const fontSize = (c: number) =>
    Math.round(Math.min(40, 15 + Math.log2(Math.max(c, 1)) * 7));

  // ── FLIP: 자리 바꿀 때 슁슁 미끄러짐 ──
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
          el.style.transition = "none";
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = "transform 1.4s cubic-bezier(0.22,1,0.36,1)";
            el.style.transform = "";
          });
        }
      }
      prevRects.current.set(key, next);
    });
    prevRects.current.forEach((_, key) => {
      if (!refs.has(key)) prevRects.current.delete(key);
    });
  }, [shuffledEntries]);

  // ── 단어 추가 (엔터/버튼) → 즉시 upsert ──
  async function addCurrent() {
    if (!user) {
      router.push(`/login?redirect=/clubs/${clubId}`);
      return;
    }
    const trimmed = current.trim();
    if (!trimmed || full || saving) return;
    if (containsProfanity(trimmed)) {
      toast.error("앗, 이런 표현은 띄울 수 없어요 🙅");
      return;
    }
    const norm = normalizeWord(trimmed);
    if (myWords.some((w) => normalizeWord(w) === norm)) {
      setCurrent("");
      return;
    }
    const nextWords = validateWords([...myWords, trimmed]).ok;
    await saveWords(nextWords, norm);
  }

  async function removeMyWord(idx: number) {
    if (saving) return;
    const nextWords = myWords.filter((_, i) => i !== idx);
    await saveWords(nextWords, null);
  }

  // 신규/수정/삭제 모두 upsert 또는 delete로 처리
  async function saveWords(nextWords: string[], animNorm: string | null) {
    if (!user) return;
    setSaving(true);
    const supabase = createClient();

    try {
      if (nextWords.length === 0) {
        // 전부 지움 → row 삭제
        const { error } = await supabase
          .from("club_word_clouds")
          .delete()
          .eq("club_id", clubId)
          .eq("author_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("club_word_clouds").upsert(
          { club_id: clubId, author_id: user.id, words: nextWords },
          { onConflict: "club_id,author_id" }
        );
        if (error) throw error;
      }

      // 로컬 상태 갱신
      setMyWords(nextWords);
      setRows((prev) => {
        const others = prev.filter((r) => r.author_id !== user.id);
        return nextWords.length > 0
          ? [...others, { author_id: user.id, words: nextWords }]
          : others;
      });
      setCurrent("");
      if (animNorm) {
        setJustAdded(animNorm);
        window.setTimeout(() => setJustAdded(null), 700);
        toast.success("내 리뷰가 추가됐어요! 캡쳐해서 공유해보세요 📸");
      }
      inputRef.current?.focus();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "42P01") {
        toast.error("아직 준비 중인 기능이에요 (DB 미적용)");
      } else if (err.code === "42501") {
        toast.error("권한이 없어요");
      } else {
        console.error("[WordCloudSection] save error", e);
        toast.error("저장에 실패했어요");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (isComposingRef.current || e.nativeEvent.isComposing) return; // IME 가드
    if (e.key === "Enter") {
      e.preventDefault();
      addCurrent();
    }
  }

  return (
    <section className="mb-6">
      <style>{`
        @keyframes wc-word-pop {
          0%   { opacity: 0; transform: translateY(20px) scale(0.3); }
          60%  { opacity: 1; transform: translateY(-4px) scale(1.15); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .wc-word-pop { animation: wc-word-pop 0.5s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      {/* 헤더 */}
      <header className="mb-4">
        <h2 className="text-[19px] font-black text-white leading-tight">
          여기 하면 떠오르는 단어?
        </h2>
        <p className="text-[13px] text-neutral-500 mt-1">
          5자 리뷰를 남겨보세요.
        </p>
      </header>

      {/* 워드클라우드 */}
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-baseline justify-center py-4 min-h-[90px] content-center mb-3">
        {loading ? (
          <span className="text-[13px] text-neutral-600">불러오는 중...</span>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span
              className="text-[15px] font-bold text-neutral-300 leading-tight"
              style={{ textShadow: "0 0 10px rgba(168,85,247,.45)" }}
            >
              당신의 생각을 이 자리에 ✨
            </span>
          </div>
        ) : (
          shuffledEntries.map((e) => {
            const c = e.count;
            const isMine = myNormalized.has(e.normalized);
            const isJust = justAdded === e.normalized;

            const color = isMine
              ? "text-amber-300"
              : c >= 5
                ? "text-white"
                : c >= 2
                  ? "text-neutral-200"
                  : "text-neutral-500";
            const weight =
              isMine || c >= 5
                ? "font-black"
                : c >= 2
                  ? "font-bold"
                  : "font-medium";

            const glowStrength = Math.min(20, 6 + Math.log2(Math.max(c, 1)) * 5);
            const glowAlpha = Math.min(
              0.8,
              0.3 + Math.log2(Math.max(c, 1)) * 0.18
            );
            const glow = isMine
              ? "0 0 16px rgba(251,191,36,.7)"
              : c >= 2
                ? `0 0 ${Math.round(glowStrength)}px rgba(236,72,153,${glowAlpha.toFixed(2)})`
                : "none";

            return (
              <span
                key={e.normalized}
                ref={(el) => {
                  if (el && !isJust) wordRefs.current.set(e.normalized, el);
                  else wordRefs.current.delete(e.normalized);
                }}
                className={`${color} ${weight} leading-none inline-block will-change-transform ${isJust ? "wc-word-pop" : ""}`}
                style={{ fontSize: fontSize(c), textShadow: glow }}
                title={`${c}명`}
              >
                {e.label}
              </span>
            );
          })
        )}
      </div>

      {/* 인라인 입력 */}
      <div>
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
                  disabled={saving}
                  className="text-amber-400/60 hover:text-amber-200 disabled:opacity-40"
                  aria-label="삭제"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {!full ? (
          <div className="flex items-center gap-2 rounded-full bg-[#1C1C1E] border border-neutral-700 focus-within:border-white/60 px-4 py-3 transition-colors">
            <Plus className="w-4 h-4 shrink-0 text-neutral-500" />
            <input
              ref={inputRef}
              value={current}
              disabled={saving}
              // 공백 제외 글자수 기준 5자 컷 (공백 1칸은 허용, 카운트엔 미포함)
              // 한글 IME 조합 중엔 maxLength가 안 먹어 직접 제어
              onChange={(e) => setCurrent(clampByNonSpace(e.target.value, MAX_WORD_LEN))}
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
                  : "하나 더 띄우기"
              }
              className="flex-1 bg-transparent text-white text-[15px] placeholder:text-neutral-600 focus:outline-none disabled:opacity-50"
            />
            {current.length > 0 && (
              <span className="text-[11px] text-neutral-600 tabular-nums">
                {nonSpaceLen(current)}/{MAX_WORD_LEN}
              </span>
            )}
            {current.trim().length > 0 && (
              <button
                onClick={addCurrent}
                disabled={saving}
                aria-label="띄우기"
                className="flex items-center justify-center w-7 h-7 rounded-full bg-white text-black disabled:bg-neutral-700 disabled:text-neutral-500 transition-colors"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        ) : (
          <p className="text-center text-[12px] text-neutral-600 py-2">
            최대 {MAX_WORDS}개까지 남겼어요 ✨
          </p>
        )}
      </div>
    </section>
  );
}
