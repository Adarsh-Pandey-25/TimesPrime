import "server-only";

import { findArticleByLink } from "@/backend/repositories/db";
import { MOCK_ARTICLES } from "@/shared/config/newsConfig";

/**
 * Whether `link` names an article this app serves, and so may be shown as a
 * publisher link, scraped, and linked from the article page (F-005). An
 * attacker can put any URL in the page's `?url=`; only one we stored, or one
 * of the built-in mock articles the feed falls back to, is trusted.
 * Exact match: the app's link builders pass the stored value unchanged.
 */
export async function findKnownArticle(link: string | undefined | null): Promise<{ title: string; link: string } | null> {
  if (!link) return null;
  const mock = MOCK_ARTICLES.find((article) => article.link === link);
  if (mock) return { title: mock.title, link: mock.link };
  return findArticleByLink(link);
}
