/**
 * F-028: the root layout's pre-paint theme script, run as the browser runs
 * it: a plain script in the document, before React.
 */

import { THEME_BACKGROUND, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

const html = document.documentElement;
const run = () => new Function(THEME_INIT_SCRIPT)();

beforeEach(() => {
  localStorage.clear();
  html.className = "";
  html.removeAttribute("style");
});

test("a saved dark theme sets the dark class and background on <html>", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "dark");
  run();
  expect(html.classList.contains("dark")).toBe(true);
  expect(html.style.backgroundColor).toBe("rgb(26, 28, 30)"); // THEME_BACKGROUND.dark
  expect(THEME_BACKGROUND.dark).toBe("#1a1c1e");
});

test.each([["light"], [null]])("a saved %p theme leaves the page light", (saved) => {
  if (saved) localStorage.setItem(THEME_STORAGE_KEY, saved);
  run();
  expect(html.classList.contains("dark")).toBe(false);
  expect(html.style.backgroundColor).toBe("");
});

test("storage that throws is ignored, not raised", () => {
  const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("SecurityError");
  });
  expect(run).not.toThrow();
  expect(html.classList.contains("dark")).toBe(false);
  spy.mockRestore();
});

test("it reads the key ThemeContext writes", () => {
  expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
  expect(THEME_STORAGE_KEY).toBe("timesprime_theme");
});
