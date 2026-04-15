import { toast } from "sonner";
import type { Auction } from "@/types/database";
import { formatEventDate, formatEntryTime } from "./format";
import { logger } from "./logger";
import { trackEvent } from "@/lib/analytics";
import dayjs from "dayjs";
import "dayjs/locale/ko";

/**
 * URL에 referral code 파라미터 추가 (바이럴 추적용, 유저에게 비노출)
 */
export function appendReferralCode(url: string, referralCode?: string | null): string {
  if (!referralCode) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('ref', referralCode);
    return u.toString();
  } catch {
    return url;
  }
}

interface ShareAuctionParams {
  auctionId: string;
  clubName: string;
  eventDate: string;
  entryTime?: string | null;
  startPrice: number;
  tableInfo?: string;
  referralCode?: string | null;
}

/**
 * 경매를 SNS에 공유 (Web Share API 사용)
 * - 모바일: 네이티브 공유 시트 (인스타/카톡/페북 등)
 * - 데스크톱: 클립보드 복사 fallback
 */
export async function shareAuction({
  auctionId,
  clubName,
  eventDate,
  entryTime,
  startPrice,
  tableInfo,
  referralCode,
}: ShareAuctionParams): Promise<boolean> {
  const baseUrl = `${window.location.origin}/auctions/${auctionId}`;
  let url = appendReferralCode(baseUrl, referralCode);

  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'share_sheet');
    u.searchParams.set('utm_medium', 'share');
    url = u.toString();
  } catch {}

  const tableText = tableInfo ? ` ${tableInfo}` : "";
  const entry = formatEntryTime(entryTime ?? null, eventDate);
  const text = `🎉 ${clubName}${tableText} 테이블 경매 시작!\n${formatEventDate(eventDate)} ${entry}\n시작가 ₩${startPrice.toLocaleString()}\n\n지금 입찰하세요 👉`;

  // Web Share API 지원 확인
  if (navigator.share) {
    try {
      await navigator.share({
        title: `${clubName} 테이블 경매`,
        text: text,
        url: url,
      });
      return true; // 공유 성공
    } catch (err: unknown) {
      // 사용자가 취소하면 AbortError
      if (err && typeof err === "object" && "name" in err && err.name === "AbortError") {
        return false; // 취소는 에러 아님
      }
      logger.error("Share failed:", err);
      // 에러 시 클립보드 fallback
      await copyToClipboard(text, url);
      return false;
    }
  } else {
    // Web Share API 미지원 → 클립보드 복사
    await copyToClipboard(text, url);
    return false;
  }
}

/**
 * 클립보드 안전 쓰기 (HTTP 환경에서 navigator.clipboard undefined 대응)
 */
