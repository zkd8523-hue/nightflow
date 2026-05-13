"use client";

import { useState, type ReactNode } from "react";
import { normalizeProfileImage } from "@/lib/utils/image";

interface ProfileAvatarProps {
  src: string | null | undefined;
  alt: string;
  fallback: ReactNode;
  className?: string;
  imgClassName?: string;
}

export function ProfileAvatar({
  src,
  alt,
  fallback,
  className = "",
  imgClassName = "w-full h-full object-cover",
}: ProfileAvatarProps) {
  const normalized = normalizeProfileImage(src);
  const [failed, setFailed] = useState(false);

  return (
    <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
      <span className="absolute inset-0 flex items-center justify-center">
        {fallback}
      </span>
      {normalized && !failed && (
        <img
          src={normalized}
          alt={alt}
          className={`relative ${imgClassName}`}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
