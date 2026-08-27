"use client";

import { useState } from "react";
import Link from "next/link";
import { Instagram } from "lucide-react";
import { DjProfileSheet, type DjProfileTarget } from "@/components/djs/DjProfileSheet";

/**
 * DJ 이름 + 인스타 아이콘. 두 개는 서로 다른 곳으로 간다:
 *   - 이름  → 프로필 시트 (활동 클럽 목록)
 *   - 아이콘 → 인스타 직행
 * 아이콘이 인스타로 간다는 걸 보고 누르는 사람이 시트로 끌려가면 안 되고,
 * 반대로 이름을 눌러 클럽을 보려는 사람이 앱 밖으로 나가서도 안 된다.
 *
 * 라인업 화면 전체가 같은 동작이어야 하므로(어떤 화면은 직행, 어떤 화면은 시트가 되면
 * 같은 이름을 눌러도 결과가 달라진다) 서버 컴포넌트에서도 쓸 수 있게 상태를 안에 가둔다.
 *
 * slug가 있으면 이름을 <button>이 아니라 <a href="/dj/{slug}">로 낸다.
 * 동작은 그대로 시트다(preventDefault) — 다만 크롤러는 href를 보고 DJ 페이지를 탄다.
 * 이게 없으면 /dj/* 425개가 sitemap에만 있고 내부 링크가 0인 고아 페이지가 된다
 * (시트는 닫혀 있을 때 DOM에 렌더되지도 않아 링크로 세어지지 않는다).
 * 새 탭·가운데 클릭·수정키 조합은 가로채지 않고 그대로 페이지로 보낸다.
 */
export function DjNameButton({
  dj,
  className = "",
}: {
  dj: DjProfileTarget;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const nameClass = `text-left truncate hover:text-amber-400 transition-colors ${className}`;

  return (
    <span className="inline-flex items-center gap-1.5 max-w-full">
      {dj.slug ? (
        <Link
          href={`/dj/${dj.slug}`}
          onClick={(e) => {
            // 새 탭/새 창 의도는 존중한다 — 가로채면 사용자가 원한 동작을 뺏는다
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            setOpen(true);
          }}
          className={nameClass}
        >
          {dj.display_name}
        </Link>
      ) : (
        <button onClick={() => setOpen(true)} className={nameClass}>
          {dj.display_name}
        </button>
      )}

      {dj.instagram && (
        <a
          href={`https://instagram.com/${dj.instagram}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${dj.display_name} 인스타그램`}
          className="shrink-0 inline-flex items-center justify-center text-muted-foreground hover:text-amber-400 transition-colors"
        >
          <Instagram className="w-3.5 h-3.5" />
        </a>
      )}

      <DjProfileSheet dj={open ? dj : null} onClose={() => setOpen(false)} />
    </span>
  );
}
