/**
 * @jest-environment node
 *
 * F-028: the root layout puts the pre-paint theme script in <head>, before
 * <body>, so it runs before anything is painted. The providers and widgets
 * are stubbed to pass their children through.
 */

jest.mock("next/font/google", () => ({ PT_Serif: () => ({ variable: "font-serif-var" }) }));
jest.mock("@timesprime/ui/ThemeContext", () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/context/LanguageContext", () => ({ LanguageProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/components/chat/FloatingAiAssistant", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/BreakingNewsBanner", () => ({ __esModule: true, default: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import RootLayout from "./layout";
import { THEME_INIT_SCRIPT } from "@timesprime/shared/config/theme";

test("the theme script is in <head>, before <body>", () => {
  const markup = renderToStaticMarkup(RootLayout({ children: <main>page</main> }));
  const script = `<script>${THEME_INIT_SCRIPT}</script>`;
  expect(markup).toContain(`<head>${script}</head>`);
  expect(markup.indexOf(script)).toBeLessThan(markup.indexOf("<body"));
});

test("<html> keeps suppressHydrationWarning, so the class the script adds is not a hydration error", () => {
  const element = RootLayout({ children: null });
  expect(element.type).toBe("html");
  expect(element.props.suppressHydrationWarning).toBe(true);
});
