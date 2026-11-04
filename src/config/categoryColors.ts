/**
 * Per-category color system so different news types are visually distinct
 * at a glance (category badges, card accents, source-name dots).
 *
 * Tailwind class names are returned as complete literal strings, never
 * built via template interpolation (e.g. `bg-${color}-600`) — Tailwind's
 * build-time scanner only picks up class names it can see verbatim in
 * source, so a dynamically-assembled name would silently produce no CSS.
 */

interface CategoryColorDef {
  /** Raw hex, for contexts that need a color value rather than a class (e.g. an inline-styled dot). */
  hex: string;
  /** Semi-transparent background class (bg-*-600/90), for a badge over an image with backdrop-blur. */
  badgeBg: string;
}

const CATEGORY_COLORS: Record<string, CategoryColorDef> = {
  general: { hex: "#DC2626", badgeBg: "bg-red-600/90" },
  top: { hex: "#DC2626", badgeBg: "bg-red-600/90" },
  india: { hex: "#EA580C", badgeBg: "bg-orange-600/90" },
  world: { hex: "#2563EB", badgeBg: "bg-blue-600/90" },
  technology: { hex: "#0891B2", badgeBg: "bg-cyan-600/90" },
  tech: { hex: "#0891B2", badgeBg: "bg-cyan-600/90" },
  business: { hex: "#D97706", badgeBg: "bg-amber-600/90" },
  sports: { hex: "#16A34A", badgeBg: "bg-green-600/90" },
  entertainment: { hex: "#9333EA", badgeBg: "bg-purple-600/90" },
  health: { hex: "#0D9488", badgeBg: "bg-teal-600/90" },
  science: { hex: "#4F46E5", badgeBg: "bg-indigo-600/90" },
  politics: { hex: "#E11D48", badgeBg: "bg-rose-600/90" },
  crime: { hex: "#475569", badgeBg: "bg-slate-600/90" },
};

const DEFAULT_CATEGORY_COLOR: CategoryColorDef = {
  hex: "#DC2626",
  badgeBg: "bg-red-600/90",
};

function resolve(category: string): CategoryColorDef {
  return CATEGORY_COLORS[(category || "").toLowerCase().trim()] || DEFAULT_CATEGORY_COLOR;
}

export function getCategoryColor(category: string): string {
  return resolve(category).hex;
}

// Every card (featured and grid) uses this single brand-accent left-border
// color regardless of category — the colorful category badge
// (getCategoryBadgeBgClass) already communicates the category, so a second,
// per-category-colored signal on the border made the grid read like a
// kanban board rather than a cohesive editorial brand (design decision,
// August 2026). Matches the featured card's pre-existing border-red-600/70
// exactly. `category` is intentionally unused now — kept only so the
// existing call site doesn't need to change.
const UNIFIED_BORDER_CLASS = "border-l-red-600/70";

export function getCategoryBorderClass(_category?: string): string {
  return UNIFIED_BORDER_CLASS;
}

/** Semi-transparent badge background (bg-*-600/90) — pairs with backdrop-blur. */
export function getCategoryBadgeBgClass(category: string): string {
  return resolve(category).badgeBg;
}
