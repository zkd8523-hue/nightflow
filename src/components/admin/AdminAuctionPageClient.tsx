"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminAuctionManager } from "./AdminAuctionManager";
import { BidMonitor } from "./BidMonitor";
import { Gavel, Radio } from "lucide-react";
import type { ComponentProps } from "react";

interface AdminAuctionPageClientProps {
  auctions: ComponentProps<typeof AdminAuctionManager>["auctions"];
}

export function AdminAuctionPageClient({ auctions }: AdminAuctionPageClientProps) {
  return (
    <Tabs defaultValue="manage" className="w-full">
      <TabsList className="w-fit bg-neutral-900 border border-neutral-800/50 h-12 p-1 rounded-xl">
        <TabsTrigger
          value="manage"
          className="rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white px-6"
        >
          <Gavel className="w-4 h-4 mr-2" />
          경매 관리
        </TabsTrigger>
        <TabsTrigger
          value="monitor"
          className="rounded-lg font-bold text-neutral-400 data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white px-6"
        >
          <Radio className="w-4 h-4 mr-2" />
          실시간 입찰
        </TabsTrigger>
      </TabsList>
      <TabsContent value="manage" className="mt-6">
        <AdminAuctionManager auctions={auctions} />
      </TabsContent>
      <TabsContent value="monitor" className="mt-6">
        <BidMonitor />
      </TabsContent>
    </Tabs>
  );
}
