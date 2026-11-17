/**
 * @jest-environment node
 *
 * The revision diff: blocks first, then words inside a changed block.
 */

import { diffBlocks, diffWords, type DiffPart } from "./diff";

const join = (parts: DiffPart[], keep: DiffPart["kind"]) => parts.filter((p) => p.kind !== keep).map((p) => p.text).join("");

test("identical revisions are all the same", () => {
  expect(diffBlocks(["a b", "c"], ["a b", "c"])).toEqual([
    { kind: "same", text: "a b" },
    { kind: "same", text: "c" },
  ]);
});

test("an added and a removed block", () => {
  expect(diffBlocks(["one", "two"], ["one", "three", "two"])).toEqual([
    { kind: "same", text: "one" },
    { kind: "added", text: "three" },
    { kind: "same", text: "two" },
  ]);
  expect(diffBlocks(["one", "two"], ["two"])).toEqual([
    { kind: "removed", text: "one" },
    { kind: "same", text: "two" },
  ]);
});

test("a changed block marks only the words that changed", () => {
  const [block] = diffBlocks(["India won by 6 runs."], ["India won by 7 runs."]);
  expect(block.kind).toBe("changed");
  const parts = (block as { parts: DiffPart[] }).parts;
  expect(parts.filter((p) => p.kind !== "same")).toEqual([
    { kind: "removed", text: "6" },
    { kind: "added", text: "7" },
  ]);
});

test("a word diff joins back to each side exactly, spaces included", () => {
  const before = "The  lower house voted on Tuesday.";
  const after = "The lower house passed it on Wednesday.";
  const parts = diffWords(before, after);
  expect(join(parts, "added")).toBe(before);
  expect(join(parts, "removed")).toBe(after);
});

test("Hindi words diff as words", () => {
  const before = "भारत ने मैच जीता";
  const after = "भारत ने सीरीज़ जीती";
  const parts = diffWords(before, after);
  expect(parts.filter((p) => p.kind === "removed").map((p) => p.text)).toEqual(["मैच", "जीता"]);
  expect(parts.filter((p) => p.kind === "added").map((p) => p.text)).toEqual(["सीरीज़", "जीती"]);
  expect(join(parts, "added")).toBe(before);
  expect(join(parts, "removed")).toBe(after);
});
