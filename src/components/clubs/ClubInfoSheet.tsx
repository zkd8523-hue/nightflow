"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock, MapPin, Ticket, Shirt, Instagram } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface ClubInfoTarget {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  address: string | null;
  operating_hours: string | null;
  entry_fee_detail: string | null;
  dresscode: string | null;
  instagram: string | null;
}

/**
 * 라인업 화면에서 여는 클럽 정보 시트.
 *
 * 왜 클럽 상세 페이지로 안 보내는가:
 *   라인업을 훑다가 페이지로 나가면 탐색이 끊긴다(DJ 프로필과 같은 이유).
 *   그렇다고 클럽 상세(ClubDetailContent, 1000줄+ · 편집기·경매·워드클라우드까지)를
 *   통째로 시트에 담으면 오히려 더 무겁다. 여기서 필요한 건 "지금 갈지" 판단에
 *   드는 것뿐이라 위치·영업시간·입장료·드레스코드만 담고, 더 볼 사람은
 *   하단 링크로 상세 페이지에 보낸다.
 */
export function ClubInfoSheet({
  club,
  onClose,
}: {
  club: ClubInfoTarget | null;
  onClose: () => void;
}) {
  const rows = club
    ? [
        { icon: MapPin, label: "위치", value: club.address },
        { icon: Clock, label: "영업시간", value: club.operating_hours },
        { icon: Ticket, label: "입장료", value: club.entry_fee_detail },
        { icon: Shirt, label: "드레스코드", value: club.dresscode },
      ].filter((r) => !!r.value)
    : [];

  return (
    <Sheet open={!!club} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[80vh] overflow-y-auto bg-card border-border rounded-t-3xl gap-0 px-4 pt-5 pb-8 max-w-lg mx-auto [&>*]:shrink-0"
      >
        {club && (
          <>
            <SheetHeader className="p-0">
              <div className="flex items-center gap-3 pr-10">
                {club.thumbnail_url ? (
                  <Image
                    src={club.thumbnail_url}
                    alt=""
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <span className="w-12 h-12 rounded-xl bg-muted shrink-0" />
                )}
                <div className="min-w-0">
                  <SheetTitle className="text-left text-[17px] font-black text-foreground truncate">
                    {club.name}
                  </SheetTitle>
                  {club.area && (
                    <p className="text-[12px] text-muted-foreground mt-0.5">{club.area}</p>
                  )}
                </div>
              </div>
            </SheetHeader>

            {rows.length > 0 ? (
              <div className="mt-4 bg-[#1C1C1E] rounded-2xl divide-y divide-white/5">
                {rows.map((r) => (
                  <div key={r.label} className="flex gap-3 px-4 py-3">
                    <r.icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-muted-foreground">{r.label}</p>
                      <p className="text-[13px] font-semibold text-foreground whitespace-pre-wrap break-words mt-0.5">
                        {r.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* 정보가 하나도 없으면 빈 카드만 남아 더 답답하다 — 상세로 보낸다 */
              <p className="mt-4 text-[13px] text-muted-foreground text-center py-6">
                아직 등록된 클럽 정보가 없어요
              </p>
            )}

            <div className="mt-3 flex gap-2">
              {club.instagram && (
                <a
                  href={`https://instagram.com/${club.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-10 rounded-xl border border-border text-muted-foreground hover:text-foreground text-[12.5px] font-black inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Instagram className="w-3.5 h-3.5" aria-hidden="true" />
                  인스타그램
                </a>
              )}
              <Link
                href={`/clubs/${club.id}`}
                onClick={onClose}
                className="flex-1 h-10 rounded-xl border border-border text-muted-foreground hover:text-foreground text-[12.5px] font-black inline-flex items-center justify-center transition-colors"
              >
                클럽 상세 보기
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
