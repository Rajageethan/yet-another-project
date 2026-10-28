import { chat, expect, signUp, test } from "./fixtures";

// Runs in the "mobile" project (Pixel 7).
test("the workspace works on a phone: one pane at a time, nothing squeezed", async ({ page }) => {
  await signUp(page);
  const tabs = page.getByRole("tablist", { name: "Workspace" });
  await expect(tabs.getByRole("tab")).toHaveText(["problem", "chat", "code"]);
  await expect(tabs.getByRole("tab", { name: "chat" })).toHaveAttribute("aria-selected", "true");

  await expect(chat(page)).toContainText("What is the problem asking");
  expect((await chat(page).boundingBox())!.height).toBeGreaterThan(250);

  await tabs.getByRole("tab", { name: "problem" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(chat(page)).toBeHidden();

  await tabs.getByRole("tab", { name: "code" }).click();
  const editor = page.locator(".monaco-editor");
  await expect(editor).toBeVisible();
  await expect.poll(async () => (await editor.boundingBox())?.height ?? 0).toBeGreaterThan(200);
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
});

test("no page scrolls sideways on a phone", async ({ page }) => {
  await signUp(page);
  for (const path of ["/today", "/progress", "/history", "/settings", "/onboarding"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { scroll, width } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
    }));
    expect(scroll, `${path} is ${scroll}px wide on a ${width}px screen`).toBeLessThanOrEqual(width);
  }
});
