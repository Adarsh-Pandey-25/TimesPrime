/**
 * The page's language follows the reader's choice on <html lang>. Hindi text needs it: the
 * Devanagari line heights in globals.css apply under :lang(hi), and screen readers pick the voice
 * from it.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider, useLanguage } from "./LanguageContext";

function Probe() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button onClick={() => setLanguage("hi")}>hi</button>
      <button onClick={() => setLanguage("en")}>en</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "en";
});

test("<html lang> is en by default", () => {
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(document.documentElement.lang).toBe("en");
});

test("a saved Hindi choice sets <html lang> to hi", () => {
  localStorage.setItem("timesprime_language", "hi");
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(document.documentElement.lang).toBe("hi");
});

test("switching language updates <html lang> both ways", () => {
  render(<LanguageProvider><Probe /></LanguageProvider>);
  fireEvent.click(screen.getByRole("button", { name: "hi" }));
  expect(document.documentElement.lang).toBe("hi");
  fireEvent.click(screen.getByRole("button", { name: "en" }));
  expect(document.documentElement.lang).toBe("en");
});
