"use client";

import { useState } from "react";
import { Instagram, MessageCircle, Copy, ChevronDown, ChevronRight } from "lucide-react";
import type { SlotClickerSerial } from "./page";

interface Row {
  slot_id: string;
  club_name: string | null;
  club_area: string | null;
  md_name: string | null;
  md_instagram: string | null;
  instagram_clicks: number;
  openchat_clicks: number;
  copy_message_clicks: number;
  total_clicks: number;
  unique_users: number;
  unique_clickers: number;
  last_clicked_at: string | null;
}

interface Props {
  rows: Row[];
  clickersBySlot: Record<string, SlotClickerSerial[]>;
  anonBySlot: Record<string, number>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

const TYPE_META: Record<string, { label: string; cls: string; Icon: typeof Instagram }> = {
  instagram: { label: "인스타", cls: "text-pink-300 bg-pink-500/10", Icon: Instagram },
  openchat: { label: "오픈채팅", cls: "text-green-300 bg-green-500/10", Icon: MessageCircle },
  copy_message: { label: "문의복사", cls: "text-amber-300 bg-amber-500/10", Icon: Copy },
};

export function HotdealClicksTable({ rows, clickersBySlot, anonBySlot }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (slotId: string) => {
    setExpanded((prev) => (prev === slotId ? null : slotId));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900 text-neutral-500 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="text-left px-4 py-3 font-bold">클럽</th>
            <th className="text-left px-4 py-3 font-bold">지역</th>
            <th className="text-left px-4 py-3 font-bold">담당 파트너</th>
            <th className="text-right px-4 py-3 font-bold">인스타</th>
            <th className="text-right px-4 py-3 font-bold">오픈채팅</th>
            <th className="text-right px-4 py-3 font-bold">문의 복사</th>
            <th className="text-right px-4 py-3 font-bold">합계</th>
            <th className="text-right px-4 py-3 font-bold">유니크</th>
            <th className="text-right px-4 py-3 font-bold">마지막 클릭</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-center py-12 text-neutral-500">
                해당 주차에 등록된 게스트 간판이 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const clickers = clickersBySlot[r.slot_id] ?? [];
              const anon = anonBySlot[r.slot_id] ?? 0;
              const isOpen = expanded === r.slot_id;
              const hasDetail = clickers.length > 0 || anon > 0;
              return (
                <>
                  <tr
                    key={r.slot_id}
                    onClick={() => hasDetail && toggle(r.slot_id)}
                    className={`hover:bg-neutral-900/50 ${hasDetail ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-4 py-3 font-bold text-white">
                      <span className="inline-flex items-center gap-1.5">
                        {hasDetail ? (
                          isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          )
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}
                        {r.club_name ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{r.club_area ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-300">
                      {r.md_name ?? "-"}
                      {r.md_instagram && (
                        <span className="text-neutral-500 text-[11px] ml-1">@{r.md_instagram}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-pink-300">
                      {Number(r.instagram_clicks || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-300">
                      {Number(r.openchat_clicks || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-300">
                      {Number(r.copy_message_clicks || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-white">
                      {Number(r.total_clicks || 0).toLocaleString()}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-bold text-sky-300"
                      title={`로그인 유저 ${r.unique_users}명${r.unique_clickers > r.unique_users ? " + 비로그인" : ""}`}
                    >
                      {Number(r.unique_users || 0).toLocaleString()}
                      {Number(r.unique_clickers || 0) > Number(r.unique_users || 0) && (
                        <span className="text-neutral-500 text-[10px] ml-0.5">+익명</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-500 text-[11px]">
                      {formatDate(r.last_clicked_at)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.slot_id}-detail`} className="bg-neutral-950/60">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                            클릭한 유저 ({clickers.length}명{anon > 0 ? ` + 비로그인 ${anon}` : ""})
                          </p>
                          {clickers.length === 0 ? (
                            <p className="text-[12px] text-neutral-600">
                              로그인 유저 클릭이 없습니다 (비로그인 {anon}건).
                            </p>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {clickers.map((c) => (
                                <div
                                  key={c.userId}
                                  className="flex items-center gap-3 bg-neutral-900 rounded-lg px-3 py-2"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[13px] font-bold text-white">{c.name}</span>
                                    {c.instagram && (
                                      <span className="text-neutral-500 text-[11px] ml-1.5">
                                        @{c.instagram}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {c.types.map((t) => {
                                      const meta = TYPE_META[t];
                                      if (!meta) return null;
                                      const { label, cls, Icon } = meta;
                                      return (
                                        <span
                                          key={t}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}
                                        >
                                          <Icon className="w-3 h-3" />
                                          {label}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <span className="text-neutral-600 text-[10px] shrink-0 w-20 text-right">
                                    {formatDate(c.lastClickedAt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
