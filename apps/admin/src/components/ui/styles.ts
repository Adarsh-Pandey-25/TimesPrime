// The back office's one look: the class names every screen's buttons, fields, cards and links use,
// so that a change of look is made once, here. Before this file each screen kept its own copy of
// the same strings. Plain strings, no component: a screen composes them (`${field} mt-0.5`) and
// Tailwind sees every class in this file.
//
// Hover and press effects only on what can be clicked or typed in, and only while it is enabled
// (`not-disabled:`, which also covers a link drawn as a button), so a disabled button never seems
// to answer. Movement is one pixel and short; the global stylesheet turns animations off for people
// who ask for reduced motion.

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold " +
  "transition-all duration-150 not-disabled:hover:-translate-y-px not-disabled:hover:shadow-md not-disabled:active:translate-y-0 " +
  "not-disabled:active:shadow-sm motion-reduce:not-disabled:hover:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40";

/** The ordinary button: outlined, for most actions. */
export const button =
  `${base} border-slate-300 shadow-sm not-disabled:hover:border-slate-400 not-disabled:hover:bg-slate-50 ` +
  "dark:border-[#3a3f47] dark:not-disabled:hover:border-[#4b515b] dark:not-disabled:hover:bg-[#2b2f36]";

/** The screen's main action (Save, Approve, Add): filled blue. One per form at most. */
export const buttonPrimary =
  `${base} border-blue-600 bg-blue-600 text-white shadow-sm not-disabled:hover:border-blue-700 not-disabled:hover:bg-blue-700 ` +
  "dark:border-blue-500 dark:bg-blue-600 dark:not-disabled:hover:bg-blue-500";

/** An action that takes something away (Take down, Revoke, Suspend): outlined red. */
export const buttonDanger =
  `${base} border-red-300 text-red-700 shadow-sm not-disabled:hover:border-red-400 not-disabled:hover:bg-red-50 ` +
  "dark:border-red-900 dark:text-red-300 dark:not-disabled:hover:border-red-700 dark:not-disabled:hover:bg-red-950/40";

/** The confirming button of a popup that takes something away: filled red. */
export const buttonDangerSolid =
  `${base} border-red-600 bg-red-600 text-white shadow-sm not-disabled:hover:border-red-700 not-disabled:hover:bg-red-700`;

/** A text field, select or text area, full width. */
export const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors duration-150 " +
  "hover:border-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "dark:border-[#3a3f47] dark:bg-[#25282d] dark:hover:border-[#4b515b] dark:focus:border-blue-400 dark:focus:ring-blue-400/20";

/** The same, sized by its content: a filter in a row of filters. */
export const fieldInline = field.replace("w-full ", "");

/** A section of a screen. */
export const card =
  "space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#2b2f36] dark:bg-[#202327]";

/** A link inside text or beside a heading. */
export const link =
  "font-semibold text-blue-700 underline-offset-2 transition-colors hover:text-blue-800 hover:underline " +
  "dark:text-blue-300 dark:hover:text-blue-200";

/** A row of a list or table that answers the pointer. */
export const rowHover = "transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-[#25282d]";

/** An item inside a card (a role, a request): a lighter box that answers the pointer. */
export const item =
  "rounded-xl border border-slate-200 p-3 text-sm transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50/60 " +
  "dark:border-[#2b2f36] dark:hover:border-[#3a3f47] dark:hover:bg-[#25282d]/60";

/** A page's title, and a card's. */
export const pageTitle = "font-serif text-2xl font-extrabold tracking-tight";
export const cardTitle = "font-serif text-lg font-bold";

/** Small grey words: a hint under a title, or beside a value. */
export const hint = "text-xs text-slate-500 dark:text-slate-400";

/** A field's label, above it. */
export const label = "block text-sm font-semibold text-slate-700 dark:text-slate-200";

/** The way back to a list, above a page's title. */
export const backLink =
  "inline-flex items-center gap-1 text-sm font-semibold text-slate-600 transition-colors hover:text-blue-700 " +
  "dark:text-slate-300 dark:hover:text-blue-300";

/** A small coloured tag for a status, a state or a flag, with its colour from `tone`. */
export const badge = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";
export const tone = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  slate: "bg-slate-100 text-slate-700 dark:bg-[#2b2f36] dark:text-slate-300",
} as const;

/** A smaller card, for a side column (the story screen's workflow) or a box inside a page. */
export const panel =
  "space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-[#2b2f36] dark:bg-[#202327]";
export const panelTitle = "text-sm font-bold";
