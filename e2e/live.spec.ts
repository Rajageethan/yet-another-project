import { chat, currentStage, expect, send, signUp, test } from "./fixtures";

// Only in `npm run e2e:live`: talks to the real Groq mentor (uses quota, wording varies).
test("the real mentor greets, replies with one question and keeps its stage tag hidden", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  // Every mentor message carries one "Mentor" label.
  const labels = chat(page).getByText("Mentor", { exact: true });
  await expect(labels).toHaveCount(1, { timeout: 30_000 });
  const greeting = labels.first().locator("..");
  await expect(greeting).toContainText("?");

  await send(page, "We get a list of numbers and must return something about it. I think I understand what is asked.");
  await expect(labels).toHaveCount(2, { timeout: 45_000 });
  await expect(chat(page).getByRole("alert")).toHaveCount(0);
  // Wait for the stream to finish (Send is re-enabled once the mentor is done).
  await expect(page.getByRole("button", { name: /Hint/ })).toBeEnabled({ timeout: 45_000 });

  const reply = (await labels.last().locator("..").innerText()).replace(/^Mentor\s*/, "").trim();
  test.info().annotations.push({ type: "greeting", description: (await greeting.innerText()).replace(/^Mentor\s*/, "") });
  test.info().annotations.push({ type: "reply", description: reply });
  console.log(`[live] reply: ${reply}`);
  expect(reply.length).toBeGreaterThan(10);
  expect(reply).not.toContain("[[stage");
  expect(reply.split("?").length - 1, `one question per reply: ${reply}`).toBeLessThanOrEqual(1);
  await expect(currentStage(page)).toBeVisible();
});
