/**
 * The back office's error and not-found pages (R1-07).
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerClientErrorReporter } from "@timesprime/shared/lib/clientErrorReport";
import ErrorPage from "./error";
import GlobalError from "./global-error";
import NotFound, { metadata } from "./not-found";

test("error.tsx reports the error, shows its digest, retries, and links the dashboard", async () => {
  const error = Object.assign(new Error("boom"), { digest: "d-7" });
  const retry = jest.fn();
  // What instrumentation-client.ts registers in the app: Sentry.captureException.
  const report = jest.fn();
  registerClientErrorReporter(report);
  await act(async () => {
    render(<ErrorPage error={error} retry={retry} />);
  });
  expect(report).toHaveBeenCalledWith(error);
  expect(screen.getByText("Reference: d-7")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "Back to the dashboard" })).toHaveAttribute("href", "/admin");
});

test("global-error.tsx is a whole document with a retry", () => {
  const html = renderToStaticMarkup(<GlobalError error={new Error("layout")} retry={() => {}} />);
  // React moves the <title> into <head>.
  expect(html).toMatch(/^<html lang="en"><head><title>Something went wrong \| TimesPrime Admin<\/title><\/head><body/);
  expect(html).toContain("Something went wrong");
  expect(html).toContain("Try again");
});

test("not-found.tsx: its title, the message, and no retry", () => {
  expect(metadata.title).toBe("Page not found");
  render(NotFound());
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
