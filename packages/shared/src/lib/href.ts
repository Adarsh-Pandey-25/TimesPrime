// What a link in a story, a related link or a live update may point to (Panel 2 design §5): an https
// address, an email address, or a path on this site. Here, not in packages/editor, so that the
// server's code (which imports no React UI) checks links by the same rule the editor does.

/** An https URL, a mailto: address, or a path on this site. */
export function isAllowedHref(href: string): boolean {
  if (typeof href !== "string") return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}
