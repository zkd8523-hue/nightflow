"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/utils/format";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search,
  XCircle,
  Trash2,
  Loader2,
  ArrowUpDown,
  Clock,
  CheckCircle2,
  CalendarClock,
  ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { AuctionStatus } from "@/types/database";
import { getErrorMessage, logError } from "@/lib/utils/error";

interface AuctionItem {
  id: string;
  status: AuctionStatus;
  title: string;
  event_date: string;
  current_bid: number;
  start_price: number;
  bid_count: number;
  created_at: string;
  auction_start_at: string;
  auction_end_at: string;
  extended_end_at: string | null;
  buy_now_price: number | null;
  cancel_type?: string | null;
  cancel_reason?: string | null;
  club?: { name: string; area: string } | null;
  md?: { name: string } | null;
}

interface AdminAuctionManagerProps {
  auctions: AuctionItem[];
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "진행중", className: "bg-red-500/10 text-red-500 border-red-500/20" },
  scheduled: { label: "예정", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  won: { label: "낙찰", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  confirmed: { label: "확인완료", className: "bg-green-500/10 text-green-500 border-green-500/20" },
  unsold: { label: "유찰", className: "bg-neutral-500/10 text-neutral-500 border-neutral-500/20" },
  cancelled: { label: "취소", className: "bg-neutral-500/10 text-neutral-500 border-neutral-500/20" },
  draft: { label: "초안", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  expired: { label: "마감", className: "bg-neutral-500/10 text-neutral-500 border-neutral-500/20" },
};

/** DB status가 아닌 실제 시간 기반 표시용 status 반환 */
function getDisplayStatus(a: AuctionItem): string {
  const tab = getAuctionTab(a);
  // 시간 초과인데 DB status가 아직 scheduled/active → "expired"로 표시
  if (tab === "ended" && (a.status === "scheduled" || a.status === "active")) {
    return "expired";
  }
  // 시작됨인데 DB status가 scheduled → "active"로 표시
  if (tab === "active" && a.status === "scheduled") {
    return "active";
  }
  return a.status;
}

const ENDED_DB_STATUSES: AuctionStatus[] = ["won", "confirmed", "unsold", "cancelled", "expired"];

function getAuctionTab(a: AuctionItem): "scheduled" | "active" | "ended" {
  const now = dayjs();
  const start = dayjs(a.auction_start_at);
  const end = dayjs(a.extended_end_at || a.auction_end_at);

  if (ENDED_DB_STATUSES.includes(a.status)) return "ended";
  if (a.status === "draft") return "scheduled";

  // scheduled / active → 시간 기반 판별
  if (now.isBefore(start)) return "scheduled";
  if (now.isBefore(end)) return "active";
  return "ended"; // 시간 초과, status 미갱신
}

function AuctionTable({
  auctions,
  onCancel,
  onDelete,
}: {
  auctions: AuctionItem[];
  onCancel: (a: AuctionItem) => void;
  onDelete: (a: AuctionItem) => void;
}) {
  const router = useRouter();

  if (auctions.length === 0) {
    return (
      <div className="py-24 text-center text-neutral-600 bg-neutral-900/10 rounded-3xl border border-dashed border-neutral-800">
        해당하는 경매가 없습니다
      </div>
    );
  }

  const grouped = new Map<string, AuctionItem[]>();
  for (const a of auctions) {
    const dateKey = dayjs(a.event_date).format("YYYY-MM-DD");
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(a);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([date, items]) => (
        <div key={date} className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <CalendarClock className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[13px] font-bold text-neutral-400">
              {dayjs(date).locale("ko").format("M/D(ddd)")}
            </span>
            <span className="text-[11px] text-neutral-600 font-medium">
              {items.length}건
            </span>
            <div className="flex-1 h-px bg-neutral-800/50" />
          </div>

          <div className="grid grid-cols-12 px-6 py-2 text-[10px] text-neutral-500 font-black uppercase tracking-widest border-b border-neutral-800">
            <div className="col-span-4">Auction / MD</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-2 text-right">Price / Bids</div>
            <div className="col-span-2 text-right">Date</div>
            <div className="col-span-2 text-center">Actions</div>
          </div>

          {items.map((a) => {
            const displayStatus = getDisplayStatus(a);
            const statusCfg = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.expired;
            const canCancel = ["active", "scheduled"].includes(a.status);
            const canDelete = a.status === "draft";

            return (
              <Card
                key={a.id}
                className="bg-[#1C1C1E] border-neutral-800/50 hover:border-neutral-700 transition-all p-5 cursor-pointer"
                onClick={() => router.push(`/auctions/${a.id}`)}
              >
                <div className="grid grid-cols-12 items-center gap-4">
                  <div className="col-span-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center font-black text-neutral-600">
                      {a.club?.name?.substring(0, 1) || "C"}
                    </div>
                    <div>
                      <p className="text-white font-bold">{a.club?.name || "-"}</p>
                      <p className="text-[12px] text-neutral-500 font-medium">
                        MD: {a.md?.name || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-2 flex flex-col items-center gap-1">
                    <Badge
                      className={`${statusCfg.className} font-black text-[10px] px-2 py-0.5 rounded-lg border uppercase tracking-widest`}
                    >
                      {statusCfg.label}
                    </Badge>
                    {a.status === "cancelled" && a.cancel_type && (
                      <span className="text-[9px] text-neutral-600 font-medium">
                        {a.cancel_type === "mutual" ? "합의취소" : a.cancel_type === "noshow_md" ? "노쇼" : a.cancel_type}
                      </span>
                    )}
                    {a.status === "cancelled" && a.cancel_reason && (
                      <span
                        className="text-[9px] text-neutral-500 font-medium max-w-[80px] text-center line-clamp-2 leading-tight"
                        title={a.cancel_reason}
                      >
                        "{a.cancel_reason}"
                      </span>
                    )}
                  </div>

                  <div className="col-span-2 text-right">
                    <p className="text-white font-black">
                      {formatPrice(a.current_bid || a.start_price)}
                    </p>
                    <p className="text-[11px] text-neutral-500 font-bold">{a.bid_count} Bids</p>
                  </div>

                  <div className="col-span-2 text-right">
                    <p className="text-[12px] text-neutral-400 font-bold">
                      {dayjs(a.event_date).locale("ko").format("M/D (ddd)")}
                    </p>
                    <p className="text-[10px] text-neutral-600 font-medium uppercase">
                      {a.club?.area || "-"}
                    </p>
                  </div>

                  <div className="col-span-2 flex justify-center gap-2">
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); onCancel(a); }}
                        className="text-xs bg-transparent border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        취소
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); onDelete(a); }}
                        className="text-xs bg-transparent border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        삭제
                      </Button>
                    )}
                    {!canCancel && !canDelete && (
                      <span className="text-neutral-600 text-xs">-</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function AdminAuctionManager({ auctions }: AdminAuctionManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [sortAsc, setSortAsc] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<AuctionItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AuctionItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const scheduledAuctions = auctions.filter((a) => getAuctionTab(a) === "scheduled");
  const activeAuctions = auctions.filter((a) => getAuctionTab(a) === "active");
  const endedAuctions = auctions.filter((a) => getAuctionTab(a) === "ended");

  const tabCounts = {
    scheduled: scheduledAuctions.length,
    active: activeAuctions.length,
    ended: endedAuctions.length,
  };

  function filterAndSort(list: AuctionItem[]): AuctionItem[] {
    const searched = list.filter((a) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        a.club?.name?.toLowerCase().includes(q) ||
        a.md?.name?.toLowerCase().includes(q) ||
        a.title?.toLowerCase().includes(q)
      );
    });

    return searched.sort((a, b) => {
      const dateA = dayjs(a.event_date).valueOf();
      const dateB = dayjs(b.event_date).valueOf();
      return sortAsc ? dateA - dateB : dateB - dateA;
    });
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSortAsc(value !== "ended");
  };

  const handleCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) {
      toast.error("취소 사유를 입력해주세요");
      return;
    }
    setCancelLoading(true);
    try {
      const res = await fetch("/api/admin/auctions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auctionId: cancelTarget.id,
          action: "cancel",
          reason: cancelReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("경매가 강제 취소되었습니다");
      setCancelTarget(null);
      setCancelReason("");
      window.location.reload();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'AdminAuctionManager.handleCancel');
      toast.error(msg || "취소 처리 중 오류가 발생했습니다");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/auctions?auctionId=${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("경매가 삭제되었습니다");
      setDeleteTarget(null);
      window.location.reload();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'AdminAuctionManager.handleDelete');
      toast.error(msg || "삭제 처리 중 오류가 발생했습니다");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 검색 + 정렬 */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <Input
            placeholder="클럽명, MD명, 경매 제목 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-[#1C1C1E] border-neutral-800 text-white"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setSortAsc(!sortAsc)}
          className="h-10 px-4 bg-[#1C1C1E] border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 text-xs font-bold"
        >
          <ArrowUpDown className="w-4 h-4 mr-2" />
          {sortAsc ? "가까운 날짜순" : "최신순"}
        </Button>
      </div>

      {/* 3탭 */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full bg-neutral-900 border border-neutral-800/50 h-12 p-1 rounded-xl">
          <TabsTrigger
            value="scheduled"
            className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white"
          >
            <Clock className="w-4 h-4 mr-2" />
            예정 ({tabCounts.scheduled})
          </TabsTrigger>
          <TabsTrigger
            value="active"
            className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" />
            진행중 ({tabCounts.active})
          </TabsTrigger>
          <TabsTrigger
            value="ended"
            className="flex-1 rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            종료 ({tabCounts.ended})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled" className="mt-6">
          <AuctionTable
            auctions={filterAndSort(scheduledAuctions)}
            onCancel={setCancelTarget}
            onDelete={setDeleteTarget}
          />
        </TabsContent>
        <TabsContent value="active" className="mt-6">
          <AuctionTable
            auctions={filterAndSort(activeAuctions)}
            onCancel={setCancelTarget}
            onDelete={setDeleteTarget}
          />
        </TabsContent>
        <TabsContent value="ended" className="mt-6">
          <AuctionTable
            auctions={filterAndSort(endedAuctions)}
            onCancel={setCancelTarget}
            onDelete={setDeleteTarget}
          />
        </TabsContent>
      </Tabs>

      {/* 강제 취소 Sheet */}
      <Sheet open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <SheetContent
          side="bottom"
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">경매 강제 취소</SheetTitle>
            <SheetDescription className="text-neutral-400">
              이 경매를 강제로 취소합니다
            </SheetDescription>
          </SheetHeader>
          {cancelTarget && (
            <div className="space-y-4 mt-6">
              <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">클럽</span>
                  <span className="font-bold text-white">{cancelTarget.club?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">MD</span>
                  <span className="font-bold text-white">{cancelTarget.md?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">현재가</span>
                  <span className="font-black text-xl text-green-500">
                    {formatPrice(cancelTarget.current_bid || cancelTarget.start_price)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">입찰 수</span>
                  <span className="font-bold text-white">{cancelTarget.bid_count}건</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-bold text-neutral-400">취소 사유</p>
                <Textarea
                  placeholder="취소 사유를 입력해주세요..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="bg-neutral-900 border-neutral-800 text-white min-h-[80px]"
                />
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-[13px] text-red-400 font-medium leading-relaxed">
                이 경매의 모든 활성 입찰이 취소됩니다. 이 작업은 되돌릴 수 없습니다.
              </div>

              <div className="grid grid-cols-2 gap-3 pb-8">
                <Button
                  variant="outline"
                  onClick={() => setCancelTarget(null)}
                  className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
                >
                  닫기
                </Button>
                <Button
                  onClick={handleCancel}
                  disabled={cancelLoading || !cancelReason.trim()}
                  className="h-14 rounded-2xl font-black text-lg bg-red-500 hover:bg-red-400 text-white"
                >
                  {cancelLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "강제 취소"
                  )}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 삭제 확인 Sheet */}
      <Sheet open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <SheetContent
          side="bottom"
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">경매 삭제</SheetTitle>
            <SheetDescription className="text-neutral-400">
              초안 경매를 삭제합니다
            </SheetDescription>
          </SheetHeader>
          {deleteTarget && (
            <div className="space-y-4 mt-6">
              <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">클럽</span>
                  <span className="font-bold text-white">{deleteTarget.club?.name || "-"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 text-sm font-bold">MD</span>
                  <span className="font-bold text-white">{deleteTarget.md?.name || "-"}</span>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-[13px] text-red-400 font-medium leading-relaxed">
                이 경매가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </div>

              <div className="grid grid-cols-2 gap-3 pb-8">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
                >
                  닫기
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="h-14 rounded-2xl font-black text-lg bg-red-500 hover:bg-red-400 text-white"
                >
                  {deleteLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "삭제"
                  )}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
