import { test as base, expect, type Page } from "@playwright/test";

/** Every test fails if the page throws an uncaught error. */
export const test = base.extend<{ failOnPageError: void }>({
  failOnPageError: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await use();
      expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

type Language = "python" | "javascript";

/** Signs up a brand-new student through the dev login and onboarding, ending on /today. */
export async function signUp(page: Page, opts: { language?: Language; name?: string } = {}) {
  const { language = "javascript", name = "Test Student" } = opts;
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto("/signin");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
  await page.getByRole("radio", { name: language === "python" ? "Python" : "JavaScript" }).check();
  await page.getByRole("button", { name: "Start my first problem" }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 30_000 });
  await waitForEditor(page);
  return { email };
}

export const chat = (page: Page) => page.getByLabel("Conversation with mentor");

/** Sends a chat message the way a student does: type, press Enter. */
export async function send(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Explain your thinking to the mentor" });
  await box.fill(text);
  await box.press("Enter");
}

export const currentStage = (page: Page) =>
  page.getByRole("list", { name: "Solving stages" }).locator('[aria-current="step"]');

export async function waitForEditor(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as unknown as { monaco?: { editor: { getModels(): unknown[] } } }).monaco;
    return !!m && m.editor.getModels().length > 0;
  });
}

/** Replaces the editor contents (typing whole solutions key by key fights Monaco's auto-indent). */
export async function setCode(page: Page, code: string) {
  await page.evaluate((c) => {
    const m = (window as unknown as { monaco: { editor: { getModels(): { setValue(v: string): void }[] } } }).monaco;
    m.editor.getModels()[0].setValue(c);
  }, code);
}

/** Pastes text into the editor the way Ctrl+V does, so the editor's paste handler runs. */
export async function pasteCode(page: Page, code: string) {
  await page.evaluate((c) => {
    type Ed = { focus(): void; trigger(source: string, handler: string, payload: unknown): void };
    const m = (window as unknown as { monaco: { editor: { getEditors(): Ed[] } } }).monaco;
    const editor = m.editor.getEditors()[0];
    editor.focus();
    editor.trigger("keyboard", "paste", { text: c });
  }, code);
}

export async function getCode(page: Page) {
  return page.evaluate(() => {
    const m = (window as unknown as { monaco: { editor: { getModels(): { getValue(): string }[] } } }).monaco;
    return m.editor.getModels()[0].getValue();
  });
}

/** The function the starter code asks for, e.g. "pairWithSum" or "pair_with_sum". */
export async function functionName(page: Page) {
  const code = await getCode(page);
  const name = code.match(/(?:function|def)\s+(\w+)/)?.[1];
  if (!name) throw new Error(`No function in starter code:\n${code}`);
  return name;
}

/**
 * Correct solutions for the problems a default onboarding can be assigned (easy Arrays & Hashing,
 * picked with a per-user random tie-break). A new default problem must be added here.
 */
const SOLUTIONS: Record<string, string> = {
  pairWithSum: `function pairWithSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}`,
  hasDuplicate: `function hasDuplicate(nums) {
  return new Set(nums).size !== nums.length;
}`,
  isAnagram: `function isAnagram(s, t) {
  return [...s].sort().join("") === [...t].sort().join("");
}`,
  topKFrequent: `function topKFrequent(nums, k) {
  const c = new Map();
  for (const x of nums) c.set(x, (c.get(x) || 0) + 1);
  return [...c.keys()].sort((a, b) => c.get(b) - c.get(a) || a - b).slice(0, k);
}`,
  pair_with_sum: `def pair_with_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
`,
  has_duplicate: `def has_duplicate(nums):
    return len(set(nums)) != len(nums)
`,
  is_anagram: `def is_anagram(s, t):
    return sorted(s) == sorted(t)
`,
  top_k_frequent: `def top_k_frequent(nums, k):
    from collections import Counter
    c = Counter(nums)
    return sorted(c, key=lambda v: (-c[v], v))[:k]
`,
};

export async function correctSolution(page: Page) {
  const name = await functionName(page);
  const code = SOLUTIONS[name];
  if (!code) throw new Error(`No reference solution in e2e/fixtures.ts for ${name}`);
  return code;
}

/** Valid code that always returns a wrong answer, in the editor's current language. */
export async function wrongSolution(page: Page) {
  const name = await functionName(page);
  const python = (await getCode(page)).trimStart().startsWith("def ");
  return python ? `def ${name}(*args):\n    return 12345\n` : `function ${name}(...args) {\n  return 12345;\n}\n`;
}

export async function run(page: Page) {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeEnabled({ timeout: 60_000 });
}

export const testPanel = (page: Page) => page.getByRole("region", { name: "Code editor and tests" }).locator("> div").last();
