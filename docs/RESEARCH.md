# Build the newsroom, rent the plumbing

TimesPrime should keep its Next.js 16 + Supabase stack. It should build its own editorial core on top of the access layer it already has, rent everything that is a commodity (CDN, video, push, email, analytics), and host the reader site as containers in AWS Mumbai behind CloudFront's flat-rate plan. None of that matters until the aggregator is switched off. Today the product republishes scraped full article text, machine-translates it into Hindi through an unofficial Google endpoint, and fills gaps with stock photos. That matches Google's written definitions of "scraping" and "scaled content abuse" almost word for word ([Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)). Indian copyright law gives no cover for publishing other people's full articles on public pages: the July 2026 *ANI v OpenAI* interim order rested on the training data being stored privately, not shown to the public ([Cyril Amarchand Mangaldas](https://corporate.cyrilamarchandblogs.com/2026/07/ani-v-open-ai-delhi-high-court-refuses-interim-injunction-in-landmark-ai-copyright-dispute/)). The CMS choice is closer than it looks. Vendors charge enterprise prices for scoped roles, MFA, audit logs and multi-step approval. TimesPrime has already built the first three (Panel 0), and its data model is designed for the fourth. What is still missing (editor, revisions, media library, scheduling, preview) is roughly 3–5 developer-months of commodity work (estimate). Quintype, at about $4,000/month median (≈₹42 lakh/year), is the only news SaaS worth pricing as a fallback. Arc XP's median licence of about $400–500k/year is, by the researchers' estimate, more than a two-developer team costs in a year ([GNI CMS directory](https://newsinitiative.withgoogle.com/cms-providers/arc-xp/)). Infrastructure is cheap next to journalism: at 10 million pageviews a month, the modelled delivery-plus-security bill is about **$1,000 (≈₹88,000)** on the flat-rate plan, and compute is under $150 (estimate). The legal duties are manageable but real. IT Rules Part III (Rule 18 filing, an India-based Grievance Officer with a 15-day deadline, monthly reports) and CERT-In (6-hour incident reports, 180 days of logs kept in India) apply from day one. The DPDP Act's core duties start around **13 May 2027**. Foreign investment is capped at **26%**, with government approval. Two business decisions should come first. One is the name: "Times Prime" is already a Times Internet membership product. The other is whether original journalism launches on URLs (and possibly a domain) kept apart from the aggregator's history.

*How to read this report.* A sentence with a source link is a fact from the research notes, gathered on 2 November 2026. Text marked **Inference** or **Estimate** is reasoning or a model with no source behind it. **Lawyer to confirm** marks a legal point that Indian counsel must check before you act on it. All rupee figures convert US dollars at an assumed **₹88 = US$1**. That rate comes from the notes, not from any source, so use today's rate when you budget. Vendor prices often come from third parties and change often, so get written quotes before you commit.

## The owner's decision register

These are the decisions this report asks you to take. The sections that follow give the evidence for each one, and section 8 places them on the roadmap.

| # | Decision | Recommendation | Why, in one line | Section |
|---|---|---|---|---|
| D1 | Keep the name "TimesPrime"? | Order a trademark search now. If the risk is confirmed, rebrand **before** launch | Times Internet already sells "Times Prime". Google News now uses your site name as your identity, so renaming later loses search equity | 6 |
| D2 | What happens to the aggregator? | Stop serving scraped full text and unofficial translations **before any public traffic**. Keep only headline + your own summary + link (noindex), or drop it | Copyright exposure, plus Google's scraping and scaled-content policies | 5, 6 |
| D3 | CMS: build, embed Payload, Quintype, WordPress? | **Build** on the current stack with an open-source editor (Tiptap). Quintype is the fallback | You already own the governance features vendors gate behind enterprise tiers | 1 |
| D4 | Where Hindi lives | `/hi/` subfolder on the same domain at launch, unless you want a separate Hindi brand | Cheapest to run, and it pools authority. BBC Hindi shows a subfolder works | 5 |
| D5 | Translation policy | Hindi stories either reported in Hindi or translated by a human (AI drafts allowed), with a visible credit. Never auto-translate at scale | Google names "translating" in scaled content abuse | 4, 5 |
| D6 | Hosting | ECS Fargate (Arm) containers + CloudFront flat-rate plan, in ap-south-1 | Full support for Next 16 features. CDN and security dominate cost, and the flat rate caps them | 3 |
| D7 | Database | Stay on Supabase Mumbai, with a custom domain, log drains and server-side reads | Competitive on cost and already carries Auth/RLS. Move only when a stated trigger fires | 3 |
| D8 | Repo shape | One repo, three deployables (reader, admin, worker). No Turborepo/Nx yet | Two developers. Public evidence favours fewer apps, not more | 2 |
| D9 | Video and "channel" | YouTube-first (including YouTube Live embedded on site). Mux for on-site video later. No satellite TV | YouTube is India's #1 news platform. A TV licence needs ₹20 crore net worth | 4, 6 |
| D10 | Reader comments | None at launch | Comments make you an intermediary, with 3-hour takedowns and 7-day grievance deadlines | 4, 6 |
| D11 | Money | Owned audience first, then AdSense, then GAM, then membership via Razorpay. No hard paywall early | Subscriptions were about 10% of Indian online-news revenue in 2023 | 7 |
| D12 | Named people and filings | Name an Editor, a Grievance Officer, a CERT-In Point of Contact and a DPDP contact. File the Rule 18 details. Join a self-regulatory body. Register for GST | All are cheap. Rules 18 and 19 are not stayed | 6 |
| D13 | Company and investors | Indian private limited company, Indian-citizen CEO, majority-Indian board, foreign equity at most 26% (with approval) | The FDI rule for digital news explicitly covers aggregators | 6 |
| D14 | Wire agency | License one agency (PTI, ANI, IANS or Reuters) for text. Check the photo, video and AI/RAG scope in the contract | It is the only legal route to full-text copy you did not write | 4, 6 |
| D15 | Panel order | Pull the launch minimums of Compliance (Panel 7) and Privacy (Panel 8) into launch scope | Grievances, corrections and logs apply at launch. DPDP applies from May 2027 | 8 |

## 1. CMS: TimesPrime already owns the part vendors charge most for

### What Indian and global newsrooms actually run

Large Indian newsrooms fall into three camps, and the evidence for each is uneven. **WordPress** dominates among those whose stack can be seen from outside. The Indian Express runs on WordPress VIP: its live headers match VIP's and it is served from a Mumbai edge (`bom3`). rtCamp has been its development partner since 2017 ([rtCamp case study](https://rtcamp.com/?p=208148); [indianexpress.com](https://indianexpress.com/)). **Quintype**, a Bengaluru SaaS CMS, runs mid-sized and digital-native outlets, including Hindi and Marathi sites ([GNI Quintype profile](https://newsinitiative.withgoogle.com/cms-providers/quintype-bold-cms/)). The biggest groups put **custom Next.js or React front ends** in front of back offices they do not name in public. That TimesPrime's public site is already Next.js is normal in this market. Whichever back office you pick, the reader site can stay.

