/**
 * Panel 7, M1: the grievance status page holds the lookup, leads back to the grievance page, and is
 * kept out of search engines.
 */

jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));

import { render, screen } from "@testing-library/react";
import StatusPage, { metadata } from "./page";

test("the heading, the lookup, the way back, and kept out of search engines", () => {
  render(<StatusPage />);
  expect(screen.getByRole("heading", { level: 1, name: "Grievance status" })).toBeInTheDocument();
  expect(screen.getByRole("form", { name: "Your grievance's status" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Grievance Redressal" })).toHaveAttribute("href", "/grievance");
  expect(metadata.robots).toEqual({ index: false, follow: true });
  expect(metadata.alternates?.canonical).toBe("/grievance/status");
});
