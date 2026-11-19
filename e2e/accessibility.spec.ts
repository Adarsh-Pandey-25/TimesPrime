// The sign-in page and the welcome page (Panel 1) checked with axe (WCAG 2.1 A and AA), and the
// sign-in page with the keyboard alone. Read-only: nothing is submitted, so nothing reaches the
// database.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Nothing is excluded: since the split (ADR 0006) the sign-in page is in the back office, which does
// not render the public site's chrome and its contrast defects (BL-037).
const violations = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

test("the staff sign-in step", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

// Panel 1: where a one-time link lands; without a token it explains itself and asks the server nothing.
test("the welcome page, without a token", async ({ page }) => {
  await page.goto("/admin/welcome");
  await expect(page.getByRole("heading", { name: "This link does not work" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("keyboard only: Tab reaches every control in order", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeFocused();
});
