/**
 * A story body's plain text (Panel 2 design §3): for the revision diff, word counts and, later,
 * search. Reads the stored Tiptap JSON directly, without Tiptap, so it runs anywhere and never fails
 * on a body it does not understand: unknown nodes contribute their children's text.
 */

interface JsonNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
}

/** Nodes whose text stands as a block of its own. */
const BLOCKS = new Set(["paragraph", "heading", "listItem", "blockquote", "factbox", "relatedLink", "embed"]);

function walk(node: JsonNode, out: string[], current: string[]): void {
  if (typeof node.text === "string") {
    current.push(node.text);
    return;
  }
  if (node.type === "hardBreak") {
    current.push(" ");
    return;
  }
  if (node.type === "relatedLink") {
    out.push(String(node.attrs?.title ?? "").trim());
    return;
  }
  if (node.type === "embed") {
    out.push(String(node.attrs?.url ?? "").trim());
    return;
  }
  const isBlock = BLOCKS.has(node.type ?? "");
  const own: string[] = isBlock ? [] : current;
  for (const child of node.content ?? []) walk(child, out, own);
  if (isBlock && own.length > 0) out.push(own.join("").replace(/\s+/g, " ").trim());
}

/** The body's blocks of text, in order; empty blocks are dropped. */
export function textBlocks(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const out: string[] = [];
  const loose: string[] = [];
  walk(body as JsonNode, out, loose);
  if (loose.length > 0) out.push(loose.join("").replace(/\s+/g, " ").trim());
  return out.filter((block) => block.length > 0);
}

/** The body as one string, a blank line between blocks. */
export function plainText(body: unknown): string {
  return textBlocks(body).join("\n\n");
}

/** Words, counted the way a reader would: runs of non-space characters, in any script. */
export function wordCount(body: unknown): number {
  return textBlocks(body).reduce((sum, block) => sum + block.split(/\s+/).filter(Boolean).length, 0);
}
