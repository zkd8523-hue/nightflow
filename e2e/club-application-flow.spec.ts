import { test, expect, Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PW = "test1234";
const MD_EMAIL = "e2e-md@nightflow.com";
const MD_PW = "test123456";

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  // 로그인 성공 시 "/" 로 이동, 실패 시 "/login"에 머묾
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {
    // 로그인 실패 (계정 미존재/비밀번호 불일치) - 테스트에서 skip 처리
  });
}

/** MD 로그인 성공 여부 반환 */
async function mdLogin(page: Page): Promise<boolean> {
  await devLogin(page, MD_EMAIL, MD_PW);
  return !page.url().includes("/login");
}

async function adminLogin(page: Page) {
  await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
}

// ============================================================
// 1. MD 클럽 신청 페이지 (MD 측)
// ============================================================
test.describe("MD 클럽 신청 (/md/clubs)", () => {
  test("1-1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/md/clubs");
    await expect(page).toHaveURL(/\/login/);
  });

  test("1-2. MD 로그인 → 나의 클럽 페이지 렌더링", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs");
    await page.waitForLoadState("networkidle");

    // MD가 아니면 리다이렉트됨
    if (!page.url().includes("/md/clubs")) {
      test.skip(true, "MD 권한 없음");
      return;
    }

    await expect(page.getByRole("heading", { name: "나의 클럽" })).toBeVisible();
    await expect(page.getByText(/신청한 클럽 \d+개/)).toBeVisible();
  });

  test("1-3. 클럽 추가 버튼 → /md/clubs/new 이동", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs")) {
      test.skip(true, "MD 권한 없음");
      return;
    }

    await page.getByRole("link", { name: /추가/ }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/md\/clubs\/new/);
  });

  test("1-4. 빈 상태 - 클럽 신청 안내 문구", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs")) {
      test.skip(true, "MD 권한 없음");
      return;
    }

    // 클럽이 있으면 빈 상태가 아니므로 스킵
    const hasClubs = (await page.locator("[class*='bg-[#1C1C1E]']").count()) > 0;
    if (hasClubs) {
      test.skip(true, "이미 등록된 클럽이 있음");
      return;
    }

    await expect(page.getByText("신청한 클럽이 없습니다")).toBeVisible();
    await expect(page.getByText("관리자 승인 후")).toBeVisible();
    await expect(page.getByRole("link", { name: "클럽 신청하기" })).toBeVisible();
  });
});

// ============================================================
// 2. MD 클럽 신청 폼 (/md/clubs/new)
// ============================================================
test.describe("MD 클럽 신청 폼 (/md/clubs/new)", () => {
  test("2-1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/md/clubs/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("2-2. 클럽 신청 페이지 헤더 렌더링", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs/new");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs/new")) {
      test.skip(true, "MD 권한 없음 또는 미승인 MD");
      return;
    }

    await expect(page.getByRole("heading", { name: "클럽 신청" })).toBeVisible();
    await expect(page.getByText("관리자 승인 후 사용 가능합니다")).toBeVisible();
  });

  test("2-3. 클럽 신청 폼 필수 필드 렌더링", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs/new");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs/new")) {
      test.skip(true, "MD 권한 없음 또는 미승인 MD");
      return;
    }

    // 기본 정보 섹션
    await expect(page.getByText("기본 정보")).toBeVisible();
    await expect(page.getByText("클럽 이름")).toBeVisible();
    await expect(page.getByText("지역 *")).toBeVisible();

    // 지역 버튼 (강남/홍대/이태원)
    await expect(page.getByRole("button", { name: "강남" })).toBeVisible();
    await expect(page.getByRole("button", { name: "홍대" })).toBeVisible();
    await expect(page.getByRole("button", { name: "이태원" })).toBeVisible();
  });

  test("2-4. 신청 버튼 텍스트가 '클럽 신청하기'", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs/new");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs/new")) {
      test.skip(true, "MD 권한 없음 또는 미승인 MD");
      return;
    }

    // Floating submit 버튼
    await expect(page.getByRole("button", { name: "클럽 신청하기" })).toBeVisible();
  });

  test("2-5. 뒤로 버튼 → /md/clubs 이동", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs/new");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs/new")) {
      test.skip(true, "MD 권한 없음 또는 미승인 MD");
      return;
    }

    await page.getByRole("link", { name: "뒤로" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/md\/clubs$/);
  });
});

