"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Instagram } from "lucide-react";
import { DjProfileSheet, type DjProfileTarget } from "@/components/djs/DjProfileSheet";
import { DjPreviewButton } from "@/components/djs/DjPreviewButton";

/**
 * DJ 이름 + 인스타 아이콘. 두 개는 서로 다른 곳으로 간다:
 *   - 이름  → 프로필 시트 (활동 클럽 목록)
 *   - 아이콘 → 인스타 직행
 * 아이콘이 인스타로 간다는 걸 보고 누르는 사람이 시트로 끌려가면 안 되고,
 * 반대로 이름을 눌러 클럽을 보려는 사람이 앱 밖으로 나가서도 안 된다.
 *
 * soundcloud_url 이 있으면 이름 왼쪽에 ▶ 미리듣기가 하나 더 붙는다(세 번째 목적지).
 * 이름만 봐서는 어떤 DJ인지 모르는 문제를 화면 이동 없이 푸는 자리다.
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
  showPreview = true,
  fill = false,
}: {
  dj: DjProfileTarget;
  className?: string;
  /** 칸 전체를 눌러도 프로필이 열리게 한다 — 이름 글자만 표적이면 너무 작다.
   *  아이콘들은 그대로 각자 동작한다(stopPropagation). */
  fill?: boolean;
  /** 라인업 표는 재생 버튼을 행 오른쪽 끝 열에 따로 두므로 여기선 끈다.
   *  (이름 옆에 두면 인스타 아이콘과 붙어 오탭이 났다) */
  showPreview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  /* 시트는 바깥 pointerdown 에서 닫히는데, 이어지는 click 은 그 아래 행까지
     내려와 래퍼(fill)를 다시 눌러 시트가 곧바로 재오픈된다.
     닫힌 직후 짧은 시간의 클릭은 무시한다. */
  const closedAt = useRef(0);

  const nameClass = `text-left truncate hover:text-amber-400 transition-colors ${className}`;

  return (
    <span
      className={`inline-flex items-center gap-1 max-w-full ${
        fill ? "w-full cursor-pointer" : ""
      }`}
      onClick={
        fill
          ? (e) => {
              // 새 탭 의도(수정키·가운데 클릭)는 이름 링크가 그대로 통과시키므로
              // 래퍼까지 올라와 시트를 같이 열면 안 된다.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              if (Date.now() - closedAt.current < 250) return;
              setOpen(true);
            }
          : undefined
      }
    >
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

      {showPreview && (
        <DjPreviewButton soundcloudUrl={dj.soundcloud_url} djName={dj.display_name} />
      )}

      {dj.instagram && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          aria-label={`${dj.display_name} 프로필`}
          /* 인스타로 바로 나가면 라인업을 훑던 흐름이 앱 밖에서 끊긴다 —
             이름과 같은 프로필 시트를 연다(시트 안에 인스타 링크가 있다).
             아이콘은 14px 그대로 두고 패딩으로 터치 영역만 넓힌다 —
             -my-2 로 행 높이는 그대로라 표가 두꺼워지지 않는다. */
          className="shrink-0 inline-flex items-center justify-center px-1.5 py-2 -my-2 text-muted-foreground hover:text-amber-400 transition-colors"
        >
          <Instagram className="w-3.5 h-3.5" />
        </button>
      )}

      <DjProfileSheet
        dj={open ? dj : null}
        onClose={() => {
          closedAt.current = Date.now();
          setOpen(false);
        }}
      />
    </span>
  );
}
