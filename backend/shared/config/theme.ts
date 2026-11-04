/**
 * The saved theme, shared by ThemeContext (which reads and writes it) and
 * the root layout's pre-paint script (which only reads it).
 */
export const THEME_STORAGE_KEY = "timesprime_theme";

/** The page background ThemeContext paints for each theme. */
export const THEME_BACKGROUND = { light: "#f8fafc", dark: "#1a1c1e" } as const;

/**
 * Runs in <head> while the HTML is parsed, before the first paint (F-028).
 * ThemeContext applies the saved theme in an effect, after hydration, so a
 * reader who chose dark saw the light page first. This sets the same `dark`
 * class on <html>, which every `dark:` variant keys on (globals.css), and the
 * same background. It never throws: storage can be unavailable.
 *
 * Inline, so a Content-Security-Policy without 'unsafe-inline' would block
 * it. None is set today (next.config.ts, proxy.ts); one added later needs a
 * nonce or this script's hash.
 */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark"){var d=document.documentElement;d.classList.add("dark");d.style.backgroundColor=${JSON.stringify(THEME_BACKGROUND.dark)}}}catch(e){}})()`;
