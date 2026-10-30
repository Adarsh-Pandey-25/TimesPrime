/**
 * Hostnames next/image is allowed to fetch and optimize from. Shared
 * between next.config.ts (remotePatterns, enforced by the framework at the
 * /_next/image endpoint) and topicImages.ts (existingUrl validation before
 * ever handing a URL to <Image>) so the two can't drift out of sync.
 *
 * Kept deliberately small: article images come from hundreds of arbitrary
 * publisher domains via NewsData.io, which isn't a viable allowlist target
 * (same reasoning as the scraper's SSRF guard — see lib/urlValidation.ts).
 * Anything not on this list falls back to the curated Unsplash topic image
 * instead of being rejected outright.
 */
/**
 * RSS publisher CDN domains were removed in August 2026, and RSS ingestion
 * itself was deleted outright by owner decision on 2026-10-29. The publisher
 * licensing contacts that lived in src/lib/rssParser.ts survive in git
 * history:  git log --diff-filter=D -- src/lib/rssParser.ts
 */
export const ALLOWED_IMAGE_HOSTNAMES = [
  "images.unsplash.com",
  "newsdata.io",

  // NewsData.io article image CDNs — verified from live Supabase data (August 2026)
  "n.bytvi.com",
  "bloximages.chicago2.vip.townnews.com",
  "bloximages.newyork1.vip.townnews.com",
  "staticimg.amarujala.com",
  "media.tegna-media.com",
  "i.headtopics.com",
  "www.marketbeat.com",
  "scx1.b-cdn.net",
  "s.yimg.com",
  "static.toiimg.com",
  "kubrick.htvapps.com",
  "content-media.investing.com",
  "cloud.investing.com", // not yet seen in live data — added proactively
  "i-invdn-com.investing.com", // not yet seen in live data — added proactively
  "invdn-com.investing.com", // not yet seen in live data — added proactively
  "images.investing.com", // not yet seen in live data — added proactively
  "www.jagranimages.com",
  "static.bundle.app",
  "s.hdnux.com",
  "www.usnews.com",
  "images.bhaskarassets.com",
  "www.reuters.com",
  "i0.wp.com",
  "assets.thehansindia.com",

  // Full-table Supabase audit (August 2026) — every domain below appeared
  // 11+ times in stored image_url values, i.e. a genuinely recurring
  // source, not a one-off.
  //
  // Cutoff math, because it's tighter than it looks: Next.js hard-caps
  // images.remotePatterns at 50 entries (a real build error, not a style
  // guideline) and next.config.ts derives remotePatterns directly from
  // this array — so this file's max size *is* 50, full stop. At 5+
  // occurrences there were 83 candidate domains; at 10+ there were 27,
  // which would have pushed the total to 53 and failed the build. Cutting
  // to 11+ (23 domains) lands at 49 total — under the cap, but only by
  // one slot. Any future addition here needs to either raise this cutoff
  // further or prune something else first; there is no room left to just
  // keep appending.
  //
  // NOT added: "cbnc.com" (11 occurrences) — looks like a typosquat of
  // cnbc.com (missing the "n"); the real CNBC CDN (image.cnbcfm.com,
  // 7 occurrences, below this cutoff) is separately and legitimately
  // present in the same data, which is what made the typosquat pattern
  // stand out enough to flag rather than silently include.
  "media.assettype.com", // The Free Press Journal
  "static.langimg.com", // NBT Navbharat Times (Times Internet)
  "img-cdn.publive.online", // Greater Kashmir
  "c.ndtvimg.com", // NDTV
  "cms.patrika.com", // Patrika News
  "cdn.newser.com", // Newser
  "www.livehindustan.com", // Hindustan
  "publish.tribuneindia.com", // The Tribune India
  "www.hindustantimes.com", // Hindustan Times
  "cf-images.assettype.com", // Edex Live
  "cdn.forumcomm.com", // Brainerd Dispatch (Forum Communications)
  "posterimage.amarujala.com", // Amar Ujala
  "img.etimg.com", // The Economic Times
  "hindi.cdn.zeenews.com", // Zee News Hindi
  "res.cloudinary.com", // Yardbarker — NOTE: shared multi-tenant CDN, not a single publisher's own domain (like i0.wp.com below) — allowlisting it permits any Cloudinary-hosted image, not just this one source
  "royalbulletin.in", // रॉयल बुलेटिन
  "bringatrailer.com", // Bring a Trailer
  "nypost.com", // New York Post
  "indoremirror.in", // Indore Mirror
  "www.wsbtv.com", // WSB-TV Atlanta
  "cdn.completeaitraining.com", // Complete AI Training
  "static.asianetnews.com", // Asianet Newsable
  "jantaserishta.com", // Janta Se Rishta
] as const;

/** True only for https URLs whose hostname is on the allowlist (or a subdomain of one). */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTNAMES.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}
