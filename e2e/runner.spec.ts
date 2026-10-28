import { correctSolution, expect, getCode, run, setCode, signUp, test, testPanel, wrongSolution } from "./fixtures";

test.describe("running code in the browser", () => {
  test("JavaScript: correct, wrong, syntax error and infinite loop", async ({ page }) => {
    await signUp(page, { language: "javascript" });
    await expect(page.getByText("solution.js")).toBeVisible();
    const panel = testPanel(page);
    // Look these up while the starter code (with the function name) is still in the editor.
    const correct = await correctSolution(page);
    const wrong = await wrongSolution(page);

    await setCode(page, correct);
    await run(page);
    await expect(panel).toContainText("3 of 3 passed");
    await expect(panel.getByRole("img", { name: "Passed" })).toHaveCount(3);

    await setCode(page, wrong);
    await run(page);
    await expect(panel).toContainText("0 of 3 passed");
    await expect(panel.getByRole("img", { name: "Failed" })).toHaveCount(3);
    await expect(panel).toContainText("got 12345");

    await setCode(page, "function broken( {\n  return 1;\n}\n");
    await run(page);
    await expect(page.getByRole("button", { name: "console" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel).toContainText("SyntaxError");

    await setCode(page, correct.replace(/\{/, "{\n  while (true) {}"));
    await run(page);
    await expect(panel).toContainText("Time limit exceeded (3s)");

    // The runner recovers after the stuck worker was killed.
    await setCode(page, correct);
    await run(page);
    await page.getByRole("button", { name: "tests" }).click();
    await expect(panel).toContainText("3 of 3 passed");
  });

  test("each language keeps its own code when switching", async ({ page }) => {
    await signUp(page, { language: "javascript" });
    const js = await correctSolution(page);
    await setCode(page, js);
    const language = page.getByRole("combobox", { name: "Language" });
    await language.selectOption("python");
    await expect(page.getByText("solution.py")).toBeVisible();
    expect(await getCode(page)).toMatch(/^def \w+\(/);
    await language.selectOption("javascript");
    expect(await getCode(page)).toBe(js);
  });

  test("Python runs in Pyodide", async ({ page }) => {
    test.slow(); // downloads the Python runtime from the CDN
    await signUp(page, { language: "python" });
    await expect(page.getByText("solution.py")).toBeVisible();
    await setCode(page, await correctSolution(page));
    await run(page);
    await expect(testPanel(page)).toContainText("3 of 3 passed", { timeout: 60_000 });

    await setCode(page, "def f(nums):\n    return nums[99]\n" + (await correctSolution(page)).replace(/return /, "return f([1]) or "));
    await run(page);
    await expect(testPanel(page)).toContainText("IndexError");
  });
});
