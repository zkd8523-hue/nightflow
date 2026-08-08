"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, X, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { type Lang, makeT, areaLabel } from "@/lib/i18n";
import { useSavedClubs, removeSavedClub } from "@/lib/clubs/savedClubs";
import { ForeignClubDetailPanel, displayClubName, type ForeignClubDetail } from "@/components/clubs/ForeignClubDetailPanel";

function buildFlagHref(lang: Lang, area?: string, clubId?: string) {
  const params = new URLSearchParams();
  params.set("lang", lang);
  if (area) params.set("area", area);
  if (clubId) params.set("club", clubId);
  return `/flags/new?${params.toString()}`;
}

/**
 * 헤더의 "찜한 클럽" 진입점 — 모아둔 후보를 다시 꺼내보는 곳.
 * 하트만 눌러두고 어디서 보는지 모르면 찜 자체가 무의미해지므로, 예약 CTA 바로 옆에 둔다.
 * 찜이 0개면 아무것도 렌더하지 않는다(첫 방문자 헤더를 어지럽히지 않기 위해).
 *
 * 목록의 각 행을 누르면 클럽 상세(ForeignClubDetailPanel)가 열린다 — 찜해둔 이유를 다시 확인하고
 * 바로 예약까지 갈 수 있어야, 이름만 적힌 목록에서 다시 헤매는 원래 문제가 반복되지 않는다.
 */
export function SavedClubsButton({ lang, clubs = [] }: { lang: Lang; clubs?: ForeignClubDetail[] }) {
  const t = makeT(lang);
  const saved = useSavedClubs();
  const [open, setOpen] = useState(false);
  const [detailClub, setDetailClub] = useState<ForeignClubDetail | null>(null);

  if (saved.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("찜한 클럽", "Saved clubs", "保存したクラブ", "收藏的夜店")}
        className="flex items-center gap-1 px-3 py-2 rounded-full bg-muted border border-border text-foreground font-black text-[13px] hover:bg-card transition-colors"
      >
        <Heart className="w-3.5 h-3.5 text-brand-amber fill-current" />
        {saved.length}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="bg-background border-border rounded-t-3xl max-h-[80vh] overflow-y-auto p-0">
          <div className="p-5 space-y-4">
            <SheetTitle className="font-black text-[18px] text-foreground">
              {t("찜한 클럽", "Saved clubs", "保存したクラブ", "收藏的夜店")}
            </SheetTitle>

            <div className="flex flex-col gap-2">
              {saved.map((c) => {
                // 홈이 들고 있는 클럽 목록에 있으면 상세를 열 수 있음. 없으면 정보 행으로만 표시.
                const full = clubs.find((x) => x.id === c.id);
                return (
                  <div key={c.id} className="flex items-center gap-1 p-2 rounded-xl bg-card border border-border">
                    <button
                      type="button"
                      disabled={!full}
                      onClick={() => full && setDetailClub(full)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left disabled:cursor-default"
                    >
                      <div className="w-11 h-11 rounded-lg bg-muted overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.thumbnail_url && (
                          <img src={c.thumbnail_url} alt={c.name_en || c.name} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-bold text-foreground truncate">
                          {full ? displayClubName(full) : c.name_en?.trim() || c.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{areaLabel(c.area, lang)}</p>
                      </div>
                      {full && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </button>
                    <button
                      type="button"
                      aria-label={t("찜 해제", "Remove", "解除", "移除")}
                      onClick={() => removeSavedClub(c.id)}
                      className="shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <Link
              href={`/flags/new?lang=${lang}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-center w-full py-3.5 rounded-2xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors"
            >
              {t("이 클럽들로 요청하기", "Request with these clubs", "このクラブでリクエスト", "用这些夜店申请")}
            </Link>
            <p className="text-[11px] text-muted-foreground text-center">
              {t(
                "요청 폼에서 한 번씩 탭해 담을 수 있어요.",
                "Tap each one to add it on the request form.",
                "リクエストフォームでタップして追加できます。",
                "在申请表中点击即可添加。"
              )}
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* 클럽 상세 — 목록 시트 위에 겹쳐 뜬다(닫으면 목록으로 복귀) */}
      <Sheet open={!!detailClub} onOpenChange={(o) => !o && setDetailClub(null)}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl max-h-[88vh] overflow-y-auto p-0">
          {detailClub && (
            <>
              <SheetTitle className="sr-only">{detailClub.name}</SheetTitle>
              <ForeignClubDetailPanel
                club={detailClub}
                lang={lang}
                cta={
                  <div className="flex gap-2 mt-2">
                    <Link
                      href={buildFlagHref(lang, detailClub.area, detailClub.id)}
                      onClick={() => {
                        setDetailClub(null);
                        setOpen(false);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-amber-500 text-black font-black text-[15px] hover:bg-amber-400 transition-colors"
                    >
                      🍾 {t("예약하기", "Book", "予約する", "预订")} {displayClubName(detailClub)}
                    </Link>
                  </div>
                }
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
