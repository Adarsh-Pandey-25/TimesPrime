/**
 * R3: the grievance page names the Grievance Officer, gives the email and the office address, and
 * says how fast a grievance is answered. No phone number.
 */

jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));

import { render, screen } from "@testing-library/react";
import GrievancePage, { metadata } from "./page";

test("it names the officer, links the email and shows the office address", () => {
  render(<GrievancePage />);
  expect(screen.getByRole("heading", { level: 1, name: "Grievance Redressal" })).toBeInTheDocument();
  expect(screen.getByText("Adarsh Pandey")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "adarsh@timesprime247.com" })).toHaveAttribute("href", "mailto:adarsh@timesprime247.com");
  expect(screen.getByText("704A-704B, Iris Tech Park")).toBeInTheDocument();
  expect(screen.getByText("Gurgaon 122018")).toBeInTheDocument();
});

test("it says a grievance is acknowledged within 24 hours and decided within 15 days", () => {
  render(<GrievancePage />);
  expect(screen.getByText(/within 24 hours/)).toBeInTheDocument();
  expect(screen.getByText(/within 15 days/)).toBeInTheDocument();
});

test("it publishes no phone number", () => {
  const { container } = render(<GrievancePage />);
  expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  expect(container.textContent).not.toMatch(/phone|\+91|\b\d{10}\b/i);
});

test("its canonical link is /grievance", () => {
  expect(metadata.alternates?.canonical).toBe("/grievance");
});
