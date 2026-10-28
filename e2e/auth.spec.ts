import { expect, signUp, test } from "./fixtures";

test.describe("signing up and access control", () => {
  test("landing page leads to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One problem a day");
    await page.getByRole("link", { name: "Start today's problem" }).click();
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole("link", { name: "DSA Mentor" })).toHaveAttribute("href", "/");
  });

  test("new student signs up, onboards and lands on today's problem", async ({ page }) => {
    await signUp(page, { name: "Asha Kumar" });
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
    await expect(page.getByText(/^Day 1$/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Current streak: 0 days/ })).toBeVisible();
    await expect(page.getByLabel("Signed in as Asha Kumar")).toHaveText("AK");
  });

  test("an invalid email shows an error instead of crashing", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel("Name").fill("X");
    // Passes the browser's email check but not the server's (no dot in the domain).
    await page.getByLabel("Email").fill("student@localhost");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/signin\?error=CredentialsSignin/);
    // Scoped to main: Next.js also renders a role="alert" route announcer.
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Enter a name and a valid email address");
  });

  test("logged-out visitors are redirected and APIs refuse them", async ({ page, request }) => {
    for (const path of ["/today", "/progress", "/history", "/settings", "/onboarding"]) {
      await page.goto(path);
      await expect(page, `${path} should redirect`).toHaveURL(/\/signin$/);
    }
    for (const api of ["chat", "snapshot", "run", "hidden", "submit"]) {
      const res = await request.post(`/api/session/some-id/${api}`, { data: { kind: "start", cases: [] } });
      expect(res.status(), `/api/session/:id/${api}`).toBe(404);
    }
  });

  test("signing out ends the session", async ({ page }) => {
    await signUp(page);
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/today");
    await expect(page).toHaveURL(/\/signin$/);
  });
});
