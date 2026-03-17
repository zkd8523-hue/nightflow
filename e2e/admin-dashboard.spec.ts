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

async function adminLogin(page: Page) {
  await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
}

async function ensureAdminAccess(page: Page, path: string): Promise<boolean> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes(path)) {
    return false;
  }
  return true;
}

// ============================================================
// 1. Admin Dashboard Home (/admin)
// ============================================================
test.describe("Admin Dashboard Home (/admin)", () => {
  test("1-1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("1-2. 일반 유저 접근 → 홈으로 리다이렉트", async ({ page }) => {
    await devLogin(page, USER_EMAIL, USER_PW);
    await page.goto("/admin");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("1-3. Admin 로그인 → 대시보드 헤더 표시", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("heading", { name: /Admin Dashboard/ })).toBeVisible();
    await expect(page.getByText("NightFlow 플랫폼 관리")).toBeVisible();
  });

  test("1-4. 통계 카드 8개 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const labels = ["전체 유저", "등록 MD", "총 경매", "등록 클럽", "총 거래액", "플랫폼 수수료", "총 거래", "노쇼"];
    for (const label of labels) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test("1-5. 빠른 바로가기 6개 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("heading", { name: "빠른 바로가기" })).toBeVisible();
    const links = ["MD 승인 관리", "유저 관리", "거래 관리", "정산 관리", "경매 관리", "클럽 등록 관리"];
    for (const label of links) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test("1-6. MD 승인 관리 링크 클릭 → /admin/mds 이동", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByText("MD 승인 관리").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/mds/);
  });

  test("1-7. 경매 관리 링크 클릭 → /admin/auctions 이동", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByText("경매 관리").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/auctions/);
  });

  test("1-8. 클럽 등록 관리 링크 클릭 → /admin/clubs 이동", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByText("클럽 등록 관리").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/clubs/);
  });

  test("1-9. 유저 관리 링크 클릭 → /admin/users 이동", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByText("유저 관리").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  test("1-10. 최근 활동 섹션 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("heading", { name: "최근 활동" })).toBeVisible();
    await expect(page.getByText("최근 활동 타임라인 (추후 구현 예정)")).toBeVisible();
  });
});

// ============================================================
// 2. Admin Clubs (/admin/clubs)
// ============================================================
test.describe("Admin Clubs (/admin/clubs)", () => {
  test("2-1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin/clubs");
    await expect(page).toHaveURL(/\/login/);
  });

  test("2-2. 일반 유저 접근 → 홈으로 리다이렉트", async ({ page }) => {
    await devLogin(page, USER_EMAIL, USER_PW);
    await page.goto("/admin/clubs");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("2-3. Admin 접근 → 페이지 헤더 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("heading", { name: "클럽 신청 관리" })).toBeVisible();
  });

  test("2-4. 탭 3개 렌더링 (승인 대기 / 승인 완료 / 거부됨)", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("tab", { name: /승인 대기/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /승인 완료/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /거부됨/ })).toBeVisible();
  });

  test("2-5. 승인 대기 탭이 기본 활성화", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const pendingTab = page.getByRole("tab", { name: /승인 대기/ });
    await expect(pendingTab).toHaveAttribute("data-state", "active");
  });

  test("2-6. 승인 대기 - 빈 상태 또는 클럽 카드 표시", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const hasEmpty = (await page.getByText("승인 대기 중인 클럽이 없습니다").count()) > 0;
    const hasCards = (await page.getByRole("button", { name: /승인/ }).count()) > 0;
    expect(hasEmpty || hasCards).toBe(true);
  });

  test("2-7. 승인 완료 탭 전환", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /승인 완료/ }).click();
    await expect(page.getByRole("tab", { name: /승인 완료/ })).toHaveAttribute("data-state", "active");

    const hasEmpty = (await page.getByText("승인된 클럽이 없습니다").count()) > 0;
    const hasCards = (await page.locator("[class*='bg-[#1C1C1E]']").count()) > 0;
    expect(hasEmpty || hasCards).toBe(true);
  });

  test("2-8. 거부됨 탭 전환", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /거부됨/ }).click();
    await expect(page.getByRole("tab", { name: /거부됨/ })).toHaveAttribute("data-state", "active");

    const hasEmpty = (await page.getByText("거부된 클럽이 없습니다").count()) > 0;
    const hasCards = (await page.getByText("거부 사유").count()) > 0;
    expect(hasEmpty || hasCards).toBe(true);
  });

  test("2-9. 승인 대기 클럽 - 승인/거부 버튼 표시", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const approveBtn = page.getByRole("button", { name: /승인/ }).first();
    if (!(await approveBtn.isVisible().catch(() => false))) {
      test.skip(true, "승인 대기 클럽 없음");
      return;
    }

    await expect(page.getByRole("button", { name: /거부/ }).first()).toBeVisible();
  });

  test("2-10. 거부 다이얼로그 열기/닫기", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const rejectBtn = page.getByRole("button", { name: /거부/ }).first();
    if (!(await rejectBtn.isVisible().catch(() => false))) {
      test.skip(true, "승인 대기 클럽 없음");
      return;
    }

    await rejectBtn.click();
    await expect(page.getByRole("heading", { name: "클럽 신청 거부" })).toBeVisible();

    // 거부 사유 미입력 시 거부하기 버튼 비활성화
    await expect(page.getByRole("button", { name: "거부하기" })).toBeDisabled();

    // 사유 입력 시 활성화
    await page.getByPlaceholder("예: 실제 클럽 확인 불가, 중복 신청 등").fill("e2e 테스트");
    await expect(page.getByRole("button", { name: "거부하기" })).toBeEnabled();

    // 취소로 닫기
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("heading", { name: "클럽 신청 거부" })).not.toBeVisible();
  });

  test("2-11. 뒤로가기 버튼 동작", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/clubs");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.locator("a[href='/']").first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL("http://localhost:3000/");
  });
});

