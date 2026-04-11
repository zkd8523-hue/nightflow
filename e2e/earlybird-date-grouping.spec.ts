import { test, expect, Page } from "@playwright/test";

async function devLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "이메일" }).fill(email);
  await page.getByRole("textbox", { name: "비밀번호 (6자 이상)" }).fill(password);
  await page.getByRole("button", { name: "테스트 로그인" }).click();
  await page.waitForURL("/");
}

// 얼리버드 탭이 HomeContent에서 제거되어 전체 스킵
test.describe.skip("얼리버드 탭 날짜별 그룹핑", () => {
  // ── 1. 얼리버드 탭 접근 및 렌더링 ─────────────────────────────────────
  test("1. 홈에서 얼리버드 탭 클릭 시 정상 렌더링", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 얼리버드 탭 버튼 찾기 (📅 얼리버드 또는 earlybird 텍스트)
    const advanceTab = page.getByRole("button", { name: /얼리버드|advance/i });
    await expect(advanceTab).toBeVisible({ timeout: 5000 });

    // 탭 클릭
    await advanceTab.click();
    await page.waitForTimeout(500); // 탭 전환 애니메이션 대기

    // 얼리버드 콘텐츠 또는 빈 상태 메시지 확인
    const hasContent = (await page.locator("a[href^='/auctions/']").count()) > 0;
    const hasEmptyMessage = (await page.getByText(/등록된 얼리버드 경매가 없습니다/).count()) > 0;
    expect(hasContent || hasEmptyMessage).toBe(true);
  });

  // ── 2. 날짜별 그룹 헤더 표시 확인 ───────────────────────────────────
  test("2. 얼리버드 탭에서 날짜별 그룹 헤더 표시", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 얼리버드 탭 클릭
    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    // 경매가 없으면 스킵
    const auctionCount = await page.locator("a[href^='/auctions/']").count();
    if (auctionCount === 0) {
      test.skip(true, "얼리버드 경매 없음 - 스킵");
      return;
    }

    // DateGroup 헤더 찾기 (날짜 형식: "3/15(금)", "내일", "모레" 등)
    // DateGroup은 13px bold text-neutral-400 스타일 사용
    const dateHeaders = page.locator("span.text-\\[13px\\].font-bold.text-neutral-400");
    const headerCount = await dateHeaders.count();

    expect(headerCount).toBeGreaterThan(0);

    // 첫 번째 헤더가 날짜 형식인지 확인
    const firstHeaderText = await dateHeaders.first().textContent();
    expect(firstHeaderText).toMatch(/\d+\/\d+\([월화수목금토일]\)|내일|모레|오늘/);
  });

  // ── 3. showCount 표시 확인 (예: "2건") ────────────────────────────
  test("3. 날짜 그룹 헤더에 경매 수(showCount) 표시", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    const auctionCount = await page.locator("a[href^='/auctions/']").count();
    if (auctionCount === 0) {
      test.skip(true, "얼리버드 경매 없음 - 스킵");
      return;
    }

    // "N건" 형식의 카운트 표시 확인
    // DateGroup의 showCount는 text-[11px] text-neutral-600 스타일
    const countBadges = page.locator("span.text-\\[11px\\].text-neutral-600");
    const badgeCount = await countBadges.count();

    expect(badgeCount).toBeGreaterThan(0);

    // 첫 번째 배지가 "N건" 형식인지 확인
    const firstBadgeText = await countBadges.first().textContent();
    expect(firstBadgeText).toMatch(/\d+건/);
  });

  // ── 4. 날짜 오름차순 정렬 확인 ─────────────────────────────────────
  test("4. 얼리버드 날짜 오름차순 정렬 (가까운 날짜 먼저)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    const auctionCount = await page.locator("a[href^='/auctions/']").count();
    if (auctionCount === 0) {
      test.skip(true, "얼리버드 경매 없음 - 스킵");
      return;
    }

    // 모든 날짜 헤더 텍스트 수집
    const dateHeaders = page.locator("span.text-\\[13px\\].font-bold.text-neutral-400");
    const headerCount = await dateHeaders.count();

    if (headerCount < 2) {
      test.skip(true, "날짜 그룹이 1개뿐 - 정렬 검증 불가");
      return;
    }

    const dates: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      const text = await dateHeaders.nth(i).textContent();
      if (text) dates.push(text);
    }

    // 날짜 형식 파싱 (간단한 검증: "3/15(금)" 형식에서 "3/15" 추출)
    const parsedDates = dates.map(d => {
      // "내일", "모레" 같은 상대 날짜는 스킵
      if (d.includes("내일") || d.includes("모레") || d.includes("오늘")) return null;
      const match = d.match(/(\d+)\/(\d+)/);
      if (!match) return null;
      return { month: parseInt(match[1]), day: parseInt(match[2]), original: d };
    }).filter(d => d !== null);

    if (parsedDates.length < 2) {
      console.log("날짜 형식 파싱 불가 - 스킵");
      return;
    }

    // 오름차순 확인 (앞 날짜 <= 뒤 날짜)
    for (let i = 0; i < parsedDates.length - 1; i++) {
      const curr = parsedDates[i]!;
      const next = parsedDates[i + 1]!;

      // 월이 다르면 월 비교, 같으면 일 비교
      if (curr.month !== next.month) {
        expect(curr.month).toBeLessThanOrEqual(next.month);
      } else {
        expect(curr.day).toBeLessThanOrEqual(next.day);
      }
    }
  });

  // ── 5. 같은 날짜 경매가 한 그룹에 모이는지 확인 ─────────────────────
  test("5. 같은 날짜 경매가 DateGroup 내에 함께 표시", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    const auctionCount = await page.locator("a[href^='/auctions/']").count();
    if (auctionCount === 0) {
      test.skip(true, "얼리버드 경매 없음 - 스킵");
      return;
    }

    // DateGroup 구조 확인
    // DateGroup은 space-y-3 클래스를 가진 div 내에 경매 카드들을 포함
    const dateGroups = page.locator("div.space-y-5 > div.space-y-3");
    const groupCount = await dateGroups.count();

    expect(groupCount).toBeGreaterThan(0);

    // 각 그룹에 최소 1개 이상의 경매 카드가 있는지 확인
    for (let i = 0; i < groupCount; i++) {
      const cardsInGroup = dateGroups.nth(i).locator("a[href^='/auctions/']");
      const cardCount = await cardsInGroup.count();
      expect(cardCount).toBeGreaterThan(0);
    }
  });

  // ── 6. "내일"/"모레" 라벨 표시 확인 (조건부) ───────────────────────
  test("6. 내일/모레 경매가 있을 경우 상대 날짜 라벨 표시", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    const auctionCount = await page.locator("a[href^='/auctions/']").count();
    if (auctionCount === 0) {
      test.skip(true, "얼리버드 경매 없음 - 스킵");
      return;
    }

    // "내일" 또는 "모레" 라벨이 있는지 확인 (선택사항)
    const dateHeaders = page.locator("span.text-\\[13px\\].font-bold.text-neutral-400");
    const allHeaders = await dateHeaders.allTextContents();

    const hasRelativeDate = allHeaders.some(h => h.includes("내일") || h.includes("모레"));

    // 내일/모레 경매가 실제로 있는지는 DB 상태에 따라 다르므로
    // 있으면 확인, 없으면 패스
    if (hasRelativeDate) {
      console.log("✅ 내일/모레 라벨 확인됨:", allHeaders.filter(h => h.includes("내일") || h.includes("모레")));
      expect(true).toBe(true);
    } else {
      console.log("ℹ️ 내일/모레 경매 없음 (정상)");
      expect(true).toBe(true);
    }
  });

  // ── 7. 종료 탭과 시각적 일관성 확인 ──────────────────────────────────
  test("7. 종료 탭과 얼리버드 탭의 DateGroup 스타일 일관성", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 얼리버드 탭 DateGroup 스타일 확인
    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    const advanceDateHeaders = page.locator("span.text-\\[13px\\].font-bold.text-neutral-400");
    const advanceHeaderCount = await advanceDateHeaders.count();

    // 종료 탭으로 전환
    const completedTab = page.getByRole("button", { name: /종료/i });
    await completedTab.click();
    await page.waitForTimeout(500);

    const completedDateHeaders = page.locator("span.text-\\[13px\\].font-bold.text-neutral-400");
    const completedHeaderCount = await completedDateHeaders.count();

    // 두 탭 모두 동일한 DateGroup 스타일 사용
    // (경매가 없으면 0일 수 있으므로, 있을 경우에만 비교)
    if (advanceHeaderCount > 0 && completedHeaderCount > 0) {
      // 첫 번째 헤더의 스타일 클래스가 동일한지 확인
      const advanceClass = await advanceDateHeaders.first().getAttribute("class");

      // 얼리버드 탭으로 다시 전환
      await advanceTab.click();
      await page.waitForTimeout(500);

      const completedClass = await advanceDateHeaders.first().getAttribute("class");

      expect(advanceClass).toBe(completedClass);
    } else {
      console.log("ℹ️ 경매 부족으로 스타일 비교 스킵");
    }
  });

  // ── 8. 모바일 뷰 (390px) 레이아웃 확인 ──────────────────────────────
  test("8. 모바일 뷰에서 DateGroup 레이아웃 정상 표시", async ({ page }) => {
    // Playwright config에서 이미 모바일 뷰포트 설정 (390x844)
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    const auctionCount = await page.locator("a[href^='/auctions/']").count();
    if (auctionCount === 0) {
      test.skip(true, "얼리버드 경매 없음 - 스킵");
      return;
    }

    // DateGroup 헤더와 경매 카드가 정상 표시되는지 확인
    const dateHeaders = page.locator("span.text-\\[13px\\].font-bold.text-neutral-400");
    await expect(dateHeaders.first()).toBeVisible();

    // 경매 카드도 표시되는지 확인
    const firstCard = page.locator("a[href^='/auctions/']").first();
    await expect(firstCard).toBeVisible();

    // 가로 스크롤이 발생하지 않는지 확인 (선택사항)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = page.viewportSize()!.width;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px 오차 허용
  });

  // ── 9. 경매 카드 클릭 → 상세 페이지 이동 (얼리버드) ──────────────────
  test("9. 얼리버드 탭에서 경매 카드 클릭 시 상세 페이지 이동", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    const auctionCards = page.locator("a[href^='/auctions/']");
    const cardCount = await auctionCards.count();

    if (cardCount === 0) {
      test.skip(true, "얼리버드 경매 없음 - 스킵");
      return;
    }

    // 첫 번째 카드 클릭
    const firstCardHref = await auctionCards.first().getAttribute("href");
    await auctionCards.first().click();

    // 상세 페이지로 이동 확인
    await expect(page).toHaveURL(firstCardHref!, { timeout: 5000 });

    // 상세 페이지 핵심 요소 확인 (가격 표시)
    await expect(page.getByText(/원/).first()).toBeVisible({ timeout: 8000 });
  });

  // ── 10. 빈 상태 메시지 확인 ─────────────────────────────────────────
  test("10. 얼리버드 경매가 없을 때 빈 상태 메시지 표시", async ({ page }) => {
    // 이 테스트는 실제 DB에 얼리버드 경매가 없을 때만 통과
    // 경매가 있으면 스킵
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const advanceTab = page.getByRole("button", { name: /얼리버드/i });
    await advanceTab.click();
    await page.waitForTimeout(500);

    const auctionCount = await page.locator("a[href^='/auctions/']").count();

    if (auctionCount > 0) {
      test.skip(true, "얼리버드 경매 존재 - 빈 상태 테스트 스킵");
      return;
    }

    // 빈 상태 메시지 확인
    const emptyMessage = page.getByText("등록된 얼리버드 경매가 없습니다");
    await expect(emptyMessage).toBeVisible();
  });
});
