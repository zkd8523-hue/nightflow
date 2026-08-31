"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateDjCupSession } from "@/lib/djCup/session";
import { trackEvent } from "@/lib/analytics/events";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * DJ 이상형 월드컵 공용 댓글 (Migration 617).
 *
 * 월드컵이 하나뿐이라 댓글창도 전역 하나다. 각 댓글에는 그 사람의 우승자가
 * 붙는다 — 그래야 댓글 자체가 "다른 사람들은 누굴 뽑았나" 콘텐츠가 된다.
 * 랭킹은 실사용 판이 쌓이기 전엔 비어 있지만 댓글은 한 건만 있어도 화면이 산다.
 *
 * 로그인을 요구하지 않는다 — 비로그인 유입이 주 타겟이라 댓글 한 줄에
 * 카카오 로그인을 시키면 그 자리에서 이탈한다. 도배 방어는 서버 RPC에서 한다
 * (클라이언트 검증은 우회되므로 여기 로직은 UX용일 뿐이다).
 */

interface CommentRow {
  id: string;
  nickname: string;
  body: string;
  champion_name: string | null;
  champion_slug: string | null;
  round_size: number | null;
  created_at: string;
}

const PAGE = 30;

export function DjCupComments({
  championId,
  championName,
  roundSize,
}: {
  /** 방금 판을 끝낸 사람만 우승자가 붙는다. 랭킹 페이지 등에서는 없음. */
  championId?: string;
  championName?: string;
  roundSize?: number;
}) {
  const [rows, setRows] = useState<CommentRow[] | null>(null);
  const [body, setBody] = useState("");
  const [nickname, setNickname] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadingMore = useRef(false);

  /** 전역 auth store에 이미 users 프로필 전체가 들어있다(useAuthInit의 select *).
   *  여기서 따로 조회하면 같은 걸 두 번 읽는 셈이라 store를 그대로 쓴다. */
  const { user } = useCurrentUser();
  /** 계정 닉네임. 비우고 보내면 서버가 이걸로 채운다(Migration 620).
   *  placeholder로만 쓴다 — 값을 넣어버리면 "직접 입력"으로 취급돼서
   *  나중에 닉네임을 바꿔도 이 댓글만 옛 이름으로 굳는다. */
  const myName = user?.display_name ?? null;
  const isAdmin = user?.role === "admin";

  const load = useCallback(async (before?: string) => {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_dj_cup_comments", {
      p_limit: PAGE,
      p_before: before ?? null,
    });
    const list = (data ?? []) as CommentRow[];
    setHasMore(list.length === PAGE);
    return list;
  }, []);

  useEffect(() => {
    load().then(setRows);
  }, [load]);

  const submit = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("post_dj_cup_comment", {
        p_session_id: getOrCreateDjCupSession(),
        p_body: text,
        p_nickname: nickname.trim() || null,
        p_champion_id: championId ?? null,
        p_champion_name: championName ?? null,
        p_round_size: roundSize ?? null,
      });

      const res = data as { success?: boolean; error?: string } | null;
      if (error || !res?.success) {
        toast.error(res?.error ?? "댓글을 남기지 못했어요");
        return;
      }

      trackEvent("dj_cup_comment_posted", {
        round_size: roundSize,
        has_champion: !!championName,
      });
      setBody("");
      setDone(true);
      setRows(await load());
    } finally {
      setSending(false);
    }
  };

  /** Admin 전용 숨김(Migration 621). hard delete가 아니라 is_hidden 토글이라
   *  오조작을 되돌릴 수 있고, 도배범이 지워서 레이트리밋을 리셋하는 것도 막는다. */
  const hide = async (id: string) => {
    if (!confirm("이 댓글을 숨길까요? 관리자 페이지에서 되살릴 수 있어요.")) return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_set_dj_cup_comment_hidden", {
      p_comment_id: id,
      p_hidden: true,
    });
    const res = data as { success?: boolean; error?: string } | null;
    if (error || !res?.success) {
      toast.error(res?.error ?? "숨기지 못했어요");
      return;
    }
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    toast.success("숨겼어요");
  };

  const loadMore = async () => {
    if (loadingMore.current || !rows?.length) return;
    loadingMore.current = true;
    try {
      const more = await load(rows[rows.length - 1].created_at);
      setRows([...rows, ...more]);
    } finally {
      loadingMore.current = false;
    }
  };

  return (
    <div className="mt-4">
      <p className="text-[13px] font-black text-white tracking-[-0.02em] mb-2">
        한마디 남기기
        {rows && rows.length > 0 && (
          <span className="text-muted-foreground font-bold ml-1.5 tabular-nums">
            {rows.length}
            {hasMore ? "+" : ""}
          </span>
        )}
      </p>

      {/* 한 번 남기면 폼을 접는다 — 같은 사람이 연속으로 쓰라고 부추기지 않는다
          (서버도 분당 3건·1시간 내 같은 내용을 막는다). */}
      {done ? (
        <p className="text-[11.5px] text-muted-foreground bg-card border border-border rounded-xl px-3 py-2.5">
          남겨주셔서 고마워요
          <button
            type="button"
            onClick={() => setDone(false)}
            className="text-white font-bold ml-2 underline underline-offset-2"
          >
            하나 더 쓰기
          </button>
        </p>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-2.5">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder={myName ? `${myName} (변경하려면 입력)` : "닉네임 (선택)"}
            className="w-full h-8 px-2.5 rounded-lg bg-background border border-border text-[12px] text-white placeholder:text-muted-foreground outline-none focus:border-white/30"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="메세지를 입력하세요"
            className="w-full mt-1.5 px-2.5 py-2 rounded-lg bg-background border border-border text-[12.5px] text-white placeholder:text-muted-foreground outline-none focus:border-white/30 resize-none"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {body.length}/300
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!body.trim() || sending}
              className="h-8 px-4 rounded-lg bg-white text-black text-[12px] font-black disabled:opacity-40 transition-opacity"
            >
              {sending ? "남기는 중" : "남기기"}
            </button>
          </div>
        </div>
      )}

      {rows === null ? (
        <p className="text-[11.5px] text-muted-foreground text-center py-5">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground text-center py-5">
          아직 한마디가 없어요. 첫 댓글을 남겨보세요
        </p>
      ) : (
        <ul className="mt-3">
          {rows.map((c) => (
            <li key={c.id} className="py-2.5 border-t border-border first:border-t-0 flex items-start gap-2">
              <div className="flex-1 min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-[12px] font-extrabold text-white">{c.nickname}</span>
                {c.champion_name && (
                  <span className="text-[11px] text-muted-foreground">
                    (
                    {c.champion_slug ? (
                      <Link
                        href={`/dj/${c.champion_slug}`}
                        className="text-green-500 font-bold hover:underline"
                      >
                        {c.champion_name}
                      </Link>
                    ) : (
                      <span className="text-green-500 font-bold">{c.champion_name}</span>
                    )}
                    )
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/70">
                  {formatWhen(c.created_at)}
                </span>
              </p>
              <p className="text-[12.5px] text-foreground mt-0.5 whitespace-pre-wrap break-words leading-[1.45]">
                {c.body}
              </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => hide(c.id)}
                  title="숨기기 (관리자)"
                  aria-label="댓글 숨기기"
                  className="shrink-0 mt-0.5 p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasMore && rows && rows.length > 0 && (
        <button
          type="button"
          onClick={loadMore}
          className="w-full h-9 mt-1 rounded-xl border border-border text-muted-foreground text-[11.5px] font-bold"
        >
          더 보기
        </button>
      )}
    </div>
  );
}

/** 방금/N분 전/N시간 전/월-일. 초 단위까지 보여주던 원본(피쿠)과 달리
 *  모바일에서 한 줄에 들어가야 해서 짧게 줄인다. */
function formatWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
