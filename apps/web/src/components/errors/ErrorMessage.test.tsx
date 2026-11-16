/**
 * The reader site's not-found and error message (R1-07), in the reader's language.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import ErrorMessage from "./ErrorMessage";
import { LanguageProvider } from "@/context/LanguageContext";

async function renderIn(language: "en" | "hi", ui: React.ReactElement) {
  localStorage.setItem("timesprime_language", language);
  await act(async () => {
    render(<LanguageProvider>{ui}</LanguageProvider>);
  });
}

afterEach(() => localStorage.clear());

test("not found, in English: the heading and a link to the latest news, no retry", async () => {
  await renderIn("en", <ErrorMessage kind="not-found" />);
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to the latest news" })).toHaveAttribute("href", "/");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("not found, in Hindi", async () => {
  await renderIn("hi", <ErrorMessage kind="not-found" />);
  expect(screen.getByRole("heading", { name: "पेज नहीं मिला" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "ताज़ा समाचार पर लौटें" })).toHaveAttribute("href", "/");
});

test("an error: the retry button calls retry, and the digest is shown for support", async () => {
  const retry = jest.fn();
  await renderIn("en", <ErrorMessage kind="error" onRetry={retry} digest="1234567890" />);
  expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Reference: 1234567890")).toBeInTheDocument();
});

test("an error, in Hindi", async () => {
  await renderIn("hi", <ErrorMessage kind="error" onRetry={() => {}} />);
  expect(screen.getByRole("heading", { name: "कुछ गड़बड़ हो गई" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "फिर से कोशिश करें" })).toBeInTheDocument();
});
