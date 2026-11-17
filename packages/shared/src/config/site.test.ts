/**
 * @jest-environment node
 *
 * R3: the publisher's contact details, in one place for every page that shows them.
 */

import { CONTACT_EMAIL, GRIEVANCE_OFFICER, OFFICE_ADDRESS } from "./site";

test("the grievance officer is named, with a mailbox on the site's own domain", () => {
  expect(GRIEVANCE_OFFICER).toEqual({ name: "Adarsh Pandey", email: "adarsh@timesprime247.com" });
  expect(CONTACT_EMAIL).toBe(GRIEVANCE_OFFICER.email);
});

test("the office address is the one the owner's senior gave, with its state", () => {
  expect(OFFICE_ADDRESS.join(", ")).toBe("704A-704B, Iris Tech Park, Sector 48, Gurgaon 122018, Haryana, India");
});

test("no phone number is kept with the contact details", () => {
  const all = JSON.stringify({ GRIEVANCE_OFFICER, OFFICE_ADDRESS });
  expect(all).not.toMatch(/\+91|\b\d{10}\b|phone/i);
});
