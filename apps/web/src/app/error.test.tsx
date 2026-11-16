/**
 * The reader site's error boundary pages (R1-07): each reports the error to Sentry, since a
 * boundary that catches it would otherwise swallow it, and offers a retry.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerClientErrorReporter } from "@timesprime/shared/lib/clientErrorReport";
import ErrorPage from "./error";
import GlobalError from "./global-error";
import NotFound, { metadata } from "./not-found";
import { LanguageProvider } from "@/context/LanguageContext";

test("error.tsx reports the error once, shows its digest, and retries on click", async () => {
  const error = Object.assign(new Error("boom"), { digest: "d-42" });
  const retry = jest.fn();
  // What instrumentation-client.ts registers in the app: Sentry.captureException.
  const report = jest.fn();
  registerClientErrorReporter(report);
  await act(async () => {
    render(
      <LanguageProvider>
        <ErrorPage error={error} retry={retry} />
      </LanguageProvider>
    );
  });
  expect(report).toHaveBeenCalledWith(error);
  expect(screen.getByText("Reference: d-42")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test("a thrown value that is not an Error has no digest to show", async () => {
  await act(async () => {
    render(
      <LanguageProvider>
        <ErrorPage error="a string" retry={() => {}} />
      </LanguageProvider>
    );
  });
  expect(screen.queryByText(/Reference/)).not.toBeInTheDocument();
});

test("global-error.tsx is a whole document, in both languages, with a retry", () => {
  const html = renderToStaticMarkup(<GlobalError error={new Error("layout")} retry={() => {}} />);
  // React moves the <title> into <head>.
  expect(html).toMatch(/^<html lang="en"><head><title>Something went wrong \| TimesPrime News<\/title><\/head><body/);
  expect(html).toContain("Something went wrong");
  expect(html).toContain("कुछ गड़बड़ हो गई");
  expect(html).toContain("Try again / फिर से कोशिश करें");
});

test("not-found.tsx: its title, and the not-found message", async () => {
  expect(metadata.title).toBe("Page not found");
  await act(async () => {
    render(<LanguageProvider>{NotFound()}</LanguageProvider>);
  });
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
});
