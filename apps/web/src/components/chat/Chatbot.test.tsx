/**
 * F-027: the chatbot had no dark: classes, so it stayed a white panel on the
 * dark theme. Every light surface, border and text colour in it now has a
 * dark counterpart (dark mode is the `dark` class on <html>, globals.css).
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import Chatbot from "./Chatbot";

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

function classesOf(container: HTMLElement): string[][] {
  return [container.firstElementChild as Element, ...Array.from(container.querySelectorAll("*"))]
    .map((el) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean));
}

const LIGHT = [
  [/^bg-(white|slate-50(\/\d+)?)$/, /^dark:bg-/],
  [/^border(-[trbl])?-slate-200$/, /^dark:border(-[trbl])?-/],
  [/^text-slate-(500|600|800|900)$/, /^dark:text-/],
] as const;

test("every light background, border and text colour has a dark variant", async () => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch; // keeps "AI is thinking..." on screen
  const { container } = render(<Chatbot isOpen onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText("Ask AI news assistant..."), { target: { value: "Hello" } });
  await act(async () => {
    fireEvent.submit(screen.getByPlaceholderText("Ask AI news assistant...").closest("form") as HTMLFormElement);
  });
  expect(screen.getByText("AI is thinking...")).toBeInTheDocument();

  const missing: string[] = [];
  for (const classes of classesOf(container)) {
    for (const [light, dark] of LIGHT) {
      if (classes.some((c) => light.test(c)) && !classes.some((c) => dark.test(c))) missing.push(classes.join(" "));
    }
  }
  expect(missing).toEqual([]);
});
