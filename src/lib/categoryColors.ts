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
  /** Solid background class, e.g. for a badge. */
  bg: string;
  /** Text color class. */
  text: string;
  /** Left-edge accent border class (border-l-*), for a card's category accent stripe. */
  border: string;
  /** Semi-transparent background class (bg-*-600/90), for a badge over an image with backdrop-blur. */
  badgeBg: string;
}

const CATEGORY_COLORS: Record<string, CategoryColorDef> = {
  general: { hex: "#DC2626", bg: "bg-red-600", text: "text-red-600", border: "border-l-red-600", badgeBg: "bg-red-600/90" },
  top: { hex: "#DC2626", bg: "bg-red-600", text: "text-red-600", border: "border-l-red-600", badgeBg: "bg-red-600/90" },
  india: { hex: "#EA580C", bg: "bg-orange-600", text: "text-orange-600", border: "border-l-orange-600", badgeBg: "bg-orange-600/90" },
  world: { hex: "#2563EB", bg: "bg-blue-600", text: "text-blue-600", border: "border-l-blue-600", badgeBg: "bg-blue-600/90" },
  technology: { hex: "#0891B2", bg: "bg-cyan-600", text: "text-cyan-600", border: "border-l-cyan-600", badgeBg: "bg-cyan-600/90" },
  tech: { hex: "#0891B2", bg: "bg-cyan-600", text: "text-cyan-600", border: "border-l-cyan-600", badgeBg: "bg-cyan-600/90" },
  business: { hex: "#D97706", bg: "bg-amber-600", text: "text-amber-600", border: "border-l-amber-600", badgeBg: "bg-amber-600/90" },
  sports: { hex: "#16A34A", bg: "bg-green-600", text: "text-green-600", border: "border-l-green-600", badgeBg: "bg-green-600/90" },
  entertainment: { hex: "#9333EA", bg: "bg-purple-600", text: "text-purple-600", border: "border-l-purple-600", badgeBg: "bg-purple-600/90" },
  health: { hex: "#0D9488", bg: "bg-teal-600", text: "text-teal-600", border: "border-l-teal-600", badgeBg: "bg-teal-600/90" },
  science: { hex: "#4F46E5", bg: "bg-indigo-600", text: "text-indigo-600", border: "border-l-indigo-600", badgeBg: "bg-indigo-600/90" },
  politics: { hex: "#E11D48", bg: "bg-rose-600", text: "text-rose-600", border: "border-l-rose-600", badgeBg: "bg-rose-600/90" },
  crime: { hex: "#475569", bg: "bg-slate-600", text: "text-slate-600", border: "border-l-slate-600", badgeBg: "bg-slate-600/90" },
};

const DEFAULT_CATEGORY_COLOR: CategoryColorDef = {
  hex: "#DC2626",
  bg: "bg-red-600",
  text: "text-red-600",
  border: "border-l-red-600",
  badgeBg: "bg-red-600/90",
};

function resolve(category: string): CategoryColorDef {
  return CATEGORY_COLORS[(category || "").toLowerCase().trim()] || DEFAULT_CATEGORY_COLOR;
}

export function getCategoryColor(category: string): string {
  return resolve(category).hex;
}

export function getCategoryBgClass(category: string): string {
  return resolve(category).bg;
}

export function getCategoryTextClass(category: string): string {
  return resolve(category).text;
}

export function getCategoryBorderClass(category: string): string {
  return resolve(category).border;
}

/** Semi-transparent badge background (bg-*-600/90) — pairs with backdrop-blur. */
export function getCategoryBadgeBgClass(category: string): string {
  return resolve(category).badgeBg;
}
