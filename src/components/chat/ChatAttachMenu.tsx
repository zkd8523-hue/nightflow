"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { getCurrentCoords } from "@/lib/geo/currentCoords";
import type { ChatMediaItem } from "@/types/database";

interface Props {
  /** 사진/카메라로 고른 파일 — 업로드는 호출측에서 (방마다 업로드 경로가 같지만 슬롯 제한이 다름) */
  onFiles: (files: File[]) => void;
  /** 내 위치 카드 */
  onLocation: (item: ChatMediaItem) => void;
  disabled?: boolean;
}

/**
 * 채팅 입력창 좌측 "+" 첨부 메뉴 — 사진 / 카메라 / 내 위치.
 * DM·조각 단체방·와글에서 공용으로 쓴다.
 */
export function ChatAttachMenu({ onFiles, onLocation, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setOpen(false);
    if (files.length > 0) onFiles(files);
  }

  async function shareLocation() {
    if (locating) return;
    setLocating(true);
    try {
      const { latitude, longitude } = await getCurrentCoords();

      // 주소는 있으면 좋고 없어도 위치는 보낸다 (역지오코딩 실패로 막지 않음)
      let label: string | undefined;
      try {
        const res = await fetch("/api/geo/reverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude, longitude }),
        });
        if (res.ok) {
          const { address } = (await res.json()) as { address?: string | null };
          label = address ?? undefined;
        }
      } catch {
        // 주소 없이 좌표만 보냄
      }

      onLocation({
        type: "location",
        lat: latitude,
        lng: longitude,
        label,
        url: `https://map.kakao.com/link/map/${encodeURIComponent(
          label || "공유된 위치"
        )},${latitude},${longitude}`,
      });
      setOpen(false);
    } catch (e) {
      toast.error(
        e instanceof Error && e.message.includes("권한")
          ? "위치 권한을 켜주세요"
          : "위치를 가져오지 못했어요"
      );
    } finally {
      setLocating(false);
    }
  }

  const ITEMS = [
    {
      key: "photo",
      icon: ImageIcon,
      label: "사진",
      onClick: () => galleryRef.current?.click(),
    },
    {
      key: "camera",
      icon: Camera,
      label: "카메라",
      onClick: () => cameraRef.current?.click(),
    },
    {
      key: "location",
      icon: MapPin,
      label: locating ? "찾는 중" : "내 위치",
      onClick: shareLocation,
    },
  ];

  return (
    <>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={pick}
        className="hidden"
      />
      {/* capture 속성 — 모바일에서 갤러리 대신 카메라를 바로 연다 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={pick}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label={open ? "첨부 닫기" : "첨부"}
        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-40"
      >
        {open ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
      </button>

      {open && (
        <>
          {/* 바깥 탭하면 닫힘 */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute bottom-full left-2 mb-2 z-40 flex gap-1.5 rounded-2xl border border-neutral-800 bg-[#1C1C1E] p-2 shadow-xl">
            {ITEMS.map(({ key, icon: Icon, label, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                disabled={key === "location" && locating}
                className="w-16 flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                <span className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-white" />
                </span>
                <span className="text-[11px] font-bold text-neutral-300">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
