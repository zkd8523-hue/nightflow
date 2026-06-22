"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { tokenizeChatContent } from "@/lib/chat/hashtag";

interface Props {
  content: string;
  /** 메시지에 박제된 클럽 ID들 */
  clubTags: string[];
  className?: string;
}

/** 클럽 ID → 이름 매핑 (전역 캐시) */
const clubNameCache = new Map<string, string>();

/**
 * 본문 텍스트 렌더링 — #해시태그를 클럽 링크로 변환.
 * - club_tags 배열의 ID들로 클럽명을 fetch
 * - 클럽명(띄어쓰기 포함)을 longest-match-first로 본문에서 매칭
 * - 매칭되면 /clubs/{id}로 링크, 보라 강조
 * - 매칭 안 된 자유 #해시태그는 회색 강조
 */
export function ChatContentText({ content, clubTags, className }: Props) {
  const [clubMap, setClubMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (clubTags.length === 0) {
      setClubMap(new Map());
      return;
    }
    const uncached = clubTags.filter((id) => !clubNameCache.has(id));
    if (uncached.length === 0) {
      const m = new Map<string, string>();
      for (const id of clubTags) {
        const name = clubNameCache.get(id);
        if (name) m.set(id, name);
      }
      setClubMap(m);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("clubs")
        .select("id, name")
        .in("id", uncached);
      if (cancelled) return;
      for (const c of (data ?? []) as { id: string; name: string }[]) {
        clubNameCache.set(c.id, c.name);
      }
      const m = new Map<string, string>();
      for (const id of clubTags) {
        const name = clubNameCache.get(id);
        if (name) m.set(id, name);
      }
      setClubMap(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [clubTags]);

  // 클럽명 → ID 역매핑
  const nameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, name] of clubMap.entries()) {
      m.set(name, id);
    }
    return m;
  }, [clubMap]);

  const knownClubNames = useMemo(
    () => Array.from(clubMap.values()),
    [clubMap]
  );

  const tokens = useMemo(
    () => tokenizeChatContent(content, knownClubNames),
    [content, knownClubNames]
  );

  return (
    <p className={className}>
      {tokens.map((t, i) => {
        if (t.type === "text") {
          return <span key={i}>{t.value}</span>;
        }
        if (t.type === "club") {
          const clubId = nameToId.get(t.name);
          if (clubId) {
            return (
              <Link
                key={i}
                href={`/clubs/${clubId}`}
                className="text-[#7C3AED] font-bold hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {t.raw}
              </Link>
            );
          }
          // fallback
          return (
            <span key={i} className="text-neutral-500">
              {t.raw}
            </span>
          );
        }
        // 자유 해시태그
        return (
          <span key={i} className="text-neutral-500">
            {t.raw}
          </span>
        );
      })}
    </p>
  );
}
