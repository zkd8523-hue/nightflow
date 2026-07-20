"use client";

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  clubName: string;
  address: string | null;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

// ClubMap.tsx의 SDK 로더와 동일 로직 (단일 인스턴스 공유 가능 — window.kakao 캐시)
let sdkPromise: Promise<void> | null = null;
function loadKakaoSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  if (typeof window !== "undefined" && window.kakao?.maps) {
    return Promise.resolve();
  }
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!key) {
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 미설정"));
  }
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("kakao-map-sdk") as HTMLScriptElement | null;
    const onReady = () => {
      if (window.kakao?.maps) window.kakao.maps.load(() => resolve());
      else reject(new Error("kakao SDK 로드 실패"));
    };
    if (existing) {
      if (window.kakao?.maps) onReady();
      else existing.addEventListener("load", onReady);
      return;
    }
    const s = document.createElement("script");
    s.id = "kakao-map-sdk";
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.async = true;
    s.onload = onReady;
    s.onerror = () => reject(new Error("kakao SDK 네트워크 오류"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/**
 * 클럽 주소 클릭 시 풀스크린 지도 모달.
 * - 카카오맵 SDK 임베드 (외부 앱 안 가도 위치 확인 가능)
 * - 하단에 "네이버지도/카카오맵으로 열기" 버튼
 */
export function ClubLocationModal({
  open,
  onClose,
  clubName,
  address,
  latitude,
  longitude,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // ESC + body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // 지도 인스턴스 생성
  useEffect(() => {
    if (!open) return;
    if (!latitude || !longitude) {
      // 좌표 없으면 SDK 로드 후에도 빈 지도 표시. 일단 로딩 종료.
      setStatus("error");
      setErrorMsg("좌표 정보가 없어요");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    loadKakaoSdk()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const map = new window.kakao.maps.Map(mapRef.current, {
          center: new window.kakao.maps.LatLng(latitude, longitude),
          level: 3,
        });
        const marker = new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(latitude, longitude),
        });
        marker.setMap(map);
        setStatus("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, latitude, longitude]);

  if (!open) return null;

  const naverSearchQuery = encodeURIComponent(address || clubName);
  const kakaoSearchQuery = encodeURIComponent(address || clubName);

  return (
    <div
      className="fixed inset-0 z-[300] bg-background flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`${clubName} 위치`}
    >
      {/* 헤더 */}
      <header className="flex-shrink-0 flex items-center gap-2 px-3 py-3 bg-white border-b border-neutral-200">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-neutral-100 -ml-2"
        >
          <X className="w-6 h-6 text-neutral-800" strokeWidth={2.5} />
        </button>
        <div className="flex-1 min-w-0 text-center pr-10">
          <p className="text-[15px] font-bold text-neutral-900 truncate">
            {clubName}
          </p>
          {address && (
            <p className="text-[12px] text-muted-foreground truncate">{address}</p>
          )}
        </div>
      </header>

      {/* 지도 영역 */}
      <div className="relative flex-1 bg-neutral-100">
        <div ref={mapRef} className="absolute inset-0" />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-muted-foreground">지도 불러오는 중…</p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">지도를 불러올 수 없어요</p>
              <p className="text-[11px] text-muted-foreground">{errorMsg}</p>
            </div>
          </div>
        )}
      </div>

      {/* 하단 외부 앱 버튼 */}
      <div className="flex-shrink-0 grid grid-cols-2 gap-2 p-3 bg-white border-t border-neutral-200 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <a
          href={`https://map.naver.com/v5/search/${naverSearchQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#03C75A] text-foreground text-[14px] font-bold hover:bg-[#02b052] active:scale-95 transition"
        >
          <span className="font-black">N</span>
          네이버지도
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <a
          href={`https://map.kakao.com/link/search/${kakaoSearchQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#FEE500] text-neutral-900 text-[14px] font-bold hover:bg-[#fbd700] active:scale-95 transition"
        >
          <span className="font-black">K</span>
          카카오맵
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
