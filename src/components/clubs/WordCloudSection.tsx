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
import { Plus, X, ArrowUp, ChevronDown } from "lucide-react";
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
  type WordCloudEntry,
} from "@/lib/clubs/wordCloud";
import { WordVotersSheet } from "./WordVotersSheet";

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
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [likeSaving, setLikeSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myWords, setMyWords] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [showMine, setShowMine] = useState(false);
  const isComposingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const full = myWords.length >= MAX_WORDS;

  // ── 데이터 로드 ──
  const fetchData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);

    const [wordsRes, likesRes] = await Promise.all([
      supabase
        .from("club_word_clouds")
        .select("author_id, words")
        .eq("club_id", clubId),
      supabase
        .from("club_word_cloud_likes")
        .select("normalized_word, user_id")
        .eq("club_id", clubId),
    ]);

    if (wordsRes.error) {
      console.error("[WordCloudSection] fetch error", wordsRes.error);
      setRows([]);
      setLoading(false);
      return;
    }
    const fetched = (wordsRes.data ?? []) as {
      author_id: string;
      words: string[];
    }[];
    setRows(fetched);
    // 내 row 반영
    const mine = user ? fetched.find((r) => r.author_id === user.id) : null;
    setMyWords(mine?.words ?? []);

    // 좋아요 집계 (테이블 미적용 등 에러 시 조용히 빈 상태로 degrade)
    if (likesRes.error) {
      console.warn("[WordCloudSection] likes fetch skipped", likesRes.error);
      setLikeCounts(new Map());
      setMyLikes(new Set());
    } else {
      const counts = new Map<string, number>();
      const mineLikes = new Set<string>();
      for (const r of (likesRes.data ?? []) as {
        normalized_word: string;
        user_id: string;
      }[]) {
        counts.set(r.normalized_word, (counts.get(r.normalized_word) ?? 0) + 1);
        if (user && r.user_id === user.id) mineLikes.add(r.normalized_word);
      }
      setLikeCounts(counts);
      setMyLikes(mineLikes);
    }
    setLoading(false);
  }, [clubId, user]);

  useEffect(() => {
    if (userLoading) return;
    fetchData();
  }, [fetchData, userLoading]);

  const entries = useMemo(() => aggregateWords(rows), [rows]);

  // ── 단어별 작성자 목록 (normalized → author_id[]) ──
  const authorsByWord = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of rows) {
      for (const raw of row.words ?? []) {
        const norm = normalizeWord(raw);
        if (!norm) continue;
        const arr = m.get(norm) ?? [];
        if (!arr.includes(row.author_id)) arr.push(row.author_id);
        m.set(norm, arr);
      }
    }
    return m;
  }, [rows]);

  // ── 단어 탭 → 작성자 시트 ──
  const [selectedEntry, setSelectedEntry] = useState<WordCloudEntry | null>(
    null
  );
  const selectedAuthorIds = selectedEntry
    ? (authorsByWord.get(selectedEntry.normalized) ?? [])
    : [];

  // ── 셔플 (마운트 후 + 10초마다, 하이드레이션 안전) ──
  const [mounted, setMounted] = useState(false);
  const [shuffleTick, setShuffleTick] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);
  useEffect(() => {
    setMounted(true);
    setHintIdx(Math.floor(Math.random() * PLACEHOLDER_HINTS.length));
  }, []);
  const hint = PLACEHOLDER_HINTS[hintIdx];

  // 3개 이상일 때만 10초마다 셔플 (1~2개는 움직일 게 없어 새로고침처럼 보임)
  const canShuffle = entries.length >= 3;
  useEffect(() => {
    if (!canShuffle) return;
    const t = setInterval(() => setShuffleTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, [canShuffle]);

  const shuffledEntries = useMemo(
    () => (mounted && canShuffle ? shuffle(entries) : entries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, mounted, canShuffle, shuffleTick]
  );

  // ── 크기/밝기: 빈도 절대값 로그 스케일 (곡선 완만) ──
  const fontSize = (c: number) =>
    Math.round(Math.min(40, 15 + Math.log2(Math.max(c, 1)) * 5));

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

  // ── 단어 좋아요 토글 (클럽 × 정규화 단어 단위, 낙관적 업데이트) ──
  async function toggleLike(normalized: string) {
    if (!user) {
      router.push(`/login?redirect=/clubs/${clubId}`);
      return;
    }
    if (!normalized || likeSaving) return;
    const wasLiked = myLikes.has(normalized);
    const delta = wasLiked ? -1 : 1;

    // 낙관적 반영
    setMyLikes((prev) => {
      const n = new Set(prev);
      if (wasLiked) n.delete(normalized);
      else n.add(normalized);
      return n;
    });
    setLikeCounts((prev) => {
      const n = new Map(prev);
      n.set(normalized, Math.max(0, (n.get(normalized) ?? 0) + delta));
      return n;
    });

    setLikeSaving(true);
    const supabase = createClient();
    try {
      if (wasLiked) {
        const { error } = await supabase
          .from("club_word_cloud_likes")
          .delete()
          .eq("club_id", clubId)
          .eq("normalized_word", normalized)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("club_word_cloud_likes")
          .insert({
            club_id: clubId,
            normalized_word: normalized,
            user_id: user.id,
          });
        // 23505 = 이미 좋아요됨(중복) → 무시
        if (error && error.code !== "23505") throw error;
      }
    } catch (e) {
      // 롤백
      setMyLikes((prev) => {
        const n = new Set(prev);
        if (wasLiked) n.add(normalized);
        else n.delete(normalized);
        return n;
      });
      setLikeCounts((prev) => {
        const n = new Map(prev);
        n.set(normalized, Math.max(0, (n.get(normalized) ?? 0) - delta));
        return n;
      });
      const err = e as { code?: string };
      if (err.code === "42P01") {
        toast.error("아직 준비 중인 기능이에요 (DB 미적용)");
      } else {
        console.error("[WordCloudSection] like error", e);
        toast.error("좋아요 처리에 실패했어요");
      }
    } finally {
      setLikeSaving(false);
    }
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
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[19px] font-black text-foreground leading-tight">
            여기 하면 떠오르는 단어?
          </h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            5자 리뷰를 남겨보세요.
          </p>
        </div>
        {myWords.length > 0 && (
          <button
            onClick={() => setShowMine((v) => !v)}
            className={`shrink-0 mt-1 inline-flex items-center gap-0.5 text-[13px] font-bold transition-colors ${
              showMine ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            내 리뷰
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showMine ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </header>

      {/* 내 리뷰 펼침 (탭 눌렀을 때만) */}
      {showMine && myWords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 justify-center rounded-2xl bg-card/60 p-3">
          {myWords.map((w, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted text-foreground text-[13px] font-bold"
            >
              {w}
              <button
                onClick={() => removeMyWord(i)}
                disabled={saving}
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label="삭제"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 워드클라우드 */}
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-baseline justify-center py-4 min-h-[90px] content-center mb-3">
        {loading ? (
          <span className="text-[13px] text-muted-foreground">불러오는 중...</span>
        ) : entries.length === 0 ? (
          // 예시 워드클라우드 — 3층 고정. 2층의 "리뷰가 이렇게 보여요"가 문장으로 읽힘, 1·3층은 예시 단어
          <div className="flex flex-col items-center gap-y-2 select-none pointer-events-none">
            {/* 1층 */}
            <div className="flex items-baseline justify-center gap-x-2.5">
              <span className="font-bold text-foreground/80 leading-none" style={{ fontSize: 17, textShadow: "0 0 9px rgba(236,72,153,.45)" }}>음악</span>
              <span className="font-medium text-muted-foreground leading-none" style={{ fontSize: 13 }}>사랑</span>
            </div>
            {/* 2층 — 안내 문장 */}
            <div className="flex items-baseline justify-center gap-x-2.5">
              <span className="font-black text-foreground leading-none" style={{ fontSize: 30, textShadow: "0 0 18px rgba(236,72,153,.8)" }}>리뷰가</span>
              <span className="font-bold text-foreground leading-none" style={{ fontSize: 19, textShadow: "0 0 11px rgba(236,72,153,.55)" }}>이렇게</span>
              <span className="font-black text-foreground leading-none" style={{ fontSize: 25, textShadow: "0 0 15px rgba(236,72,153,.7)" }}>보여요</span>
            </div>
            {/* 3층 */}
            <div className="flex items-baseline justify-center gap-x-2.5">
              <span className="font-bold text-foreground/80 leading-none" style={{ fontSize: 18, textShadow: "0 0 10px rgba(236,72,153,.5)" }}>자유</span>
              <span className="font-medium text-muted-foreground leading-none" style={{ fontSize: 14 }}>책임</span>
              <span className="font-medium text-muted-foreground leading-none" style={{ fontSize: 12 }}>준법</span>
            </div>
          </div>
        ) : (
          shuffledEntries.map((e) => {
            const likeCount = likeCounts.get(e.normalized) ?? 0;
            // 크기 점수 = 남긴 사람 수 + 좋아요×0.5 (좋아요 2개 = 1명분, 과증폭 방지)
            const c = e.count + likeCount * 0.5;
            const isJust = justAdded === e.normalized;

            // 점수 기준으로 색/굵기 (모두 동일하게 보임)
            const color =
              c >= 5
                ? "text-foreground"
                : c >= 2
                  ? "text-foreground/90"
                  : "text-foreground/80";
            const weight = c >= 5 ? "font-black" : c >= 2 ? "font-bold" : "font-bold";

            // 글로우: 1점부터 켜짐, 점수 클수록 강하게
            const glowStrength = Math.min(20, 8 + Math.log2(Math.max(c, 1)) * 5);
            const glowAlpha = Math.min(0.85, 0.4 + Math.log2(Math.max(c, 1)) * 0.18);
            const glow = `0 0 ${Math.round(glowStrength)}px rgba(236,72,153,${glowAlpha.toFixed(2)})`;

            return (
              <button
                key={e.normalized}
                type="button"
                onClick={() => setSelectedEntry(e)}
                ref={(el) => {
                  if (el && !isJust) wordRefs.current.set(e.normalized, el);
                  else wordRefs.current.delete(e.normalized);
                }}
                className={`${color} ${weight} leading-none inline-flex flex-col items-center will-change-transform cursor-pointer transition-transform hover:scale-110 active:scale-95 ${isJust ? "wc-word-pop" : ""}`}
                style={{ fontSize: fontSize(c), textShadow: glow }}
                title={`${e.count}명 남김${likeCount > 0 ? ` · 좋아요 ${likeCount}` : ""} · 눌러서 보기`}
              >
                <span>{e.label}</span>
                {likeCount > 0 && (
                  <span
                    className="mt-0.5 font-bold text-pink-400"
                    style={{ fontSize: 11, textShadow: "none" }}
                  >
                    ♥{likeCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* 인라인 입력 */}
      <div>
        {!full ? (
          <div className="flex items-center gap-2 rounded-full bg-card border border-border focus-within:border-white/60 px-4 py-3 transition-colors">
            <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
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
              className="flex-1 bg-transparent text-foreground text-[15px] placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />
            {current.length > 0 && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {nonSpaceLen(current)}/{MAX_WORD_LEN}
              </span>
            )}
            {current.trim().length > 0 && (
              <button
                onClick={addCurrent}
                disabled={saving}
                aria-label="띄우기"
                className="flex items-center justify-center w-7 h-7 rounded-full bg-inverse text-inverse-foreground disabled:bg-muted disabled:text-muted-foreground transition-colors"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        ) : (
          <p className="text-center text-[12px] text-muted-foreground py-2">
            최대 {MAX_WORDS}개까지 남겼어요 ✨
          </p>
        )}
      </div>

      {/* 단어 탭 → 남긴 사람들 프로필 */}
      <WordVotersSheet
        open={selectedEntry !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedEntry(null);
        }}
        label={selectedEntry?.label ?? null}
        authorIds={selectedAuthorIds}
        myId={user?.id ?? null}
        likeCount={
          selectedEntry ? (likeCounts.get(selectedEntry.normalized) ?? 0) : 0
        }
        liked={selectedEntry ? myLikes.has(selectedEntry.normalized) : false}
        likeSaving={likeSaving}
        onToggleLike={() =>
          selectedEntry && toggleLike(selectedEntry.normalized)
        }
      />
    </section>
  );
}
