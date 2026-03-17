import { toast } from "sonner";
import type { Auction } from "@/types/database";
import { formatEventDate } from "./format";
import { logger } from "./logger";

interface ShareAuctionParams {
  auctionId: string;
  clubName: string;
  eventDate: string;
  startPrice: number;
  tableInfo?: string;
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
  startPrice,
  tableInfo,
}: ShareAuctionParams): Promise<boolean> {
  const url = `${window.location.origin}/auctions/${auctionId}`;
  const tableText = tableInfo ? ` ${tableInfo}` : "";
  const text = `🎉 ${clubName}${tableText} 테이블 경매 시작!\n${formatEventDate(eventDate)}\n시작가 ₩${startPrice.toLocaleString()}\n\n지금 입찰하세요 👉`;

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
 * 클립보드 복사 fallback
 */
async function copyToClipboard(text: string, url: string): Promise<void> {
  const fullText = `${text}\n${url}`;
  try {
    await navigator.clipboard.writeText(fullText);
    toast.success("링크가 복사되었습니다! 원하는 곳에 붙여넣기하세요", {
      duration: 3000,
    });
  } catch (err) {
    logger.error("Clipboard failed:", err);
    toast.error("공유 링크 생성에 실패했습니다");
  }
}

/**
 * Auction 객체에서 공유 파라미터 추출
 */
export function getShareParams(auction: Auction): ShareAuctionParams {
  return {
    auctionId: auction.id,
    clubName: auction.club?.name || "클럽",
    eventDate: auction.event_date,
    startPrice: auction.start_price,
    tableInfo: auction.table_info,
  };
}

/**
 * 인스타그램 공유: 미리 fetch된 이미지 Blob으로 네이티브 공유 시트 → 인스타 스토리
 * imageBlob은 User Gesture 만료 방지를 위해 미리 준비된 것을 인자로 받음
 */
export async function shareToInstagram(
  auctionId: string,
  imageBlob: Blob | null,
  clubName: string
): Promise<boolean> {
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
      const url = URL.createObjectURL(imageBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${clubName}-auction.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("이미지를 저장했습니다! 인스타 스토리에서 사용하세요", {
        duration: 3000,
      });
      return true;
    } catch {
      toast.error("이미지 저장에 실패했습니다");
    }
  }

  // 최종 Fallback: 링크 복사
  await copyAuctionLink(auctionId);
  return false;
}

/**
 * 경매 링크만 클립보드에 복사
 */
export async function copyAuctionLink(auctionId: string): Promise<boolean> {
  const url = `${window.location.origin}/auctions/${auctionId}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("링크가 복사되었습니다!", { duration: 2000 });
    return true;
  } catch {
    toast.error("링크 복사에 실패했습니다");
    return false;
  }
}
