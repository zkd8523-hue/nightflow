import { test, expect, Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PW = "test1234";

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

/** Admin 로그인 후 /admin/mds 이동. Admin 권한 없으면 null 반환. */
async function loginAndGotoMds(page: Page): Promise<boolean> {
  await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
  await page.goto("/admin/mds");
  await page.waitForLoadState("networkidle");
  return page.url().includes("/admin/mds");
}

/** 활동 모니터링 탭으로 전환. 첫 번째 승인 MD의 상세 URL 반환 (없으면 null). */
async function switchToMonitoringTab(page: Page): Promise<string | null> {
  await page.getByRole("tab", { name: /활동 모니터링/ }).click();
  await page.waitForTimeout(300);

  // Case 1: MDMonitorList 렌더링된 경우 (md_health_scores 데이터 있음)
  const searchInput = page.getByPlaceholder("이름 또는 지역 검색...");
  if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    // 이미 펼쳐진 "상세 보기" 링크가 있으면 바로 반환
    const openLink = page.getByRole("link", { name: /상세 보기/ }).first();
    if (await openLink.isVisible({ timeout: 500 }).catch(() => false)) {
      return openLink.getAttribute("href");
    }
    // MDMonitorCard 클릭 → 펼침 → "상세 보기" 링크 노출
    const card = page.locator(".bg-\\[\\#1C1C1E\\]").first();
    if (await card.isVisible({ timeout: 1000 }).catch(() => false)) {
      await card.click();
      await page.waitForTimeout(300);
      const link = page.getByRole("link", { name: /상세 보기/ }).first();
      if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
        return link.getAttribute("href");
      }
    }
    return null;
  }

  // Case 2: MDApplicationCard(isSimple) 렌더링된 경우 (md_health_scores 없음)
  // "상세 / 제재" 링크에서 href 수집
  const sanctionLink = page.getByRole("link", { name: "상세 / 제재" }).first();
  if (await sanctionLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    return sanctionLink.getAttribute("href");
  }
  return null;
}

