/**
 * @jest-environment node
 *
 * The legal-orders register (Panel 7, M4): the fields Legal enters, the story addresses, the deadline's
 * clock, and the same values as the database's.
 */

import fs from "fs";
import path from "path";
import { AUTHORITY_TYPES, legalOrderFields, ORDER_ASKS, ORDER_STATUSES, orderClock, RECEIVED_VIA, storyAddresses } from "./legalOrders";

const NOW = Date.parse("2026-11-21T06:00:00Z");
const VALID = {
  reference: " W.P.(C) 1234/2026 ",
  authority_type: "court",
  authority: " Delhi High Court ",
  order_date: "2026-11-19",
  received_at: "2026-11-20T10:00:00Z",
  received_via: "email",
  asks: ["remove_or_block", "remove_or_block", "preserve_records"],
  summary: " Take down the story about X within 36 hours. ",
  due_at: "2026-11-22T10:00:00Z",
  original_kept_at: " Legal's drive ",
  stories: [" /india/x-12 ", "/india/x-12", ""],
};

test("an order's fields, trimmed, its asks and stories without repeats", () => {
  expect(legalOrderFields(VALID, NOW)).toEqual({
    ok: true,
    fields: {
      reference: "W.P.(C) 1234/2026",
      authorityType: "court",
      authority: "Delhi High Court",
      orderDate: "2026-11-19",
      receivedAt: "2026-11-20T10:00:00.000Z",
      receivedVia: "email",
      asks: ["remove_or_block", "preserve_records"],
      summary: "Take down the story about X within 36 hours.",
      dueAt: "2026-11-22T10:00:00.000Z",
      originalKeptAt: "Legal's drive",
      storyAddresses: ["/india/x-12"],
    },
  });
  const bare = legalOrderFields({ ...VALID, order_date: "", due_at: null, stories: undefined }, NOW);
  expect(bare.ok && [bare.fields.orderDate, bare.fields.dueAt, bare.fields.storyAddresses]).toEqual([null, null, []]);
});

test.each([
  ["no reference", { reference: " " }, /reference/],
  ["an unknown authority", { authority_type: "army" }, /authority_type/],
  ["no authority's name", { authority: "" }, /authority's name/],
  ["a bad order date", { order_date: "19/11/2026" }, /order_date/],
  ["no arrival", { received_at: null }, /received_at/],
  ["an arrival in the future", { received_at: "2026-12-01T00:00:00Z" }, /future/],
  ["an unknown way", { received_via: "fax" }, /received_via/],
  ["nothing asked", { asks: [] }, /asks/],
  ["an unknown ask", { asks: ["arrest"] }, /asks/],
  ["no summary", { summary: "" }, /summary/],
  ["a bad deadline", { due_at: "tomorrow" }, /due_at/],
  ["nowhere for the original", { original_kept_at: " " }, /original/],
  ["stories that are not a list", { stories: "/india/x-12" }, /stories/],
])("refuses %s", (_name, change, words) => {
  const result = legalOrderFields({ ...VALID, ...change }, NOW);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(words);
});

test("at most 20 story addresses", () => {
  expect(storyAddresses(Array.from({ length: 21 }, (_, i) => `/india/s-${i + 1}`))).toBeNull();
  expect(storyAddresses(null)).toEqual([]);
});

test("the deadline's clock: done once complied or closed; late, due within 2 days, due, or none", () => {
  expect(orderClock({ status: "closed", due_at: "2026-11-20T00:00:00Z" }, NOW)).toBe("done");
  expect(orderClock({ status: "complied", due_at: null }, NOW)).toBe("done");
  expect(orderClock({ status: "open", due_at: null }, NOW)).toBe("none");
  expect(orderClock({ status: "open", due_at: "2026-11-21T05:00:00Z" }, NOW)).toBe("late");
  expect(orderClock({ status: "challenged", due_at: "2026-11-22T06:00:00Z" }, NOW)).toBe("due_soon");
  expect(orderClock({ status: "open", due_at: "2026-11-30T06:00:00Z" }, NOW)).toBe("due");
});

test("the values agree with compliance-4", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-21-compliance-4-legal-orders.sql"), "utf8");
  const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");
  expect(sql).toContain(`authority_type IN (${list(AUTHORITY_TYPES)})`);
  expect(sql).toContain(`received_via IN (${list(RECEIVED_VIA)})`);
  expect(sql).toContain(`ARRAY[${list(ORDER_ASKS)}]`);
  expect(sql).toContain(`status IN (${list(ORDER_STATUSES)})`);
});
