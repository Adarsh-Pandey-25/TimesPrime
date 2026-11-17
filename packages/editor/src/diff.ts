/**
 * The revision diff (Panel 2 design §3): what changed between two revisions, block by block, and
 * word by word inside a changed block. Our own code (owner decision 4 of the design's approval: no
 * diff package). Blocks first keeps it cheap on long stories: the word-level pass only ever runs on
 * one changed paragraph against its replacement.
 */

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

/** One block of the diff: unchanged, added, removed, or changed with its words marked. */
export type BlockDiff =
  | { kind: "same"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "changed"; parts: DiffPart[] };

/** The longest common subsequence's moves between two sequences: equal, delete from a, insert from b. */
function lcsMoves<T>(a: readonly T[], b: readonly T[]): Array<"=" | "-" | "+"> {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const moves: Array<"=" | "-" | "+"> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      moves.push("=");
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      moves.push("-");
      i++;
    } else {
      moves.push("+");
      j++;
    }
  }
  while (i++ < n) moves.push("-");
  while (j++ < m) moves.push("+");
  return moves;
}

/** Words and the spaces between them, so a diff joins back to the original text exactly. */
const tokens = (text: string) => text.split(/(\s+)/).filter((t) => t.length > 0);

/** The word-level diff of one block against its replacement; neighbouring parts of a kind merge. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  for (const move of lcsMoves(a, b)) {
    if (move === "=") {
      push("same", a[i++]);
      j++;
    } else if (move === "-") push("removed", a[i++]);
    else push("added", b[j++]);
  }
  return parts;
}

/** The longest blocks the word pass compares: past this a changed block shows as removed and added. */
const MAX_WORD_DIFF_TOKENS = 4000;

/**
 * The diff of two revisions' text blocks (text.ts). A removed block followed by an added one is
 * shown as one changed block, with its words marked.
 */
export function diffBlocks(before: readonly string[], after: readonly string[]): BlockDiff[] {
  const out: BlockDiff[] = [];
  let i = 0;
  let j = 0;
  const moves = lcsMoves(before, after);
  for (let k = 0; k < moves.length; k++) {
    const move = moves[k];
    if (move === "=") {
      out.push({ kind: "same", text: before[i++] });
      j++;
    } else if (move === "-" && moves[k + 1] === "+") {
      const a = before[i++];
      const b = after[j++];
      k++;
      out.push(
        tokens(a).length + tokens(b).length <= MAX_WORD_DIFF_TOKENS
          ? { kind: "changed", parts: diffWords(a, b) }
          : { kind: "changed", parts: [{ kind: "removed", text: a }, { kind: "added", text: b }] }
      );
    } else if (move === "-") {
      out.push({ kind: "removed", text: before[i++] });
    } else {
      out.push({ kind: "added", text: after[j++] });
    }
  }
  return out;
}
