import { defineConfig, devices } from "@playwright/test";
import path from "path";

// .env.test 로드 (비어있으면 .env.local 폴백)
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, ".env.test") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    viewport: { width: 390, height: 844 }, // 모바일 기준 (iPhone 14)
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Pixel 5"] }, // 모바일 에뮬레이션
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
