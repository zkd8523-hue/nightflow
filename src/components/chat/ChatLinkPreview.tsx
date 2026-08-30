"use client";

import { useEffect, useState } from "react";
import { normalizeUrl } from "@/lib/chat/linkPreview";

interface Preview {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
}

// 같은 링크가 여러 메시지에 있어도 한 번만 조회 (와글은 한 화면에 글이 많다)
const cache = new Map<string, Preview | null>();
// 동시에 같은 URL을 여러 말풍선이 요청하는 것 방지
const inflight = new Map<string, Promise<Preview | null>>();

function loadPreview(url: string): Promise<Preview | null> {
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = fetch("/api/link-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.preview ?? null) as Preview | null)
    .catch(() => null)
    .then((v) => {
      cache.set(url, v);
      inflight.delete(url);
      return v;
    });
  inflight.set(url, p);
  return p;
}

interface Props {
  /** 본문에서 처음 발견된 URL (원본 그대로) */
  url: string;
}

/**
 * 채팅 본문 링크의 OG 미리보기 카드 (카톡 스타일).
 * - 메타를 못 가져오면 아무것도 렌더하지 않는다 (링크 텍스트는 본문에 이미 있음)
 * - 로딩 중에도 자리를 잡지 않는다 → 카드가 뒤늦게 나타나며 채팅이 밀리지 않게 최소 높이만 사용
 */
export function ChatLinkPreview({ url }: Props) {
  const normalized = normalizeUrl(url);
  const [preview, setPreview] = useState<Preview | null | undefined>(
    normalized ? cache.get(normalized) : null
  );

  useEffect(() => {
    if (!normalized) return;
    if (cache.has(normalized)) {
      setPreview(cache.get(normalized) ?? null);
      return;
    }
    let cancelled = false;
    loadPreview(normalized).then((v) => {
      if (!cancelled) setPreview(v);
    });
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  // 로딩 중이거나 메타 없음 → 카드 없음 (본문 링크 텍스트로 충분)
  if (!preview) return null;

  const host = (() => {
    try {
      return new URL(preview.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-1 block rounded-2xl border border-border bg-card max-w-[260px] overflow-hidden hover:bg-white/5 transition-colors"
    >
      {preview.image_url && (
        // 외부 도메인 이미지 — next/image 최적화 대상이 아니므로 img 사용
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image_url}
          alt=""
          loading="lazy"
          className="w-full aspect-[1.91/1] object-cover bg-muted"
          onError={(e) => {
            // 죽은 썸네일이면 이미지 영역만 제거 (카드는 유지)
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="px-3 py-2">
        {preview.title && (
          <p className="text-[13px] font-black text-foreground line-clamp-2 leading-snug">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-[12px] text-muted-foreground line-clamp-2 leading-snug mt-0.5">
            {preview.description}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-1 truncate">
          {preview.site_name || host}
        </p>
      </div>
    </a>
  );
}
