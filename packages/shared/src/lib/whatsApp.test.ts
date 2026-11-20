/**
 * @jest-environment node
 *
 * "Copy for WhatsApp" (Panel 3, M1): the message a desk posts to the WhatsApp Channel by hand.
 */

import { whatsAppMessage } from "./whatsApp";

test("the headline in bold, the dek, and the address tagged for WhatsApp", () => {
  expect(whatsAppMessage({ headline: "Budget passes", dek: "The house voted 300 to 120.", url: "https://timesprime247.com/india/budget-passes-101" })).toBe(
    "*Budget passes*\nThe house voted 300 to 120.\nhttps://timesprime247.com/india/budget-passes-101?utm_source=whatsapp&utm_medium=social&utm_campaign=channel"
  );
});

test("a Hindi story keeps its own words; the address is encoded once", () => {
  const text = whatsAppMessage({ headline: "संसद में बजट पास", dek: "सदन ने 300 के मुकाबले 120 मतों से पारित किया।", url: "https://timesprime247.com/hi/india/budget-paas-102" });
  expect(text.split("\n")).toEqual([
    "*संसद में बजट पास*",
    "सदन ने 300 के मुकाबले 120 मतों से पारित किया।",
    "https://timesprime247.com/hi/india/budget-paas-102?utm_source=whatsapp&utm_medium=social&utm_campaign=channel",
  ]);
});

test("no dek: two lines; asterisks in a headline would break the bold, so they are dropped", () => {
  expect(whatsAppMessage({ headline: "5* hotel *fire*", dek: null, url: "https://timesprime247.com/india/fire-1" })).toBe(
    "*5 hotel fire*\nhttps://timesprime247.com/india/fire-1?utm_source=whatsapp&utm_medium=social&utm_campaign=channel"
  );
});

test("an address that already has a query keeps it, and the tags are not doubled", () => {
  const text = whatsAppMessage({ headline: "H", dek: "", url: "https://timesprime247.com/india/h-1?utm_source=old&x=1" });
  expect(text.split("\n")[1]).toBe("https://timesprime247.com/india/h-1?utm_source=whatsapp&x=1&utm_medium=social&utm_campaign=channel");
});
