"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";

// 외국어 클럽 상세의 주소 칸(2026-10-25, 운영자 "외국어 페이지에 한국어 다 없애").
// 화면엔 한국어 주소를 보이지 않고, 누르면 한국어 주소가 복사된다 — 택시 기사에게 보여 주거나
// 지도 앱에 붙여 넣는 용도. 한국 지도·택시 앱은 한국어 주소가 가장 정확하다.
const L: Record<string, { copy: string; done: string }> = {
  en: { copy: "Copy address for taxi", done: "Copied — show it to your driver" },
  ja: { copy: "タクシー用に住所をコピー", done: "コピーしました" },
  zh: { copy: "复制地址给司机", done: "已复制" },
  "zh-tw": { copy: "複製地址給司機", done: "已複製" },
};

export function CopyAddressButton({ address, lang }: { address: string; lang: string }) {
  const [done, setDone] = useState(false);
  const t = L[lang] ?? L.en;
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); } catch { return; }
    setDone(true);
    trackEvent("foreign_copy_address", { lang });
    setTimeout(() => setDone(false), 2500);
  };
  return (
    <button type="button" onClick={copy}
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-[12px] font-bold text-foreground hover:text-brand-amber">
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? t.done : t.copy}
    </button>
  );
}
