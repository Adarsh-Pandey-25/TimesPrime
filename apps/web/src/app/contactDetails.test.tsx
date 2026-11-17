/**
 * R3: the contact, privacy and terms pages show the publisher's real contact details from the site
 * config, never the old timesprime.in mailboxes, and no phone number. The privacy policy no longer
 * describes collection that does not happen (BL-008: newsletter, contact form, synced accounts,
 * a personalised feed).
 */

jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));

import { render, screen } from "@testing-library/react";
import ContactPage from "./contact/page";
import PrivacyPolicyPage from "./privacy/page";
import TermsOfUsePage from "./terms/page";

const pages = { contact: ContactPage, privacy: PrivacyPolicyPage, terms: TermsOfUsePage };

test.each(Object.entries(pages))("%s shows the confirmed mailbox, no old one and no phone number", (_name, Page) => {
  const { container } = render(<Page />);
  expect(container.textContent).toContain("adarsh@timesprime247.com");
  expect(container.textContent).not.toMatch(/timesprime\.in\b/);
  expect(container.textContent).not.toMatch(/phone|\+91|\b\d{10}\b/i);
  expect(container.querySelector('a[href^="tel:"]')).toBeNull();
});

test("contact links the email and the grievance page, and shows the office address", () => {
  render(<ContactPage />);
  expect(screen.getByRole("link", { name: /adarsh@timesprime247\.com/ })).toHaveAttribute("href", "mailto:adarsh@timesprime247.com");
  expect(screen.getByRole("link", { name: /Grievance Officer: Adarsh Pandey/ })).toHaveAttribute("href", "/grievance");
  expect(screen.getByText(/704A-704B, Iris Tech Park, Sector 48, Gurgaon 122018/)).toBeInTheDocument();
  expect(screen.queryByText(/advertis/i)).toBeNull();
});

test("privacy names the Grievance Officer and no longer describes collection that does not happen", () => {
  const { container } = render(<PrivacyPolicyPage />);
  expect(screen.getByRole("heading", { name: "Grievance Officer" })).toBeInTheDocument();
  expect(container.textContent).toContain("Adarsh Pandey");
  expect(container.textContent).not.toMatch(/newsletter|contact form|synced account|personali[sz]e/i);
});
