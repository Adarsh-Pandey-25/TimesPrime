/**
 * The reader site's not-found and error message (R1-07), in the reader's language. Since BL-039 it
 * carries both languages, each in a span with its own lang, and globals.css shows the one
 * <html lang> names: no language context, so the not-found page needs no client code.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";
import ErrorMessage, { type Message } from "./ErrorMessage";

const NOT_FOUND: Message = { en: { title: "Page not found", body: "Gone." }, hi: { title: "पेज नहीं मिला", body: "नहीं है।" } };
const ERROR: Message = { en: { title: "Something went wrong", body: "Try later." }, hi: { title: "कुछ गड़बड़ हो गई", body: "बाद में।" } };

/** The text a reader of `language` sees: the other language's spans are hidden by globals.css. */
function seenIn(language: "en" | "hi", element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(language === "hi" ? ".tp-lang-en" : ".tp-lang-hi").forEach((n) => n.remove());
  return clone.textContent ?? "";
}

test("not found: the heading and a link to the latest news in each language, no retry", () => {
  render(<ErrorMessage message={NOT_FOUND} />);
  const heading = screen.getByRole("heading", { level: 1 });
  expect(seenIn("en", heading)).toBe("Page not found");
  expect(seenIn("hi", heading)).toBe("पेज नहीं मिला");
  const home = screen.getByRole("link");
  expect(home).toHaveAttribute("href", "/");
  expect(seenIn("en", home)).toBe("Back to the latest news");
  expect(seenIn("hi", home)).toBe("ताज़ा समाचार पर लौटें");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("an error: the retry button calls retry, and the digest is shown for support", () => {
  const retry = jest.fn();
  render(<ErrorMessage message={ERROR} onRetry={retry} digest="1234567890" />);
  expect(seenIn("en", screen.getByRole("heading", { level: 1 }))).toBe("Something went wrong");
  expect(seenIn("hi", screen.getByRole("heading", { level: 1 }))).toBe("कुछ गड़बड़ हो गई");
  const button = screen.getByRole("button");
  expect(seenIn("en", button)).toBe("Try again");
  expect(seenIn("hi", button)).toBe("फिर से कोशिश करें");
  fireEvent.click(button);
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Reference: 1234567890")).toBeInTheDocument();
  expect(screen.getByText("संदर्भ: 1234567890")).toBeInTheDocument();
});

test("each language's text is marked with its lang, for screen readers", () => {
  const html = renderToStaticMarkup(<ErrorMessage message={NOT_FOUND} />);
  expect(html).toContain('<span lang="en" class="tp-lang-en">Page not found</span>');
  expect(html).toContain('<span lang="hi" class="tp-lang-hi">पेज नहीं मिला</span>');
});

test("globals.css hides the language <html lang> does not name", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
  expect(css).toMatch(/html:not\(\[lang="hi"\]\) \.tp-lang-hi,\s*html\[lang="hi"\] \.tp-lang-en \{\s*display: none;/);
});

test("it is a server-safe component: no client directive and no hook", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "ErrorMessage.tsx"), "utf8");
  expect(source).not.toMatch(/^["']use client["']/m);
  expect(source).not.toMatch(/\buse[A-Z]\w*\(/);
});
