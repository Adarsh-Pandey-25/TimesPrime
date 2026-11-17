/**
 * The brand colours (R2; the owner's senior, 16 Nov 2026: the site's red, #E7000B). Tailwind 4's
 * red-600 is this colour, so the classes the pages use already match; CSS and inline styles that
 * need a value use these, or the --color-brand and --color-brand-dark tokens in each app's
 * globals.css. Tailwind 3's red-600 is gone (brand.test.ts).
 */
export const BRAND_COLOR = "#E7000B";

/** The pressed or flashing shade: Tailwind 4's red-700. */
export const BRAND_COLOR_DARK = "#C10007";
