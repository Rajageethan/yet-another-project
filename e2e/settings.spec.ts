import { expect, signUp, test } from "./fixtures";

test.describe("settings", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await page.goto("/settings");
  });

  test("preferences are saved", async ({ page }) => {
    await page.getByRole("radio", { name: /Interviewer/ }).check();
    await page.getByRole("checkbox", { name: /Mentor can interrupt/ }).uncheck();
    await page.getByRole("combobox", { name: "Default language" }).selectOption("python");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");
    await page.reload();
    await expect(page.getByRole("radio", { name: /Interviewer/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Mentor can interrupt/ })).not.toBeChecked();
    await expect(page.getByRole("combobox", { name: "Default language" })).toHaveValue("python");
  });

  test("a malformed Groq key is rejected", async ({ page }) => {
    await page.getByLabel(/Your Groq API key/).fill("not-a-key");
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("doesn't look like a Groq key");
  });

  test("retaking topic ratings opens the profile editor with a way back", async ({ page }) => {
    await page.getByRole("link", { name: "Retake" }).click();
    await expect(page.getByRole("heading", { name: "Update your profile" })).toBeVisible();
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });
});