// ============================================================
// 3. Admin Auctions (/admin/auctions)
// ============================================================
test.describe("Admin Auctions (/admin/auctions)", () => {
  test("3-1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin/auctions");
    await expect(page).toHaveURL(/\/login/);
  });

  test("3-2. 일반 유저 접근 → 홈으로 리다이렉트", async ({ page }) => {
    await devLogin(page, USER_EMAIL, USER_PW);
    await page.goto("/admin/auctions");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("3-3. Admin 접근 → 페이지 헤더 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("heading", { name: "경매 관리" })).toBeVisible();
    await expect(page.getByText("경매 현황 모니터링 및 관리 작업을 수행합니다.")).toBeVisible();
  });

  test("3-4. 탭 2개 렌더링 (경매 관리 / 실시간 입찰)", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("tab", { name: /경매 관리/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /실시간 입찰/ })).toBeVisible();
  });

  test("3-5. 경매 관리 탭 기본 활성화 + 통계 카드 4개", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("tab", { name: /경매 관리/ })).toHaveAttribute("data-state", "active");

    const labels = ["전체 경매", "진행중", "연락 대기", "연락 완료"];
    for (const label of labels) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("3-6. 검색 인풋 + 상태 필터 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByPlaceholder("클럽명, MD명, 경매 제목 검색...")).toBeVisible();
    // 상태 필터 Select
    await expect(page.locator("[role='combobox']").first()).toBeVisible();
  });

  test("3-7. 경매 목록 테이블 헤더 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByText("Auction / MD")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Price / Bids")).toBeVisible();
    await expect(page.getByText("Actions")).toBeVisible();
  });

  test("3-8. 검색 필터 동작 - 없는 키워드 입력 시 빈 결과", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByPlaceholder("클럽명, MD명, 경매 제목 검색...").fill("zzz_nonexistent_query_999");
    await expect(page.getByText("검색 결과가 없습니다")).toBeVisible();
  });

  test("3-9. 실시간 입찰 탭 전환", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /실시간 입찰/ }).click();
    await expect(page.getByRole("tab", { name: /실시간 입찰/ })).toHaveAttribute("data-state", "active");
  });

  test("3-10. 취소 가능 경매 - 취소 Sheet 열기/닫기", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    // "취소" 버튼이 있는 경매 찾기
    const cancelBtn = page.getByRole("button", { name: "취소" }).first();
    if (!(await cancelBtn.isVisible().catch(() => false))) {
      test.skip(true, "취소 가능한 경매 없음");
      return;
    }

    await cancelBtn.click();
    await expect(page.getByText("경매 강제 취소")).toBeVisible();
    await expect(page.getByText("이 경매의 모든 활성 입찰이 취소됩니다")).toBeVisible();

    // 사유 미입력 시 강제 취소 버튼 비활성화
    await expect(page.getByRole("button", { name: "강제 취소" })).toBeDisabled();

    // 사유 입력 시 활성화
    await page.getByPlaceholder("취소 사유를 입력해주세요...").fill("e2e 테스트 사유");
    await expect(page.getByRole("button", { name: "강제 취소" })).toBeEnabled();

    // 닫기
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByText("경매 강제 취소")).not.toBeVisible();
  });

  test("3-11. 삭제 가능 경매 (draft) - 삭제 Sheet 열기/닫기", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const deleteBtn = page.getByRole("button", { name: "삭제" }).first();
    if (!(await deleteBtn.isVisible().catch(() => false))) {
      test.skip(true, "삭제 가능한(draft) 경매 없음");
      return;
    }

    await deleteBtn.click();
    await expect(page.getByText("경매 삭제")).toBeVisible();
    await expect(page.getByText("이 경매가 영구적으로 삭제됩니다")).toBeVisible();

    // 닫기
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByText("경매 삭제")).not.toBeVisible();
  });

  test("3-12. 뒤로가기 버튼 → /admin 이동", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/auctions");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.locator("a[href='/admin']").first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin$/);
  });
});

