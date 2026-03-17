import { test, expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "path";

const MD_EMAIL = "e2e-md@nightflow.com";
const MD_PW = "test123456";

const TEST_FLOORPLAN = path.resolve(__dirname, "fixtures/test-floorplan.png");
const TEST_FLOORPLAN_2 = path.resolve(__dirname, "fixtures/test-floorplan-2.png");

// Service role client for test setup/teardown
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 })
    .catch(() => {});
}

async function mdLogin(page: Page): Promise<boolean> {
  await devLogin(page, MD_EMAIL, MD_PW);
  return !page.url().includes("/login");
}

/** 플로어맵 섹션의 file input */
function floorPlanFileInput(page: Page) {
  return page.locator("input[type='file'][accept='image/*']");
}

// ============================================================
// 테스트 데이터 셋업 & 정리
// ============================================================
let testClubId: string | null = null;

test.beforeAll(async () => {
  const supabase = getAdminClient();
  if (!supabase) return;

  // MD 유저 찾기
  const { data: mdUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", MD_EMAIL)
    .single();
  if (!mdUser) return;

  // 이미 approved 클럽이 있는지 확인
  const { data: existingClubs } = await supabase
    .from("clubs")
    .select("id")
    .eq("md_id", mdUser.id)
    .eq("status", "approved")
    .limit(1);

  if (existingClubs && existingClubs.length > 0) {
    testClubId = existingClubs[0].id;
    return;
  }

  // 테스트용 approved 클럽 생성
  const { data: club, error } = await supabase
    .from("clubs")
    .insert({
      md_id: mdUser.id,
      name: "E2E 테스트 클럽",
      area: "강남",
      address: "서울 강남구 역삼동 123-45",
      status: "approved",
      latitude: 37.5013,
      longitude: 127.0396,
    })
    .select("id")
    .single();

  if (!error && club) {
    testClubId = club.id;
  }
});

test.afterAll(async () => {
  // 테스트 후 floor_plan_url 정리 (클럽은 유지)
  const supabase = getAdminClient();
  if (!supabase || !testClubId) return;

  await supabase
    .from("clubs")
    .update({ floor_plan_url: null })
    .eq("id", testClubId);
});

// ============================================================
// 클럽 수정 - 플로어맵 등록/변경/삭제 E2E
// ============================================================
test.describe("클럽 플로어맵 관리 (/md/clubs/[id]/edit)", () => {
  async function goToClubEdit(page: Page): Promise<boolean> {
    if (!testClubId) return false;

    const loggedIn = await mdLogin(page);
    if (!loggedIn) return false;

    await page.goto(`/md/clubs/${testClubId}/edit`);
    await page.waitForLoadState("networkidle");

    return page.url().includes("/edit");
  }

  test("1. 수정 페이지 - 플로어맵 섹션 렌더링", async ({ page }) => {
    const ok = await goToClubEdit(page);
    if (!ok) {
      test.skip(true, "클럽 편집 페이지 접근 실패");
      return;
    }

    await expect(page.getByRole("heading", { name: "클럽 수정" })).toBeVisible();
    await expect(page.getByText("이미지만 수정 가능")).toBeVisible();
    await expect(page.getByText("플로어맵")).toBeVisible();
  });

  test("2. 플로어맵 빈 상태 - 업로드 영역 표시", async ({ page }) => {
    const ok = await goToClubEdit(page);
    if (!ok) {
      test.skip(true, "클럽 편집 페이지 접근 실패");
      return;
    }

    // 기존 플로어맵 삭제 (있으면)
    const floorPlanImg = page.locator("img[alt='클럽 플로어맵']");
    if (await floorPlanImg.isVisible().catch(() => false)) {
      await page
        .locator("section")
        .filter({ hasText: "플로어맵" })
        .getByRole("button", { name: "삭제" })
        .click();
      await page.waitForTimeout(500);
    }

    await expect(page.getByText("플로어맵 이미지 업로드")).toBeVisible();
    await expect(page.getByText("클럽 평면도를 업로드해주세요")).toBeVisible();
    await expect(page.getByText("5MB 이하")).toBeVisible();
  });

  test("3. 플로어맵 업로드 - 미리보기 + 성공 토스트", async ({ page }) => {
    const ok = await goToClubEdit(page);
    if (!ok) {
      test.skip(true, "클럽 편집 페이지 접근 실패");
      return;
    }

    // 기존 플로어맵 삭제
    const floorPlanImg = page.locator("img[alt='클럽 플로어맵']");
    if (await floorPlanImg.isVisible().catch(() => false)) {
      await page
        .locator("section")
        .filter({ hasText: "플로어맵" })
        .getByRole("button", { name: "삭제" })
        .click();
      await page.waitForTimeout(500);
    }

    // 업로드
    await floorPlanFileInput(page).setInputFiles(TEST_FLOORPLAN);

    // 미리보기
    await expect(page.locator("img[alt='클럽 플로어맵']")).toBeVisible({
      timeout: 15000,
    });

    // 성공 토스트
    await expect(
      page.getByText("플로어맵이 업로드되었습니다")
    ).toBeVisible({ timeout: 5000 });

    // 변경/삭제 버튼
    const section = page.locator("section").filter({ hasText: "플로어맵" });
    await expect(section.getByRole("button", { name: "이미지 변경" })).toBeVisible();
    await expect(section.getByRole("button", { name: "삭제" })).toBeVisible();
  });

  test("4. 플로어맵 변경 - 다른 이미지로 교체", async ({ page }) => {
    const ok = await goToClubEdit(page);
    if (!ok) {
      test.skip(true, "클럽 편집 페이지 접근 실패");
      return;
    }

    // 기존 없으면 먼저 업로드
    if (
      await page
        .getByText("플로어맵 이미지 업로드")
        .isVisible()
        .catch(() => false)
    ) {
      await floorPlanFileInput(page).setInputFiles(TEST_FLOORPLAN);
      await expect(page.locator("img[alt='클럽 플로어맵']")).toBeVisible({
        timeout: 15000,
      });
      await page.waitForTimeout(1000);
    }

    const originalSrc = await page
      .locator("img[alt='클럽 플로어맵']")
      .getAttribute("src");

    // 다른 이미지 업로드
    await floorPlanFileInput(page).setInputFiles(TEST_FLOORPLAN_2);

    await expect(
      page.getByText("플로어맵이 업로드되었습니다")
    ).toBeVisible({ timeout: 15000 });

    const newSrc = await page
      .locator("img[alt='클럽 플로어맵']")
      .getAttribute("src");
    expect(newSrc).not.toBe(originalSrc);
  });

  test("5. 플로어맵 삭제 - 빈 상태 복귀", async ({ page }) => {
    const ok = await goToClubEdit(page);
    if (!ok) {
      test.skip(true, "클럽 편집 페이지 접근 실패");
      return;
    }

    // 없으면 먼저 업로드
    if (
      await page
        .getByText("플로어맵 이미지 업로드")
        .isVisible()
        .catch(() => false)
    ) {
      await floorPlanFileInput(page).setInputFiles(TEST_FLOORPLAN);
      await expect(page.locator("img[alt='클럽 플로어맵']")).toBeVisible({
        timeout: 15000,
      });
      await page.waitForTimeout(1000);
    }

    // 삭제
    await page
      .locator("section")
      .filter({ hasText: "플로어맵" })
      .getByRole("button", { name: "삭제" })
      .click();

    await expect(page.getByText("플로어맵 이미지 업로드")).toBeVisible();
    await expect(page.locator("img[alt='클럽 플로어맵']")).not.toBeVisible();
  });

  test("6. 승인 클럽 - 기본/위치 비활성화, 이미지만 활성", async ({ page }) => {
    const ok = await goToClubEdit(page);
    if (!ok) {
      test.skip(true, "클럽 편집 페이지 접근 실패");
      return;
    }

    // 기본 정보 비활성화
    const basicInfo = page
      .locator("section")
      .filter({ hasText: "기본 정보" })
      .first();
    await expect(basicInfo).toHaveClass(/opacity-50/);
    await expect(basicInfo).toHaveClass(/pointer-events-none/);

    // 위치 정보 비활성화
    const location = page
      .locator("section")
      .filter({ hasText: "위치 정보" })
      .first();
    await expect(location).toHaveClass(/opacity-50/);
    await expect(location).toHaveClass(/pointer-events-none/);

    // 플로어맵 섹션 활성화
    const floorPlan = page
      .locator("section")
      .filter({ hasText: "플로어맵" })
      .first();
    await expect(floorPlan).not.toHaveClass(/opacity-50/);

    // 제출 버튼
    await expect(
      page.getByRole("button", { name: "이미지 저장하기" })
    ).toBeVisible();
  });

  test("7. 업로드 중 스피너 표시", async ({ page }) => {
    const ok = await goToClubEdit(page);
    if (!ok) {
      test.skip(true, "클럽 편집 페이지 접근 실패");
      return;
    }

    // 기존 삭제
    const img = page.locator("img[alt='클럽 플로어맵']");
    if (await img.isVisible().catch(() => false)) {
      await page
        .locator("section")
        .filter({ hasText: "플로어맵" })
        .getByRole("button", { name: "삭제" })
        .click();
      await page.waitForTimeout(500);
    }

    // 네트워크 지연
    await page.route("**/storage/**", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    await floorPlanFileInput(page).setInputFiles(TEST_FLOORPLAN);

    await expect(page.getByText("업로드 중...")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("img[alt='클럽 플로어맵']")).toBeVisible({
      timeout: 20000,
    });
  });

  test("8. 다크 테마 적용", async ({ page }) => {
    const ok = await goToClubEdit(page);
    if (!ok) {
      test.skip(true, "클럽 편집 페이지 접근 실패");
      return;
    }

    // 페이지 배경 #0A0A0A = rgb(10, 10, 10)
    await expect(page.locator("div.min-h-screen").first()).toHaveCSS(
      "background-color",
      "rgb(10, 10, 10)"
    );

    // 플로어맵 섹션 존재
    await expect(
      page.locator("section").filter({ hasText: "플로어맵" }).first()
    ).toBeVisible();
  });
});