| Publisher | Back-office CMS (evidence) | Reader front end |
|---|---|---|
| Indian Express | **WordPress VIP**: vendor case study; VIP headers; Mumbai edge ([rtCamp](https://rtcamp.com/?p=208148)) | WordPress |
| Jansatta (Hindi, Express group) | Self-managed WordPress 6.8 ([jansatta.com](https://www.jansatta.com/)) | WordPress behind Varnish/CloudFront |
| ThePrint, The Wire | WordPress ([theprint.in](https://theprint.in/), [thewire.in](https://thewire.in/)) | WordPress |
| News18, Hindi News18 | WordPress back end (media on `cms.ibnlive.com`) ([news18.com](https://www.news18.com/)) | **Next.js** |
| The Quint, Hindi Quint, Newslaundry, New Indian Express, Deccan Herald | **Quintype** (its `assettype.com` asset CDN) ([GNI](https://newsinitiative.withgoogle.com/cms-providers/quintype-bold-cms/)) | Quintype |
| Sakal (Marathi + English) | Quintype. Daily articles rose from 425 to over 750 (sponsored, 2023) ([Press Gazette](https://pressgazette.co.uk/publishing-services-content/how-indian-publisher-cut-costs-by-40-and-nearly-doubled-article-count/)) | Quintype |
| The Hindu | **Stibo DX Cue**, chosen Nov 2020; 250M+ media assets; ~120M pageviews/month ([Stibo DX](https://www.stibodx.com/resources/hindu-goes-digital-first-with-cue)) | Custom (`.ece` URLs) |
| TOI, HT/Live Hindustan/Mint, India Today/Aaj Tak, Jagran, Bhaskar, Amar Ujala | **Not public** ([hindustantimes.com](https://www.hindustantimes.com/), [indiatoday.in](https://www.indiatoday.in/)) | Custom Next.js/React |
| NYT, Guardian, BBC | In-house (Scoop/Oak; Composer; CPS/Optimo) ([NYT Open](https://open.nytimes.com/building-a-text-editor-for-a-digital-first-newsroom-f1cb8367fc21), [bbc.com](https://www.bbc.com/)) | In-house |
| Washington Post | Arc XP, built in-house and now sold to others ([GNI Arc XP](https://newsinitiative.withgoogle.com/cms-providers/arc-xp/)) | Arc PageBuilder |

The global leaders built their own CMS, but at a scale TimesPrime cannot match. One NYT engineer spent "almost five years" on the Oak editor alone ([smoores.dev](https://hn.jakechampion.name/reader/https://smoores.dev/post/why_i_rebuilt_prosemirror_view)). **Inference:** "build your own" is only safe for two developers if the editor stays narrow: no real-time co-editing, and no NYT-style custom rendering.

### The options, priced

Most news-SaaS prices are not public. The most structured independent source, the Google News Initiative CMS guide, was reviewed mainly in 2023 and is not being updated ([GNI CMS directory](https://newsinitiative.withgoogle.com/cms-providers/)). Treat its figures as possibly stale.

| Option | Licence per year (USD → INR at ₹88) | Hidden costs | India data / hosting |
|---|---|---|---|
| **Build own** (Next.js + Supabase + Tiptap) | $0. Tiptap's paid collaboration/history plans are optional: **$49–999/month** ([Tiptap pricing](https://tiptap.dev/pricing.md)) | **Estimate:** 3–5 developer-months for the core, then maintenance for good | Already Mumbai |
| **Payload** (MIT, embedded in Next.js) | Core $0. **Enterprise from ~$10k/yr (≈₹8.8 lakh)** for SSO, multi-step approvals and audit logs ([DXP Scorecard](https://www.dxpscorecard.com/platform/payload-cms)) | Payload Cloud closed to new customers; v4 rewrite in beta; a second auth system | Self-host in Mumbai |
| **Quintype Bold** | From **$99–100/month**; **median ~$4,000/month (≈₹42 lakh/yr)** for a mid-range regional publisher ([GNI](https://newsinitiative.withgoogle.com/cms-providers/quintype-bold-cms/); [Capterra India](https://www.capterra.in/software/174709/quintype)) | Customisation support "can be costly"; paywall, apps and comments are add-ons; lock-in flagged | AWS SaaS |
| **WordPress VIP** | Minimum **~$25–35k/yr (≈₹22–31 lakh)**; typical **$100–500k/yr** ([GNI VIP](https://newsinitiative.withgoogle.com/cms-providers/automattic-wordpress-vip/)) | Needs an integrator (e.g. rtCamp); no multi-step workflow in core | Managed; Mumbai edge seen |
| **Self-hosted headless WordPress** | ~$0 licence | Adds PHP + MySQL beside Postgres, a second user/role system and a security-patch burden (Inference) | Self-host |
| **Sanity / Contentful / Storyblok** | Sanity $15/seat/month; Contentful Lite $300/month (20 users); Storyblok $99–349/month ([Sanity](https://www.sanity.io/pricing); [Flowtrix](https://www.flowtrix.co/blogs/contentful-pricing-2026); [staticmania](https://staticmania.com/blog/sanity-vs-contentful-vs-storyblok)) | Seat and overage creep; SSO and audit logs on enterprise tiers | **No India region found** |
| **Arc XP** | **$50k–$3M/yr, median ~$400–500k (≈₹3.5–4.4 crore)**; implementation ≈ first year's fee ([GNI Arc XP](https://newsinitiative.withgoogle.com/cms-providers/arc-xp/)) | "Very developer-intensive"; layoffs in 2023 and 2024 ([Semafor](https://www.semafor.com/article/08/29/2023/washington-post-lays-off-staff-from-arc-xp)) | AWS SaaS |
| **Stibo DX Cue, Brightspot, Glide** | Custom quotes; Glide reportedly from ~$4k/month (unverified) ([GNI Stibo](https://newsinitiative.withgoogle.com/cms-providers/stibodx/); [code.store](https://code.store/tools/glide-publishing)) | Cue makes you build your own front end | Cue: SaaS or on-premises |

### Pros and cons for a two-developer, bilingual newsroom

| Option | Pros | Cons |
|---|---|---|
| **Build own** | Keeps the RBAC, MFA and append-only audit already built, and the four-eyes design already planned; one TypeScript stack; data stays in Mumbai; no licence fee; no lock-in | 3–5 months of CMS work before original publishing (estimate); you maintain the editor for good; no evidence yet on how Devanagari typing behaves in Tiptap/ProseMirror (gap) |
| **Payload hybrid** | Gives drafts, versions, autosave, scheduled publish (via a jobs queue) and field-level localisation for free ([Payload drafts docs](https://payloadcms.com/docs/versions/drafts)) | Bought by Figma in June 2025 ([Payload blog](https://payloadcms.com/posts/blog/payload-is-joining-figma)); Cloud closed to new customers; the open-source core has only draft/published plus locking, while approvals sit in Enterprise; no news publisher case study; **Inference:** its own auth would clash with Supabase Auth and your RLS |
| **Quintype** | Fastest to a working newsroom; Indian vendor; proven on Hindi and Marathi sites; CDN and DDoS protection bundled | Admin UI is **English-only**; GNI flags lock-in and slow feature requests ([GNI](https://newsinitiative.withgoogle.com/cms-providers/quintype-bold-cms/)); makes most of your back office redundant; your custom features wait on its roadmap |
| **WordPress VIP / headless WP** | The most common CMS among the Indian publishers checked; huge plug-in ecosystem; Gutenberg is easy for editors | VIP's entry price is high for a pre-revenue outlet; GNI notes "core WordPress is aging" and has no multi-step workflow ([GNI VIP](https://newsinitiative.withgoogle.com/cms-providers/automattic-wordpress-vip/)); splits the team across PHP and TypeScript |
| **Sanity / Contentful / Storyblok** | Polished editor UX | No India data region; per-seat pricing grows with the newsroom; governance features sit behind enterprise tiers |
| **Arc XP / Cue / Brightspot** | Complete enterprise suites | Priced and staffed for large or print-heavy groups. GNI says Arc fits poorly without "sizeable in-house development teams" ([GNI](https://newsinitiative.withgoogle.com/cms-providers/arc-xp/)) |

### Recommendation: build the core, keep the editor narrow, keep Quintype as the escape hatch

The deciding fact is which features each vendor locks away. Payload Enterprise holds back SSO, multi-step approvals and audit logs ([DXP Scorecard](https://www.dxpscorecard.com/platform/payload-cms)). Payload's own Enterprise page lists audit logs without saying they are enterprise-only, and marks parts of its publishing workflows "Coming Soon" ([payloadcms.com/enterprise](https://payloadcms.com/enterprise)). Strapi offers review workflows and audit logs only on its Enterprise plan ([Strapi pricing](https://strapi.io/pricing-self-hosted)). Sanity keeps SSO and audit for Enterprise ([Sanity pricing](https://www.sanity.io/pricing)). Apart from SSO, which a small staff can do without (Inference), these are the governance features TimesPrime already has or has designed. Panel 0 provides scoped roles, MFA and the append-only audit log, and four-eyes approval is planned in the desk panel's transition model. One caveat: `docs/PANEL_DOCS.md` still lists Panel 0 as "in progress", with the local-database run and the remaining done-criteria open. **Inference:** buying a CMS would mean paying for, or duplicating, the one part of the product that is already the hardest to get right. Building means writing the commodity part.

**Estimate** (the notes' effort model, which has no source):

| Piece of work | Effort (2 developers) |
|---|---|
| Story model with revisions, drafts and scheduling | 3–5 weeks |
| Tiptap/ProseMirror editor with news embeds and Hindi input testing | 4–8 weeks |
| Media library on S3 Mumbai with resizing | 2–4 weeks |
| Preview, SEO fields and sitemaps | 2–4 weeks |
| **Total** | **About 3–5 months** |

Tiptap's editor core is MIT-licensed and free ([Tiptap pricing](https://tiptap.dev/pricing.md)).

Take **Quintype** instead only if you would rather spend on journalists than on engineers, and can accept an English-only admin UI and a vendor's roadmap. Its entry price (≈₹8,800/month) makes a two-week trial cheap insurance. **Inference:** a fair checkpoint is this: if a usable Hindi + English editor with revisions is not working within about three months of starting the desk panel, price Quintype seriously.

On Hindi, every option shown live already publishes Devanagari content. The real risks are elsewhere: how the editor behaves with Hindi input methods, fonts, search, and transliterated slugs. The research found no published reports either way on Devanagari input in Tiptap, ProseMirror or Lexical. **Inference:** test the editor with real Hindi typists, on both InScript and phonetic keyboards, in the first week of the desk panel. That is cheaper than finding problems after launch.

## 2. Architecture: one repo, three deployables, and a CDN that does the real work

### Separate the deployments, not the codebase

There is little first-party public evidence on how big publishers lay out their repositories. The one well-documented case points the other way from "split everything". The Guardian keeps its web rendering in one monorepo, and its RFC plans to fold the separate apps-rendering project back in, with that project to be "eventually decommissioned" ([Guardian RFC](https://github-redirect.dependabot.com/guardian/dotcom-rendering/discussions/11240)).

Next.js can split one domain into several independently deployed apps ("multi-zones"). The cost is a full page reload whenever a reader crosses between zones ([Next.js multi-zones](https://nextjs.org/docs/app/guides/multi-zones)). A single `next start` process "handles every Next.js feature correctly", including ISR, Cache Components, Server Actions and Proxy ([Next.js deploying to platforms](https://nextjs.org/docs/app/guides/deploying-to-platforms)). The Washington Post's earlier AWS stack shows where self-built news infrastructure gets expensive. It ran on ECS with a custom SQS/EC2 revalidation system that the team called "complex" and "expensive" ([Vercel: Washington Post](https://vercel.com/blog/washington-post-next.js-vercel-engineering-at-the-speed-of-breaking-news)). The pain was in the caching machinery, not in how the app was split.

| Shape | Pros | Cons | Verdict for 2 developers |
|---|---|---|---|
| **One app, one deployment** (today) | Simplest; one build | An admin deploy resets the reader cache; editor libraries bloat shared bundles; admin is exposed on the public origin | Fine until the desk panel ships |
| **One repo, three deployables** (reader site, admin, ingestion worker) | The admin can sit behind a stricter WAF, an IP or MFA gate, and no caching; the worker scales apart and never blocks a reader request | A little more CI and infrastructure | **Recommended** (Inference) |
| **Monorepo with Turborepo/Nx and many apps** | Separate build caches and shared packages | Tooling overhead with no matching benefit at one app plus one worker | Not yet |
| **Separate API service** | Independent scaling | No publisher evidence supports it; adds a network hop and a second auth surface | No |

**Inference:** start by serving the admin from the same build but under a separate CloudFront behaviour or subdomain, with caching off and stricter WAF rules. Make the admin its own Next.js app only when one of three triggers fires: admin deploys start invalidating the reader cache, editor or chart libraries bloat reader bundles, or the admin needs a different network exposure such as a VPN or IP allowlist. Readers and editors rarely move between the two, so the full-reload cost of multi-zones does not matter here. Run ingestion and the scheduled jobs as a plain Node worker (Lambda or a Fargate task), not as API routes.

### Next.js 16 caching: what the bundled docs say

Next 16 renamed Middleware to **Proxy** and introduced **Cache Components** (the `"use cache"` directive, enabled with `cacheComponents: true`). These replace `experimental.ppr`, and `use cache` supersedes `unstable_cache` ([Next.js 16 blog](https://nextjs.org/blog/next-16)).

Built-in `cacheLife` profiles range from `seconds` (revalidate every 1 s, expire after 1 min) to `max` (revalidate every 30 days, expire after 1 year) ([cacheLife docs](https://nextjs.org/docs/app/api-reference/functions/cacheLife)). The recommended invalidation call is `revalidateTag(tag, 'max')`, which serves stale content while it refreshes. Inside Server Actions, `updateTag` gives read-your-own-writes. The single-argument form of `revalidateTag` is deprecated ([revalidateTag docs](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)).

Three facts shape the design. First, **a CDN on its own does not honour `revalidateTag` or `revalidatePath`**, so publishing needs an explicit CDN purge ([Next.js CDN caching](https://nextjs.org/docs/app/guides/cdn-caching)). Second, **the cache is per instance by default**: `revalidateTag()` on one self-hosted instance "only invalidates the cache on that instance". The fix is a shared cache handler (Redis or S3) that implements `refreshTags()`, plus one `deploymentId` and one Server Actions encryption key across all instances ([Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)). Third, **remote cache entries do not survive a deploy**, because `'use cache: remote'` keys include the build or deployment ID ([use cache: remote](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote)).

On the CDN side, CloudFront began supporting **invalidation by cache tag on 29 April 2026**. The origin sends tags in a response header, and an invalidation path such as `#article:123` purges every object that carries that tag ([AWS What's New](https://aws.amazon.com/about-aws/whats-new/2026/04/cloudfront-invalidation-cache-tag/)). This maps directly onto Next's cache tags. The first 1,000 invalidation paths a month are free, and each one after that costs **$0.005** ([AWS Price List: CloudFront](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json)).

**Estimate:** 100 publish or update events a day, each purging about 4 tags, comes to about 12,000 paths a month, or roughly **$55/month (≈₹4,800)**. The flat-rate Pro tier and above include tag invalidations.

### The layered cache design (Inference, built from the cited mechanics)

| Page type | Server cache | CDN behaviour | On publish |
|---|---|---|---|
| Article | `use cache` + `cacheTag('article:<id>', 'section:<slug>', 'lang:hi\|en')`, `cacheLife('days')` or `max` | Long `s-maxage` + stale-while-revalidate | `revalidateTag(tag,'max')` **and** a CloudFront tag invalidation for the same tags |
| Home and section fronts | `cacheLife('minutes')` | About 60 s `s-maxage` + SWR | Tag invalidation |
| Live blog, results, scores | Cached page shell; the fast-changing part is a small JSON endpoint | JSON cached 5–15 s at the edge, polled by the browser | Nothing needed; the short TTL handles it |
| Saved articles, login state | Client-side, or `use cache: private` behind Suspense | Page stays `Cache-Control: public` | n/a |
| Admin | None | No caching; separate behaviour | n/a |

Use **path-based locales** (`/hi/...`, `/en/...`), not cookie or `Accept-Language` negotiation, so the cache key stays the URL (Inference, consistent with Google's guidance in section 5).

App Router pages need the CDN to forward the `rsc` header and keep `_rsc` in the cache key ([Next.js CDN caching](https://nextjs.org/docs/app/guides/cdn-caching)). **Inference:** news fronts carry dozens of links. Every link prefetched in the viewport is a separate request, which multiplies CDN request counts and cost. Limiting prefetch on fronts is a real cost lever.

### Breaking-news surges are big in India; design so audience size does not reach the origin

Indian surge numbers are large, though all are self-reported. **ABP Live** reported **50 lakh (5 million) concurrent users** on Lok Sabha results day, 4 June 2024, three times its previous peak ([exchange4media](https://www.exchange4media.com/industry-briefing-news/abp-live-200-mn-users-recorded-across-platforms-on-election-results-day-134936.html)). **NDTV** reported over 500,000 concurrent users and 117.7 million pageviews on counting day in 2014 ([exchange4media](https://www.exchange4media.com/industry-briefing-news/ndtv-records-highest-traffic-for-indian-website-on-election-results-day-55799.html)). An ABP News AWS case study cites spikes "up to six times" normal traffic ([casestudies.com](https://www.casestudies.com/company/amazonwebservices/case-study/abp-news-network-increases-page-views-by-70-using-aws)). Outside India, **The Guardian** on Fastly rode a royal-birth spike from about 400 to more than 1,000 requests per second by caching dynamic HTML at the edge and purging in about 150 ms ([Fastly: The Guardian](https://www.fastly.com/customers/the-guardian)). On the 2022 US midterms, the Washington Post's websocket results page was "lagging like crazy" and had to be rewritten at the last minute ([Vercel: Washington Post](https://vercel.com/blog/washington-post-next.js-vercel-engineering-at-the-speed-of-breaking-news)).

**Inference:** if every reader page can be cached publicly with stale-while-revalidate, origin load depends on *distinct URLs × refresh rate*, not on how many people are reading. That is the whole surge strategy. A two-person team should poll cached JSON for live pages, not run bespoke websockets. Write a "breaking-news mode" runbook: raise TTLs on fronts, pre-scale containers, freeze deploys (every deploy resets the remote cache), and warm the top URLs after any deploy that cannot wait. `stale-if-error` (RFC 5861) lets the CDN keep serving a stale page when the origin fails ([RFC 5861](https://datatracker.ietf.org/doc/rfc5861/)). The notes did not verify whether CloudFront honours it from origin headers. Check that before relying on it.

## 3. Hosting in Mumbai: containers behind a flat-rate CDN, Supabase stays with three fixes

### Amplify is out; the real choice is containers or OpenNext

AWS Amplify Hosting's own docs still say you can deploy "Next.js versions up through Next.js 15". They list **on-demand ISR** and **Next.js streaming** as unsupported ([AWS Amplify docs](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html)). A news CMS needs both. Next.js's own list of verified adapters names only Vercel and Bun, and puts Amplify under "Other platforms". The Node.js server and Docker paths support every feature ([Next.js deploying](https://nextjs.org/docs/app/getting-started/deploying)).

The OpenNext AWS adapter, which SST uses, is active. It released v4.1.14 on 30 October 2026 and has shipped Next-16-specific fixes most weeks ([opennextjs-aws releases](https://github.com/opennextjs/opennextjs-aws/releases)). Its own site, however, still "aims to support all Next.js 15 features" ([OpenNext](https://opennext.js.org/aws)). SST's docs say it defaults to OpenNext 3.9.14 for Next 15+, which suggests the default may lag behind ([SST Nextjs component](https://sst.dev/docs/component/aws/nextjs/)).

| | Amplify Hosting | OpenNext/SST (Lambda) | **ECS Fargate + ALB + CloudFront** | EC2 + ALB |
|---|---|---|---|---|
| Next 16 | Not documented (docs say up to 15) | Yes, through a fast-moving community adapter | **Full** (`next start` is the reference path) | Full |
| On-demand ISR / `revalidateTag` | **Unsupported** | Yes (S3 + DynamoDB + SQS); you add the CDN purge | Yes, with a Redis cache handler | Yes |
| Streaming / Cache Components | **Unsupported** | Adapter-dependent | Yes | Yes |
| Cold starts | Managed | Yes (a warmer helps) | None | None |
| Ops burden | Lowest, but blocked on features | Medium: many resources; the adapter must track each Next minor version | **Medium-low**: one Dockerfile, autoscaling | Highest (patching servers) |
| Portability | Low | Medium | **High** (Docker runs anywhere) | High |

(Feature rows are from the cited docs. The ops and portability rows are Inference.)

**Recommendation (Inference):** run the standalone `next build` image on **ECS Fargate (Arm)**: two tasks across two availability zones, autoscaling on CPU and request count. Put an ALB (or a CloudFront VPC origin) behind **CloudFront on a flat-rate plan**. Use Redis (the existing Upstash, or a small ElastiCache) as the shared `cacheHandler`. OpenNext is cheaper when traffic is idle, but it adds an adapter you must upgrade in step with every Next release. Two developers should not take on that coupling.

### The CDN bill dominates, and the November 2025 flat-rate plans cap it

CloudFront flat-rate plans launched on **18 November 2025** with **no overage charges**. Each plan bundles CloudFront, AWS WAF, DDoS protection, bot management, Route 53 DNS and ingestion of CloudFront/WAF logs into CloudWatch:

| Tier | Price/month | Requests/month | Data/month |
|---|---|---|---|
| Free | $0 | 1M | 100 GB |
| Pro | $15 | 10M | 50 TB |
| Business | $200 (≈₹17,600) | 125M | 50 TB |
| Premium | $1,000 (≈₹88,000) | 500M | 50 TB |
| Premium, larger configs | $1,450 / $2,250 / $3,500 / $6,000 / $10,000 | 750M / 1.25B / 2B / 3.5B / 6B | 75 / 125 / 200 / 350 / 600 TB |

Spike and attack traffic are treated generously. "Your first traffic spike up to 3x your monthly allowance won't affect your service that month", and requests blocked by WAF or DDoS protection do not count against the allowance. Several features need a specific tier: tag invalidation comes with Pro and up; custom cache policies, Bot Control and the uptime SLA with Business and up; and Origin Shield and origin failover with Premium only. Sources for the plan details: [AWS What's New](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-flat-rate-pricing-plans) and [CloudFront flat-rate docs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html).

**Estimate.** The model behind this table has no source, but it uses the cited Mumbai and India unit prices. It assumes about 1 MB and about 25 CDN requests per pageview, all viewers in India, and a CDN hit rate of 95% or better.

| Monthly line item | 10M pageviews | 100M pageviews |
|---|---|---|
| CloudFront pay-as-you-go (India: $0.109/GB first 10 TB; $0.012 per 10k HTTPS requests) + WAF + Bot Control | ≈ $1,705 (≈₹1.5 lakh) | ≈ $15,685 (≈₹13.8 lakh) |
| **CloudFront flat-rate instead** (WAF, bot control, DDoS included) | **$1,000** Premium (≈₹88,000); **$200** Business if requests stay at or below 12.5 per pageview | **$6,000** (≈₹5.3 lakh); **$3,500** if requests stay at or below 2B |
| Amplify data transfer alone, at $0.15/GB ([Amplify pricing](https://aws.amazon.com/amplify/pricing/)) | ≈ $1,536 | ≈ $15,360 |
| Origin compute, Fargate Arm + ALB | ≈ $80–150 (≈₹7,000–13,200) | ≈ $150–300 |
| Origin compute, OpenNext Lambda instead | ≈ $40 | ≈ $255 |

The flat-rate plan cuts delivery plus security cost by about 41–88% at 10M pageviews and about 62–78% at 100M (Estimate). It also removes the risk of a surprise bill on counting day. Compute is a rounding error next to the CDN. Fargate in Mumbai costs $0.02383 per vCPU-hour on Arm ([AWS Price List: ECS](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-south-1/index.json)).

A plan covers one distribution, so serve the site, images and static assets from one distribution with several behaviours. **Inference:** at launch traffic, start on **Business ($200)**. Move to Premium when requests pass 125M a month, or when you need Origin Shield for live pages with 5–15 s TTLs.

### Database: Supabase Mumbai is competitive; fix logs, the ISP-block risk and browser exposure

Supabase offers **ap-south-1 (Mumbai)**, and the region you choose "determines where primary project data is stored" ([Supabase regions](https://supabase.com/docs/guides/platform/regions)). Data residency alone therefore does not force a move to RDS.

| Option (Mumbai) | Monthly cost (Estimate from cited unit prices) | Pros | Cons |
|---|---|---|---|
| **Supabase Pro** + Large compute + 7-day PITR + custom domain + 1 log drain | **≈ $295 (≈₹26,000)**. Team plan (SOC 2, 28-day logs) adds ≈ $574 | Auth, RLS and PostgREST already wired into the app; managed | Logs kept only 7 days (Pro), 28 (Team) or 90 (Enterprise) ([Supabase pricing](https://supabase.com/pricing)); the Feb 2026 ISP block (below) |
| **RDS PostgreSQL** Multi-AZ db.m7g.large + 100 GB gp3 | **≈ $376 (≈₹33,000)** plus containers for Auth and PostgREST | Inside your own AWS account; standard tooling | You self-host GoTrue (Supabase Auth) and PostgREST, and recreate the `auth.uid()` helpers your RLS uses |
| **Aurora Serverless v2**, writer + reader at a 0.5 ACU floor | **≈ $131** plus storage and I/O, rising to ≈ $525 per instance at a 4-ACU average | Scales with load; can auto-pause to 0 ([AWS](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)) | Same Auth/PostgREST rebuild; resume latency |

Unit prices: Supabase compute Large $110/month and PITR $100/month per 7 days ([Supabase pricing](https://supabase.com/pricing)); log drains $60 per drain per month ([Supabase log drains](https://supabase.com/docs/guides/telemetry/log-drains)); RDS m7g.large Multi-AZ $0.479/hour and Aurora $0.18 per ACU-hour ([AWS Price List: RDS](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-south-1/index.json)).

The ISP block is a real precedent. On **24 February 2026**, a Section 69A blocking order led Jio, Airtel and ACT Fibernet to DNS-block `*.supabase.co`, and project endpoints became unreachable for affected users. Access was later reported restored, but the date was not confirmed ([TechCrunch](https://www.techcrunch.com/2026/02/27/india-disrupts-access-to-popular-developer-platform-supabase-with-blocking-order/); [Supabase blog](https://supabase.com/blog/navigating-regional-network-blocks); [Analytics India Mag](https://analyticsindiamag.com/ai-news/india-restores-access-to-supabase-after-isp-level-block)).

**Inference:** three fixes keep Supabase safe. Put it on a **custom domain** ($10/month), so browsers never call `*.supabase.co`. Do **all reader-side data fetching on the server**, from AWS Mumbai, so a consumer-ISP block cannot break pages, and keep browser-to-Supabase calls to admin auth only. **Drain Supabase logs** into an S3 or CloudWatch sink in Mumbai, to reach the retention period CERT-In requires. Move to RDS or Aurora only when a trigger fires: a regulatory or contractual need to hold the database inside your own AWS account, a repeat ISP block, or Supabase Team or Enterprise costs that exceed RDS plus one or two Fargate tasks for Auth and PostgREST.

### CERT-In logs: 180 days in India is law; keep 365 to cover DPDP too

The CERT-In Directions of 28 April 2022 require covered entities to "enable logs of all their ICT systems and maintain them securely for a rolling period of 180 days... within the Indian jurisdiction" ([CERT-In Directions](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)). The CERT-In FAQs pull in two directions. FAQ 35 allows storage abroad if logs can be produced in reasonable time. FAQ 36 requires foreign service providers' logs to be kept in India ([Linklaters](https://www.linklaters.com/insights/blogs/digilinks/2022/may/india-new-and-onerous-cyber-security-framework-and-breach-reporting-obligations)). The DPDP Rules separately require access logs to be kept for one year ([Legal500](https://www.legal500.com/intelligence/india/privacy/8-key-takeaways-the-digital-personal-data-protection-rules-2025)).

**Inference:** keep one log store in ap-south-1 with retention of **at least 365 days**, which satisfies both rules. Send into it the CloudFront and WAF logs, ALB logs, application stdout, the append-only audit log, CloudTrail and the Supabase log drains. Sentry stores event data only in the **US (Iowa) or the EU (Frankfurt)**, and some metadata always stays in the US ([Sentry docs](https://docs.sentry.io/organization/data-storage-location/)). Treat Sentry as a PII-scrubbed copy for triage, never the system of record. Set `sendDefaultPii: false`.

**Estimate:** at 10M pageviews, CDN logs come to about 125 GB a month. Ingestion is included on the flat-rate plan, and keeping 180 days in CloudWatch costs about $23 a month at $0.03/GB-month ([AWS Price List: CloudWatch](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-south-1/index.json)). S3 with lifecycle rules is cheaper still. **Lawyer to confirm** whether CloudFront edge logs and logs held by third-party SaaS tools (analytics, the Anthropic API) must be copied into India.

### Search, images and the jobs that replace the Vercel cron

**Search.** PostgreSQL ships a Snowball `hindi_stem` dictionary in its documented catalogue ([PostgreSQL docs](https://www.postgresql.org/docs/19/textsearch-psql.html)). The newsroom notes assume the opposite, but that is an unsourced inference and the cited documentation wins. The notes did not confirm whether a ready-made `hindi` *configuration* exists, or whether Supabase's Postgres version includes the dictionary, so check both on the instance. OpenSearch has a built-in `hindi` analyzer that applies Indic and Hindi normalisation, stop words and a stemmer ([OpenSearch docs](https://docs.opensearch.org/3.6/analyzers/language-analyzers/hindi/)). An m7g.large.search node in Mumbai costs $0.097/hour, about $71/month ([AWS Price List: OpenSearch](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonES/current/ap-south-1/index.json)). **Inference:** start with Postgres full-text search (Hindi stemming, English config, and `pg_trgm` for typos), and move to OpenSearch when relevance or volume demands it. Hindi stemming will not help romanised "Hinglish" queries, so plan a transliterated column.

**Images.** **Inference:** store originals in S3 Mumbai, served through the same CloudFront distribution. Generate fixed renditions (16:9, 4:3 and 1:1, AVIF and WebP) in the worker, so no image processing runs during a surge.

**Scheduling.** EventBridge Scheduler costs **$1.05 per million invocations** in Mumbai ([AWS Price List: EventBridge](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSEvents/current/ap-south-1/index.json)). A 30-minute schedule is effectively free. Have it trigger a Lambda or an ECS RunTask, with SQS ($0.40 per million) and a dead-letter queue for retries.

### Resilience basics

**Inference:** the resilience minimum is short. Run at least two tasks across two availability zones. Give the admin a behaviour with no caching and a stricter WAF. Rate-limit the API and search endpoints. Use Route 53 health checks plus an external uptime monitor from Indian locations. Set CloudWatch alarms on 5xx rate, origin latency and cache-hit ratio. Sync clocks to NIC/NPL-traceable NTP servers, which the CERT-In Directions require ([CERT-In](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)). Shield Advanced costs $3,000/month on a one-year term ([wring.co](https://www.wring.co/blog/aws-waf-pricing-guide)). It is not justified unless the site becomes a sustained DDoS target.

## 4. Newsroom: build the editorial core, buy distribution and video

### Real newsroom CMSs model workflow as statuses plus one permission per move

Every newsroom system in the notes uses the same pattern: custom statuses, with each move between statuses guarded by its own permission.

| System | How it models workflow |
|---|---|
| **VIP Workflow** (WordPress VIP) | Default statuses Pitch, Assigned, In Progress, Draft and Pending Review. A Publish Guard hides the Publish button until the final review status ([VIP Workflow](https://github.com/Automattic/vip-workflow-plugin)) |
| **Quintype** | Separate verbs: `story-submit`, `story-approve`, `story-reject`, `story-publish`, `story-retract`, `breaking-news-save`, `story-schedule`, and `story-close` for live blogs ([Quintype help](https://help.quintype.com/users-and-profile/getting-started)) |
| **Drupal** | One permission per transition; unpublishing is a permissioned "Archive" transition ([Drupal.org](https://www.drupal.org/docs/8/core/modules/content-moderation/overview)) |
| **Contentstack** | Can require approval before publish *or* unpublish, scoped by language, with a "Prevent self-approval" rule that needs two different people ([Contentstack](https://www.contentstack.com/docs/headless-cms/add-a-publish-rule)) |
| **Superdesk** (open source) | Organises work by desks, each with configurable stages, plus a separate Planning component for assignments ([Sourcefabric](https://www.sourcefabric.org/blog/superdesk-the-newsroom-tool-by-journalists-for-journalists)) |

TimesPrime's planned `workflow_transitions` table and its `has_permission(user, perm, language, section)` check already fit this pattern.

**Inference:** the story states should run `pitch → assigned → draft → in_review → desk_review → approved → scheduled → published`. After publication a story can be `unpublished` (a soft takedown) or `retracted` (a public notice stays at the URL), and abandoned work becomes `killed`. "Updated" is an event on a published story, not a state of its own.

Each edge gets its own permission (`story.submit`, `story.approve`, `story.publish`, `story.schedule`, `story.unpublish`, `story.retract`). A tightly held `story.publish_direct` covers breaking news. Four-eyes means the approver is neither the author nor the last editor, and the backend checks this from the transition log.

Schedule and embargo are different things: `scheduled_at` means "publish automatically at time T", while `embargo_until` means "must never be public before time T, even if someone presses Publish", and the backend enforces it.

Revisions are immutable full snapshots. The story row points to a `published_revision_id`, so editing a draft never changes the live copy. Locking is a WordPress-style soft lock with a heartbeat and an audited "take over" action, combined with a revision-number check on every save. Real-time co-editing waits until phase 3, or never. Pre-publish checklist items (headline length, alt text, image credit, SEO title, fields in both languages, a legal-review flag) should **block** approval. The free WordPress checklist plugins do not block, which is their weakness ([Editorial Workflow Manager](https://ku.wordpress.org/plugins/editorial-workflow-manager/)).

There is one data-model problem to fix before the desk panel. The current `public.articles` table is shaped for an aggregator: it has `link`, `source_id`, a text `pub_date` and an index built for 7-day retention, and no author, state, revision or desk columns. **Inference:** original journalism needs its own `stories` table, or a `kind` column that is excluded from retention, and originals must be kept permanently. Rule 19(3) of the IT Rules alone requires content records to be kept for at least 60 days ([CAM blog](https://corporate.cyrilamarchandblogs.com/2021/09/from-harbour-to-hardships-understanding-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021-part-iii/)). Defamation defence argues for keeping them far longer. Link the English and Hindi versions of a story with a `translation_group_id`, but let each language desk edit, approve and correct its version on its own.

### Corrections are a public duty, not a nice-to-have

The IT Rules point digital news publishers to the Press Council's norms of journalistic conduct ([exchange4media](https://www.exchange4media.com/digital-news/digital-news-platforms-will-have-to-follow-codes-of-press-council-cable-tv-network-act-111196.html)). The Code of Ethics clause is stayed (section 6), but the 15-day grievance duty is not. The Hindu runs a public "Corrections and Clarifications" column ([inkl](https://www.inkl.com/news/corrections-and-clarifications-december-25-2020)).

**Inference:** build a `corrections` table recording the kind (correction, clarification, update, editor's note or retraction), public text in English and Hindi, the internal reason, any linked grievance ID, and who made and approved it. Render each correction at the foot of its story and list all of them on a public `/corrections` page. Show "Published" and "Updated" times in IST on every story, and move "Updated" only for substantive edits, using an `is_substantive` flag on each revision. Linking each correction to the grievance that triggered it lets you prove you met the 15-day clock.

### One block-based story model covers almost every format

A live blog is schema.org `LiveBlogPosting`: a parent story with `coverageStartTime`, `coverageEndTime` and one `liveBlogUpdate` per entry ([schema.org](https://schema.org/LiveBlogPosting)). The Guardian added a clickable "key events" list at the top of each live blog. Its reason: after an hour or two, "it becomes difficult for a new reader to start reading" ([Nieman Lab](https://www.niemanlab.org/2014/09/the-guardian-has-a-new-format-for-liveblogs-to-make-them-more-readable/)). Coverage of the Guardian attributes **about 15% of its page views on an average day** to live blogs. The notes could not pin down which page carries that quote ([Press Gazette](https://pressgazette.co.uk/publishers/digital-journalism/live-blogs-bbc-guardian-sky-news/)).

Web Stories are tap-through AMP pages. To appear in Search and Discover they need valid AMP, specific metadata and a self-canonical URL ([Google Search Central](https://developers.google.com/search/docs/appearance/enable-web-stories)).

**Inference:** use one `stories` row with a `format` (news, live blog, opinion, explainer, analysis, interview, gallery, video, fact-check, sponsored) and a body made of typed JSON blocks (paragraph, image, gallery, embed, quote, factbox, related link, ad slot). Templates switch on `format`. Live blogs get a `live_updates` table with key-event and pinned flags. Readers poll a cached JSON endpoint every 15–30 seconds, and the server renders the latest updates so Google can read them. Posting to an already-approved live blog needs a desk-scoped `live.post` permission, not four-eyes on every update; per-update approval would make the format unusable. Defer Web Stories, polls and interactive pieces. Election and cricket widgets are data products: license the feed rather than building one.

### Bylines, contributors and wire copy

Wire copy in India is a licensed and litigated asset. ANI sued PTI in the Delhi High Court for ₹2 crore over alleged copying of its videos ([LiveLaw](https://www.livelaw.in/high-court/delhi-high-court/ani-files-copyright-infringement-suit-against-pti-in-delhi-high-court-seeks-2-crores-for-alleged-plagiarism-of-videos-262357)). PTI now sells cheap video licences to creators ([Storyboard18](https://www.storyboard18.com/amp/how-it-works/pti-launches-affordable-video-licensing-for-creators-amidst-anis-aggressive-copyright-crackdown-67465.htm)). Agencies sell text and multimedia as separate digital subscriptions ([Deccan Herald](https://www.deccanherald.com/national/prasar-bharati-decides-to-end-pti-uni-subscriptions-to-call-for-fresh-proposals-902768.html)). The notes found no public attribution rules or prices for PTI, ANI, IANS or Reuters, so the terms will come from the contract you sign.

**Inference:** keep an `authors` table separate from staff accounts, so that columnists, freelancers and agencies (PTI, ANI) can hold bylines without logins. Give each byline a role (byline, additional reporting, translated by). Author pages are cheap and matter for Google's trust signals (section 5), so they belong in launch scope.

Licensed feeds go into a desk "wire basket". "Use as-is" publishes with an agency byline and a mandatory credit; "rewrite" produces a staff story credited "with inputs from" the agency. Store each licence's scope (text, photo or video; web, app or social; languages), and block publication when the scope does not cover the channel. This is the copyright kill switch the panel plan already describes.

### Media and video: YouTube first, Mux when you need your own player

YouTube is India's top platform for news: 55% in the Reuters Institute's 2025 India sample ([Rural India Online, DNR 2025](https://ruralindiaonline.org/hi/library/resource/reuters-institute-digital-news-report-2025/)), and about 58% in 2026 ([Newslaundry](https://www.newslaundry.com/2026/06/18/58-news-from-youtube-56-via-whatsapp-reuters-report-on-indias-news-consumption-habits)). One outlet reported 52% for 2026, so treat the exact figure loosely. The sample is mostly English-speaking online users.

Mux charges no platform fee, gives **100,000 free delivery minutes a month** and encodes 1080p basic on-demand video for free. Delivery after that costs $0.001/minute and live encoding $0.03125/minute ([Mux pricing](https://www.mux.com/pricing)). Amazon IVS bills output by where viewers connect. In India, HD costs **$0.092 per viewer-hour** for the first 10,000 hours a month, and Standard input costs $2/hour ([AWS IVS pricing](https://aws.amazon.com/ivs/pricing/)).

| Daily 2-hour live show, about 1,000 concurrent HD viewers in India (Estimate) | Monthly cost |
|---|---|
| Amazon IVS | ≈ $120 input + ≈ $5,500 output (≈₹4.9 lakh) |
| Mux live | ≈ $113 input + ≈ $3,500 delivery (≈₹3.2 lakh) |
| **YouTube Live, embedded on site** | **$0**, and it can earn YouTube revenue |
| Mux on-demand: 500 clips × 3 min, 300k minutes watched | ≈ $205 (≈₹18,000) |

A 24x7 linear "channel" is a broadcast-operations project (playout, graphics, a master control room), not a web feature. A satellite channel also needs MIB permission and ₹20 crore of net worth (section 6).

**Inference:** image rights must be stored as data on each asset: credit, source (staff, agency, stock, handout, social), licence and expiry, who cleared the rights, and alt text and captions in both languages. Publishing should be blocked when an image lacks a credit, alt text or rights status. An `asset_usages` table turns "remove this photo everywhere" into a single query.

### Distribution in India runs through YouTube and WhatsApp

In the Reuters Institute's 2025 India sample, YouTube (55%), WhatsApp (46%), Instagram (37%) and Facebook (36%) were the leading news platforms. **53% named WhatsApp as the biggest source of false information**, the highest of any market, and among 18–34s **41% relied mainly on social media and YouTube, against 24% on publisher websites** ([WION on DNR 2025](https://www.wionews.com/technology/reuters-2025-digital-news-report-young-indians-prefer-ai-and-influencers-for-news-1750172305224/amp)). By the 2026 report, WhatsApp had reached 56% ([Newslaundry](https://www.newslaundry.com/2026/06/18/58-news-from-youtube-56-via-whatsapp-reuters-report-on-indias-news-consumption-habits)).

WhatsApp Channels reach large audiences: in late 2023, News18 India had 11.6M followers and Aaj Tak 10.7M ([BestMediaInfo](https://bestmediainfo.com/2023/10/are-whatsapps-channels-a-potential-gamechanger-for-news-platforms)). They come with limits. Channels are one-way, publishers get **no data on followers**, and updates disappear after 30 days ([INMA](https://inma.org/blogs/research/post.cfm/whatsapp-channels-offer-engagement-opportunity-but-constraints-remain)).

For push and email the cheap options are proven. **iZooto** (Noida) is the most-used web-push platform among tracked Indian sites ([wmtips](https://www.wmtips.com/technologies/push-notifications/izooto/)). **OneSignal's** free plan capped mobile push at 1,000 MAU from late 2026 but kept web push free, according to a competitor's write-up ([Pushwoosh](https://www.pushwoosh.com/blog/onesignal-free-plan-changes/)). **Amazon SES** costs $0.10 per 1,000 emails ([AWS SES](https://aws.amazon.com/ses/pricing/)).

**Inference:** at launch, send web push through OneSignal's free tier or iZooto, with breaking-news push as a tightly held, audited permission. Post to WhatsApp Channels by hand, with a "copy for WhatsApp" button that builds the headline, a line of text and a UTM link in both languages. A fact-check format pushed to WhatsApp suits the 53% misinformation finding. Publish RSS for each section and language.

A daily newsletter on SES costs very little (Estimate: 100,000 subscribers emailed daily is about $300/month, ≈₹26,400). Start it at launch if the desk can staff it, otherwise in phase 2. Use Buffer or Meta's own scheduling tools for social posting, and launch with a PWA. Native apps wait for phase 3.

### Comments wait; AI assists but never approves

Coral is open source (Apache 2.0), was built for newsrooms and has belonged to Vox Media since 2019 ([Axios](https://www.axios.com/2019/01/22/exclusive-vox-media-is-acquiring-coral-project-1548104279)). Hosting reader comments brings intermediary duties. Since 20 February 2026 those include takedown within 3 hours of a court or government order, and grievance resolution within 7 days ([Chandhiok & Mahajan](https://chandhiok.com/insights/cm-e-alert-ministry-of-electronics-and-information-technology-notifies-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-amendment-rules-2026)). That is an on-call burden two developers cannot carry at launch.

Indian publishers already use AI in the newsroom. India Today works with CAMB.AI on translation ([Arab News](https://www.arabnews.com/node/2615064)), and ABP generates SEO headlines, summaries and FAQs with AI ([GNI](https://newsinitiative.withgoogle.com/resources/stories/bridging-indias-linguistic-divide-with-abponeai/)). An MIB official said "AI can assist but it cannot approve the final thing" ([BestMediaInfo](https://bestmediainfo.com/mediainfo/mediainfo-digital/human-oversight-cannot-be-outsourced-to-ai-models-says-mibs-prabhat-11132144)).

**Inference:** ranked by value against risk, the AI features to build are English↔Hindi translation drafts (always edited by a human), then headline and SEO-title suggestions, short key-point summaries, tag suggestions, alt-text drafts and, last, wire triage. Log every AI output in an `ai_generations` table and show readers an `ai_disclosure` note on affected stories. AI must never move a story's state. Restrict the existing chatbot to TimesPrime's own and licensed content (see the copyright discussion in section 6).

### Launch versus later, build versus buy (Inference, built from the cited options)

| Area | Launch | Phase 2 | Phase 3 | Build / buy |
|---|---|---|---|---|
| Story model | Block-based stories (EN/HI); formats news, opinion, explainer, live blog; tags, sections | Gallery, polls | Interactive/data stories | Build |
| Workflow | States, per-transition permissions, four-eyes, schedule + embargo, soft locks, revisions + diff, blocking checklist | Planning calendar and assignments | Real-time co-editing | Build |
| Corrections and grievances | Corrections table, on-story notes, `/corrections`, grievance form with 15-day timer | Monthly report automation | — | Build |
| Bylines | Authors, author pages, agency bylines | Contributor portal | Contributor payments | Build |
| Wire | Wire basket from **licensed** feeds, licence flags, credits | AI triage and dedupe | — | Build ingest, buy licence |
| Media | Asset library with credit, licence and bilingual alt text; CDN renditions | Focal-point crops, usage tracking | Full DAM | Build light |
| Video | YouTube embeds + YouTube Live | Mux on-site video | IVS/Mux live | Buy |
| Push / newsletter | Web push (free tier); optional daily brief on SES | Segments by language and topic | App push via FCM; CDP | Buy |
| Search | Postgres full-text search (EN + HI) | OpenSearch/Typesense | Semantic search | Build, then host |
| Comments | None | Coral (managed or self-hosted), only with moderation on-call | — | Buy |
| AI assistant | Translation drafts and headline suggestions, with disclosure | Tagging, alt text, wire triage | Transcription, personalised push | Build on an LLM API |
| Apps | PWA | — | Native (Expo) | Build later |

## 5. News SEO: Google rewards exactly what the aggregator is not

### Google News has no front door; eligibility is earned by original reporting

You cannot apply to Google News any more. Since 25 April 2024, "publishers can no longer set up Google News publications in Publisher Center". Content that follows Google's policies is "automatically eligible for consideration" ([Google Publisher Center Help](https://support.google.com/news/publisher-center/answer/14859160?hl=en)). Since early 2025, Google News builds publication pages automatically from each site's **favicon and site name**, and it stopped using RSS feeds submitted in Publisher Center ([Search Engine Land](https://searchengineland.com/google-news-automated-publication-pages-to-start-in-march-451831)).

Eligibility rests on three things: E-E-A-T, "a consistent history of original news content", and compliance with Google's news policies ([Google Search Central, 2021](https://developers.google.com/search/blog/2021/07/google-news-top-questions)). Those policies expect "clear dates and bylines", information about the authors, publisher and owning company, and contact details. They also require that ads not "exceed your content" ([Google News policies](https://support.google.com/news/publisher-center/answer/6204050)).

AMP has not been required for Top Stories since the 2021 page-experience rollout ([Google Search Central](https://developers.google.com/search/blog/2020/11/timing-for-page-experience)). In August 2025 Google launched **Preferred Sources** in English in the US and India. Readers can star outlets, which then appear more often in Top Stories ([TechCrunch](https://techcrunch.com/2025/08/12/google-will-now-allow-you-define-your-top-sources-for-search-results)).

**Inference:** your site name and favicon are now your Google News identity. That is one more reason to settle the name (D1) before launch rather than after.

### The aggregator matches Google's spam examples almost word for word

Google's spam policies define **scraping** as "republishing another site's content with no original content or value" and "reproducing content feeds from other sites without a unique benefit to users". They define **scaled content abuse** to include scraping feeds through "automated transformations like synonymizing, translating", and using generative AI "to generate many pages without adding value" ([Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)). Both policies date from 5 March 2024, and scaled content abuse applies "whether content comes from automation, humans, or both" ([Google Search Central, Mar 2024](https://developers.google.com/search/blog/2024/03/core-update-spam-policies)).

Google has kept up the pressure. Its status dashboard lists, in 2026 through September alone, four spam updates, two core updates and the first Discover-only core update ([Google Search Status Dashboard](https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history)). The SEO notes' summary says "five spam and three core" but its own table shows fewer; the dashboard table is used here.

Legitimate syndication is allowed. Wire services, and news outlets syndicating from other outlets, are explicitly not site reputation abuse ([Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)). Since 2023 Google has recommended that syndication partners use `noindex` rather than a cross-domain canonical ([Search Engine Land](https://searchengineland.com/google-no-longer-recommends-canonical-tags-for-syndicated-content-406491)).

**Inference:** the current model risks a manual action. A sitewide demotion would also sink your future original journalism on the same domain. Stop serving scraped bodies. Reduce aggregated items to a headline, a short summary in your own words and a prominent outbound link, and keep those pages `noindex` or do not create them. Expect licensed wire copy to be outranked by the original, and add value on top of it. Google publishes no recovery timeline, so consider a **clean break**: launch original journalism on a new URL structure, and let legacy aggregator URLs return 410 or `noindex`.

### Discover is now most of Google's news traffic, and search is shrinking

NewzDash tracks 400+ publishers worldwide. In that sample, **Discover's share of Google mobile traffic rose from 37% in 2023 to 67.5% in Q4 2025**. Over the same period web search fell from 51% to 27%, and Google News from 7% to 3% ([PPC Land, reporting NewzDash](https://ppc.land/news-publishers-lose-half-their-google-search-traffic-in-two-years/)). NewzDash later put Discover at about 75% by Q2 2026 (a vendor claim) ([NewzDash](https://www.newzdash.com/guide/14-predictions-publishers-rebuild-phase-news-industry)).

Indian sites are losing search traffic. Google referrals to Indian news sites fell **25% from May 2024 to May 2025** ([exchange4media](https://www.exchange4media.com/digital-news/zero-click-surge-how-google-ai-are-wiping-out-publisher-traffic-147334.html)). Similarweb data for April 2026 showed year-on-year drops of about 50% for Hindustan Times, 33% for Indian Express and 26% for News18 ([Indian Printer & Publisher](https://indianprinterpublisher.com/?p=98189)).

Discover needs no markup, but it has rules: images at least **1200 px wide**, more than 300,000 pixels and in 16:9; `max-image-preview:large` enabled; no generic images such as your logo; and no clickbait, misleading previews or sensationalism ([Google Discover docs](https://developers.google.com/search/docs/appearance/google-discover)).

Google's first Discover-only core update (5 February 2026) favours locally relevant, original and expert content, judged **topic by topic**. It launched for US English first, and India is not mentioned ([Google Search Central, Feb 2026](https://developers.google.com/search/blog/2026/02/discover-core-update)).

**Inference:** because expertise is judged per topic, a few beats with dedicated reporters will beat thin coverage of everything. Because search is falling, owned channels (push, newsletter, WhatsApp, YouTube) are not optional.

### The technical checklist, item by item

| Item | Requirement (cited) | How to do it in Next.js 16 (Inference unless cited) |
|---|---|---|
| NewsArticle JSON-LD | No required properties. Recommended: `headline`; `image` (at least 50,000 pixels, in 16:9, 4:3 and 1:1); `datePublished` and `dateModified` with a timezone; one `author` entry per person, with `url` pointing to the author page ([Google Article docs](https://developers.google.com/search/docs/appearance/structured-data/article)) | Emit server-side on every story, with `+05:30` and `inLanguage` `en` or `hi` |
| Author pages | ProfilePage markup is valid for "an author page on a news site" ([Google ProfilePage](https://developers.google.com/search/docs/appearance/structured-data/profile-page)) | `/author/{slug}` with photo, bio, beat and links |
| Organization | Use the most specific subtype; logo at least 112×112 px ([Google Organization](https://developers.google.com/search/docs/appearance/structured-data/organization)) | NewsMediaOrganization on Home/About; link the policy pages from it (hygiene, not a proven ranking lever) |
| News sitemap | Only the last **2 days**; at most **1,000** entries per file; `news:language` as an ISO 639 code (`hi`/`en`); `news:name` must match Google News exactly; update in place ([Google news sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap)) | Next's `sitemap.ts` has no `news` property (per the local Next docs), so use a route handler: one news sitemap per language |
| robots.txt + sitemaps | Amar Ujala, Jagran, Bhaskar and Aaj Tak all declare news sitemaps ([jagran.com](https://www.jagran.com/news-sitemap.xml); [aajtak.in robots](https://www.aajtak.in/robots.txt)) | `app/robots.ts` pointing to a sitemap index |
| Bing / IndexNow | Bing closed PubHub on 9 Jun 2025 and "strongly recommend[s]" IndexNow for news ([Search Engine Roundtable](https://www.seroundtable.com/bing-pubhub-retired-39552.html); [IndexNow](https://www.indexnow.org/documentation)) | Ping on publish, update and unpublish |
| Image preview | `max-image-preview:large` ([Google robots meta](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)) | `robots: { 'max-image-preview': 'large' }` in metadata |
| Core Web Vitals | Good = LCP within 2.5 s, INP under 200 ms, CLS under 0.1. INP replaced FID on 12 Mar 2024. No stated weight ([Google CWV](https://developers.google.com/search/docs/appearance/core-web-vitals)) | Server-render article HTML; `next/image` for the hero; reserve ad-slot heights |
| Skip | FAQ rich results restricted (Aug 2023); HowTo deprecated (Sep 2023); ClaimReview dropped (2025) ([Google](https://developers.google.com/search/blog/2025/06/simplifying-search-results)) | Do not build these for rich results |

### Hindi needs its own URLs, and you must choose where they live

Google "recommends using different URLs for each language version of a page rather than using cookies or browser settings" ([Google multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)). Two more rules matter here. Google does not use `lang` or hreflang to detect a page's language. And hreflang pairs are ignored unless both pages point to each other and each lists itself ([Google localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)).

Large Hindi publishers mostly run their own domains (Aaj Tak, Amar Ujala, Bhaskar, Jagran, Live Hindustan). Navbharat Times uses a subdomain, and BBC Hindi uses a subfolder (`bbc.com/hindi`). Every one uses Latin (English or transliterated) slugs, never Devanagari, and none of the homepages checked had hreflang pointing to an English twin ([bbc.com/hindi](https://www.bbc.com/hindi); [aajtak.in](https://www.aajtak.in); [navbharattimes](https://navbharattimes.indiatimes.com)).

Demand for Hindi is strong. A 2024 Google study found that two in three Hindi speakers prioritise news in their own language ([IANS](https://ianslive.in/2-out-of-3-hindi-speakers-now-prioritise-news-in-their-preferred-language-google-study--20240806150006)).

| Hindi location | Pros | Cons |
|---|---|---|
| **`/hi/` subfolder** (BBC Hindi model) | "Low maintenance (same host)" ([Google](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)); pools domain authority; one CDN distribution, one cache, one codebase | Harder to give Hindi its own brand. Whether `/hi/` gets its own Google News publication page is unverified |
| **`hindi.` subdomain** (Navbharat Times, Hindi News18) | "Easy to set up"; somewhat separate brand | Builds authority partly apart from the main site; needs a second Search Console property |
| **Separate Hindi domain** (Aaj Tak, Bhaskar) | The Indian norm; full brand and newsroom separation | Two domains to grow from zero; a second plan (flat-rate plans cover one apex domain each) |

**Recommendation (Inference):** launch with English at `/` and Hindi at `/hi/`. Set `<html lang>` per route, and give each language its own news sitemap and Search Console property. Choose a separate Hindi domain only if you want a distinct Hindi brand, because that is a brand decision, not an SEO requirement. Use URLs like `/hi/{section}/{transliterated-slug}-{id}` that resolve by numeric ID, so an edited headline 301-redirects to the new slug instead of breaking. Add hreflang `en`↔`hi` **only** where one story is a true translation of the other. Stories reported separately in each language get no hreflang pair.

On machine translation: a Google spokesperson said its policies "do not strictly define content that has been translated by AI as spam", but that quote reached the notes second-hand ([Search Engine Roundtable](https://www.seroundtable.com/google-softens-automated-translation-stance-39579.html)). Unreviewed translation at scale is still named in scaled content abuse. **Inference:** human-reviewed translation, with a visible "translated by" credit, is defensible. Auto-translating everything is not.

### What the current setup gets wrong

These problems were found in the repository on 2 November 2026. Severity ratings are the researchers' inference, based on the cited policies.

| Problem (file) | Why it matters | Severity | Fix |
|---|---|---|---|
| Scraped full article bodies served as TimesPrime pages | "Scraping" under the spam policy; copyright (section 6) | **Critical** | Stop serving them; headline + own summary + link, `noindex` |
| Hindi produced client-side through the unofficial `translate_a/single` endpoint (`src/server/services/translate/googleTranslate.ts`), with the language kept in localStorage (`src/context/LanguageContext.tsx`) on one URL | Googlebot never sees Hindi; "translating" is named in scaled content abuse; terms-of-service risk; swapping the page after hydration causes layout shift | **Critical** | Separate `/hi/` URLs with Hindi rendered on the server; human-reviewed translation only |
| Article URL `/article/<slug>?url=<publisher-link>` with no canonical (`src/app/article/[slug]/page.tsx`) | Page identity lives in a query string; no stable ID; the URL advertises another publisher's content | **Critical** | `/{lang}/{section}/{slug}-{id}` with a self-canonical |
| No `robots.txt`, sitemap or news sitemap | Discovery depends on links alone; nothing covers the 2-day freshness window | High | `robots.ts`, sitemap index, a news sitemap per language |
| Site title "Premium News Aggregator" promising "AI-curated summaries" (`src/app/layout.tsx`) | Signals the opposite of an original publisher | High | Rebrand the copy; publish About, Ownership, Masthead and Corrections pages |
| No human bylines, author pages or ownership/masthead pages | Fails Google News transparency and E-E-A-T | High | Authors table and pages; policy pages |
| Unsplash stock fallback images (`src/config/topicImages.ts`) | Discover warns against generic images; schema images must "represent the marked-up content" | Medium–high | Original or licensed photos only |
| `<html lang="en">` hard-coded; PT Serif with only the `latin` subset | Wrong for Hindi accessibility; Devanagari falls back to system fonts, so layout can shift | Medium | `lang` per route; a Devanagari-capable font loaded on Hindi routes |
| No NewsArticle JSON-LD; no `max-image-preview:large` | Dates, authors and images give Google no machine-readable signal; small Discover thumbnails | Medium | Add both |

## 6. Indian law: what applies today, what is stayed, and what a lawyer must confirm

*This section is planning research, not legal advice. Every item marked **Lawyer to confirm** needs Indian media-law counsel before launch.*

### IT Rules Part III covers TimesPrime now, aggregator included

Part III of the IT Rules 2021 covers online publishers of news and current affairs, including "online papers, news portals, aggregators and agencies" ([PRS India](https://prsindia.org/billtrack/the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021)). It applies to publishers with a physical presence in India, or that do systematic business making content available in India ([CAM blog](https://corporate.cyrilamarchandblogs.com/2021/09/from-harbour-to-hardships-understanding-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021-part-iii/)).

The **Code of Ethics duty (Rules 9(1) and 9(3)) has been stayed since August 2021**. The Bombay High Court stayed it first, and the Madras High Court said that stay should have pan-India effect ([MediaNama](https://www.medianama.com/2021/08/223-bombay-high-court-stays-it-rules/); [CAM blog](https://corporate.cyrilamarchandblogs.com/2021/09/from-harbour-to-hardships-understanding-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021-part-iii/)). On 22 March 2024 the Supreme Court sent every challenge to the Delhi High Court ([Bar & Bench](https://www.barandbench.com/news/supreme-court-transfers-it-rules-petitions-to-delhi-high-court)). Part III arguments were scheduled from 11 November 2024 ([IFF](https://internetfreedom.in/dhc-it-rules-2021-hearing/)), and the notes found no judgment as of November 2026.

Several duties are **not** stayed. **Rule 18** requires publishers to furnish their details to MIB, and **Rule 18(3)** requires a "periodic compliance report every month" on grievances received and action taken ([Indian Kanoon](https://future.indiankanoon.org/doc/186195796/)). **Rule 19(3)** requires records of content to be preserved for at least **60 days** ([CAM blog](https://corporate.cyrilamarchandblogs.com/2021/09/from-harbour-to-hardships-understanding-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021-part-iii/)). The grievance mechanism needs a Grievance Officer based in India who resolves complaints within **15 days**, with escalation to a self-regulatory body and, above it, MIB's Inter-Departmental Committee ([PRS India](https://prsindia.org/billtrack/the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021)).

MIB kept sending Rule 18 notices after the stay ([IFF](https://internetfreedom.in/revealed-two-thousand-news-publishers-furnished-details-to-mib/)). In an RTI appeal, however, it said publishers had provided their details on a "voluntary basis" ([IFF](https://internetfreedom.in/rule-18-it-rules-rti-appeal/)). After a CIC order, MIB released a list of **3,101 digital news publishers** that had furnished details ([IFF forum](https://forum.internetfreedom.in/t/top-secret-mib-furnishes-list-of-digital-news-media-publishers-and-ott-platforms-that-submitted-their-details-under-it-rules-2021/3472)).

MIB also holds emergency powers. Under Rule 16, the MIB Secretary can order emergency blocking ex parte, and that rule was never stayed ([PRS India](https://prsindia.org/billtrack/the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021)). Section 85 of the IT Act can make directors and officers liable when an offence is committed ([CAM blog](https://corporate.cyrilamarchandblogs.com/2021/09/from-harbour-to-hardships-understanding-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021-part-iii/)).

Self-regulatory bodies that MIB has registered include DIGIPUB (April 2022) and PADMA (December 2022) ([MIB letter, DIGIPUB](https://xn--m1bet2jh5i.xn--11b7cb3a6a.xn--h2brj9c/sites/default/files/2024-02/DIGIPUB%20News%20India%20Foundation%20Registration%20Letter%2021.04.2022_0.pdf); [exchange4media](https://www.exchange4media.com/media-others-news/mib-approves-registration-of-padma-as-srb-124095.html)). The notes conflict on the scope of IAMAI's DPCGC. Some sources describe it as an OTT body, so check before choosing it.

Two 2026 changes matter. The **February 2026 amendment** (notified 10 February, in force 20 February) brings AI-content labelling and shorter takedown windows, but it is aimed at **intermediaries**, not Part III publishers, and pure text is not "synthetically generated information" ([Chandhiok & Mahajan](https://chandhiok.com/insights/cm-e-alert-ministry-of-electronics-and-information-technology-notifies-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-amendment-rules-2026)). The **31 March 2026 draft** would extend Part III to news posted by ordinary users; no final notification was found ([MediaNama](https://www.medianama.com/2026/03/223-draft-it-rules-explained-news-post-social-media-fall-under-mibs-oversight-heres-what-means/)).

**Inference:** comply fully even with Rule 9 stayed. Compliance is cheap, and it doubles as a trust signal for Google. Furnish the Rule 18 details, appoint and publish an India-based Grievance Officer, build a grievance form with ticket IDs and a 15-day timer, and publish the monthly report at a stable URL. Keep every published version, including takedowns, permanently. Join a registered self-regulatory body and adopt the Press Council norms as your house code.

**Lawyer to confirm:** the exact Rule 18 deadline (the notes' unverified understanding is 30 days from starting operations) and form; whether the Bombay and Madras stays survived the transfer to Delhi; and the status of the March 2026 draft.

### No licence needed for a website, app or YouTube channel; satellite TV is another world

In 2020, MIB told the Supreme Court that digital news outlets need no registration ([MediaNama](https://www.medianama.com/2020/09/223-mib-supreme-court-regulation-of-digital-news-media/)). The 2024 draft Broadcasting Services Bill, which would have covered YouTube news creators, was **withdrawn on 12 August 2024** ([Outlook Business](https://www.outlookbusiness.com/news/the-ministry-of-information-and-broadcasting-withdraws-broadcasting-bill-faces-backlash-from-stakeholders)). Later reports say MIB will not bring a fresh draft and will address the issues through the Digital India Act ([BW Marketing World](https://www.bwmarketingworld.com/article/no-new-draft-for-broadcasting-bill-mib-confirms-report-530057)).

A satellite TV news channel is different. It needs MIB permission and a minimum net worth of **₹20 crore for the first news channel** ([taxguru](https://taxguru.in/?p=861593)). The PRP Act 2023 covers printed periodicals. Sources disagree on whether it reaches e-papers ([Wikipedia](https://en.wikipedia.org/wiki/Press_and_Registration_of_Periodicals_Act,_2023)), so **Lawyer to confirm** before you call any product an "e-paper".

Video brings a practical copyright risk: Prasar Bharati has issued YouTube copyright strikes against news channels over clips of Parliament and the Prime Minister's speeches ([Scroll](https://scroll.in/article/1056536/prasar-bharati-sends-youtube-news-channels-copyright-strikes-for-clips-of-parliament-pm-speeches)).

### DPDP: May 2027 is the hard deadline; plan as if it were sooner

The DPDP Rules were notified on 13 November 2025 and phase in over 18 months:

| Phase | What takes effect | Date |
|---|---|---|
| 1 | Data Protection Board provisions | 13 Nov 2025 (immediately) |
| 2 | Consent-manager provisions | About 13–14 Nov 2026 |
| 3 | Core duties: notice, consent, safeguards, breach notice, rights, retention and erasure, children's data | About 13–14 May 2027 |

Sources: [DPDP tracker](https://www.dpdpactindia.com/timeline.html); [Legal500](https://www.legal500.com/intelligence/india/privacy/8-key-takeaways-the-digital-personal-data-protection-rules-2025).

In January 2026, MeitY proposed shortening the runway to 12 months. No adopted change was found ([Business Standard](https://www.business-standard.com/technology/tech-news/meity-may-cut-compliance-timeline-for-key-dpdp-rules-to-12-months-126012201293_1.html)).

The core duties that bite for a news site are a notice in clear, plain language; seven minimum security safeguards, including **access logs kept for one year**; breach notice to users "without delay", with a detailed report to the Board within **72 hours**; **verifiable parental consent for anyone under 18**, with no tracking, behavioural monitoring or targeted ads aimed at children; and **48 hours' notice before erasure** ([Legal500](https://www.legal500.com/intelligence/india/privacy/8-key-takeaways-the-digital-personal-data-protection-rules-2025)). Penalties reach **₹250 crore** per breach of the security-safeguard duty ([Seclore](https://www.seclore.com/fundamentals/dpdp-rules-2025-compliance-guide/)). There is no general bar on cross-border transfers.

**Inference:** anonymous reading needs no age gate. Accounts, newsletters, push notifications, chatbot logs, and analytics or ad cookies all need consent and notice. Build a bilingual consent banner that blocks non-essential tags until the reader opts in, consent records versioned against each version of the notice, a rights workflow, a one-year log store in Mumbai and an age declaration at sign-up. List Anthropic, NewsData.io, and your analytics and push vendors as processors. **Lawyer to confirm:** the penalty tiers below ₹250 crore, whether notices must be offered in Eighth Schedule languages, and how cookie consent should be treated, since the Act does not mention cookies.

### CERT-In: six hours, 180 days, an Indian time source, a named contact

The CERT-In Directions have been in force since about 27 June 2022 and bind every "body corporate". They impose four duties. Entities must report listed incidents **within 6 hours** of noticing them, including "defacement of website", unauthorised access, data breaches, DDoS and "unauthorised access to social media accounts". They must sync clocks to NIC or NPL NTP servers, or servers traceable to them, designate a Point of Contact, and keep logs of all ICT systems for 180 days within India. Non-compliance can be punished under section 70B(7) of the IT Act ([CERT-In Directions](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)).

**Inference:** write one incident runbook with three clocks: CERT-In at 6 hours, the DPDP Board report at 72 hours, and, if comments ever launch, intermediary takedown at 3 hours. Defacement and social-account takeover are the likeliest incidents for a news brand. **Lawyer to confirm:** the penalty under s.70B(7), and whether logs held by overseas SaaS tools must be copied into India (section 3).

### Copyright: the scraped-text model is the highest legal risk in the product

On **24 July 2026**, Justice Amit Bansal of the Delhi High Court refused ANI an interim injunction against OpenAI (2026:DHC:5900); the main suit is still pending ([CAM blog](https://corporate.cyrilamarchandblogs.com/2026/07/ani-v-open-ai-delhi-high-court-refuses-interim-injunction-in-landmark-ai-copyright-dispute/)). The court held, prima facie, that storing data for training counts as "research" and "private use". That reading rested partly on the dataset **not being public**.

Three other points from the order matter for TimesPrime. Copyright protects the expression in news articles, not the facts behind them, and free public availability does not cancel it. "Memorisation and verbatim reproduction could still be established at trial." And OpenAI had voluntarily blocked ANI's site from its crawlers, for both training and retrieval-augmented generation (RAG), which the court weighed in OpenAI's favour ([CAM blog](https://corporate.cyrilamarchandblogs.com/2026/07/ani-v-open-ai-delhi-high-court-refuses-interim-injunction-in-landmark-ai-copyright-dispute/); [SpicyIP](https://spicyip.com/2026/07/ani-v-openai-user-rights-fair-dealing-and-the-future-of-ai-in-indian-copyright-law-part-i.html)).

**Inference:** republishing a rival's full article on a public page is the opposite fact pattern: public, a substitute for the original, and competing for the same readers. Expect the rights-holder to win. The product changes follow directly. Show a headline, source, time and a 1–2 sentence summary in your own words, with a link. Honour robots.txt and no-scrape or AI signals, and keep a publisher opt-out list. License wire copy for anything reproduced in full. Confine the chatbot's retrieval to your own and licensed content, because the order expressly did not analyse RAG. Keep a licence record for every image.

Translating someone else's article creates a derivative work, which adds to the infringement exposure. **Lawyer to confirm:** NewsData.io's redistribution terms; whether the s.52(1)(a)(iii) fair-dealing exception for "reporting current events" protects any part of the current model; and the AI/RAG clauses in any wire contract.

### Defamation, reporting restrictions and blocking orders

Defamation is a crime under **Bharatiya Nyaya Sanhita s.356**, punishable with up to two years' simple imprisonment, a fine or community service. It is also a civil wrong. The main defences are truth for the public good and good-faith comment on public servants ([SupremeToday](https://supremetoday.ai/issue/bns-section-356-vs-ipc-section-499-500-defamation-laws)). In September 2025 the Supreme Court remarked that the "time has come to decriminalise defamation", but nothing has changed in law ([Millennium Post via Magzter](https://www.magzter.com/hi/stories/newspaper/Millennium-Post-Delhi/TIME-HAS-COME-TO-DECRIMINALISE-DEFAMATION-SC-482367)). Complaints against journalists are filed in practice, for example on Adani Group complaints in Gandhinagar ([National Herald](https://www.nationalheraldindia.com/amp/story/national/gandhinagar-court-summons-journalists-abhisar-sharma-and-raju-parulekar-for-defaming-adani)).

Blocking requests under Rule 16 of the 2009 Blocking Rules are confidential ([Verfassungsblog](https://verfassungsblog.de/blocked-without-explanation/)). On 24 September 2025, the Karnataka High Court upheld the government's Sahyog takedown route; X's appeal is pending ([LiveLaw](https://www.livelaw.in/high-court/karnataka-high-court/karnataka-high-court-x-sahyog-portal-centre-blocking-orders-304983)).

**Inference:** the desk panel should carry a legal-review flag on sensitive stories, a right-of-reply record, retention of sources and evidence, and the versioned article history. Keep an access-restricted register of blocking orders, and do not publish an order without advice. The chatbot can defame named people, so restrict it to sourced content and log its answers.

**Lawyer to brief the newsroom** on reporting restrictions the notes did not research: the identity of sexual-offence victims (BNS s.72), POCSO s.23, JJ Act s.74, and contempt of court.

### Ads, subscriptions, tax and ownership

**Ads.** ASCI's rules require sponsored, branded and native content to carry a clear label (#ad, "Sponsored", "Partnership") that is seen at once ([ASCI](https://www.ascionline.in/wp-content/uploads/2022/09/press-release-influencer-guidelines-2021.pdf)). Since August 2025, Clause 1.8 extends this to media companies' paid social posts ([ASCI, Aug 2025](https://www.ascionline.in/wp-content/uploads/2025/08/ASCI_Code_Update_Media_Paid_Posts_Aug2025_PressRelease.pdf)).

**Subscriptions.** The CCPA's Dark Patterns Guidelines 2023 ban 13 patterns, including **subscription traps, drip pricing and confirm-shaming** ([Mondaq](https://www.mondaq.com/article/1844140/ccpas-guidelines-on-dark-patterns-an-overview)). On 5 June 2025 the CCPA asked e-commerce platforms to self-audit within 3 months ([AZB](https://www.azbpartners.com/bank/central-consumer-protection-authority-issues-advisory-to-e-commerce-platforms-for-self-audit-to-detect-dark-patterns-on-their-platforms/)).

**Tax.** Online news subscriptions attract **18% GST** as OIDAR services, while print is exempt. MIB and DNPA have asked for 5% or nil, with no decision found ([afaqs](https://afaqs.com/news/media/mib-urges-revenue-department-to-exempt-digital-news-subscriptions-from-18-gst-or-cut-rate-to-5)). The 6% equalisation levy on online ads ended on 1 April 2025 ([Business Standard](https://www.business-standard.com/industry/news/india-equalisation-levy-removed-tax-impact-2025-125040100810_1.html)).

**Ownership.** Foreign direct investment in digital news is capped at **26%, through the government approval route**. The cap explicitly covers news aggregators. A company with FDI needs a majority-Indian board, an Indian-citizen CEO, and security clearance for any foreign staff deployed more than 60 days a year ([Khaitan ERGO](https://www.khaitanco.com/sites/default/files/2020-10/Clarification%20on%20the%20FDI%20Policy%20for%20uploading%20%20streaming%20of%20news%20and%20current%20affairs%20through%20digital%20media.pdf)).

**Lawyer to confirm:** whether the September 2025 GST rate changes touched OIDAR or ad services, and whether the FDI conditions have changed since 2020.

### The name: "TimesPrime" collides with an existing Times Internet product

"Times Prime" is already a **Times Internet membership product**, sold bundled with TOI+ at about ₹1,199 a year. That price comes from an aggregator listing and is unverified ([Subger](https://subger.com/en/service/toi-plus)). The monetization research flags a trademark and brand-confusion risk with advertisers and with Google's news and ad-policy reviewers.

**Inference:** this risk compounds with every month of growth. Google News now identifies a publication by its site name and favicon (section 5). A forced rename after launch would throw away the search and social equity the new brand has built, and a news brand cannot afford to look like it is trading on someone else's name.

**Lawyer to confirm, before launch and before the domain earns any authority:** a trademark search and a passing-off assessment for "TimesPrime" and "TimesPrime247" in the publishing and online-news classes. Decide D1 on that advice.

### Compliance map

| Obligation | Status (Nov 2026) | When | Build or do |
|---|---|---|---|
| IT Rules Rule 18 filing; monthly grievance report; 60-day content records | **In force**, not stayed | At launch | MIB filing; grievance page and tickets; report page; permanent revisions |
| Code of Ethics (Press Council norms) and three-tier oversight | Rules 9(1) and 9(3) **stayed**; Delhi HC pending | Voluntary now | Adopt as house code; join a self-regulatory body |
| MIB emergency blocking; s.69A blocking (confidential) | **In force** | On receipt | Takedown runbook; confidential register |
| Intermediary duties (3-hour takedown, 7-day grievance, AI-media labels) | **In force** since 20 Feb 2026 | Only if comments or uploads launch | Moderation on-call; labels on AI images and video |
| Licence for website, app or YouTube | **None required** | n/a | Nothing |
| DPDP core duties | Phase 3 from about 13–14 May 2027 | Before May 2027 | Consent banner, bilingual notice, rights workflow, 1-year logs, breach runbook, age handling |
| CERT-In (6 h, NTP, Point of Contact, 180-day logs in India) | **In force** | Now | 365-day Mumbai log store; NTP; runbook; Point of Contact |
| Copyright | High risk under the current model | Before any public traffic | Headline-summary-link; wire licences; image register |
| Defamation (BNS s.356) | **In force** | Ongoing | Legal-review flag; corrections; right of reply |
| ASCI labels; CCPA dark patterns; 18% GST | **In force** | Before ads or subscriptions | Content labels; honest paywall; GST registration |
| FDI cap of 26% | **In force** | At incorporation and each funding round | Indian-controlled company |

## 7. Money and measurement: build the hooks now, switch on revenue later

### Indian online news earns from ads roughly ten times what it earns from readers

In 2023, Indian online news earned **₹1,900 crore from ads and ₹200 crore from subscriptions**, the latter from 1.7 million paid subscriptions (FICCI-EY 2024, via [BestMediaInfo](https://bestmediainfo.com/2024/03/online-news-generates-rs-200-crore-from-subscriptions-and-rs-1900-crore-from-ads-in-2023)). Digital as a whole took about ₹94,700 crore, or 63% of India's ad spend, in 2025 ([Storyboard18](https://www.storyboard18.com/advertising/digital-media-hits-%e2%82%b9100000-crore-ad-revenues-surge-to-%e2%82%b994700-crore-ficci-ey-report-92987.htm)). Government digital ad rates have halved in eight years ([exchange4media](https://www.exchange4media.com/digital-news/news-publishers-feel-the-pinch-as-goi-halves-digital-ad-rates-147025.html)).

No audited data compares Hindi and English yields. The only figures are one reseller's direct-sold rate cards:

| Inventory (reseller rate card) | CPM |
|---|---|
| Amar Ujala banners | ≈ ₹80–150 desktop, ₹60–120 mobile |
| Live Hindustan homepage leaderboard | ≈ ₹200–350 |
| Aaj Tak pre-roll video | ≈ ₹400–800 |

Sources: [SmartAds: Amar Ujala](https://smartads.in/services/digital/amarujala-advertising), [SmartAds: Aaj Tak](https://smartads.in/services/digital/aaj-tak-digital-advertising). Mint reports that regional-language CPMs are "usually lower" ([Mint via Magzter](https://www.magzter.com/en/stories/newspaper/Mint-Mumbai/REGIONAL-CONTENT-PLAYERS-STRUGGLE-WITH-LOW-AD-RATES-POOR-ALGORITHMS)). **Inference:** Hindi brings reach and English brings yield. Sell and measure the two on separate ad units, because you will have to produce your own numbers.

### Ads: AdSense first, Google Ad Manager when you sell direct, header bidding last

AdSense now pays per impression, and publishers receive 80% after the advertiser-side fee ([Google blog](https://blog.google/products/adsense/evolving-how-publishers-monetize-with-adsense/)). Google Ad Manager is free up to **200 million non-video impressions a month** for a group of countries that includes India ([Google Ad Manager Help](https://support.google.com/admanager/answer/6214526?hl=en)). **Estimate:** at three slots per page, that covers about 66 million pageviews a month before any ad-server fee.

Header bidding pays off at scale, though the evidence is vendor case studies, mostly old. NDTV reported CPM lifts of up to 30% after consolidating on PubMatic OpenWrap ([PubMatic](https://pubmatic.com/wp-content/uploads/2021/10/Case-Study-NDTV-OpenWrap.pdf)). Zee reported 40% more programmatic revenue ([PubMatic](https://pubmatic.com/case-studies/how-zee-media-saw-a-40-increase-in-overall-programmatic-revenue-by-adopting-pubmatics-openwrap/)).

Speed and ads are linked. Netzwelt's ad revenue rose 18% after it fixed Core Web Vitals, partly by moving ads out of the top slots ([web.dev](https://web.dev/case-studies/netzwelt)). Google's guidance is to reserve space for every ad slot and lazy-load where appropriate ([web.dev](https://web.dev/articles/loading-ads-page-speed)).

**Inference:** at roughly 5–30M monthly pageviews, header bidding through a managed wrapper or ad-ops partner beats running Prebid in-house. Below that it is not worth the JavaScript weight.

### Reader revenue: membership before paywall

| Publisher | Reader-revenue facts |
|---|---|
| **TOI+** | More than 120,000 paying users; 25–35% of app trial users converted within 30 days ([Press Institute of India](https://pressinstitute.in/?p=22859)) |
| **TOI+ and HT Premium prices** | About ₹999/yr and ₹399/yr (aggregator listings, unverified) ([Subger](https://subger.com/en/service/toi-plus)) |
| **Newslaundry** | No ads; 50,000+ paying subscribers (July 2024) ([Wikipedia](https://en.wikipedia.org/wiki/Newslaundry)); ₹7.5 crore revenue in FY25 ([Inc42](https://inc42.com/company/newslaundry/financials/)) |
| **Indian Express** | Investigations go to subscribers first, then open after half a day to a day ([Press Gazette](https://pressgazette.co.uk/news-leaders/indian-express-paywall/)) |

On payments, UPI Autopay mandates up to ₹15,000 per transaction need no extra authentication. Customers must get a pre-debit notice at least 24 hours before each recurring debit ([Razorpay](https://razorpay.com/docs/payments/recurring-payments/upi.md)). Piano and Zephr publish no prices ([CCBill](https://ccbill.com/blog/best-paywall-solutions)).

**Inference:** a new outlet should start with membership ("support TimesPrime", ad-light) on Razorpay or Cashfree with UPI Autopay, plus an entitlement table in Supabase checked on the server. A metered paywall comes only once original investigations exist, following the Indian Express "subscribers first, then open" model.

Two other revenue routes are invitation-based. Google News Showcase launched in India in May 2021 with 30 publishers, who are paid fixed monthly fees; it is invitation-only and the amounts are not public ([TechRadar](https://www.techradar.com/news/google-launches-news-showcase-in-india-with-30-news-outlets)). The GNI Indian Languages Program trained and funded more than 300 publishers in its first edition (2023), but no 2025–26 edition was found ([Business Standard](https://www.business-standard.com/india-news/google-launches-indian-languages-programme-to-support-news-publishers-123061600515_1.html)).

### Analytics: free tools first, your own events from day one

| Tool | Facts | Cost |
|---|---|---|
| **GA4** | Keeps exploration data for 2–14 months. Its free BigQuery export is capped at 1M events a day and **is not retroactive** ([Cypress North](https://cypressnorth.com/data-analysis/using-bigquery-to-overcome-ga4-data-retention-limits/)) | Free |
| **Microsoft Clarity** | Heatmaps and session replay ([PostHog blog](https://posthog.com/blog/best-microsoft-clarity-alternatives)) | Free |
| **Parse.ly** | Starter about $995/month (≈₹87,600); sources conflict ([TrustRadius](https://www.trustradius.com/compare-products/parse-ly-vs-chartbeat)) | Paid |
| **Chartbeat** | No published price ([GetApp](https://www.getapp.com/business-intelligence-analytics-software/a/chartbeat/pricing/)) | Paid |
| **Comscore** | The Indian currency; figures swing widely depending on whether social traffic counts ([exchange4media](https://www.exchange4media.com/industry-briefing-news/network18-overtakes-times-internet-news18-leads-over-times-of-india-comscore-report-143020.html)) | Not public |

**Inference:** at launch run Search Console, Bing Webmaster, GA4 behind the consent gate (switch on the BigQuery export on day one) and Clarity. Add a small first-party heartbeat pipeline that feeds a newsroom "live now / top stories / referrer mix" screen. That screen is what the Insights panel should show. Track Discover, Google News, WhatsApp, push and newsletter as separate referrer classes. Buy Chartbeat or Parse.ly only when there is a newsroom large enough to act on real-time data.

### Hooks to build before launch, because they are cheap now and costly to retrofit (Inference)

| Hook | Why |
|---|---|
| First-party consent state, read before any ad or analytics tag loads; bilingual banner | DPDP consent from May 2027; non-personalised ads as the fallback |
| `analytics.track()` abstraction | Swap or consent-gate GA4, Clarity or PostHog without touching components |
| `<AdSlot>` with reserved sizes; `ads.txt` served from a route | Protects CLS and LCP; edit sellers without a deploy |
| `content_label` on stories (editorial, sponsored, partner) | ASCI labelling, `rel="sponsored"`, exclusion from news sitemaps |
| `access` on stories (free, metered, members) | A paywall later without a schema change |
| `subscriber` table with consent source and timestamp | Newsletter and push under DPDP |

| Phase | Rough traffic (judgement call, not a benchmark) | Switch on |
|---|---|---|
| A: before launch | 0 | The hooks above; web push free tier; SES newsletter (tens of dollars a month) |
| B: launch | Up to about 1–5M pageviews/month | AdSense with manual, below-the-fold placements; YouTube channel; labelled branded content; GNI applications |
| C: growth | About 5–30M | GAM (still free) with direct sales; separate Hindi and English ad units; a managed header-bidding wrapper; Razorpay membership |
| D: scale | Above 30M | Metered paywall on investigations; Chartbeat or Parse.ly; a CDP once an app exists; GAM 360 only near the free limit |

## 8. Roadmap: five phases for two developers, with compliance pulled forward

### Why the current panel order needs one change

The project's panel sequence in `docs/PANEL_DOCS.md` runs Access foundation (0), Administration (1), Desk (2), Front page (3), Ingestion (4), AI assistant (5), Insights (6), Compliance (7), Privacy & security (8) and Commercial (9). Two dates make that order risky. The desk alone is about 3–5 months of work (Estimate, section 1), so a public launch of original journalism lands around **April–May 2027** at the earliest (Estimate). The DPDP core duties start around **13 May 2027**, and the IT Rules grievance and record duties and the CERT-In duties apply from the first public day (section 6).

**Inference:** launch and DPDP compliance fall on effectively the same date. Compliance and privacy therefore cannot be the seventh and eighth panels. Their launch minimum must ship with the desk and front page: the grievance form with its 15-day timer, the corrections log, the monthly report page, the consent banner, the bilingual notice, the rights-request form, the 365-day log store and the incident runbook. The rest of those panels follows straight after (decision D15). If launch slips, the privacy minimum still has to be live by 13 May 2027, because staff accounts and any newsletter or push sign-ups are already personal data (Inference).

The rule of one panel at a time still holds. What changes is what counts as "launch scope". `docs/PANEL_PLAN.md` is the project's reference and is not edited here, so the owner decides whether to amend it.

Ingestion (Panel 4) should also be re-scoped. It was planned around NewsData.io sync and scraping. It should become a **licensed wire basket** with licence controls and a kill switch, and it can come after launch.

### The phases (Inference; durations are estimates for two developers, with months counted from November 2026)

| Phase | Approx. timing | Developer work | Owner and newsroom work | Gate to exit |
|---|---|---|---|---|
| **0. Make it safe to be public** | Now, 2–4 weeks | Turn off scraped full text, the unofficial translate endpoint and stock-image fallbacks in reader output; reduce aggregator items to headline + own summary + link with `noindex`, or hide them; restrict the chatbot to own/licensed content; close Panel 0's remaining done-criteria (the local-database run) | Trademark search (D1); incorporate an Indian Pvt Ltd with an Indian CEO and a majority-Indian board (D13); retain media-law counsel; decide where Hindi lives (D4); open wire-agency talks (D14); hire the editor | Nothing scraped or machine-translated is publicly reachable; counsel engaged |
| **1. Platform + desk** (Panels 1 and 2) | Months 1–5 | Lean Panel 1 (users, scoped role assignments). Panel 2: `stories`, revisions, Tiptap editor tested with Hindi typists, workflow states and four-eyes, schedule and embargo, soft locks, authors and bylines, tags and sections, media library with rights, corrections table. In parallel: Fargate + CloudFront Business flat-rate + Redis cache handler + tag invalidation; 365-day Mumbai log store; NTP; Supabase custom domain and log drain; EventBridge for scheduled publishing | Editorial standards, corrections policy and AI-use policy written; first reporters and desk editors in both languages; Grievance Officer and CERT-In Point of Contact named | Two people can write, review, approve, schedule and correct a Hindi and an English story end to end, with every action audited |
| **2. Launch** (Panel 3 + compliance/privacy minimum) | Months 5–7 | Front page curation, breaking banner, live blogs, breaking-push permission; `/en` and `/hi` routing, NewsArticle and ProfilePage markup, robots, sitemaps, news sitemaps, IndexNow, transparency pages; web push, RSS, YouTube embeds and Live, "copy for WhatsApp"; consent banner, analytics abstraction, AdSense with reserved slots; grievance form, monthly report page, rights-request form, incident runbook | Rule 18 filing; join a self-regulatory body; GST registration if selling anything; Search Console and Bing properties per language; a launch beat plan focused on a few topics (Discover judges per topic) | The table below passes |
| **3. Finish compliance** (Panels 7 and 8 in full) | Months 7–9, and before any comments | Legal-orders register, content-record exports, monthly report automation; data-rights workflow, breach handling, audit viewer | Data-protection contact; processor contracts (Anthropic, analytics, push) | Panels 7 and 8 complete; the DPDP duties themselves were already met by the Phase 2 minimum before 13 May 2027 |
| **4. Grow** (Panels 4, 5, 6, 9) | Month 9 onward | Licensed wire basket; AI assistant (translation drafts, headline suggestions, `ai_generations`, disclosure); Insights dashboard on first-party events; then Commercial (GAM, Razorpay membership). Later: Mux, OpenSearch, Web Stories, comments (only with an on-call rota), apps | Ad sales, branded-content desk, GNI applications, YouTube programming | Revenue phases B to D in section 7 |

### What "ready to launch" should mean

| Gate | Evidence |
|---|---|
| No scraped or unreviewed machine-translated content is reachable | Crawl of the site; `noindex` or 410 on legacy aggregator URLs |
| Every story has a real byline, an author page, published and updated times in IST, and NewsArticle markup | Rich Results Test passes on sample EN and HI stories |
| Hindi has its own server-rendered URLs, with `lang="hi"` and a Devanagari font | View-source on `/hi/...` shows Hindi |
| News sitemap per language (last 48 hours, at most 1,000 entries); robots.txt; IndexNow pings | Search Console accepts the sitemaps |
| Grievance Officer published; 15-day ticket timer; corrections page; About, Ownership, Masthead, Editorial Standards, AI-use, Privacy and Terms pages in EN and HI | Pages live; Rule 18 filed |
| Logs from CloudFront, WAF, ALB, the app, the audit log and Supabase land in ap-south-1 with at least 365 days' retention; NTP traceable to NIC/NPL; CERT-In Point of Contact named; 6-hour runbook rehearsed | One tabletop drill |
| Consent banner blocks analytics and ads until the reader opts in; bilingual privacy notice; rights-request form | Manual test with tags blocked |
| Publish purges both the Next cache and CloudFront by tag; live pages poll cached JSON; "breaking-news mode" runbook written | Load test on a live-blog URL |

### Running cost at launch (Estimate)

At launch traffic the platform costs about **$620–760 a month (≈₹55,000–67,000)**. The pieces: the CloudFront Business plan ($200), two Fargate tasks with an ALB ($80–150), Supabase Pro with Large compute, PITR, a custom domain and a log drain (about $295), log storage ($25–60), and SES and scheduling (tens of dollars). That figure excludes the existing Upstash and Sentry plans and any Tiptap plan. It also excludes the costs that will dominate the budget, which the notes did not price: **journalists, a wire licence and legal counsel**.

For scale, ThePrint launched in 2017 with about 35 journalists ([Nieman Lab](https://www.niemanlab.org/2017/10/one-of-indias-most-famous-newspapermen-is-turning-to-digital-with-a-political-journalism-platform/)), and The Quint launched in 2015 with 80 journalists among 135 staff ([Business Standard](https://www.business-standard.com/article/companies/online-portals-seek-a-new-face-of-journalism-115110201472_1.html)). **Inference:** a credible bilingual launch needs, at minimum, an editor, 2–4 reporters per language, one desk or copy editor per language, a video and social producer, and an SEO or audience editor.

### Which decisions block what

| Needed by | Decisions | What they block |
|---|---|---|
| Before Phase 1 code | D1 name, D2 aggregator fate, D3 CMS, D4 Hindi location, D8 repo shape | Domain, URL scheme, data model, the editor build |
| Before infrastructure work | D6 hosting, D7 database | The Fargate/CloudFront set-up and the log store |
| Before launch | D5 translation policy, D9 video, D10 comments, D12 named people and filings, D13 company, D14 wire agency, D15 panel order | Launch gates, Rule 18 filing, legal exposure |
| Before revenue | D11 money sequencing | Ads, membership, GST |

## Conclusion

The research turns the project's sense of what is an asset and what is a liability upside down. The parts that looked like overhead (scoped roles, MFA, an append-only audit log, four-eyes approval) are the hard-to-buy core of a newsroom. Payload, Strapi and Sanity sell their equivalents, approval workflows and audit logs, only in enterprise tiers. The parts that looked like the product are exactly what Google's spam policies and Indian copyright law punish: aggregation, scraped full text, instant AI translation and an AI chatbot over other people's articles. The same holds in infrastructure. With CloudFront's flat-rate plans and cache-tag purging (new in 2025–26), a two-developer team can serve an Indian election-night surge for a fixed few hundred to a few thousand dollars a month. The Washington Post once built its own SQS/EC2 revalidation system for that, and called it complex and expensive. The constraint has moved from servers to journalists, distribution through YouTube, WhatsApp and Discover, and legal process.

Three things are cheapest today and get dearer every month: settling the name, making a clean break from the aggregator's URLs and reputation, and building the compliance launch minimum into the desk instead of leaving it for later panels. Three things remain genuinely unknown and should be settled with quotes, tests or counsel, not assumptions. The first is current Quintype and wire-agency prices, which decide whether "buy" ever beats "build". The second is how Hindi input actually behaves in the chosen editor. The third is whether the Delhi High Court's eventual Part III ruling revives the Code of Ethics and the oversight committee. Building as if it will costs little, while being caught out would cost a lot.

