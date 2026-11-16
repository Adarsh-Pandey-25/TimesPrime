import "server-only";

import { findArticleByLink } from "../../repositories/db";

/**
 * Whether `link` names an article this app serves, and so may be shown as a
 * publisher link, scraped, and linked from the article page (F-005). An
 * attacker can put any URL in the page's `?url=`; only one we stored is
 * trusted. Exact match: the app's link builders pass the stored value unchanged.
 */
export async function findKnownArticle(link: string | undefined | null): Promise<{ title: string; link: string } | null> {
  if (!link) return null;
  return findArticleByLink(link);
}
