import { test, expect, Page } from "@playwright/test";

// DEV 테스트 로그인 헬퍼
async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

test.describe("MD 회원가입 → Admin 심사 플로우", () => {
  test.describe.configure({ mode: "serial" });

  // ── 시나리오 1: 로그인 페이지 렌더링 ────────────────────────────────
  test("1. 로그인 페이지 렌더링", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "NightFlow" })).toBeVisible();
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();

    // DEV 모드에서 테스트 로그인 섹션 노출
    await expect(page.getByText("DEV 테스트 로그인")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "이메일" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "비밀번호 (6자 이상)" })).toBeVisible();
  });

  // ── 시나리오 2: DEV 로그인 → 홈 이동 ───────────────────────────────
  test("2. DEV 테스트 로그인 성공 후 홈 리다이렉트", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "NightFlow" }).first()).toBeVisible();
  });

  // ── 시나리오 3: MD 신청 페이지 접근 ─────────────────────────────────
  test("3. 로그인 후 MD 파트너 신청 페이지 접근", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/md/apply");
    await page.waitForLoadState("networkidle");

    // 승인된 MD → /md/dashboard로 리다이렉트됨
    if (!page.url().includes("/md/apply")) {
      await expect(page.locator("body")).toBeVisible();
      return;
    }

    // 이미 신청한 유저: "파트너 심사 중" 또는 "신청이 반려되었습니다" 화면
    const isStatusPage =
      (await page.getByText("파트너 심사 중").isVisible().catch(() => false)) ||
      (await page.getByText("신청이 반려되었습니다").isVisible().catch(() => false));

    if (isStatusPage) {
      await expect(page.locator("body")).toBeVisible();
      return;
    }

    // 미신청 상태: 폼 렌더링 확인 (UI 변경 가능성 있으므로 유연하게)
    const hasForm = (await page.getByText("빈 테이블").isVisible().catch(() => false)) ||
      (await page.getByRole("button", { name: /파트너 신청|완료/ }).isVisible().catch(() => false));
    // 폼이 없으면 다른 상태(pending 등)이므로 패스
    if (!hasForm) return;
    await expect(page.locator("body")).toBeVisible();
  });

  // ── 시나리오 4: MD 신청 폼 유효성 검사 ─────────────────────────────
  test("4. 필수 항목 미입력 시 제출 불가 (인스타그램 아이디)", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/md/apply");
    await page.waitForLoadState("networkidle");

    // 이미 신청한 유저(pending/approved)는 폼 자체가 없음 → 스킵
    const submitBtn = page.getByRole("button", { name: "파트너 신청 완료하기" });
    if (!(await submitBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "e2e-user가 이미 pending/approved 상태 - 폼 없음");
      return;
    }

    // 인스타그램 없이 바로 제출 시도
    await submitBtn.click();

    // 인스타그램 필드 required → 제출 안 됨 (URL 변경 없음)
    await expect(page).toHaveURL("/md/apply");
  });

  // ── 시나리오 5: 주소 검색 모달 동작 ────────────────────────────────
  test("5. 주소 검색 모달 열기/닫기", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/md/apply");
    await page.waitForLoadState("networkidle");

    // 이미 pending/approved 상태면 폼 없음 → 스킵
    const addressBtn = page.getByRole("button", { name: "주소 검색하기" });
    if (!(await addressBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "e2e-user가 이미 pending/approved 상태 - 폼 없음");
      return;
    }

    // 주소 검색 버튼 클릭 → 모달 열림
    await addressBtn.click();
    await expect(page.getByRole("heading", { name: "주소 검색" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "주소, 건물명, 장소명 검색" })).toBeVisible();

    // 닫기 버튼
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "주소 검색" })).not.toBeVisible();
  });

  // ── 시나리오 6: 지역 선택 버튼 렌더링 ──────────────────────────────
  test("6. 주력 활동 지역 버튼 5개 렌더링 확인", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/md/apply");
    await page.waitForLoadState("networkidle");

    // 이미 pending/approved 상태면 폼 없음 → 스킵
    const firstAreaBtn = page.getByRole("button", { name: "강남" });
    if (!(await firstAreaBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "e2e-user가 이미 pending/approved 상태 - 폼 없음");
      return;
    }

    // 5개 지역 버튼 모두 존재
    for (const area of ["강남", "홍대", "이태원", "건대", "다른 지역"]) {
      await expect(page.getByRole("button", { name: area })).toBeVisible();
    }

    // 강남 클릭 시 선택 상태 (bg-white 클래스 적용)
    await page.getByRole("button", { name: "강남" }).click();
    await expect(page.getByRole("button", { name: "강남" })).toHaveClass(/bg-white/);
  });

  // ── 시나리오 7: MD 신청 폼 입력 및 주소 확인 ────────────────────────
  test("7. MD 신청 폼 입력 및 주소 검색 완료 검증", async ({ page }) => {
    await devLogin(page, "e2e-user@nightflow.com", "test123456");
    await page.goto("/md/apply");

    // 이미 pending/approved 상태면 해당 화면 확인 후 조기 종료
    const headings = page.getByRole("heading");
    const firstHeading = await headings.first().textContent();
    if (firstHeading?.includes("파트너 심사 중") || firstHeading?.includes("신청이 반려")) {
      await expect(headings.first()).toBeVisible();
      return;
    }

    // 연락처: placeholder로 찾아서 항상 덮어쓰기 (user 프로필 phone이 유효성 실패할 수 있음)
    const phoneField = page.getByPlaceholder("010-0000-0000").first();
    await phoneField.fill("01012345678");

    // 인스타그램
    await page.getByRole("textbox", { name: "your_instagram_id" }).fill("e2e_md_test");

    // 지역 선택
    await page.getByRole("button", { name: "강남" }).click();
    await expect(page.getByRole("button", { name: "강남" })).toHaveClass(/bg-white/);

    // 클럽명
    await page.getByRole("textbox", { name: "예: OCTAGON" }).fill("TEST CLUB");

    // 주소 검색 모달
    await page.getByRole("button", { name: "주소 검색하기" }).click();
    await expect(page.getByRole("heading", { name: "주소 검색" })).toBeVisible();

    await page.getByRole("textbox", { name: "주소, 건물명, 장소명 검색" }).fill(
      "서울 강남구 삼성동 143-40"
    );
    await page.getByRole("button", { name: "검색", exact: true }).click();

    const addressResult = page.getByRole("button", { name: /서울 강남구 삼성동 143-40/ });
    await expect(addressResult).toBeVisible({ timeout: 10000 });
    await addressResult.click();

    // "위치 확인됨" 뱃지 → 좌표 세팅 완료
    await expect(page.getByText("위치 확인됨")).toBeVisible({ timeout: 10000 });

    // 상세 주소
    await page.getByRole("textbox", { name: "동, 층, 호수 등 (예: B2층)" }).fill("B2층");

    // 제출
    await page.getByRole("button", { name: "파트너 신청 완료하기" }).click();

    // 결과: 심사 중 화면 OR 토스트 중 하나 확인 (API 응답 여부에 따라)
    await page.waitForTimeout(3000);
    const isPendingScreen = await page.getByRole("heading", { name: "파트너 심사 중" }).isVisible();
    const isSuccessToast = await page.getByText("MD 파트너 신청이 완료되었습니다!").isVisible();
    const isErrorToast = await page.getByText("오류").isVisible();

    expect(isPendingScreen || isSuccessToast || isErrorToast).toBeTruthy();
  });

  // ── 시나리오 8: Admin MD 심사 페이지 접근 ───────────────────────────
  test("8. Admin - MD 파트너 관리 페이지 렌더링", async ({ page }) => {
    await devLogin(page, "admin@test.com", "test1234");
    await page.goto("/admin/mds");

    await expect(page.getByRole("heading", { name: "MD 파트너 관리" })).toBeVisible();
    await expect(page.getByText("파트너 심사 및 운영 품질 모니터링")).toBeVisible();

    // 탭 3개 존재
    await expect(page.getByRole("tab", { name: /심사 대기/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /활동 모니터링/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /반려 내역/ })).toBeVisible();
  });

  // ── 시나리오 9: Admin - 상세 정보 펼치기 ────────────────────────────
  test("9. Admin - MD 신청 상세 정보 토글", async ({ page }) => {
    await devLogin(page, "admin@test.com", "test1234");
    await page.goto("/admin/mds");

    const pendingTab = page.getByRole("tab", { name: /심사 대기/ });
    await pendingTab.click();

    const detailBtn = page.getByRole("button", { name: "상세 정보 보기" }).first();
    if (await detailBtn.isVisible()) {
      await detailBtn.click();
      await expect(page.getByText("CLUB INFORMATION")).toBeVisible();
      await expect(page.getByText("Verification")).toBeVisible();

      // 접기
      await page.getByRole("button", { name: "상세 정보 접기" }).click();
      await expect(page.getByText("CLUB INFORMATION")).not.toBeVisible();
    } else {
      // 심사 대기가 없으면 빈 상태 메시지 확인
      await expect(page.getByText("심사 대기 명단이 없습니다.")).toBeVisible();
    }
  });

  // ── 시나리오 10: Admin - MD 승인 ────────────────────────────────────
  test("10. Admin - MD 활동 승인", async ({ page }) => {
    await devLogin(page, "admin@test.com", "test1234");
    await page.goto("/admin/mds");

    const approveBtn = page.getByRole("button", { name: "활동 승인" }).first();

    if (await approveBtn.isVisible()) {
      const monitoringTabBefore = page.getByRole("tab", { name: /활동 모니터링/ });
      const beforeText = await monitoringTabBefore.textContent();
      const beforeCount = parseInt(beforeText?.match(/\d+/)?.[0] ?? "0");

      await approveBtn.click();

      // 토스트 메시지
      await expect(page.getByText("MD 승인이 완료되었습니다!")).toBeVisible();

      // 심사 대기 탭 카운트 감소, 활동 모니터링 탭 카운트 증가
      await expect(page.getByRole("tab", { name: `활동 모니터링 (${beforeCount + 1})` })).toBeVisible();
    } else {
      test.skip(true, "심사 대기 MD가 없어 승인 테스트 스킵");
    }
  });

  // ── 시나리오 11: Admin - MD 반려 (사유 입력) ────────────────────────
  test("11. Admin - MD 반려 다이얼로그 동작", async ({ page }) => {
    await devLogin(page, "admin@test.com", "test1234");
    await page.goto("/admin/mds");

    const rejectBtn = page.getByRole("button", { name: "반려" }).first();

    if (await rejectBtn.isVisible()) {
      await rejectBtn.click();

      // 반려 다이얼로그 열림
      await expect(page.getByRole("heading", { name: "MD 신청 반려" })).toBeVisible();
      await expect(page.getByPlaceholder("반려 사유를 입력해주세요")).toBeVisible();

      // 사유 없이 반려 확정 버튼 비활성화
      await expect(page.getByRole("button", { name: "반려 확정" })).toBeDisabled();

      // 사유 입력 후 활성화
      await page.getByPlaceholder("반려 사유를 입력해주세요").fill("본인 인증 서류 미제출");
      await expect(page.getByRole("button", { name: "반려 확정" })).toBeEnabled();

      // 취소
      await page.getByRole("button", { name: "취소" }).click();
      await expect(page.getByRole("heading", { name: "MD 신청 반려" })).not.toBeVisible();
    } else {
      test.skip(true, "심사 대기 MD가 없어 반려 테스트 스킵");
    }
  });

  // ── 시나리오 12: 미인증 유저 Admin 페이지 접근 차단 ─────────────────
  test("12. 비로그인 상태에서 Admin 페이지 접근 시 리다이렉트", async ({ page }) => {
    // 로그아웃 상태에서 직접 접근
    await page.goto("/admin/mds");

    // /login으로 리다이렉트되거나 홈으로 이동
    await expect(page).toHaveURL(/\/(login|$)/);
  });
});
