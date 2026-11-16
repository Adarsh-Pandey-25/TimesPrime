import "server-only";

import type { Article } from "@timesprime/shared/types";
import { findArticleByLink } from "../../repositories/db";

/**
 * The stored story whose link is exactly `link`, or null: only a story we stored may be shown on
 * the article page and linked to as its publisher's (F-005). An
 * attacker can put any URL in the page's `?url=`; only one we stored is
 * trusted. Exact match: the app's link builders pass the stored value unchanged.
 */
export async function findKnownArticle(link: string | undefined | null): Promise<Article | null> {
  if (!link) return null;
  return findArticleByLink(link);
}