// ============================================================
// 1. 활동 모니터링 탭 (목록)
// ============================================================
test.describe("Admin - MD 활동 모니터링 탭", () => {

  test("1. 활동 모니터링 탭 클릭 → active 상태 전환", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();
    await expect(
      page.getByRole("tab", { name: /활동 모니터링/ })
    ).toHaveAttribute("data-state", "active");
  });

  test("2. 승인 MD 없을 때 빈 상태 메시지 표시", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    const hasMD = (await page.locator(".bg-\\[\\#1C1C1E\\]").count()) > 0;
    if (!hasMD) {
      await expect(page.getByText("활동 중인 MD가 없습니다")).toBeVisible();
    } else {
      // MD가 있으면 카드 렌더링 확인
      await expect(page.locator(".bg-\\[\\#1C1C1E\\]").first()).toBeVisible();
    }
  });

  test("3. 검색 입력 필드 + 정렬 select 렌더링 (MDMonitorList)", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    // MDMonitorList는 md_health_scores 데이터가 있을 때만 렌더링
    const hasSearch = await page.getByPlaceholder("이름 또는 지역 검색...").isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasSearch) { test.skip(true, "MDMonitorList 비렌더링 (md_health_scores 없음)"); return; }

    await expect(page.getByPlaceholder("이름 또는 지역 검색...")).toBeVisible();
    await expect(page.locator("select")).toBeVisible();
  });

  test("4. 정렬 옵션 3가지 존재 (최근활동순 / 낙찰액순 / 점수순)", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    const hasSearch = await page.getByPlaceholder("이름 또는 지역 검색...").isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasSearch) { test.skip(true, "MDMonitorList 비렌더링 (md_health_scores 없음)"); return; }

    const select = page.locator("select");
    await expect(select.locator("option", { hasText: "최근활동순" })).toHaveCount(1);
    await expect(select.locator("option", { hasText: "낙찰액순" })).toHaveCount(1);
    await expect(select.locator("option", { hasText: "점수순" })).toHaveCount(1);
  });

  test("5. MDMonitorCard - 4개 지표(경매/낙찰/낙찰액/낙찰률) 상시 표시", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    // MDMonitorList 렌더링 여부 확인
    const hasSearch = await page.getByPlaceholder("이름 또는 지역 검색...").isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasSearch) { test.skip(true, "MDMonitorList 비렌더링 (md_health_scores 없음)"); return; }

    // MDMonitorCard: 4개 지표 그리드는 클릭 전부터 표시됨
    const card = page.locator(".bg-\\[\\#1C1C1E\\].rounded-2xl").first();
    if (!(await card.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, "활동 중인 MD 없음"); return;
    }

    await expect(card.getByText("경매")).toBeVisible();
    await expect(card.getByText("낙찰")).toBeVisible();
    await expect(card.getByText("낙찰액")).toBeVisible();
    await expect(card.getByText("낙찰률")).toBeVisible();
  });

  test("6. MDMonitorCard 클릭 → 최근 활동 타임라인 + 상세 보기 링크 펼침", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    const hasSearch = await page.getByPlaceholder("이름 또는 지역 검색...").isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasSearch) { test.skip(true, "MDMonitorList 비렌더링 (md_health_scores 없음)"); return; }

    const card = page.locator(".bg-\\[\\#1C1C1E\\].rounded-2xl").first();
    if (!(await card.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, "활동 중인 MD 없음"); return;
    }

    // 클릭 전: "상세 보기" 없음
    await expect(page.getByRole("link", { name: /상세 보기/ })).not.toBeVisible();

    // 카드 클릭 → 펼침
    await card.click();
    await expect(page.getByText("최근 활동")).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("link", { name: /상세 보기/ }).first()).toBeVisible();
  });

  test("7. MDMonitorCard 재클릭 → 접힘", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    const hasSearch = await page.getByPlaceholder("이름 또는 지역 검색...").isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasSearch) { test.skip(true, "MDMonitorList 비렌더링 (md_health_scores 없음)"); return; }

    const card = page.locator(".bg-\\[\\#1C1C1E\\].rounded-2xl").first();
    if (!(await card.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, "활동 중인 MD 없음"); return;
    }

    await card.click();
    await expect(page.getByText("최근 활동")).toBeVisible({ timeout: 3000 });

    // 재클릭 → 접힘
    await card.click();
    await expect(page.getByText("최근 활동")).not.toBeVisible();
  });

  test("8. 검색어 입력 → 결과 필터링 (MDMonitorList)", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    const searchInput = page.getByPlaceholder("이름 또는 지역 검색...");
    const hasSearch = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasSearch) { test.skip(true, "MDMonitorList 비렌더링 (md_health_scores 없음)"); return; }

    await searchInput.fill("존재하지않는검색어xyz");
    await expect(page.getByText("검색 결과가 없습니다")).toBeVisible({ timeout: 3000 });

    // 검색어 지우면 카드 복원
    await searchInput.clear();
    await expect(page.locator(".bg-\\[\\#1C1C1E\\].rounded-2xl").first()).toBeVisible({ timeout: 3000 });
  });

  test("9. 정렬 변경 → select 값 업데이트 (MDMonitorList)", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    const hasSearch = await page.getByPlaceholder("이름 또는 지역 검색...").isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasSearch) { test.skip(true, "MDMonitorList 비렌더링 (md_health_scores 없음)"); return; }

    const select = page.locator("select");
    await select.selectOption("wonAmount");
    await expect(select).toHaveValue("wonAmount");

    await select.selectOption("health");
    await expect(select).toHaveValue("health");

    await select.selectOption("recent");
    await expect(select).toHaveValue("recent");
  });

  test("10. 상세 링크 클릭 → /admin/mds/{id} 이동", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    // MDMonitorList: "상세 보기" | MDApplicationCard: "상세 / 제재"
    const detailLink = page.getByRole("link", { name: /상세 보기|상세 \/ 제재/ }).first();
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/admin\/mds\/.+/);
  });

  test("11. 주의 MD 알림 배너 - 있을 때 렌더링, 접기/펼치기", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    await page.getByRole("tab", { name: /활동 모니터링/ }).click();

    const banner = page.getByText(/주의가 필요한 MD/);
    if (!(await banner.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip(true, "주의 MD 없음 (모든 MD가 정상)"); return;
    }

    // 배너 토글 버튼으로 접기
    const toggleBtn = page.locator("button").filter({ hasText: /주의가 필요한 MD/ });
    await toggleBtn.click();
    // 펼쳐진 목록이 사라짐 (배너 헤더는 유지)
    await expect(page.getByText("주의가 필요한 MD")).toBeVisible();

    // 다시 펼치기
    await toggleBtn.click();
  });
});