// ============================================================
// 3. Admin 클럽 신청 관리 (/admin/clubs)
// ============================================================
test.describe("Admin 클럽 신청 관리 (/admin/clubs)", () => {
  test("3-1. 비로그인 접근 → /login 리다이렉트", async ({ page }) => {
    await page.goto("/admin/clubs");
    await expect(page).toHaveURL(/\/login/);
  });

  test("3-2. Admin 접근 → '클럽 신청 관리' 헤더 표시", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await expect(page.getByRole("heading", { name: "클럽 신청 관리" })).toBeVisible();
  });

  test("3-3. Admin 직접 등록 폼이 제거되었는지 확인", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    // "새 클럽 등록" 폼이 없어야 함
    await expect(page.getByText("새 클럽 등록")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "등록하기" })).not.toBeVisible();
  });

  test("3-4. 탭 3개 렌더링 (승인 대기 / 승인 완료 / 거부됨)", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await expect(page.getByRole("tab", { name: /승인 대기/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /승인 완료/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /거부됨/ })).toBeVisible();
  });

  test("3-5. 승인 대기 탭이 기본 활성화", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const pendingTab = page.getByRole("tab", { name: /승인 대기/ });
    await expect(pendingTab).toHaveAttribute("data-state", "active");
  });

  test("3-6. 승인 대기 클럽 - 승인/거부 버튼 표시", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    // pending 클럽이 있으면 승인/거부 버튼 확인
    const approveBtn = page.getByRole("button", { name: /승인/ }).first();
    if (!(await approveBtn.isVisible().catch(() => false))) {
      // 빈 상태 메시지 확인
      await expect(page.getByText("승인 대기 중인 클럽이 없습니다")).toBeVisible();
      return;
    }

    await expect(page.getByRole("button", { name: /거부/ }).first()).toBeVisible();
  });

  test("3-7. 승인 대기 클럽 - 신청자 MD 정보 표시", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const approveBtn = page.getByRole("button", { name: /승인/ }).first();
    if (!(await approveBtn.isVisible().catch(() => false))) {
      test.skip(true, "승인 대기 클럽 없음");
      return;
    }

    // 신청자 MD 정보가 표시되어야 함
    await expect(page.getByText(/신청자:/).first()).toBeVisible();
  });

  test("3-8. 거부 다이얼로그 - 사유 미입력 시 비활성화", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    const rejectBtn = page.getByRole("button", { name: /거부/ }).first();
    if (!(await rejectBtn.isVisible().catch(() => false))) {
      test.skip(true, "승인 대기 클럽 없음");
      return;
    }

    await rejectBtn.click();
    await expect(page.getByRole("heading", { name: "클럽 신청 거부" })).toBeVisible();

    // 사유 미입력 시 거부하기 비활성화
    await expect(page.getByRole("button", { name: "거부하기" })).toBeDisabled();

    // 사유 입력 시 활성화
    await page.getByPlaceholder("예: 실제 클럽 확인 불가, 중복 신청 등").fill("e2e 테스트");
    await expect(page.getByRole("button", { name: "거부하기" })).toBeEnabled();

    // 취소로 닫기
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("heading", { name: "클럽 신청 거부" })).not.toBeVisible();
  });

  test("3-9. 승인 완료 탭 전환", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await page.getByRole("tab", { name: /승인 완료/ }).click();
    await expect(page.getByRole("tab", { name: /승인 완료/ })).toHaveAttribute("data-state", "active");

    const hasEmpty = (await page.getByText("승인된 클럽이 없습니다").count()) > 0;
    const hasCards = (await page.locator("[class*='bg-[#1C1C1E]']").count()) > 0;
    expect(hasEmpty || hasCards).toBe(true);
  });

  test("3-10. 거부됨 탭 전환", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/clubs")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await page.getByRole("tab", { name: /거부됨/ }).click();
    await expect(page.getByRole("tab", { name: /거부됨/ })).toHaveAttribute("data-state", "active");

    const hasEmpty = (await page.getByText("거부된 클럽이 없습니다").count()) > 0;
    const hasCards = (await page.getByText("거부 사유").count()) > 0;
    expect(hasEmpty || hasCards).toBe(true);
  });
});

