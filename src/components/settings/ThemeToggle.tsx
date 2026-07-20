"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

/** 화면 테마 선택 (밝은 모드 / 어두운 모드 2단 버튼). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 마운트 전에는 서버 렌더 결과와 맞추기 위해 기본값(어두움)으로 표시
  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <>
      <h2 className="text-[13px] font-bold text-muted-foreground mt-6 mb-2 px-1">
        화면
      </h2>
      <div className="bg-card rounded-2xl border border-border p-5">
        <h2 className="text-[15px] font-bold text-foreground mb-3">테마</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTheme("light")}
            disabled={!mounted}
            aria-pressed={mounted && !isDark}
            className={`h-11 rounded-xl flex items-center justify-center gap-1.5 text-[14px] font-bold transition-colors ${
              mounted && !isDark
                ? "bg-inverse text-inverse-foreground"
                : "bg-muted text-muted-foreground"
            } ${!mounted ? "opacity-50" : ""}`}
          >
            <Sun className="w-4 h-4" />
            밝은 모드
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            disabled={!mounted}
            aria-pressed={mounted && isDark}
            className={`h-11 rounded-xl flex items-center justify-center gap-1.5 text-[14px] font-bold transition-colors ${
              mounted && isDark
                ? "bg-inverse text-inverse-foreground"
                : "bg-muted text-muted-foreground"
            } ${!mounted ? "opacity-50" : ""}`}
          >
            <Moon className="w-4 h-4" />
            어두운 모드
          </button>
        </div>
      </div>
    </>
  );
}
