"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * 랭킹 표 행의 DJ 썸네일.
 *
 * 클라이언트 조각으로 떼어낸 이유는 onError 하나 때문이다 — 저장된 주소가
 * 죽어 있으면(유튜브 영상 삭제·비공개, 사클 계정 정리) next/image가 브라우저
 * 기본 깨진 이미지 아이콘을 그대로 그린다. 실측: Alan Walker의 유튜브 영상이
 * 삭제돼 i.ytimg.com 썸네일이 404(1KB placeholder)를 돌려주는데, 상태 코드가
 * 200이 아니어도 이미지 요소는 그냥 깨진 채로 남는다.
 *
 * DjCupCard가 쓰는 규약과 같다 — 값이 없으면 이니셜, "값은 있는데 죽었다"도
 * 이니셜로 떨어뜨린다.
 *
 * ⚠️ 호스트 검증(usableDjArtwork)은 호출부에서 이미 끝난 상태로 받는다.
 * remotePatterns에 없는 호스트는 렌더 시점에 예외가 나서 onError로도 못 잡고
 * 에러 바운더리가 페이지를 통째로 덮기 때문이다.
 */
export function DjRankingAvatar({
  src,
  displayName,
}: {
  src: string | null;
  displayName: string;
}) {
  const [failed, setFailed] = useState(false);
  const usable = src && !failed;

  return (
    <span className="relative w-[54px] h-[72px] overflow-hidden shrink-0 bg-[#1C1C1E]">
      {usable ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="54px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[20px] font-black text-white/70">
          {displayName.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
