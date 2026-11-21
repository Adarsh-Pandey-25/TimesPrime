/**
 * R3: the grievance page names the Grievance Officer, gives the email and the office address, and
 * says how fast a grievance is answered. No phone number.
 */

jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));

import { render, screen, within } from "@testing-library/react";
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
  expect(screen.getByText(/acknowledge every grievance within 24 hours/)).toBeInTheDocument();
  expect(screen.getByText(/decide on it within 15 days, and tell you the decision by email/)).toBeInTheDocument();
});

// Panel 7, M1: the form, and the way to a grievance's status; email stays the other way in.
test("it offers the form, the status page, and still the email", () => {
  render(<GrievancePage />);
  const form = screen.getByRole("form", { name: "Send a grievance" });
  for (const name of ["Your name", "Your email, for our reply", "Your grievance"]) expect(within(form).getByRole("textbox", { name })).toBeRequired();
  expect(within(form).getByRole("combobox", { name: "What is it about?" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "check your grievance's status" })).toHaveAttribute("href", "/grievance/status");
  expect(screen.getByRole("heading", { name: "Or by email" })).toBeInTheDocument();
});

test("it publishes no phone number", () => {
  const { container } = render(<GrievancePage />);
  expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  expect(container.textContent).not.toMatch(/phone|\+91|\b\d{10}\b/i);
});

test("its canonical link is /grievance", () => {
  expect(metadata.alternates?.canonical).toBe("/grievance");
});