async function safeClipboardWrite(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * 클립보드 복사 fallback
 */
async function copyToClipboard(text: string, url: string): Promise<void> {
  const fullText = `${text}\n${url}`;
  const copied = await safeClipboardWrite(fullText);
  if (copied) {
    toast.success("링크가 복사되었습니다! 원하는 곳에 붙여넣기하세요", {
      duration: 3000,
    });
  } else {
    toast.error("공유 링크 생성에 실패했습니다");
  }
}

/**
 * Auction 객체에서 공유 파라미터 추출
 */
export function getShareParams(auction: Auction, referralCode?: string | null): ShareAuctionParams {
  return {
    auctionId: auction.id,
    clubName: auction.club?.name || "클럽",
    eventDate: auction.event_date,
    entryTime: auction.entry_time,
    startPrice: auction.start_price,
    tableInfo: auction.table_info,
    referralCode,
  };
}

/**
 * 인스타그램 스토리 공유: 이미지 + 링크 자동 복사 + 스토리 가이드
 * imageBlob은 User Gesture 만료 방지를 위해 미리 준비된 것을 인자로 받음
 * auctionUrl을 전달하면 공유 전 클립보드에 자동 복사 (링크 스티커 붙여넣기용)
 */
export async function shareToInstagram(
  auctionId: string,
  imageBlob: Blob | null,
  clubName: string,
  auctionUrl?: string,
  referralCode?: string | null
): Promise<boolean> {
  const baseUrl = auctionUrl || `${window.location.origin}/auctions/${auctionId}`;
  let url = appendReferralCode(baseUrl, referralCode);

  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'instagram_story');
    u.searchParams.set('utm_medium', 'share');
    url = u.toString();
  } catch {}

  // 공유 전 경매 링크를 클립보드에 복사 (스토리 링크 스티커용)
  await safeClipboardWrite(url);

  // 이미지 Blob + navigator.share files 지원 시 → 이미지 파일로 공유
  if (imageBlob && navigator.share) {
    try {
      const file = new File([imageBlob], `${clubName}-auction.png`, {
        type: "image/png",
      });
      // navigator.canShare로 files 지원 여부 확인
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${clubName} 테이블 경매`,
        });
        trackEvent("auction_shared", { platform: "instagram", auction_id: auctionId, method: "web_share_api" });
        toast.success("스토리에 '링크 스티커'를 추가하세요!", {
          description: "경매 링크가 복사되어 있어요. 붙여넣기하면 고객이 바로 입찰할 수 있습니다.",
          duration: 6000,
        });
        return true;
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "name" in err && err.name === "AbortError") {
        return false;
      }
      logger.error("Instagram image share failed:", err);
    }
  }

  // Fallback: 이미지 다운로드
  if (imageBlob) {
    try {
      const blobUrl = URL.createObjectURL(imageBlob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${clubName}-auction.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      trackEvent("auction_shared", { platform: "instagram", auction_id: auctionId, method: "download" });
      toast.success("이미지 저장 완료! 인스타 스토리에 올려보세요", {
        description: "경매 링크가 복사되어 있어요. 스토리 '링크 스티커'에 붙여넣기하세요.",
        duration: 6000,
      });
      return true;
    } catch {
      toast.error("이미지 저장에 실패했습니다");
    }
  }

  // 최종 Fallback: 링크 복사
  trackEvent("auction_shared", { platform: "instagram", auction_id: auctionId, method: "clipboard" });
  await copyAuctionLink(auctionId);
  return false;
}

/**
 * 친구 초대 공유 (유저용): Web Share API → 클립보드 fallback
 */
export async function shareInvite(params: {
  auctionId: string;
  clubName: string;
  tableInfo?: string;
  eventDate: string;
  referralCode?: string | null;
}): Promise<void> {
  const baseUrl = `${window.location.origin}/auctions/${params.auctionId}`;
  let url = appendReferralCode(baseUrl, params.referralCode);

  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'invite');
    u.searchParams.set('utm_medium', 'share');
    url = u.toString();
  } catch {}

  const dateStr = dayjs(params.eventDate).locale('ko').format('M월 D일 (dd)');
  const inviteText = `🎉 ${params.clubName} 같이 갈래?\n\n📍 위치: ${params.tableInfo || '좋은 자리'}\n📅 일정: ${dateStr}\n\n지금 입찰 중이야! 같이 가고 싶으면 여기서 확인해 봐 👇`;

  // Web Share API 지원 시 → OS 공유 시트 (인스타/카톡/문자 등 유저가 선택)
  if (navigator.share) {
    try {
      await navigator.share({
        title: `${params.clubName} 같이 갈래?`,
        text: `${inviteText}\n${url}`,
        url,
      });
      trackEvent("auction_shared", { platform: "invite", auction_id: params.auctionId, method: "web_share_api" });
      return;
    } catch (err: unknown) {
      if (err && typeof err === "object" && "name" in err && err.name === "AbortError") {
        return; // 유저 취소
      }
      logger.error("Share invite failed:", err);
    }
  }

  // Fallback: 클립보드 복사 + 토스트 안내
  const fullMessage = `${inviteText}\n${url}`;
  const copied = await safeClipboardWrite(fullMessage);
  if (copied) {
    toast.success("초대 메시지가 복사되었습니다!", {
      description: "원하는 곳에 붙여넣기하세요.",
      duration: 4000,
    });
  } else {
    toast.error("공유에 실패했습니다. 링크를 직접 복사해주세요.");
  }
  trackEvent("auction_shared", { platform: "invite", auction_id: params.auctionId, method: "clipboard" });
}

/**
 * 경매 링크만 클립보드에 복사
 */
export async function copyAuctionLink(auctionId: string, referralCode?: string | null): Promise<boolean> {
  const baseUrl = `${window.location.origin}/auctions/${auctionId}`;
  let url = appendReferralCode(baseUrl, referralCode);
  
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'copy');
    u.searchParams.set('utm_medium', 'share');
    url = u.toString();
  } catch {}

  const copied = await safeClipboardWrite(url);
  if (copied) {
    toast.success("링크가 복사되었습니다!", { duration: 2000 });
  } else {
    toast.error("링크 복사에 실패했습니다");
  }
  return copied;
}
