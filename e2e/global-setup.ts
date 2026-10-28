import type { FullConfig } from "@playwright/test";

/**
 * `next dev` compiles each route on first request, which can take tens of seconds per route on a cold
 * build. Requesting every page and API route once here keeps that out of the tests' timeouts.
 */
export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  const pages = ["/", "/signin", "/onboarding", "/today", "/progress", "/history", "/settings", "/session/warmup", "/admin/review"];
  const apis = ["chat", "snapshot", "run", "hidden", "submit"].map((r) => `/api/session/warmup/${r}`);
  const started = Date.now();
  for (const path of pages) await fetch(base + path, { redirect: "manual" }).catch(() => {});
  for (const path of apis) {
    await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }
  await fetch(base + "/api/auth/session").catch(() => {});
  console.log(`[e2e] warmed ${pages.length + apis.length + 1} routes in ${Math.round((Date.now() - started) / 1000)}s`);
}
