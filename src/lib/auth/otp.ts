// 서버 전용 - SMS OTP 발송 및 검증 유틸
// API Route에서만 import (service role key 필요한 DB 접근 포함)

import { SolapiMessageService } from "solapi";
import { createHash, randomInt, timingSafeEqual } from "crypto";

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 3;
const MAX_ATTEMPTS = 5;

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function normalizePhone(phone: string): string {
  return cleanPhone(phone);
}

export function isValidKoreanPhone(phone: string): boolean {
  const normalized = cleanPhone(phone);
  return /^01[016789]\d{7,8}$/.test(normalized);
}

export function generateOtpCode(): string {
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

export function hashOtpCode(code: string, phone: string): string {
  // phone을 salt로 사용해 phone_verifications 행 이동/복사 시에도 안전
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export function verifyOtpCode(code: string, phone: string, expectedHash: string): boolean {
  const actual = hashOtpCode(code, phone);
  const a = Buffer.from(actual);
  const b = Buffer.from(expectedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function getOtpExpiresAt(): Date {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}

export const OTP_CONFIG = {
  LENGTH: OTP_LENGTH,
  TTL_MINUTES: OTP_TTL_MINUTES,
  MAX_ATTEMPTS,
} as const;

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER_NUMBER;

  if (!apiKey || !apiSecret || !sender) {
    throw new Error("SOLAPI credentials are not configured");
  }

  const messageService = new SolapiMessageService(apiKey, apiSecret);
  const text = `[NightFlow] 인증번호 [${code}]\n${OTP_TTL_MINUTES}분 내 입력해주세요.`;

  await messageService.sendOne({
    to: cleanPhone(phone),
    from: cleanPhone(sender),
    text,
  });
}
