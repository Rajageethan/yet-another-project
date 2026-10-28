import { correctSolution, expect, send, setCode, signUp, test, testPanel, wrongSolution } from "./fixtures";

test("full day: explain, submit (fail, then pass), score, reflect, progress, history", async ({ page }) => {
  await signUp(page, { name: "Ravi Test" });
  const title = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  await send(page, "My plan: remember what I have seen as I go");
  await expect(page.getByLabel("Conversation with mentor")).toContainText("You said:");

  // A failing submit shows results and stays on the problem; visible tests are not labelled hidden.
  await setCode(page, await wrongSolution(page));
  await page.getByRole("button", { name: "Submit" }).click();
  const panel = testPanel(page);
  await expect(panel).toContainText(/0 of \d+ passed · including hidden tests/);
  await expect(panel).not.toContainText("Hidden test");
  await expect(page).toHaveURL(/\/today$/);

  // A correct submit leads to the score page.
  await setCode(page, await correctSolution(page));
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/session\/\w+$/, { timeout: 30_000 });
  await expect(page.getByText(/Solved · all \d+ tests passed/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByText("2 test runs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thinking score" })).toBeVisible();
  // Scripted assessment: 4,3,4,5,5,4 → 83, no hints.
  await expect(page.getByText("83", { exact: true })).toBeVisible();
  const complexityRow = page.getByRole("listitem").filter({ hasText: "Complexity analysis" });
  await expect(complexityRow).toContainText("5/5");
  await expect(page.getByText("Fake assessment: you explained your idea before coding.")).toBeVisible();
  await expect(page.getByText(/Quick re-solve scheduled for/)).toBeVisible();

  await page.getByLabel("What was the key insight, in one sentence?").fill("Look things up instead of rescanning.");
  await page.getByRole("button", { name: "Save to notebook" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved to your pattern notebook");
  await expect(page.getByRole("button", { name: "Update notebook" })).toBeVisible();

  // Today now shows the result instead of a new problem.
  await page.goto("/today");
  await expect(page).toHaveURL(/\/session\/\w+$/);

  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Progress" }).click();
  await expect(page.getByRole("link", { name: "Current streak: 1 day" })).toBeVisible();
  const solvedStat = page.getByText("Problems solved").locator("..");
  await expect(solvedStat).toContainText("1");
  await expect(page.getByText("Look things up instead of rescanning.")).toBeVisible();
  // A clean solve at your level moves you up from Easy.
  await expect(page.getByText(/Current level: Medium/)).toBeVisible();

  await nav.getByRole("link", { name: "History" }).click();
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText("Solved");
  await expect(row).toContainText("83");
  await page.getByRole("link", { name: "Solved", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  await page.getByRole("link", { name: "Needed help" }).click();
  await expect(page.getByText("No sessions match these filters.")).toBeVisible();
  await page.getByRole("link", { name: "All", exact: true }).click();
  await page.getByRole("row").filter({ hasText: title }).getByRole("link", { name: "Replay" }).click();
  await expect(page.getByText(/Session replay ·/)).toBeVisible();
});
