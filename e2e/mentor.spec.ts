import { chat, currentStage, expect, send, setCode, signUp, test } from "./fixtures";

// These run against the scripted mentor (src/lib/llm/fake.ts), so replies are predictable.
test.describe("mentor chat", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await expect(chat(page)).toContainText("What is the problem asking, in your own words?");
  });

  test("the mentor opens the session and answers what the student says", async ({ page }) => {
    await expect(currentStage(page)).toHaveText("Understand");
    await send(page, "We get numbers and must find something about them");
    await expect(chat(page).getByText("We get numbers and must find something about them")).toBeVisible();
    await expect(chat(page)).toContainText('You said: "We get numbers and must find something about them"');
    // The stage tag the model writes is never shown.
    await expect(chat(page)).not.toContainText("[[stage");
    await expect(page.getByRole("textbox", { name: "Explain your thinking to the mentor" })).toHaveValue("");
  });

  test("the stage bar follows the mentor", async ({ page }) => {
    await send(page, "I understand the problem #advance");
    await expect(currentStage(page)).toHaveText("Examples");
    await expect(page.getByText("Stage 2 of 8 · Examples")).toBeVisible();
    await send(page, "here are my examples #advance");
    await expect(currentStage(page)).toHaveText("Brute force");
  });

  test("a line the mentor mentions is highlighted in the editor", async ({ page }) => {
    await setCode(page, "function f() {\n  return 1;\n}\n");
    await send(page, "please check my code #line");
    const jump = page.getByRole("button", { name: "Jump to line 2" });
    await expect(jump).toBeVisible();
    await expect(page.locator(".monaco-editor .mentor-line")).toHaveCount(1);
    await jump.click();
  });

  test("the hint button climbs the hint ladder", async ({ page }) => {
    const hint = page.getByRole("button", { name: /Hint/ });
    await expect(hint).toContainText("0 of 4 used");
    await hint.click();
    await expect(chat(page)).toContainText("Asked for a hint (level 1)");
    await expect(chat(page)).toContainText("Here is a nudge");
    await expect(hint).toContainText("1 of 4 used");
    await hint.click();
    await expect(hint).toContainText("2 of 4 used");
  });

  test("a failed reply can be retried", async ({ page }) => {
    // The fake fails each distinct message once (server-wide), so make the text unique per run.
    const message = `FAIL_ONCE what should I do ${test.info().repeatEachIndex}-${Date.now()}`;
    await send(page, message);
    const alert = chat(page).getByRole("alert");
    await expect(alert).toBeVisible();
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(chat(page)).toContainText(`You said: "${message}"`);
    await expect(alert).toBeHidden();
  });

  test("reloading while the mentor is mid-reply still saves the reply", async ({ page }) => {
    await send(page, "#slow tell me something long please");
    // Partway through the reply…
    await expect(chat(page)).toContainText("You said:");
    await expect(page.getByRole("button", { name: /Hint/ })).toBeDisabled();
    await page.reload();
    // …the server finishes the turn anyway, so the full reply is there once it's done.
    await expect(async () => {
      await page.reload();
      await expect(chat(page)).toContainText('You said: "tell me something long please". What is your next step?', { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(chat(page).getByRole("alert")).toBeHidden();
  });

  test("a reload keeps the conversation, stage and code", async ({ page }) => {
    await send(page, "I get it #advance");
    await expect(currentStage(page)).toHaveText("Examples");
    await setCode(page, "function keepMe() {\n  return 42;\n}\n");
    // Code is saved ~2.5 s after the last edit.
    await expect(page.getByText(/synced/)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(chat(page)).toContainText('You said: "I get it"');
    await expect(currentStage(page)).toHaveText("Examples");
    await expect(page.locator(".monaco-editor")).toContainText("keepMe");
  });
});
