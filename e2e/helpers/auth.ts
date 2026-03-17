import { Page } from "@playwright/test";

/**
 * Kakao OAuth를 우회하여 테스트용 세션을 직접 주입합니다.
 * 실제 OAuth 플로우 대신 Supabase 세션을 localStorage에 세팅합니다.
 */
export async function loginAsUser(page: Page, accessToken: string, refreshToken: string) {
  await page.goto("/");
  await page.evaluate(
    ({ accessToken, refreshToken }) => {
      const session = {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "bearer",
      };
      localStorage.setItem(
        `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`,
        JSON.stringify(session)
      );
    },
    { accessToken, refreshToken }
  );
  await page.reload();
}

/**
 * 로그아웃 처리
 */
export async function logout(page: Page) {
  await page.evaluate(() => {
    Object.keys(localStorage).forEach((key) => {
      if (key.includes("auth-token") || key.includes("supabase")) {
        localStorage.removeItem(key);
      }
    });
  });
}