// ============================================================
// 2. MD 상세 페이지 (/admin/mds/{id})
// ============================================================
test.describe("Admin - MD 상세 / 제재 페이지", () => {

  test("12. 존재하지 않는 MD ID → '찾을 수 없습니다' + 목록으로 돌아가기", async ({ page }) => {
    await devLogin(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/admin/mds/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/admin/mds/")) {
      test.skip(true, "Admin 권한 없음"); return;
    }

    await expect(page.getByText("MD를 찾을 수 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "목록으로 돌아가기" })).toBeVisible();
  });

  test("13. 뒤로가기 링크 → /admin/mds 이동", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    // ChevronLeft 뒤로가기 버튼
    const backLink = page.getByRole("link", { name: "" }).filter({
      has: page.locator("svg")
    }).first();

    // href="/admin/mds"인 링크
    const adminMdsLink = page.locator("a[href='/admin/mds']").first();
    await expect(adminMdsLink).toBeVisible();
    await adminMdsLink.click();

    await expect(page).toHaveURL(/\/admin\/mds$/);
  });

  test("14. 상세 페이지 헤더 - MD 이름 + 지역 표시", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    // MD 데이터 접근 불가인 경우 skip
    if (await page.getByText("MD를 찾을 수 없습니다").isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, "MD 상세 데이터 접근 불가 (RLS 또는 데이터 없음)"); return;
    }

    // "{이름} MD" 헤딩
    await expect(page.getByRole("heading", { name: /MD$/ })).toBeVisible();
    // "MD Detail" 레이블
    await expect(page.getByText("MD Detail")).toBeVisible();
  });

  test("15. 퍼포먼스 그리드 - 8개 지표 카드 렌더링", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    // Health Score 데이터가 있을 때만 그리드 표시
    const hasGrid = (await page.getByText("총 경매").count()) > 0;
    if (!hasGrid) { test.skip(true, "md_health_scores 데이터 없음"); return; }

    for (const label of ["총 경매", "낙찰", "낙찰 총액", "낙찰률", "노쇼", "방문확인률", "취소율", "마지막 활동"]) {
      await expect(page.getByText(label)).toBeVisible();
    }
  });

  test("16. 제재 관리 섹션 렌더링", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    if (await page.getByText("MD를 찾을 수 없습니다").isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, "MD 상세 데이터 접근 불가 (RLS 또는 데이터 없음)"); return;
    }

    await expect(page.getByRole("heading", { name: "제재 관리" })).toBeVisible();
    // 정상 활동 중 배너 또는 정지/박탈 배너 중 하나
    const hasStatusBanner =
      (await page.getByText("정상 활동 중").count()) > 0 ||
      (await page.getByText("활동 정지 중").count()) > 0 ||
      (await page.getByText("자격 박탈됨").count()) > 0;
    expect(hasStatusBanner).toBe(true);
  });

  test("17. 승인 MD - 경고/일시정지/자격박탈 버튼 표시", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    // 정상 활동 중인 MD만 3개 버튼 모두 표시
    const isApproved = (await page.getByText("정상 활동 중").count()) > 0;
    if (!isApproved) { test.skip(true, "해당 MD가 approved 상태 아님"); return; }

    await expect(page.getByRole("button", { name: /경고/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /일시 정지/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /자격 박탈/ })).toBeVisible();
  });

  test("18. 경고 버튼 → 다이얼로그 열림 + 사유 없이 확정 비활성화", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    const warnBtn = page.getByRole("button", { name: /경고/ });
    if (!(await warnBtn.isVisible())) { test.skip(true, "경고 버튼 없음"); return; }

    await warnBtn.click();

    // 다이얼로그 렌더링
    await expect(page.getByRole("heading", { name: "경고" })).toBeVisible();
    await expect(page.getByPlaceholder("제재 사유를 입력해주세요")).toBeVisible();

    // 사유 없이 확정 버튼 비활성화
    await expect(page.getByRole("button", { name: "경고 확정" })).toBeDisabled();
  });

  test("19. 경고 다이얼로그 - 사유 입력 → 확정 버튼 활성화", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    const warnBtn = page.getByRole("button", { name: /경고/ });
    if (!(await warnBtn.isVisible())) { test.skip(true, "경고 버튼 없음"); return; }

    await warnBtn.click();
    await page.getByPlaceholder("제재 사유를 입력해주세요").fill("운영 품질 기준 미달 - e2e 테스트");
    await expect(page.getByRole("button", { name: "경고 확정" })).toBeEnabled();
  });

  test("20. 경고 다이얼로그 - 취소 버튼으로 닫기", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    const warnBtn = page.getByRole("button", { name: /경고/ });
    if (!(await warnBtn.isVisible())) { test.skip(true, "경고 버튼 없음"); return; }

    await warnBtn.click();
    await expect(page.getByRole("heading", { name: "경고" })).toBeVisible();

    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("heading", { name: "경고" })).not.toBeVisible();
  });

  test("21. 일시 정지 다이얼로그 - 기간 선택 (7/30/90일)", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    const suspendBtn = page.getByRole("button", { name: /일시 정지/ });
    if (!(await suspendBtn.isVisible())) { test.skip(true, "일시 정지 버튼 없음"); return; }

    await suspendBtn.click();
    await expect(page.getByRole("heading", { name: "일시 정지" })).toBeVisible();

    // 정지 기간 3개 버튼
    await expect(page.getByRole("button", { name: "7일" })).toBeVisible();
    await expect(page.getByRole("button", { name: "30일" })).toBeVisible();
    await expect(page.getByRole("button", { name: "90일" })).toBeVisible();

    // 30일 선택
    await page.getByRole("button", { name: "30일" }).click();
    await expect(page.getByRole("button", { name: "30일" })).toHaveClass(/bg-red-500/);

    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("heading", { name: "일시 정지" })).not.toBeVisible();
  });

  test("22. 자격 박탈 다이얼로그 - 경고 문구 + 취소", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    const revokeBtn = page.getByRole("button", { name: /자격 박탈/ });
    if (!(await revokeBtn.isVisible())) { test.skip(true, "자격 박탈 버튼 없음"); return; }

    await revokeBtn.click();
    await expect(page.getByRole("heading", { name: "자격 박탈" })).toBeVisible();

    // 되돌릴 수 없다는 경고 문구
    await expect(page.getByText("이 작업은 되돌릴 수 없습니다")).toBeVisible();
    // 사유 없이 확정 버튼 비활성화
    await expect(page.getByRole("button", { name: "자격 박탈 확정" })).toBeDisabled();

    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("heading", { name: "자격 박탈" })).not.toBeVisible();
  });

  test("23. 경매 내역 섹션 렌더링", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    if (await page.getByText("MD를 찾을 수 없습니다").isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, "MD 상세 데이터 접근 불가 (RLS 또는 데이터 없음)"); return;
    }

    await expect(page.getByRole("heading", { name: "경매 내역" })).toBeVisible();

    // 경매가 있으면 시작가 표시, 없으면 빈 상태 메시지
    const hasAuctions = (await page.getByText(/시작가/).count()) > 0;
    const hasEmpty = (await page.getByText("경매 내역이 없습니다").count()) > 0;
    expect(hasAuctions || hasEmpty).toBe(true);
  });

  test("24. 경매 상태 배지 표시 (진행중/낙찰/유찰/취소 등)", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    const hasAuctions = (await page.getByText(/시작가/).count()) > 0;
    if (!hasAuctions) { test.skip(true, "경매 내역 없음"); return; }

    // 상태 레이블 중 하나 이상 표시
    const statusTexts = ["진행중", "낙찰", "유찰", "취소", "예정", "연락완료", "방문확인"];
    let found = false;
    for (const s of statusTexts) {
      if ((await page.getByText(s).count()) > 0) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  test("25. Health Score 숫자 표시 (데이터 있을 때)", async ({ page }) => {
    const isAdmin = await loginAndGotoMds(page);
    if (!isAdmin) { test.skip(true, "Admin 권한 없음"); return; }

    const detailHref = await switchToMonitoringTab(page);
    if (!detailHref) { test.skip(true, "활동 중인 MD 없음"); return; }

    await page.goto(detailHref);
    await page.waitForLoadState("networkidle");

    const hasHealthScore = (await page.getByText("Health Score").count()) > 0;
    if (!hasHealthScore) { test.skip(true, "md_health_scores 데이터 없음"); return; }

    await expect(page.getByText("Health Score")).toBeVisible();
    // 숫자가 Health Score 옆에 표시됨
    const scoreEl = page.locator(".text-3xl.font-black");
    await expect(scoreEl).toBeVisible();
  });
});