// ============================================================
// 4. MD 클럽 목록 - 상태별 UI (ClubList)
// ============================================================
test.describe("MD 클럽 목록 - 상태별 UI", () => {
  test("4-1. 클럽 카드에 StatusBadge 표시", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs")) {
      test.skip(true, "MD 권한 없음");
      return;
    }

    // 클럽이 없으면 스킵 (빈 상태 메시지로 확인)
    const isEmpty = (await page.getByText("신청한 클럽이 없습니다").count()) > 0;
    if (isEmpty) {
      test.skip(true, "등록된 클럽 없음");
      return;
    }

    // pending/approved/rejected 중 하나의 배지가 있어야 함
    const hasBadge =
      (await page.getByText("대기중").count()) > 0 ||
      (await page.getByText("승인됨").count()) > 0 ||
      (await page.getByText("거부됨").count()) > 0;
    expect(hasBadge).toBe(true);
  });

  test("4-2. approved 클럽은 삭제 버튼 없음", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs")) {
      test.skip(true, "MD 권한 없음");
      return;
    }

    // approved 배지가 있는 클럽 카드 찾기
    const approvedBadge = page.getByText("승인됨").first();
    if (!(await approvedBadge.isVisible().catch(() => false))) {
      test.skip(true, "승인된 클럽 없음");
      return;
    }

    // 승인된 클럽의 카드에는 삭제 아이콘이 없거나 비활성 상태
    // (수정 버튼은 opacity-40으로 표시, 삭제 버튼은 숨김)
    const card = approvedBadge.locator("xpath=ancestor::div[contains(@class, 'bg-[#1C1C1E]')]").first();
    const deleteButton = card.locator("button").filter({ has: page.locator("svg.lucide-trash-2") });
    expect(await deleteButton.count()).toBe(0);
  });

  test("4-3. rejected 클럽은 거부 사유 표시", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/clubs");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/clubs")) {
      test.skip(true, "MD 권한 없음");
      return;
    }

    const rejectedBadge = page.getByText("거부됨").first();
    if (!(await rejectedBadge.isVisible().catch(() => false))) {
      test.skip(true, "거부된 클럽 없음");
      return;
    }

    // 거부 사유 표시 확인
    await expect(page.getByText(/거부 사유:/).first()).toBeVisible();
  });
});

// ============================================================
// 5. MD 대시보드 - 클럽 섹션 라벨 확인
// ============================================================
test.describe("MD 대시보드 - 클럽 섹션", () => {
  test("5-1. 대시보드 클럽 빈 상태 - 신청 안내 문구", async ({ page }) => {
    const loggedIn = await mdLogin(page);
    if (!loggedIn) { test.skip(true, "MD 로그인 실패"); return; }
    await page.goto("/md/dashboard");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/md/dashboard")) {
      test.skip(true, "MD 대시보드 접근 불가");
      return;
    }

    // 클럽이 없는 경우 신청 안내 확인
    const emptyText = page.getByText("소속 클럽이 아직 신청되지 않았습니다");
    if (await emptyText.isVisible().catch(() => false)) {
      await expect(page.getByText("클럽 신청 후 관리자 승인이 필요합니다")).toBeVisible();
    }
    // 클럽이 있으면 StatusBadge가 표시됨 (이 경우 패스)
  });
});

// ============================================================
// 6. Admin 대시보드 - 클럽 신청 관리 링크
// ============================================================
test.describe("Admin 대시보드 - 클럽 관리 네비게이션", () => {
  test("6-1. Admin 대시보드에서 클럽 관리 바로가기 표시", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await expect(page.getByText("클럽 등록 관리")).toBeVisible();
  });

  test("6-2. 클럽 관리 링크 클릭 → /admin/clubs 이동", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin")) {
      test.skip(true, "Admin 권한 없음");
      return;
    }

    await page.getByText("클럽 등록 관리").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/clubs/);
  });
});
