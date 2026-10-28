import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

/**
 * End-to-end suite (e2e/). Each run builds and starts its own production server (next build + next start)
 * on its own port, build folder and fresh SQLite database, so it never touches `npm run dev` on :3000 or
 * prisma/dev.db. A production build is used because `next dev` compiles routes lazily, which made tests
 * time out under parallel load. E2E_TEST_SERVER=1 allows the dev login (and, with E2E_FAKE_LLM, the
 * scripted mentor) in that build; nothing else sets it.
 *
 *   npm run e2e            scripted mentor (E2E_FAKE_LLM): deterministic, no Groq quota
 *   npm run e2e:live       a short smoke test against the real Groq mentor (uses GROQ_API_KEY from .env;
 *                          see playwright.live.config.ts)
 */
export function e2eConfig(live: boolean): PlaywrightTestConfig {
  const port = live ? 3101 : 3100;
  const db = live ? "prisma/e2e-live.db" : "prisma/e2e.db";
  return defineConfig({
    testDir: "./e2e",
    globalSetup: "./e2e/global-setup.ts",
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: true,
    workers: 3,
    retries: 0,
    forbidOnly: !!process.env.CI,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
      baseURL: `http://localhost:${port}`,
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
    },
    projects: live
      ? [{ name: "live", testMatch: /live\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }]
      : [
          {
            name: "desktop",
            testIgnore: /(mobile|live)\.spec\.ts/,
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
          },
          { name: "mobile", testMatch: /mobile\.spec\.ts/, use: { ...devices["Pixel 7"] } },
        ],
    webServer: {
      command: `node scripts/e2e-db.mjs ${db} && npx next build && npx next start -p ${port}`,
      url: `http://localhost:${port}/signin`,
      reuseExistingServer: false,
      timeout: 600_000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        ...(process.env as Record<string, string>),
        NEXT_DIST_DIR: live ? ".next-e2e-live" : ".next-e2e",
        DATABASE_URL: `file:./${db}`,
        AUTH_DEV_LOGIN: "true",
        E2E_TEST_SERVER: "1",
        ...(live ? {} : { E2E_FAKE_LLM: "1" }),
      },
    },
  });
}

export default e2eConfig(false);
