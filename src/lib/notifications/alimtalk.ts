// 서버 전용 - SOLAPI 알림톡 발송 모듈
// API Route, Server Component에서만 import

import { SolapiMessageService } from "solapi";

const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY;
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET;
const SOLAPI_SENDER_NUMBER = process.env.SOLAPI_SENDER_NUMBER;
const SOLAPI_PFID = process.env.SOLAPI_PFID;

// Template ID는 카카오 승인 후 SOLAPI 대시보드에서 확인하여 env에 설정
export const ALIMTALK_TEMPLATES = {
  AUCTION_STARTED: process.env.ALIMTALK_TPL_AUCTION_STARTED || "",
  AUCTION_WON: process.env.ALIMTALK_TPL_AUCTION_WON || "",
  VISIT_CONFIRMED: process.env.ALIMTALK_TPL_VISIT_CONFIRMED || "",
  OUTBID: process.env.ALIMTALK_TPL_OUTBID || "",
  CLOSING_SOON: process.env.ALIMTALK_TPL_CLOSING_SOON || "",
  NOSHOW_BANNED: process.env.ALIMTALK_TPL_NOSHOW_BANNED || "",
  CONTACT_DEADLINE_WARNING: process.env.ALIMTALK_TPL_CONTACT_DEADLINE_WARNING || "",
  FALLBACK_WON: process.env.ALIMTALK_TPL_FALLBACK_WON || "",
  MD_NEW_MATCH: process.env.ALIMTALK_TPL_MD_NEW_MATCH || "",
  EARLYBIRD_DDAY_REMINDER: process.env.ALIMTALK_TPL_EARLYBIRD_DDAY_REMINDER || "",
  MD_NOSHOW_CHECK: process.env.ALIMTALK_TPL_MD_NOSHOW_CHECK || "",
} as const;

function getMessageService(): SolapiMessageService {
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET) {
    throw new Error("SOLAPI credentials are not configured");
  }
  return new SolapiMessageService(SOLAPI_API_KEY, SOLAPI_API_SECRET);
}

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

interface SendAlimtalkParams {
  to: string;
  templateId: string;
  variables: Record<string, string>;
}

export async function sendAlimtalk({
  to,
  templateId,
  variables,
}: SendAlimtalkParams) {
  if (!SOLAPI_PFID || !SOLAPI_SENDER_NUMBER) {
    throw new Error("SOLAPI PFID or sender number is not configured");
  }
  if (!templateId) {
    throw new Error("Alimtalk template ID is not configured");
  }

  const messageService = getMessageService();

  // SOLAPI 템플릿 변수 포맷: #{변수명}
  const formattedVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    formattedVars[`#{${key}}`] = value;
  }

  const result = await messageService.sendOne({
    to: cleanPhone(to),
    from: cleanPhone(SOLAPI_SENDER_NUMBER),
    kakaoOptions: {
      pfId: SOLAPI_PFID,
      templateId,
      variables: formattedVars,
      disableSms: true,
    },
  });

  return result;
}

// ---- 이벤트별 convenience 함수 ----

export async function sendAuctionStartedNotification(
  phone: string,
  vars: { clubName: string; auctionTitle: string; auctionUrl: string }
) {
  return sendAlimtalk({
    to: phone,
    templateId: ALIMTALK_TEMPLATES.AUCTION_STARTED,
    variables: vars,
  });
}

export async function sendAuctionWonNotification(
  phone: string,
  vars: {
    clubName: string;
    winningPrice: string;
    auctionUrl: string;
  }
) {
  return sendAlimtalk({
    to: phone,
    templateId: ALIMTALK_TEMPLATES.AUCTION_WON,
    variables: vars,
  });
}

export async function sendVisitConfirmedNotification(
  phone: string,
  vars: { clubName: string; eventDate: string }
) {
  return sendAlimtalk({
    to: phone,
    templateId: ALIMTALK_TEMPLATES.VISIT_CONFIRMED,
    variables: vars,
  });
}

async function sendSms(to: string, text: string) {
  if (!SOLAPI_SENDER_NUMBER) {
    throw new Error("SOLAPI sender number is not configured");
  }
  const messageService = getMessageService();
  return messageService.sendOne({
    to: cleanPhone(to),
    from: cleanPhone(SOLAPI_SENDER_NUMBER),
    text,
  });
}

export async function sendOutbidNotification(
  phone: string,
  vars: { clubName: string; newBidAmount: string; auctionUrl: string }
) {
  return sendSms(
    phone,
    `[NightFlow] ${vars.clubName} 경매에서 더 높은 입찰이 들어왔습니다.\n현재 최고가: ${vars.newBidAmount}\n재입찰: https://${vars.auctionUrl}`
  );
}

export async function sendClosingSoonNotification(
  phone: string,
  vars: { clubName: string; currentBid: string; auctionUrl: string; remainingTime: string }
) {
  return sendAlimtalk({
    to: phone,
    templateId: ALIMTALK_TEMPLATES.CLOSING_SOON,
    variables: vars,
  });
}

export async function sendContactDeadlineWarning(
  phone: string,
  vars: { clubName: string; remainingMinutes: string; auctionUrl: string }
) {
  return sendAlimtalk({
    to: phone,
    templateId: ALIMTALK_TEMPLATES.CONTACT_DEADLINE_WARNING,
    variables: vars,
  });
}

export async function sendNoshowNotification(
  phone: string,
  vars: { userName: string; strikeCount: string; penaltyStatus: string }
) {
  return sendAlimtalk({
    to: phone,
    templateId: ALIMTALK_TEMPLATES.NOSHOW_BANNED,
    variables: vars,
  });
}

export async function sendEarlybirdDdayReminder(
  phone: string,
  vars: { clubName: string; eventTime: string }
) {
  return sendAlimtalk({
    to: phone,
    templateId: ALIMTALK_TEMPLATES.EARLYBIRD_DDAY_REMINDER,
    variables: vars,
  });
}

export async function sendFallbackWonNotification(
  phone: string,
  vars: {
    clubName: string;
    userName: string;
    winningPrice: string;
    contactDeadline: string;
    auctionUrl: string;
  }
) {
  return sendSms(
    phone,
    `[NightFlow] ${vars.userName}님, ${vars.clubName} 경매에서 차순위 낙찰되셨습니다!\n낙찰가: ${vars.winningPrice}\n연락 마감: ${vars.contactDeadline}\n확인: https://${vars.auctionUrl}`
  );
}
