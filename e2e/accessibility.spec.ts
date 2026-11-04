// The sign-in page checked with axe (WCAG 2.1 A and AA) and with the keyboard alone. Read-only:
// nothing is submitted, so nothing reaches the database.

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

test("the shared-password step", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByRole("button", { name: "Use the shared admin password" }).click();
  await expect(page.getByLabel("Shared password")).toBeFocused();
  expect(await violations(page)).toEqual([]);
});

test("keyboard only: Tab reaches every control in order, and Enter switches steps", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Use the shared admin password" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Shared password")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Use a staff account" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Email")).toBeFocused();
});