// ============================================================
// 4. Admin Users (/admin/users)
// ============================================================
test.describe("Admin Users (/admin/users)", () => {
  test("4-1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/login/);
  });

  test("4-2. 일반 유저 접근 → 홈으로 리다이렉트", async ({ page }) => {
    await devLogin(page, USER_EMAIL, USER_PW);
    await page.goto("/admin/users");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("4-3. Admin 접근 → 유저 관리 헤더 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("heading", { name: "유저 관리" })).toBeVisible();
    await expect(page.getByText("전체 유저 조회, 차단 및 패널티 관리")).toBeVisible();
  });

  test("4-4. 통계 카드 3개 (전체 유저 / 차단됨 / 경고 대상)", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByText("전체 유저").first()).toBeVisible();
    await expect(page.getByText("차단됨").first()).toBeVisible();
    await expect(page.getByText("경고 대상").first()).toBeVisible();
  });

  test("4-5. 검색 인풋 + 상태 필터 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByPlaceholder("이름, 전화번호, 카카오ID 검색...")).toBeVisible();
    await expect(page.locator("[role='combobox']").first()).toBeVisible();
  });

  test("4-6. 유저 테이블 헤더 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("columnheader", { name: "이름" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "연락처" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /상태/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "액션" })).toBeVisible();
  });

  test("4-7. 검색 필터 동작 - 없는 이름 검색 시 빈 상태", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByPlaceholder("이름, 전화번호, 카카오ID 검색...").fill("zzz_nonexistent_user_999");
    await expect(page.getByText("유저가 없습니다")).toBeVisible();
  });

  test("4-8. 유저 목록 - 유저 행 클릭 시 상세 Sheet 열기", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    // 유저가 존재하는지 확인
    const userRow = page.locator("tbody tr").first();
    if (!(await userRow.isVisible().catch(() => false))) {
      test.skip(true, "유저 데이터 없음");
      return;
    }

    await userRow.click();
    await expect(page.getByText("유저 상세")).toBeVisible();
    await expect(page.getByText("기본 정보")).toBeVisible();
    await expect(page.getByText("패널티 현황")).toBeVisible();
  });

  test("4-9. 유저 상세 Sheet - 차단/차단 해제 버튼 표시", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const userRow = page.locator("tbody tr").first();
    if (!(await userRow.isVisible().catch(() => false))) {
      test.skip(true, "유저 데이터 없음");
      return;
    }

    await userRow.click();
    await expect(page.getByText("유저 상세")).toBeVisible();

    // 차단 또는 차단 해제 버튼 중 하나 존재
    const blockBtn = page.getByRole("button", { name: "유저 차단" });
    const unblockBtn = page.getByRole("button", { name: "차단 해제" });
    const hasBlock = (await blockBtn.count()) > 0;
    const hasUnblock = (await unblockBtn.count()) > 0;
    expect(hasBlock || hasUnblock).toBe(true);
  });

  test("4-10. 상태 필터 - '차단됨' 필터 적용", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    // 상태 필터 Select 열기
    await page.locator("[role='combobox']").first().click();
    await page.getByRole("option", { name: "차단됨" }).click();

    // 결과가 있으면 모두 차단됨 배지가 있거나, 빈 상태
    const isEmpty = (await page.getByText("유저가 없습니다").count()) > 0;
    if (!isEmpty) {
      await expect(page.getByText("차단됨").first()).toBeVisible();
    }
  });

  test("4-11. 테이블에 차단/차단 해제 인라인 버튼 존재", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/users");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const userRow = page.locator("tbody tr").first();
    if (!(await userRow.isVisible().catch(() => false))) {
      test.skip(true, "유저 데이터 없음");
      return;
    }

    // 행 내부에 차단 or 차단 해제 버튼
    const hasInlineBtn =
      (await page.locator("tbody").getByRole("button", { name: /차단/ }).count()) > 0;
    expect(hasInlineBtn).toBe(true);
  });
});

