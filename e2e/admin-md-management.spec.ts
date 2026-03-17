import { test, expect, Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PW = "test1234";
const USER_EMAIL = "e2e-user@nightflow.com";
const USER_PW = "test123456";

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

async function gotoAdminMds(page: Page) {
  await page.goto("/admin/mds");
  await page.waitForLoadState("networkidle");
}

test.describe("Admin - MD 파트너 관리 (/admin/mds)", () => {

  // ────────────────────────────────────────────────────────────────────
  // 접근 제어
  // ────────────────────────────────────────────────────────────────────

  test("1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin/mds");
    await expect(page).toHaveURL(/\/login/);
  });

  test("2. 일반 유저 접근 → 홈으로 리다이렉트", async ({ page }) => {
    await devLogin(page, USER_EMAIL, USER_PW);
    await page.goto("/admin/mds");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("3. Admin 로그인 후 페이지 정상 접근", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);

    // Admin이 아니면 홈으로 리다이렉트 → 스킵
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, `${ADMIN_EMAIL}이 admin role 아님 - DB에서 role='admin' 설정 필요`);
      return;
    }

    await expect(page.getByRole("heading", { name: "MD 파트너 관리" })).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────
  // 페이지 구조
  // ────────────────────────────────────────────────────────────────────

  test("4. 헤더 및 통계 카드 렌더링", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    // 헤더
    await expect(page.getByRole("heading", { name: "MD 파트너 관리" })).toBeVisible();
    await expect(page.getByText("파트너 심사 및 운영 품질 모니터링")).toBeVisible();

    // 통계 카드: 파트너, 심사 대기, 평균 낙찰률
    await expect(page.getByText("파트너").first()).toBeVisible();
    await expect(page.getByText("심사 대기").first()).toBeVisible();
    await expect(page.getByText("평균 낙찰률").first()).toBeVisible();
  });

  test("5. 탭 3개 렌더링 (심사 대기 / 활동 모니터링 / 반려 내역)", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await expect(page.getByRole("tab", { name: /심사 대기/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /활동 모니터링/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /반려 내역/ })).toBeVisible();
  });

  test("6. 심사 대기 탭이 기본 활성화", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const pendingTab = page.getByRole("tab", { name: /심사 대기/ });
    await expect(pendingTab).toHaveAttribute("data-state", "active");
  });

  // ────────────────────────────────────────────────────────────────────
  // 심사 대기 탭
  // ────────────────────────────────────────────────────────────────────

  test("7. 심사 대기 - 데이터 없을 때 빈 상태 메시지", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const pendingTab = page.getByRole("tab", { name: /심사 대기/ });
    await pendingTab.click();

    const hasCard = (await page.getByRole("button", { name: "활동 승인" }).count()) > 0;
    if (!hasCard) {
      await expect(page.getByText("심사 대기 명단이 없습니다.")).toBeVisible();
    } else {
      // 카드가 있으면 이름/연락처/지역 정보 중 하나 이상 표시
      const firstCard = page.locator(".bg-\\[\\#1C1C1E\\]").first();
      await expect(firstCard).toBeVisible();
    }
  });

  test("8. 심사 대기 카드 - MD 기본 정보 표시 확인", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const approveBtn = page.getByRole("button", { name: "활동 승인" }).first();
    if (!(await approveBtn.isVisible())) {
      test.skip(true, "심사 대기 MD 없음");
      return;
    }

    // 카드에 반려 버튼도 함께 표시
    await expect(page.getByRole("button", { name: "반려" }).first()).toBeVisible();
    // 상세 정보 보기 토글 버튼
    await expect(page.getByRole("button", { name: "상세 정보 보기" }).first()).toBeVisible();
  });

  test("9. 상세 정보 펼치기 / 접기 토글", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const detailBtn = page.getByRole("button", { name: "상세 정보 보기" }).first();
    if (!(await detailBtn.isVisible())) {
      test.skip(true, "심사 대기 MD 없음");
      return;
    }

    // 펼치기
    await detailBtn.click();
    await expect(page.getByText("CLUB INFORMATION")).toBeVisible();
    await expect(page.getByText("Verification")).toBeVisible();

    // 접기
    await page.getByRole("button", { name: "상세 정보 접기" }).first().click();
    await expect(page.getByText("CLUB INFORMATION")).not.toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────
  // 반려 다이얼로그
  // ────────────────────────────────────────────────────────────────────

  test("10. 반려 버튼 클릭 → 다이얼로그 열림", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const rejectBtn = page.getByRole("button", { name: "반려" }).first();
    if (!(await rejectBtn.isVisible())) {
      test.skip(true, "심사 대기 MD 없음");
      return;
    }

    await rejectBtn.click();

    // 다이얼로그 렌더링
    await expect(page.getByRole("heading", { name: "MD 신청 반려" })).toBeVisible();
    await expect(page.getByPlaceholder("반려 사유를 입력해주세요 (예: 본인 인증 서류 미제출)")).toBeVisible();
  });

  test("11. 반려 다이얼로그 - 사유 없이 반려 확정 버튼 비활성화", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const rejectBtn = page.getByRole("button", { name: "반려" }).first();
    if (!(await rejectBtn.isVisible())) {
      test.skip(true, "심사 대기 MD 없음");
      return;
    }

    await rejectBtn.click();
    await expect(page.getByRole("heading", { name: "MD 신청 반려" })).toBeVisible();

    // 사유 미입력 → 반려 확정 비활성화
    await expect(page.getByRole("button", { name: "반려 확정" })).toBeDisabled();
  });

  test("12. 반려 다이얼로그 - 사유 입력 시 반려 확정 활성화", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const rejectBtn = page.getByRole("button", { name: "반려" }).first();
    if (!(await rejectBtn.isVisible())) {
      test.skip(true, "심사 대기 MD 없음");
      return;
    }

    await rejectBtn.click();
    await page.getByPlaceholder("반려 사유를 입력해주세요 (예: 본인 인증 서류 미제출)").fill("본인 인증 서류 미제출");
    await expect(page.getByRole("button", { name: "반려 확정" })).toBeEnabled();
  });

  test("13. 반려 다이얼로그 - 취소 버튼으로 닫기", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const rejectBtn = page.getByRole("button", { name: "반려" }).first();
    if (!(await rejectBtn.isVisible())) {
      test.skip(true, "심사 대기 MD 없음");
      return;
    }

    await rejectBtn.click();
    await expect(page.getByRole("heading", { name: "MD 신청 반려" })).toBeVisible();

    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("heading", { name: "MD 신청 반려" })).not.toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────
  // 탭 전환
  // ────────────────────────────────────────────────────────────────────

  test("14. 활동 모니터링 탭 클릭 → 빈 상태 또는 목록 렌더링", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    // 활성 탭으로 전환됨
    await expect(
      page.getByRole("tab", { name: /활동 모니터링/ })
    ).toHaveAttribute("data-state", "active");

    // 목록 또는 빈 상태 메시지
    const hasContent =
      (await page.getByText("활동 중인 MD가 없습니다.").count()) > 0 ||
      (await page.getByRole("link", { name: /상세 \/ 제재/ }).count()) > 0 ||
      (await page.locator(".bg-\\[\\#1C1C1E\\]").count()) > 0;
    expect(hasContent).toBe(true);
  });

  test("15. 반려 내역 탭 클릭 → 빈 상태 또는 반려 사유 표시", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await page.getByRole("tab", { name: /반려 내역/ }).click();

    await expect(
      page.getByRole("tab", { name: /반려 내역/ })
    ).toHaveAttribute("data-state", "active");

    const hasEmpty = (await page.getByText("반려 내역이 없습니다.").count()) > 0;
    const hasRejected = (await page.getByText("반려 사유").count()) > 0;
    expect(hasEmpty || hasRejected).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  // 승인 플로우 (실제 DB 변경 발생 - pending MD 있을 때만)
  // ────────────────────────────────────────────────────────────────────

  test("16. 활동 승인 → 토스트 표시 + 해당 카드 탭 이동", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const approveBtn = page.getByRole("button", { name: "활동 승인" }).first();
    if (!(await approveBtn.isVisible())) {
      test.skip(true, "심사 대기 MD 없음");
      return;
    }

    // 승인 전 활동 모니터링 탭 카운트 기록
    const monitoringTabText = await page.getByRole("tab", { name: /활동 모니터링/ }).textContent();
    const beforeCount = parseInt(monitoringTabText?.match(/\d+/)?.[0] ?? "0");

    await approveBtn.click();

    // 성공 토스트
    await expect(page.getByText("MD 승인이 완료되었습니다!")).toBeVisible({ timeout: 5000 });

    // 활동 모니터링 카운트 증가 확인
    await expect(
      page.getByRole("tab", { name: new RegExp(`활동 모니터링 \\(${beforeCount + 1}\\)`) })
    ).toBeVisible({ timeout: 5000 });
  });

  test("17. 반려 확정 → 토스트 + 반려 내역 탭 카운트 증가", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const rejectBtn = page.getByRole("button", { name: "반려" }).first();
    if (!(await rejectBtn.isVisible())) {
      test.skip(true, "심사 대기 MD 없음");
      return;
    }

    // 반려 전 반려 내역 탭 카운트
    const rejectedTabText = await page.getByRole("tab", { name: /반려 내역/ }).textContent();
    const beforeCount = parseInt(rejectedTabText?.match(/\d+/)?.[0] ?? "0");

    await rejectBtn.click();
    await page.getByPlaceholder("반려 사유를 입력해주세요 (예: 본인 인증 서류 미제출)").fill("e2e 테스트 반려");
    await page.getByRole("button", { name: "반려 확정" }).click();

    // 성공 토스트
    await expect(page.getByText("반려 처리되었습니다.")).toBeVisible({ timeout: 5000 });

    // 반려 내역 탭 카운트 증가
    await expect(
      page.getByRole("tab", { name: new RegExp(`반려 내역 \\(${beforeCount + 1}\\)`) })
    ).toBeVisible({ timeout: 5000 });
  });

  // ────────────────────────────────────────────────────────────────────
  // MD 상세 페이지 접근
  // ────────────────────────────────────────────────────────────────────

  test("18. 활동 모니터링 탭 - '상세 / 제재' 링크 클릭 → 상세 페이지 이동", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await gotoAdminMds(page);
    if (!page.url().includes("/admin/mds")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    const detailLink = page.getByRole("link", { name: /상세 \/ 제재/ }).first();
    if (!(await detailLink.isVisible())) {
      test.skip(true, "활동 중인 MD 없음");
      return;
    }

    await detailLink.click();
    await page.waitForLoadState("networkidle");

    // /admin/mds/{id} 페이지로 이동
    await expect(page).toHaveURL(/\/admin\/mds\/.+/);
  });
});
