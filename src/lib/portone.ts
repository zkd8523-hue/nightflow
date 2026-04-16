/**
 * PortOne (아임포트) 서버 SDK 래퍼.
 * 통합 본인인증(PASS/NICE) 결과 조회용.
 *
 * 환경변수:
 *  - PORTONE_IMP_KEY: REST API 키
 *  - PORTONE_IMP_SECRET: REST API 시크릿
 *
 * 운영 전환 시 PortOne 대시보드에서 실제 키로 교체한다.
 */

const PORTONE_BASE = "https://api.iamport.kr";

export interface PortOneCertification {
  imp_uid: string;
  /** 실명 */
  name: string;
  /** 휴대폰 번호 (01012345678 형태) */
  phone: string;
  /** 생년월일 YYYY-MM-DD (PortOne은 YYYYMMDD이므로 변환 필요) */
  birthday: string;
  /** 성별 (male | female) */
  gender: "male" | "female" | null;
  /** 중복 가입 방지 키 */
  unique_key: string;
  /** 가맹점 내 식별 키 */
  unique_in_site: string;
  /** 외국인 여부 */
  foreigner: boolean;
  /** 인증 시각 (unix timestamp) */
  certified_at: number;
}

interface PortOneTokenResponse {
  code: number;
  message: string | null;
  response: {
    access_token: string;
    expired_at: number;
    now: number;
  } | null;
}

interface PortOneCertificationResponse {
  code: number;
  message: string | null;
  response: {
    imp_uid: string;
    name: string;
    phone: string;
    birthday: string;  // YYYYMMDD
    gender: string;    // "male" | "female"
    unique_key: string;
    unique_in_site: string;
    foreigner: boolean;
    certified_at: number;
  } | null;
}

export async function getAccessToken(): Promise<string> {
  const key = process.env.PORTONE_IMP_KEY;
  const secret = process.env.PORTONE_IMP_SECRET;
  if (!key || !secret) {
    throw new Error("PortOne API 키가 설정되지 않았습니다 (.env의 PORTONE_IMP_KEY/PORTONE_IMP_SECRET 확인).");
  }

  const res = await fetch(`${PORTONE_BASE}/users/getToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imp_key: key, imp_secret: secret }),
  });

  const json = (await res.json()) as PortOneTokenResponse;
  if (json.code !== 0 || !json.response) {
    throw new Error(`PortOne 토큰 발급 실패: ${json.message ?? "unknown"}`);
  }
  return json.response.access_token;
}

export async function getCertification(
  impUid: string,
  accessToken: string
): Promise<PortOneCertification> {
  const res = await fetch(`${PORTONE_BASE}/certifications/${impUid}`, {
    method: "GET",
    headers: { Authorization: accessToken },
  });

  const json = (await res.json()) as PortOneCertificationResponse;
  if (json.code !== 0 || !json.response) {
    throw new Error(`PortOne 인증 결과 조회 실패: ${json.message ?? "unknown"}`);
  }

  const raw = json.response;
  // birthday: "YYYYMMDD" → "YYYY-MM-DD"
  const birthday =
    raw.birthday && raw.birthday.length === 8
      ? `${raw.birthday.slice(0, 4)}-${raw.birthday.slice(4, 6)}-${raw.birthday.slice(6, 8)}`
      : raw.birthday;

  const gender =
    raw.gender === "male" || raw.gender === "female" ? raw.gender : null;

  return {
    imp_uid: raw.imp_uid,
    name: raw.name,
    phone: raw.phone,
    birthday,
    gender,
    unique_key: raw.unique_key,
    unique_in_site: raw.unique_in_site,
    foreigner: raw.foreigner,
    certified_at: raw.certified_at,
  };
}

export function isAdultFromBirthday(birthday: string): boolean {
  const [y, m, d] = birthday.split("-").map(Number);
  if (!y || !m || !d) return false;
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) {
    age--;
  }
  return age >= 19;
}