// ============================================================
// 5. Admin Bank Verifications (/admin/bank-verifications)
// ============================================================
test.describe("Admin Bank Verifications (/admin/bank-verifications)", () => {
  test("5-1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin/bank-verifications");
    await expect(page).toHaveURL(/\/login/);
  });

  test("5-2. Admin 접근 → 페이지 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/bank-verifications");
    if (!ok) { test.skip(true, "Admin 권한 없음 또는 페이지 없음"); return; }

    // 통계 카드: 검증 대기 / 처리 완료
    await expect(page.getByText("검증 대기").first()).toBeVisible();
    await expect(page.getByText("처리 완료").first()).toBeVisible();
  });

  test("5-3. 검증 대기 섹션 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/bank-verifications");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("heading", { name: "검증 대기 중" })).toBeVisible();

    const hasEmpty = (await page.getByText("검증 대기 중인 요청이 없습니다").count()) > 0;
    const hasTable = (await page.getByRole("button", { name: "검증" }).count()) > 0;
    expect(hasEmpty || hasTable).toBe(true);
  });

  test("5-4. 최근 처리 이력 섹션 렌더링", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/bank-verifications");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await expect(page.getByRole("heading", { name: "최근 처리 이력" })).toBeVisible();

    const hasEmpty = (await page.getByText("처리 이력이 없습니다").count()) > 0;
    const hasData = (await page.locator("table").nth(1).locator("tbody tr").count()) > 0;
    expect(hasEmpty || hasData).toBe(true);
  });

  test("5-5. 검증 버튼 클릭 → 계좌 검증 Sheet 열기", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin/bank-verifications");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    const verifyBtn = page.getByRole("button", { name: "검증" }).first();
    if (!(await verifyBtn.isVisible().catch(() => false))) {
      test.skip(true, "검증 대기 데이터 없음");
      return;
    }

    await verifyBtn.click();
    await expect(page.getByText("계좌 검증")).toBeVisible();
    await expect(page.getByText("검증 시 확인 사항")).toBeVisible();

    // 승인/거부 버튼 존재
    await expect(page.getByRole("button", { name: "승인" })).toBeVisible();
    await expect(page.getByRole("button", { name: "거부" })).toBeVisible();
  });
});

// ============================================================
// 6. Cross-page Navigation (다중 페이지 이동)
// ============================================================
test.describe("Admin Cross-page Navigation", () => {
  test("6-1. Admin Home → Clubs → Back → Home", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByText("클럽 등록 관리").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/clubs/);

    await page.locator("a[href='/']").first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("6-2. Admin Home → Users → Back → Home", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByText("유저 관리").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/users/);

    await page.locator("a[href='/admin']").first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("6-3. Admin Home → Auctions → Back → Admin Home", async ({ page }) => {
    await adminLogin(page);
    const ok = await ensureAdminAccess(page, "/admin");
    if (!ok) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByText("경매 관리").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/auctions/);

    await page.locator("a[href='/admin']").first().click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin$/);
  });
});
