/**
 * 다날 휴대폰 본인인증 서버 SDK 래퍼.
 *
 * 환경변수:
 *  - DANAL_CPID: 가맹점 ID (다날에서 발급)
 *  - DANAL_CPPWD: 가맹점 비밀번호 (다날에서 발급)
 *
 * TODO: CPID 발급 후 다날 개발자 문서 참조하여 실제 엔드포인트·암호화 방식·응답 포맷 확정.
 * 현재는 스켈레톤 구조만 작성.
 */

export interface DanalCertResult {
  name: string;
  phone: string;
  birthday: string;  // YYYY-MM-DD
  gender: "male" | "female" | null;
  ci: string;
  di: string;
  foreigner: boolean;
}

export function getDanalConfig() {
  const cpid = process.env.DANAL_CPID;
  const cppwd = process.env.DANAL_CPPWD;

  if (!cpid || !cppwd) {
    throw new Error("다날 API 키가 설정되지 않았습니다 (.env의 DANAL_CPID/DANAL_CPPWD 확인).");
  }

  return { cpid, cppwd };
}

/**
 * 다날에 인증 TID를 요청한다.
 * TODO: CPID 발급 후 실제 다날 API 엔드포인트·파라미터·암호화 구현.
 */
export async function requestTid(callbackUrl: string): Promise<{ tid: string; authUrl: string }> {
  const { cpid } = getDanalConfig();

  // TODO: 다날 API 호출
  // 1. CPPWD 기반 AES-256-CBC 암호화로 요청 파라미터 생성
  // 2. POST https://wauth.teledit.com/... (정확한 URL은 다날 문서 참조)
  // 3. TID + 인증 팝업 URL 반환

  throw new Error(
    `다날 TID 발급 미구현. CPID=${cpid}, callbackUrl=${callbackUrl}. ` +
    "다날 개발자 문서 확인 후 구현 필요."
  );
}

/**
 * 다날 인증 결과를 복호화한다.
 * TODO: CPID 발급 후 실제 복호화 로직 구현.
 */
export function decryptResult(_encryptedData: string): DanalCertResult {
  // TODO: CPPWD 기반 AES-256-CBC 복호화
  // 결과에서 NAME, BIRTHDATE, SEX, PHONENUM, CI, DI, FOREIGNER 추출

  throw new Error(
    "다날 결과 복호화 미구현. 다날 개발자 문서 확인 후 구현 필요."
  );
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
