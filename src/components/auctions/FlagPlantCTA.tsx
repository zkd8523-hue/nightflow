"use client";

import Link from "next/link";

interface Props {
  variant?: "list-end" | "empty";
  isLoggedIn: boolean;
}

export function FlagPlantCTA({ variant = "list-end", isLoggedIn }: Props) {
  const href = isLoggedIn ? "/flags/new" : "/login?redirect=/flags/new";

  if (variant === "empty") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-[12px] text-neutral-500 font-medium">
          깃발을 꽂으면 파트너가 오퍼해요
        </p>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 h-11 px-5 bg-amber-500 text-black font-black text-[13px] rounded-full hover:bg-amber-400 transition-colors active:scale-[0.98]"
        >
          ⛳ 깃발 꽂으러 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-[12px] text-neutral-500 font-medium">
        찾는 조각이 없어요? 깃발을 꽂으면 파트너가 오퍼해요
      </p>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 h-11 px-5 bg-amber-500 text-black font-black text-[13px] rounded-full hover:bg-amber-400 transition-colors active:scale-[0.98]"
      >
        ⛳ 깃발 꽂으러 가기
      </Link>
    </div>
  );
}
