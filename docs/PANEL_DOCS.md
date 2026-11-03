# Back-office panels

This file records the back office: the owner's plan for it, and what has been built, panel by
panel, with who is allowed to do what. The [panel plan](#panel-plan) says what to build: the panels,
the 15 roles, the permission matrix, the four-eyes and MFA rules, and the data model. The
[index](#index) and the [panels](#panels) say what has been built, and they must match the code.

The panels are built **one at a time**. A panel is finished (backend, screens, permissions, tests
and docs) before the next one starts. Panel 0 comes first because every other panel depends on it.
When a panel is done, its section below is filled in from the template and the index is updated in
the same piece of work. **Panel work is paused** during the release (`release/v1`); Panel 0's second
half waits on `panel-0-access`.

## Definition of done

The owner's rules for the back office (they were `CLAUDE.md`, "Back-office panels").

- **Plan:** the [panel plan](#panel-plan) below (roles, permission matrix, four-eyes and MFA rules,
  data model). It is the reference; do not edit it. Report errors or conflicts with the code
  instead.
- **Progress and per-panel docs:** this file. Its [index](#index) says which panel is next.
- **One panel at a time.** Panel 0 (Access foundation) first; no panel starts before the previous
  one is done.
- **A panel is done only when:**
  1. Every feature in its entry in this file works, and the entry matches the code.
  2. Every route and action it adds checks a permission server-side; tests prove allowed and denied.
  3. Privileged actions are audited and need MFA where the plan says so.
  4. `npm run verify` and CI are green; routes, JS and CSS reported.
  5. SQL is in migration files with a rollback, listed as an owner action.
  6. This file and the current status in `docs/OPERATIONS.md` are updated. (Until 2026-11-03 this
     item named `docs/PANEL_DOCS.md`, `docs/HANDOFF.md` and `docs/CODEMAP.md`; HANDOFF became the
     current status in OPERATIONS.md, and CODEMAP was retired.)
  7. Database tests against the real database are read-only. The database's own rules (triggers,
     audit hash chain, bootstrap) are verified by the owner via the runbook.
  8. End-to-end browser tests cover the critical flows, including a refused-access flow.
  9. Every screen has loading, error and empty states.
  10. Accessibility is checked (keyboard, labels).
  11. Failures reach Sentry; privileged actions are audited.
  12. A JS size budget per route is enforced in CI.
  13. A runbook covers what to do when the main flow breaks.

## Panel plan

The owner's reference plan, exactly as written: it is **not edited**. Everything between the two
markers below is byte-identical to `docs/PANEL_PLAN.md` at `239e701` (git blob
`4552f1913a71b1e8cbb6656869e9d774e1670295`), and a test in
`backend/shared/config/permissions.test.ts` fails if a byte changes. The permission catalogue,
`database/migrations/2026-11-02-access-2-catalog.sql`, is generated from its matrix by
`backend/scripts/generate-access-catalog.mjs`, and the same test checks the catalogue against the
matrix cell by cell.

<!-- BEGIN:panel-plan -->
# Build TimesPrime's back office around verbs and scopes

None of the five publishers (The Hindu, India Today Group, The Times of India / Times Internet, NDTV, The Indian Express) publishes its internal dashboards or permission matrices. Their back offices can still be reconstructed from vendor case studies, job postings and the admin documentation of the tools they run. Each one runs **five separate back-office surfaces rather than one admin panel**: an editorial CMS, an ad server (Google Ad Manager wherever it is documented), a subscription or paywall engine, a CRM or engagement tool, and analytics. Legal and compliance functions sit on top, and Indian law now requires some of them by name. Every serious system in this space shares the same permission design, from Google Ad Manager's roles and teams to Quintype's `story-approve` and `story-retract` and Arc XP's squads. Permissions are verbs on objects. Roles are bundles of those verbs that an administrator composes. Scope (site, language, section, advertiser) is a separate dimension from role. For TimesPrime, this means replacing the single shared admin password with named Supabase Auth staff accounts and a small verb catalogue. Role assignments should be scoped by language desk (en/hi) and section. Authority stays server-side: `proxy.ts` makes only optimistic checks, and a `server-only` permission check runs in the backend. Build in four phases. First come accounts, roles, MFA and an append-only audit log. Then the editorial workflow with four-eyes approval. Then the compliance queues (grievance, legal orders, corrections). The CRM, subscription and ads panels come only once those businesses exist. Unless a citation is given, statements about which role at a given publisher can publish, push or unpublish are inference from industry norms, and the report labels them that way throughout.

## Two of five have a confirmed CMS, and none publish a permission matrix

The evidence base is uneven, and it needs to be stated plainly before any recommendation. **The Hindu runs Stibo DX's Cue platform**: Cue Dam for more than 80 million assets, the Cue Content Store editorial CMS, and Cue Print. Its asset metadata treats embargoes, expiry dates and usage restrictions as first-class fields ([Stibo DX](https://www.stibodx.com/resources/wan-ifra-digital-media-india-2022); [Stibo DX](https://stibodx.com/resources/hindu-goes-digital-first-with-cue)). **The Indian Express runs WordPress VIP** with Full-Site Editing, built with rtCamp. Editors control layouts without developers, and custom Gutenberg blocks power IPL live scores and election-results dashboards ([rtCamp](https://rtcamp.com/?p=208148)). **India Today Group** has an unnamed CMS. On top of it sits "Pragya", an AI workflow platform built with Google. Pragya has a Journalist App for field filing, a dashboard that tracks story status "from inception to publication", and a mandatory "human-led audit and pre-publishing review" of AI output ([Google News Initiative](https://newsinitiative.withgoogle.com/resources/stories/india-today-group/)). For **Times Internet and NDTV, no public source names the web CMS**. NDTV Profit's broadcast newsroom system runs on Nutanix ([Nutanix](https://www.nutanix.com/company/customers/ndtv-profit)). TV-led groups therefore appear to run a broadcast newsroom system alongside a separate web CMS, and a digital-only product does not need to copy the broadcast side.

| Publisher | Editorial (documented) | Ads (documented) | Reader revenue / CRM (documented) | Analytics / other |
|---|---|---|---|---|
| The Hindu | Stibo DX Cue (DAM, CMS, print); Digital Editor; Social Media Sub Editor | Google Ad Manager named in Ad Ops Manager posting; Taboola Feed | Piano "subscription engine", metered paywall since Oct 2019; CleverTap | Google Analytics, Botify; comments on Vuukle since Feb 2026 |
| The Indian Express | WordPress VIP + Gutenberg/FSE (rtCamp) | Not found | Evolok paywall/identity (announced 2021); MoEngage lifecycle | Not found |
| Times of India / Times Internet | CMS unnamed; editors hold top two homepage slots over algorithm | DFP/GAM, PubMatic OpenWrap, in-house Colombia; DFP-to-SAP order automation | TOI+; CleverTap used by retention team | Chartbeat (2016) |
| NDTV | Web CMS unnamed; broadcast newsroom on Nutanix | GAM with Programmatic Guaranteed; consolidated on OpenWrap | No paywall product found | Not found |
| India Today Group | CMS unnamed; Pragya AI workflow layer | SelectMedia outstream unit; ad server not found | Ad-led; magazines via Magzter | Comscore No. 1 in News (295M, Jul 2025); Grievance Officer is Group General Counsel |

Sources for the table: [IPP/WAN-IFRA](https://indianprinterpublisher.com/?p=79194), [INMA](https://www.inma.org/blogs/Generative-AI-Initiative/post.cfm/ai-gives-times-internet-a-twitter-feel-while-ht-focuses-on-content-automation), [foundit.in](https://www.foundit.in/job/54106825), [PubMatic TIL](https://pubmatic.com/wp-content/uploads/2017/08/CaseStudy_OpenWrap_Times-Internet-August2017.pdf), [ExchangeWire](https://www.exchangewire.com/blog/2014/12/07/times-of-india-investing-in-ad-tech-stack-to-ensure-continued-growth/), [Google Ad Manager NDTV](https://admanager.google.com/home/success-stories/new-delhi-television-increases-revenue-with-programmatic/), [PubMatic NDTV](https://pubmatic.com/wp-content/uploads/2021/10/Case-Study-NDTV-OpenWrap.pdf), [Adgully](https://archive.adgully.com/evolok-partners-with-the-indian-express-107466.html), [MoEngage](https://moengage.com/casestudy/how-the-indian-express-witnessed-a-2x-uplift-in-paid-subscribers/), [CleverTap](https://clevertap.com/case-study/how-times-of-india-achieves-a-100-growth-in-subscribers-through-personalization-at-scale/), [GlobeNewswire](https://www.globenewswire.com/news-release/2016/05/10/1078589/0/en/Chartbeat-Partners-With-Times-Internet-to-Command-Newsroom-Analytics.html), [SelectMedia](https://www.selectmedia.asia/?p=6417), [Bestmediainfo](https://bestmediainfo.com/mediainfo/mediainfo-digital/india-today-group-is-the-digital-news-leader-comscores-july-2025-data-9764520), [aajtak.in](https://aajtak.in/complain-redressal), [Let's Data Science](https://letsdatascience.com/news/the-hindu-migrates-comments-to-vuukle-platform-f1383a35).

Two things are missing from every source: a job ad that states CMS permission levels such as "can publish directly", and any published org chart for a digital desk. The research environment also blocked fetching the publishers' ads.txt files and page source, so ad-stack and payment-gateway claims rest on vendor material and should be checked by hand. All five run separate language brands with their own desks on a shared platform. Indian Express's single VIP network covers Jansatta and Loksatta ([rtCamp](https://rtcamp.com/?p=208148)), and The Hindu's Cue Dam serves its English, Tamil and business editions ([Stibo DX](https://www.stibodx.com/resources/wan-ifra-digital-media-india-2022)). This is the strongest precedent for running TimesPrime's en and hi desks as scopes on one system rather than as two systems.

## Every panel family splits action from scope

### Editorial: the CMS and its workflow verbs

Documented practice at these publishers covers human review before publishing (ITG), editor-controlled homepage slots above a personalised feed (**TOI editors keep the top two slots and can override the algorithm** ([INMA](https://www.inma.org/blogs/Generative-AI-Initiative/post.cfm/ai-gives-times-internet-a-twitter-feel-while-ht-focuses-on-content-automation))), AI-personalised push notifications at TOI ([INMA](https://www.inma.org/blogs/Generative-AI-Initiative/post.cfm/times-of-india-uses-genai-as-an-engine-for-new-products-and-revenue)), and a public corrections column at The Hindu ([inkl](https://www.inkl.com/news/corrections-and-clarifications-december-25-2020)). Documented role titles include The Hindu's Social Media Sub Editor, who coordinates with reporters on breaking news and schedules posts ([Weekday](https://jobs.weekday.works/job-opening-for-social-media-sub-editor-at-the-hindu-wkdynwxjh5)). Others are NDTV's AI Editor and Executive Editor ([exchange4media](https://www.exchange4media.com/media-tv-news/ndtv-is-reshaping-newsroom-around-multimedia-and-editorial-plurality-rahul-kanwal-157413.html)) and Indian Express's Editor, New Media ([afaqs](https://www.afaqs.com/news/digital/39211_the-indian-express-appoints-nandagopal-rajan-as-editor-new-media)). The full ladder from reporter through sub-editor, chief sub, news editor, section editor and digital editor to editor-in-chief is the industry norm, not something any of the five has documented.

The permission models of the CMSs these newsrooms use, or could use, are documented, and they agree with one another. WordPress separates `publish_posts` (Author and up) from `edit_others_posts` (Editor and up). It keeps the risky `unfiltered_html` as its own capability and tells code to check capabilities, never role names ([WordPress.org](https://wordpress.org/documentation/article/roles-and-capabilities/)). Automattic's VIP Workflow adds Pitch, Assigned, In Progress and Pending Review statuses, plus a **Publish Guard that hides Publish until the final review status** ([VIP Workflow](https://awesome.ecosyste.ms/projects/github.com%2Fautomattic%2Fvip-workflow-plugin)). Quintype, the Bengaluru CMS used by Indian publishers, has the most newsroom-shaped vocabulary: `story-submit`, `story-approve`, `story-reject`, `story-publish`, `story-retract`, `breaking-news-save`, `story-schedule` and `story-close` for live blogs. Its roles inherit additively ([Quintype](https://help.quintype.com/users-and-profile/getting-started)). Drupal creates **one permission per workflow transition** and models unpublishing as a permissioned Archive transition ([Drupal.org](https://www.drupal.org/docs/8/core/modules/content-moderation/overview)). Arc XP binds roles to **squads** that limit users to particular sites ([Arc XP](https://docs.arcxp.com/en/products/arc-xp-administration/permissions/managing-roles.html)). Contentstack can require approval before publish *or* unpublish, scoped by language, with a "Prevent self-approval" rule that needs two distinct users ([Contentstack](https://www.contentstack.com/docs/headless-cms/add-a-publish-rule)). These systems share three conclusions: takedown is a separate permission from publish, breaking-news alerts get their own tightly held permission, and language or site is a scope rather than part of a role name.

### Ads: Google Ad Manager's roles-plus-teams is the template

GAM is the documented ad server at The Hindu, NDTV and Times Internet. It is probably also used at the other two, but that is not confirmed. Its access model is the clearest public blueprint for any revenue panel. **"Teams control access to entities... Roles control features and functions"**, and a user needs both a team that contains the object and a role that permits the action ([GAM Help: Teams](https://support.google.com/admanager/answer/2445375?hl=en)). Teams also filter reports, so two users running the same report see different revenue. GAM's role catalogue has **no dedicated "view revenue" permission**: revenue visibility comes from the Reports permission combined with team scope. "Approve" is separate from "Edit unapproved", which gives a native flow where a salesperson drafts and a manager approves ([GAM Help: Roles](https://support.google.com/admanager/answer/9154293?hl=en)). Only Administrators can edit users, roles and teams ([Clickio](https://docs.clickio.com/books/google-ad-manager-guide/page/users-settings-in-google-ad-manager)).

The roles themselves are partly documented. The Hindu's Ad Operations Manager owns setup, trafficking, pacing, creatives and third-party tags against approved insertion orders. The same role handles delivery reporting and monthly billing reconciliation, and enforces brand safety and "editorial standards" ([foundit.in](https://www.foundit.in/job/54106825)). NDTV merged programmatic specialists and direct sellers into one cross-channel sales team ([Google Ad Manager](https://admanager.google.com/home/success-stories/new-delhi-television-increases-revenue-with-programmatic/)). TIL ran a 30-plus-engineer ad-tech team and wired DFP into SAP for discount approval and revenue recognition ([ExchangeWire](https://www.exchangewire.com/blog/2014/12/07/times-of-india-investing-in-ad-tech-stack-to-ensure-continued-growth/)). The usual split, inferred from industry practice, gives traffickers edit rights on orders and creatives without network revenue. Yield managers get pricing rules, deals and full revenue. Salespeople get their own accounts only. Brand-safety reviewers get protections and blocking. Finance gets network revenue with no trafficking. Branded content follows its own rules. ASCI's Clause 1.8 (Aug 2025) requires media companies to put a clear "Sponsored"/"Ad"/"Partnership" label at the very start of paid posts on their own social handles, and the Norms of Journalistic Conduct already require ads to be kept separate from editorial ([ASCI](https://www.ascionline.in/wp-content/uploads/2025/08/ASCI_Code_Update_Media_Paid_Posts_Aug2025_PressRelease.pdf)). Under the CCPA's 2022 guidelines, undisclosed material connections can draw penalties of up to **₹10 lakh, rising to ₹50 lakh for repeat violations** ([AZB & Partners](https://www.azbpartners.com/bank/looks-like-content-acts-like-ads-the-legal-risk-in-e-commerces-influencer-economy/)).

### CRM and reader revenue: two panels, both holding personal data

Where reader revenue is documented, the CRM team works in **two tools: a subscription engine and an engagement platform**. The Hindu calls Piano its "subscription engine". Acquisition data flows into it for a single ROI view, CleverTap runs alongside, and payment is by card, UPI, bank transfer and in-app purchase ([IPP/WAN-IFRA](https://indianprinterpublisher.com/?p=79194)). Indian Express chose Evolok for paywall, segmentation, profiles and single login ([Adgully](https://archive.adgully.com/evolok-partners-with-the-indian-express-107466.html)), and it credits MoEngage churn prediction with a **2x uplift in paid subscribers**. Marketing runs MoEngage with "zero dependency on tech teams" ([MoEngage](https://moengage.com/casestudy/how-the-indian-express-witnessed-a-2x-uplift-in-paid-subscribers/)). TOI's Retention Manager watches CleverTap dashboards against intraday conversion targets and launches a live campaign if conversion is behind by 2–4 pm. Renewal journeys there start 30 days before expiry, and campaigns fire through an API the moment a story goes live ([CleverTap](https://clevertap.com/case-study/how-times-of-india-achieves-a-100-growth-in-subscribers-through-personalization-at-scale/)). Other documented roles are Times of India's Head of SEO, who owns technical audits and Core Web Vitals ([Weekday](https://jobs.weekday.works/times-internet-head-of-seo)), and The Hindu's data analysts running A/B tests ([IPP/WAN-IFRA](https://indianprinterpublisher.com/?p=79194)).

Nothing public describes how any of the five restricts staff access to reader data. The inferred pattern follows from the tools. An engagement platform is effectively a customer data platform, so access to it is access to reader personal data. Support agents need masked subscriber records and transaction IDs, never card numbers, because gateways tokenise cards. Refunds belong to a small finance or CRM lead group. Analysts should work on pseudonymised data. Support, newsletter-editor and comment-moderator roles appeared in no job posting found.

### Compliance: grievance is a legal function, not a support queue

The one compliance role documented by name is at India Today Group. Its **Grievance Officer is the Group General Counsel**, and digital complaints are handled under Rule 11(2)(a) with escalation to NBDSA ([aajtak.in](https://aajtak.in/complain-redressal)). This suggests content grievances and subscription complaints run through separate queues with separate owners, which is the right shape for TimesPrime too.

## Indian law turns four back-office roles into obligations

Part III of the IT Rules 2021 explicitly lists **"news aggregator"** among publishers of news and current affairs content ([LiveLaw](https://www.livelaw.in/amp/news-updates/how-centres-new-it-rules-apply-to-online-news-portals-170411)). It defines an aggregator as an entity "performing a significant role in determining" the news it makes available ([Cyril Amarchand Mangaldas](https://www.cyrilshroff.com/wp-content/uploads/2021/02/Client-Alert-Information-Technology.pdf)). TimesPrime curates categories and a breaking banner and runs an editorial publish endpoint, so it should assume it is in scope. Level I requires an India-based grievance officer who **acknowledges complaints within 24 hours and decides them within 15 days**. Rule 18 requires a monthly compliance report, and **Rule 19 requires monthly public disclosure and content records kept for at least 60 days** ([Cyril Amarchand Mangaldas](https://corporate.cyrilamarchandblogs.com/2021/09/from-harbour-to-hardships-understanding-the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021-part-iii/)). Rules 9(1) and 9(3) have been stayed since the Bombay HC order of August 2021. The challenges moved to the Delhi HC in March 2024, and no final ruling was found ([MediaNama](https://www.medianama.com/2024/03/223-supreme-court-transfers-petitions-against-it-rules-to-delhi-hc/)). Rule 16 emergency blocking was not stayed, and MIB has sent notices despite the stay ([exchange4media](https://www.exchange4media.com/media-others-news/mib-issued-notice-to-digital-news-publishers-despite-stay-from-bombay-madras-hcs-118105.html)). The stay lowers enforcement risk. It does not remove the case for running Level I. If TimesPrime ever hosts user comments or uploads, it may also count as an intermediary. The February 2026 amendment cut intermediary takedown on actual knowledge to **3 hours** and grievance resolution to 7 days, and added labelling of synthetically generated information ([Argus Partners](https://www.argus-p.com/updates/updates/update-overview-of-the-it-intermediary-amendment-rules-2026/)). That labelling duty is worth watching given the AI assistant. Whether it applies to a publisher's own AI chat is not established.

**DPDP Rules were notified on 13 Nov 2025 with phased dates.** Board provisions took effect immediately, consent managers start on **13 Nov 2026**, and the core fiduciary duties start on **13 May 2027** ([Khaitan & Co](https://www.khaitanco.com/sites/default/files/2025-11/ERGO%20-%20Digital%20Personal%20%20Data%20Protection%20Rules%20-%2015%20November%202025.pdf)). The dates are not settled. MeitY floated a shorter 12-month timeline in early 2026 ([Storyboard18](https://www.storyboard18.com/digital/meity-seeks-industry-views-on-fast-tracking-dpdp-act-rollout-proposes-12-month-compliance-timeline-88332.htm)), and an October 2026 analysis says Sections 9–10 start on **13 Mar 2027** ([India Briefing](https://www.india-briefing.com/news/dpdp-removal-of-difficulties-order-2026-consent-data-audit-47274.html/)). Plan for March 2027 and verify against the gazette. The duties that matter for panels are access controls, monitoring and logging, with **logs kept for at least one year**. Breaches must be reported to the Board with a detailed report within 72 hours and notified to affected users. Rights requests must be resolved within 90 days, and users must get 48 hours' notice before their data is erased. Verifiable parental consent is required for anyone under 18 ([Khaitan & Co](https://www.khaitanco.com/sites/default/files/2025-11/ERGO%20-%20Digital%20Personal%20%20Data%20Protection%20Rules%20-%2015%20November%202025.pdf)). **CERT-In's 2022 Directions** apply to any body corporate. They require listed incidents, including unauthorised access and website defacement, to be reported within **6 hours**, logs to be kept for a rolling **180 days within India**, clocks to be synced to NIC/NPL time, and a named point of contact ([TCSA](https://www.tcsa.in/learn/cert-in-directions-2022-explained)). An unauthorised publish on a news site is itself a reportable defacement. That makes the publish permission a security control as well as an editorial one.

Two more regimes shape TimesPrime's specific operations. Section 69A blocking requests are confidential under the 2009 Blocking Rules ([Verfassungsblog](https://verfassungsblog.de/blocked-without-explanation/)), so a legal-orders register should be hidden from general editorial staff, who see only a "withheld – legal" state on the item. On copyright, India has no snippet or neighbouring-right regime, and aggregators rely on Section 52 fair dealing. The Delhi HC declined interim relief to ANI against OpenAI in July 2026 ([Bar & Bench](https://www.barandbench.com/news/litigation/openai-did-not-violate-copyright-laws-by-using-ani-news-to-train-chatgpt-delhi-high-court-declines-interim-relief)), and an appeal is pending. TimesPrime scrapes full article text, so whoever controls source configuration and full-text display controls its main legal exposure. That needs its own permission and a per-source kill switch.

## TimesPrime's recommended panels, roles and matrix

### Eight panels mapped to today's /admin features

The panel structure below reorganises the existing single /admin into functional areas. Each is gated by permission rather than by a shared password. "Exists" marks features already built.

| Panel | Purpose | Features (exists / new) | Primary roles | Phase |
|---|---|---|---|---|
| Desk (Articles) | Review, edit, publish, unpublish aggregated and editorial items | Articles table, search, bulk actions, publish endpoint (exists); workflow states, revision history, approve queue, desk filter en/hi + section (new) | Writer, Sub-editor, Desk Editor, Managing Editor | 1–2 |
| Front page | Curate what readers see first | Breaking-news banner (exists); pinned slots above algorithmic order, scheduled expiry (new) | Desk Editor, Managing Editor | 1–2 |
| Ingestion | Control sources and sync | NewsData sync dashboard, purge (exists); source registry with licence status, snippet/full-text flag, kill switch, 60-day purge floor (new) | Ingestion Ops, Rights/Legal | 1–2 |
| AI assistant | Configure and monitor the chat assistant | Prompt/config versions, disabled topics, usage metrics; transcript access only if stored and gated as reader data (new) | Super Admin, Managing Editor (read) | 2 |
| Insights | Read-only numbers | Category stats, DB stats (exists); traffic and sync KPIs (new) | Analyst, all editors | 1 |
| Compliance | Statutory queues | Grievances with 24h/15-day SLA clocks and monthly Rule 18/19 export; corrections log; legal-orders register (restricted); content snapshot export (new) | Grievance Officer, Legal/Compliance, Standards Editor | 3 |
| Privacy & security | Reader data and incidents | Rights-request queue (90-day ceiling), consent ledger, incident clock (6h CERT-In / 72h DPDP), audit log viewer (new) | Privacy Officer, Security Lead | 1 (audit), 3 (rest) |
| Administration | People and access | Health page (exists); staff accounts, role assignments with scope and expiry, MFA status, break-glass grants, access review (new) | Super Admin | 1 |
| Commercial (later) | Reader revenue and ads | Subscriber lookup (masked), offers, refunds; sponsored-content queue with label lock; ad ops (GAM itself, not rebuilt) | CRM Manager, Support Agent, Brand Studio, Ad Ops, Finance | 4 |

The commercial panel should be thin. The publishers studied run GAM, Piano or Evolok, and CleverTap or MoEngage as separate SaaS consoles with their own role systems. TimesPrime should do the same and not rebuild ad trafficking or a CDP. Its own panel then only needs a sponsored-content workflow, a masked subscriber view for support, and links out to vendor consoles whose user lists are reviewed alongside internal roles.

### Generic roles, scoped by language desk and section

Following the Arc, Quintype and OWASP guidance, role names stay generic and scope lives in attributes. There is one "Desk Editor" role assigned with scope `language = hi, section = sports`, not a "hindi_sports_editor" role. OWASP explicitly warns that pure RBAC leads to "role explosion" and recommends attribute- or relationship-based checks at object level ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)). A null scope means all languages or all sections, and only Managing Editor and above should hold null-scope editorial grants. Every assignment carries `expires_at`, so a stringer covering elections or a contractor gets time-boxed access by default.

The matrix uses these codes: **F** = full, **S** = within assigned language/section scope, **Own** = own items only, **A** = can act but a second person must approve, **R** = read-only, **M** = masked view, **—** = none. Phase 1–3 roles come first and commercial roles last.

| Permission (verb) | Super Admin | Managing Editor | Desk Editor | Sub-editor | Writer | Ingestion Ops | Analyst | Grievance Officer | Legal/Compliance | Privacy Officer | Security Lead | CRM Mgr (P4) | Support (P4) | Brand Studio (P4) | Ad Ops (P4) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| article.view_admin | F | F | S | S | S | R | R | R | R | — | — | — | — | Own | — |
| article.create / edit | — | F | S | S | Own | — | — | — | — | — | — | — | — | Own (sponsored) | — |
| article.submit | — | F | S | S | Own | — | — | — | — | — | — | — | — | Own | — |
| article.approve (≠ author/last editor) | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| article.publish (after approval) | — | F | S | S | — | — | — | — | — | — | — | — | — | — | — |
| article.publish_direct (breaking, flagged) | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| article.unpublish / takedown | F (break-glass) | F | S | — | — | — | — | — | F | — | — | — | — | — | — |
| article.restore | — | A | A | — | — | — | — | — | A | — | — | — | — | — | — |
| article.bulk_action | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| breaking_banner.manage / push.send | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| homepage.curate | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| correction.publish | — | F | S | A | — | — | — | R | R | — | — | — | — | — | — |
| sponsored.label_remove | — | — | — | — | — | — | — | — | F | — | — | — | — | — | — |
| sponsored.approve | — | R | — | — | — | — | — | — | F | — | — | — | — | — | F |
| source.manage (add, licence flags, full-text) | F | A | — | — | — | A | — | — | F | — | — | — | — | — | — |
| source.kill_switch | F | F | — | — | — | F | — | — | F | — | — | — | — | — | — |
| sync.run / sync.view | F | R | R | — | — | F | R | — | — | — | R | — | — | — | — |
| content.purge (respects 60-day floor) | A | — | — | — | — | A | — | — | — | — | — | — | — | — | — |
| ai.configure | F | R | — | — | — | — | — | — | R | — | — | — | — | — | — |
| stats.view | F | F | S | S | S | R | F | — | — | — | — | R | — | — | R |
| grievance.handle / report | — | R | — | — | — | — | — | F | F | — | — | — | — | — | — |
| legal_order.manage (confidential) | — | R | — | — | — | — | — | — | F | — | — | — | — | — | — |
| content_records.export | — | — | — | — | — | — | — | A | F | — | — | — | — | — | — |
| reader_pii.view | — | — | — | — | — | — | — | M | M | F | — | M | M | — | — |
| reader_pii.reveal (reason logged) | — | — | — | — | — | — | — | — | — | F | — | A | — | — | — |
| reader_data.export / dsr.handle | — | — | — | — | — | — | — | — | — | F | — | — | — | — | — |
| subscription.refund (P4) | — | — | — | — | — | — | — | — | — | — | — | F | A | — | — |
| incident.manage | F | — | — | — | — | — | — | — | R | F | F | — | — | — | — |
| audit.read | F | S (own desk) | — | — | — | — | — | — | F | F | F | — | — | — | — |
| user.manage / role.assign | A | S (assign ≤ Desk Editor in own scope) | — | — | — | — | — | — | — | — | — | — | — | — | — |
| settings.manage / health.view | F | R | — | — | — | R | — | — | — | — | F | — | — | — | — |

Two design choices in the matrix need explaining. Super Admin holds no editorial verbs by default. The technical owner who can grant roles should not also be the person who publishes, and on a small team that person gets a separately assigned, audited Managing Editor role if they also edit. This is NIST's separation of duty in its lightest form ([NIST RBAC FAQ](https://webarchive.library.unt.edu/eot2008/20080916003800/http:/csrc.nist.gov/groups/SNS/rbac/faq.html)). Network-wide revenue, when ads and subscriptions arrive, should be its own explicit permission (`revenue.view_all`) and not ride on report access. GAM's lack of such a permission is a gap to avoid copying.

### Four-eyes, takedown and MFA rules

The approval rules borrow directly from documented products. Publishing requires an approval by someone other than the author and the last editor, enforced per object (Contentstack's self-approval block). The Publish action stays hidden until the item is in the Approved state (VIP's Publish Guard). Breaking news gets a narrow escape hatch: `article.publish_direct` held by Desk Editors in scope, which publishes immediately and automatically opens a post-hoc review item. Unpublish and takedown should be **single-actor for speed**, because legal and defamation exposure grows by the hour and intermediary timelines are now measured in hours. They still require a reason code, MFA and an immediate notification to the Managing Editor and Legal. **Restore needs a second approver**, because a wrongful restore is the riskier error. Granting any privileged role (Super Admin, Managing Editor, Legal, Privacy Officer) needs two admins. Bulk purge needs two people and must refuse to delete anything published or aggregated within 60 days, to protect Rule 19(3) records. Every privileged role (Super Admin, Managing Editor, Desk Editor, Legal, Privacy Officer, Security Lead, Ingestion Ops) must sign in at Supabase's **`aal2` assurance level, which is issued only after a verified second factor**. The permission check refuses privileged verbs at `aal1` ([Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa.md)). Break-glass access is a time-boxed (for example 2-hour) grant with a mandatory reason and an alert. It replaces the habit of sharing the old password. Break-glass is standard practice, but no source here prescribes a specific procedure.

## The proxy guesses and the backend decides

### Data model sketch

The tables below extend Supabase's documented RBAC pattern, which uses `user_roles`, `role_permissions` and a `security definer authorize()` function called from RLS ([Supabase RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)). They add scope, expiry and live lookups. The official example puts a single role into the JWT, which cannot express "Desk Editor for hi/politics plus Writer for en/sports". Scope must therefore come from the table, not the token.

| Table | Key columns | Notes |
|---|---|---|
| staff_profiles | user_id (→ auth.users), display_name, status (active/suspended), mfa_required, last_seen_at | A row here is what makes an auth user staff. Never derive staff status from user_metadata, which users can edit themselves. |
| roles | key, label, is_privileged, requires_aal2 | About 11 rows in Phase 1–3 |
| permissions | key (e.g. `article.approve`), risk (low/high/critical), description | Verbs as data, so adding one is a migration, not a code rewrite |
| role_permissions | role_key, permission_key | The matrix above, as rows |
| role_assignments | id, user_id, role_key, language (en/hi/null), section_id (nullable), granted_by, approved_by, reason, granted_at, expires_at, revoked_at | Scope and time-boxing live here; supports break-glass rows |
| articles (extend) | language, section_id, workflow_state, created_by, last_edited_by, approved_by, published_by, published_revision_id, legal_hold, sponsored_flag, advertiser_ref | Live revision pointer allows editing a draft without changing the live copy |
| article_revisions | id, article_id, body/snapshot, editor_id, created_at | Also serves the 60-day content-record duty |
| workflow_transitions | article_id, from_state, to_state, actor_id, reason, at | Approve/publish history; feeds the self-approval check |
| sources | id, name, licence_status (licensed/RSS/scraped), full_text_allowed, snippet_cap, enabled, reviewed_by | Ingestion and the copyright kill switch |
| audit_log | id, at, actor_id, actor_roles (snapshot), aal, action, entity_type, entity_id, language, section_id, before/after (jsonb), reason, ip, user_agent, request_id, prev_hash | Supersedes admin_logs; append-only |
| grievances, corrections, legal_orders, dsr_requests, incidents | standard ticket fields + SLA deadlines + assignee | legal_orders readable only with `legal_order.manage` |

The core check is one `security definer` function, conceptually `has_permission(user, permission, language, section)`. It returns true when an unexpired, unrevoked assignment exists for an active staff profile whose role carries that permission and whose scope is null or matches. Object-level checks (four-eyes, own-items-only) are separate helpers that read `workflow_transitions` and `created_by`. `audit_log` is append-only: revoke UPDATE and DELETE from every application role, and chain each row to the previous one with `prev_hash` so tampering is evident. Supabase's supa_audit trigger is useful for row diffs, but it does **not** record the acting user ([Supabase blog](https://supabase.com/blog/2022/03/08/audit)). The backend must therefore write the actor-aware `audit_log` row in the same transaction as the change.

### How the check flows through proxy.ts and backend/

Next.js's guidance is explicit. Middleware (now `proxy.ts`) runs on every request including prefetches, so it should do only **optimistic, cookie-based checks** and "should not be your only line of defense". Secure checks belong in a `server-only` Data Access Layer, and Server Actions and Route Handlers should be treated like public API endpoints ([Next.js](https://nextjs.org/docs/15/app/guides/authentication)). The fetched guide is the v15 version, and the guidance carries over to the Next 16 rename. Today TimesPrime checks only in `proxy.ts`, which is exactly the single line of defence the docs warn against.

| Layer | Responsibility after the change |
|---|---|
| app/ (routing shell) | Renders panels; nav items are hidden using a permission list fetched server-side (UX only, never a security boundary) |
| proxy.ts | Verifies a Supabase session cookie exists and is unexpired on /admin/ *and* /api/admin/, otherwise redirects to login; no database calls; replaces the HMAC shared-password cookie |
| backend/auth (server-only) | `getStaffSession()` (memoised per request) returns user, aal and active assignments; `requirePermission(verb, {language, section, articleId})` calls `has_permission` live and applies object rules; throws 401/403 |
| backend/* modules | Every Server Action and /api/admin handler calls `requirePermission` first, then performs the change and writes `audit_log` in one transaction |
| database/ | Tables, `has_permission`, RLS policies that call the same function (defence in depth), restrictive `aal2` policies on privileged tables |
| Upstash Redis | Short-TTL (about 60 s) cache of a user's resolved permissions, cleared on any role_assignments change; rate limits on login and on high-risk verbs; revocation list for forced sign-out |
| shared/ | The permission-key catalogue as typed constants, so frontend and backend cannot drift |

Live table lookups matter because JWT claims refresh only when the token refreshes. Supabase notes that even an MFA downgrade takes effect only at the next refresh ([Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa.md)). A revoked editor must lose publish rights immediately, not when their token rolls over. The ingestion cron should keep using the service-role key inside `backend/` only. Staff actions should migrate to a user-context Supabase client so RLS applies as a second check. Phase 1 can ship with DAL enforcement alone and add RLS in Phase 2.

### Four phases sized for a small team

| Phase | Build | Why first |
|---|---|---|
| 1 – Identity and audit (weeks) | Invite-only staff accounts in Supabase Auth (public signup off), MFA enrolment, roles/permissions/assignments tables, `requirePermission` on every existing admin route, `audit_log` replacing admin_logs, retire the shared password (keep one sealed break-glass admin) | Removes the shared-secret risk; every later feature depends on knowing *who* acted |
| 2 – Editorial workflow | Workflow states and revisions, approve queue with self-approval block, publish_direct with post-hoc review, scoped en/hi desks, source registry with licence flags and kill switch, purge floor, AI config versioning, RLS policies | Turns the publish endpoint into a four-eyes process and addresses scraping exposure |
| 3 – Compliance | Grievance queue (24h/15-day clocks, monthly export), corrections log, restricted legal-orders register, content-record export, incident clock (6h/72h), rights-request queue and consent ledger ready before the DPDP core date | Publish the grievance officer before traffic grows; DPDP duties land March–May 2027 |
| 4 – Commercial | Sponsored-content workflow with locked labels, masked subscriber view, refund approvals, vendor-console access reviews, `revenue.view_all` | Only when ads or subscriptions exist; reuse vendor consoles |

Retention settings follow from the statutes. Audit and access logs should be kept for **at least one year**, which covers both DPDP's one-year floor and CERT-In's 180 days. Content snapshots are kept for at least 60 days, and orders, takedowns and corrections much longer for litigation holds. Run the Supabase project in an Indian region, or export logs to Indian storage. Whether a cloud region in India satisfies "Indian jurisdiction" was not confirmed. A quarterly access review (who holds what, which assignments are expired, which vendor seats are unused) is the cheapest control against the privilege creep OWASP warns about ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)).

## Conclusion

Studying these five publishers mainly shows that their real authorization model sits in their vendors' documentation, not in anything they publish. GAM's roles plus teams, Quintype's verb list, Arc's squads and Contentstack's self-approval rule are, in practice, the industry standard. A small team can adopt that model without adopting the vendors: a verb catalogue, generic roles, language/section scope, expiry on every grant, and a live server-side check. The less obvious finding is that TimesPrime's biggest authorization risks are not editorial. They are the ingestion permissions that decide which scraped full text goes live, the purge job that could destroy statutorily required records, and the unpublish button that is both a legal-response tool and, if misused, a CERT-In incident. Those three verbs deserve the strictest controls in Phase 1 and 2, ahead of any CRM or ads panel.

The regulatory calendar sets the order of work more than feature demand does. The IT Rules Level I grievance mechanism and CERT-In logging apply now. DPDP's core duties arrive in March or May 2027 depending on which reading holds, and the rights-request and consent panels must exist before then, even though TimesPrime holds little reader data today. Any future reader accounts, newsletter or AI-chat transcript storage will immediately turn masked-view and reveal-with-reason permissions from hypothetical into required. Designing `reader_pii.*` verbs now, while they are unused, is far cheaper than adding them later.
<!-- END:panel-plan -->

## Index

| # | Panel | Status | Date completed | Commits |
|--:|---|---|---|---|
| 0 | Access foundation: staff accounts, roles, permissions, MFA, audit log, the permission check | Planned | — | — |
| 1 | Administration: users, role assignments with scope and expiry, access review | Planned | — | — |
| 2 | Desk: articles (write, review, approve, publish, unpublish) | Planned | — | — |
| 3 | Front page: breaking banner, pinned slots, curation | Planned | — | — |
| 4 | Ingestion: sync, source registry, licence controls, kill switch, purge | Planned | — | — |
| 5 | AI assistant | Planned | — | — |
| 6 | Insights: read-only stats | Planned | — | — |
| 7 | Compliance: grievances, corrections, legal orders, content records | Planned | — | — |
| 8 | Privacy & security: data-rights requests, incidents, audit viewer | Planned | — | — |
| 9 | Commercial: only once ads or subscriptions exist | Planned | — | — |

**Status:** *Planned* means not started. *In progress* means design or code has started. *Done*
means every item in the [definition of done](#definition-of-done) holds. A panel is
never marked Done while an owner action it depends on is unrecorded.

## Words used in this file

| Word | Meaning |
|---|---|
| Permission | One action on one kind of thing, written as `object.verb`, for example `article.publish`. The full list is the matrix in the [panel plan](#panel-plan) |
| Role | A named bundle of permissions, for example Desk Editor. Roles are generic: there is no "Hindi sports editor" role |
| Scope | Where a role applies: a language desk (`en`, `hi`, or all) and a section (one, or all) |
| Assignment | One person holding one role in one scope, with an expiry date and the name of whoever granted it |
| Four-eyes | An action that needs a second, different person to approve it |
| MFA / `aal2` | The person signed in with a second factor. Supabase calls this assurance level `aal2`; a password alone is `aal1` |
| Audit log | The append-only record of who did what, when, and why |
| Owner action | A step only the owner can take, such as applying SQL to the database or setting a production variable |

## Template

Copy this section for each panel, replace the guidance in italics, and keep the headings in this
order. Write for someone who has not seen the code: a new developer, or the senior reviewer.

### Panel N: Name

#### Panel

- **Name:** *the panel's name, as in the index*
- **URLs:** *every page and API route it adds or uses, for example `/admin/desk` and
  `/api/admin/articles`*
- **Code:** *where its code lives: the view in `frontend/views/`, the route bodies in `backend/api/`,
  services, repositories, and the SQL in `database/migrations/`*

#### Purpose

*What the panel is for, in two or three sentences. Say which problem it solves for the newsroom.*

#### Roles and responsibilities

*Which roles use it and what each one does there.*

| Role | What they do in this panel |
|---|---|
| *Desk Editor* | *Approves and publishes articles in their language and section* |

#### Features and functionality

*What a user can see and do, one line each. Mark anything partly built as partial and say what is
missing.*

#### Access permissions and authorization rules

*Every permission the panel checks, who holds it, and the extra rules around it. The server checks
each one; hiding a button in the UI is never the check.*

| Permission | Roles that hold it, and their scope | Four-eyes | MFA (`aal2`) | Audited |
|---|---|---|---|---|
| *`article.publish`* | *Managing Editor (all); Desk Editor and Sub-editor (own language and section)* | *Yes: approved by someone other than the author and last editor* | *Yes* | *Yes* |

*Also state: what a person without the permission sees (status code and message), what is written
to the audit log for each action (action name, target, before and after, reason), and any action
that needs a reason code.*

#### Database changes

| Migration file | What it does | Rollback | Applied by the owner |
|---|---|---|---|
| *`database/migrations/YYYY-MM-DD-name.sql`* | *Tables, columns, indexes, policies it adds* | *Where its rollback section is* | *No / Yes, on date* |

*Say if a table or column existing before this panel changed meaning.*

#### Tests and verification

| Test file | What it proves | Denied case covered |
|---|---|---|
| *`backend/api/admin/…test.ts`* | *A Desk Editor in `hi` can publish a `hi` article* | *A Desk Editor in `en` gets 403 for the same article; an expired assignment gets 403* |

*Every permission check needs an allowed test and a denied test. Add what was checked by hand, and
the `npm run verify` and CI result at the time the panel was marked Done.*

#### Known limits and not yet built

*What the plan asks for that this panel does not do yet, and why. Link each item to its
backlog entry (`docs/OPERATIONS.md`) or to the later panel that will do it.*

## Panels

No panel is done yet. Each panel's section goes here, copied from the template, when its work
starts.

### Panel 0 design: the access foundation (approved 2026-11-02)

> Carried from `docs/design/panel-0-access-foundation.md` in restructure 3 (2026-11-03), unchanged
> but for heading levels and links. Its paths are those of 2026-11-02: `shared/` is now
> `backend/shared/`, `scripts/` is `backend/scripts/`, `.env.local` is `frontend/.env`, and the plan
> it cites is the [panel plan](#panel-plan) in this file.

**Status:** **Approved with conditions** by the owner on 2026-11-02 (STEP 2). Being built (STEP 3).
The section "Approval: decisions and amendments" below overrides anything later in this file that
disagrees with it.
**Plan:** [`PANEL_PLAN.md`](PANEL_DOCS.md#panel-plan), "The proxy guesses and the backend decides", the
matrix, and "Four-eyes, takedown and MFA rules". **Owner decisions folded in:** the twelve answers to
the Step 1 report (2026-11-02), cited below as D1 to D12.
**Related:** [ADR 0003](ARCHITECTURE.md#adr-0003--an-articles-section-for-permission-scope-is-its-first-category-2026-11-02) (the primary-section rule),
[BL-033](OPERATIONS.md#backlog) (retention), [BL-034](OPERATIONS.md#backlog) (the chain's head hash).

Panel 0 replaces the shared admin password with named staff accounts. Every admin route checks a
permission on the server, privileged staff sign in with a second factor, and every privileged action
lands in an append-only audit log. It adds no new admin screens beyond sign-in and MFA. Managing
people and roles in the app is Panel 1.

#### Approval: decisions and amendments (2026-11-02)

**Answers to §10.**
- **Q1:** MFA is required for all staff (`mfa_required` defaults to true).
- **Q2:** "attempted, then outcome", fail closed. An attempt with no outcome row is a state of its
  own. The audit viewer (Panel 8) must show it distinctly, not as a success and not as a failure.
- **Q3:** the shared password runs until Panel 1. The end date is 2026-12-31, and
  `ADMIN_LEGACY_LOGIN=off` is the kill switch. Two conditions:
  - The date is enforced in code. After it, legacy login is refused even with the switch on, and a
    test proves it.
  - A legacy session holds a **fixed list** of today's admin capabilities and nothing else: never
    `user.manage`, `role.assign`, `audit.read`, `settings.manage` or `health.view`. Otherwise the old
    password could mint admins in the new system. Tests prove each refusal. The list is in §7.
- **Q4:** option A. `@supabase/supabase-js` 2.109.0 → 2.116.0 in its own commit, with the full verify
  and a smoke test, then `@supabase/ssr` 0.12.7.
- **Q5:** the admin purge is refused for everyone, including a legacy session, until Panel 4. The
  cron purge continues.
- **Q6:** `DELETE /api/admin/logs` is removed.
- **Q7:** `admin_logs` is frozen and not copied, and stays **readable** as history. The freeze SQL
  revokes writes only. `GET /api/admin/logs?source=legacy` returns its rows, under `audit.read`.
- **Q8:** `database/bootstrap/` is approved. D1 (nothing imports `database/`) and Tailwind's
  `@source not` both cover it: they match the folder `database/` and everything below it.

**The backend check is the only gate.** The app talks to Supabase as `service_role`, which bypasses
RLS. On the app's request path, RLS protects nothing. `requirePermission` is therefore the only
thing between a request and the data. Every admin route and method is tested for these cases:
- allowed;
- denied (no assignment);
- expired assignment;
- wrong scope;
- missing MFA;
- legacy session.

RLS (Phase 2) protects only direct access with a user's own token.

**Revocation is immediate.** Changing an assignment, a role or a staff member's status takes effect
on the next request. `expires_at` is checked on every decision.
- **Amendment: no staff-record cache in Panel 0.** §3 proposed a 60-second Redis cache, cleared on
  every change the app makes. A change the owner makes in the SQL editor cannot clear Redis, so a
  revoked user would keep access for up to 60 seconds. Instead, `requirePermission` reads the staff
  record from the database on every request, one query, and keeps it only for that request. Nothing
  is cached, so nothing can be stale.
- The cost is one indexed query per admin request, which is small at admin traffic. If it ever
  matters, a cache keyed by a database-maintained version number can come back. A test proves that
  an assignment revoked between two requests is refused on the second.

#### 0. What the docs say, and what it changes

Read before designing (D9):

- **Next 16, `authentication.md`.** Proxy should do "only optimistic checks", reading the session
  from the cookie with no database call, because it runs on every route including prefetches. It
  "should not be your only line of defense"; secure checks belong in a `server-only` Data Access
  Layer. Route Handlers must be treated "with the same security considerations as public-facing API
  endpoints". Two details matter here:
  - React's `cache` "deduplicates within a React render pass. Server Actions and Route Handlers are
    not part of a render pass, so the wrapper does nothing." The plan's "memoised per request" does
    not apply to our API routes. Each route body calls the staff check once and passes the result
    down.
  - "Use Proxy to protect static routes." `/admin` and `/admin/login` are prerendered (`o` in the
    route table). They stay static: making them dynamic would change the route table. The static
    shell holds no data; every byte of admin data comes from an API route that checks a permission.
- **Next 16, `data-security.md`.** A page-level check does not extend to the actions it renders. Every
  action re-checks. Return only what the UI needs.
- **Next 16, `proxy.md`.** Proxy runs on the Node.js runtime by default. It can read request cookies
  and set response cookies.
- **Supabase, server-side auth for Next.js.** "Server-Side Rendering (SSR) with Supabase requires
  cookie-based session storage. The `@supabase/ssr` package handles this." Plain `supabase-js` keeps
  the session in local storage, which the server cannot read. **So `@supabase/ssr` is needed** (D8).
  The proxy refreshes the token with `supabase.auth.getClaims()` and passes refreshed cookies on.
  "*Never* trust `supabase.auth.getSession()` inside server code." `getClaims()` verifies the JWT's
  signature and expiry but "an unexpired token stays valid even when the session behind it was
  revoked. Call `getUser()` where that gap matters." Cookies are not `HttpOnly` by default.
- **Supabase MFA.** TOTP "is free to use and is enabled on all Supabase projects by default". The
  `aal` claim carries the assurance level; a JWT without one is `aal1`. Unenrolling a factor
  downgrades `aal2` to `aal1` "only after the refresh interval has lapsed".
- **Supabase RBAC guide.** It puts one role into the JWT through an access-token hook. That cannot
  express "Desk Editor for hi plus Writer for en", and a JWT claim lives until the token expires.
  As the plan says, scope comes from the tables, read live.

#### 1. Data model

Everything below is SQL in files that the owner applies. The app never runs DDL.

##### Files

| File | What it does | When the owner applies it |
|---|---|---|
| `database/migrations/<date>-access-foundation.sql` | The six new tables, their triggers, RLS, grants | Step A, before the code deploy |
| `database/migrations/<date>-access-catalog.sql` | Seeds `roles`, `permissions`, `role_permissions` from the matrix | Step A, right after |
| `database/bootstrap/super-admin.sql` | Makes one invited user a Super Admin (§7). Run once per account | Step B, after the deploy |
| `database/migrations/<date>-freeze-admin-logs.sql` | Revokes writes on `admin_logs` | Step C, after the deploy is verified |

All are idempotent (`IF NOT EXISTS`, `ON CONFLICT`, `DROP POLICY IF EXISTS`). Each ends with a
rollback section and verification queries, in the style of
[`runbooks/apply-database.md`](OPERATIONS.md#runbook-apply-the-database-files). That runbook gains the new steps.
**Deviation, stated:** the bootstrap script goes in `database/bootstrap/`, not `migrations/`. It is
not a schema change: it takes an email as input and is run by hand once per account.

##### Tables

**`staff_profiles`**: a row here is what makes an auth user staff (never `user_metadata`, which
users can edit).

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK, FK `auth.users(id)` `ON DELETE RESTRICT` | Deleting a staff member's auth user fails until they are removed properly (Panel 1), so the audit trail never points at nothing |
| `display_name` | `text NOT NULL` | |
| `status` | `text NOT NULL DEFAULT 'active'`, check `active` / `suspended` | Suspended means every check says no |
| `mfa_required` | `boolean NOT NULL DEFAULT true` | §5 |
| `created_at`, `created_by` | `timestamptz`, `uuid NULL` | `created_by` is NULL only for bootstrap rows |
| `last_sign_in_at` | `timestamptz NULL` | Written at sign-in only, not per request |

**`roles`**: 15 rows, the matrix's columns (D2). Finance is added with Panel 9.

| Column | Notes |
|---|---|
| `key` `text` PK | `super_admin`, `managing_editor`, `desk_editor`, `sub_editor`, `writer`, `ingestion_ops`, `analyst`, `grievance_officer`, `legal_compliance`, `privacy_officer`, `security_lead`, `crm_mgr`, `support`, `brand_studio`, `ad_ops` |
| `label` | The matrix heading, e.g. "CRM Mgr (P4)" |
| `is_privileged` | Granting it needs two admins. True for Super Admin, Managing Editor, Legal/Compliance, Privacy Officer (D3) |
| `requires_aal2` | Those four plus Desk Editor, Security Lead, Ingestion Ops (D3) |
| `scope_required` | True for Desk Editor, Sub-editor, Writer: an assignment must name a language. Only Managing Editor and above hold null-scope editorial grants (plan) |
| `phase` | 1–4, from the plan |

**`permissions`**: 39 keys. Each matrix row becomes one key per verb it names, so
"sync.run / sync.view" is two keys with the same cells. This is mechanical, so the catalogue can be
checked against the matrix by a test (§9).

| Column | Notes |
|---|---|
| `key` `text` PK | Check `^[a-z_]+\.[a-z_]+$` |
| `matrix_row` | The row as printed, e.g. `sync.run / sync.view`, so every key traces to the plan |
| `risk` | `low` / `high` / `critical`. Informational in Panel 0 (§5 has one proposal that uses it) |
| `description` | The row's qualifier, e.g. "after approval", "respects 60-day floor" |

The 39 keys: `article.view_admin`, `article.create`, `article.edit`, `article.submit`,
`article.approve`, `article.publish`, `article.publish_direct`, `article.unpublish`,
`article.takedown`, `article.restore`, `article.bulk_action`, `breaking_banner.manage`, `push.send`,
`homepage.curate`, `correction.publish`, `sponsored.label_remove`, `sponsored.approve`,
`source.manage`, `source.kill_switch`, `sync.run`, `sync.view`, `content.purge`, `ai.configure`,
`stats.view`, `grievance.handle`, `grievance.report`, `legal_order.manage`,
`content_records.export`, `reader_pii.view`, `reader_pii.reveal`, `reader_data.export`,
`dsr.handle`, `subscription.refund`, `incident.manage`, `audit.read`, `user.manage`, `role.assign`,
`settings.manage`, `health.view`.

**`role_permissions`**: the matrix, as rows: one per non-empty cell and key.

| Column | Notes |
|---|---|
| `role_key`, `permission_key` | PK, both FKs |
| `access` | The cell's code: `F`, `S`, `Own`, `A`, `R`, `M` (no row for `—`) |
| `break_glass_only` | True for Super Admin's "F (break-glass)" on unpublish/takedown |
| `note` | The cell's qualifier: "own desk", "assign ≤ Desk Editor in own scope", "sponsored" |

**`role_assignments`**: one person, one role, one scope, with an expiry.

| Column | Notes |
|---|---|
| `id` `uuid` PK | |
| `user_id` | FK `staff_profiles` |
| `role_key` | FK `roles` |
| `language` | `NULL` (all), `en` or `hi`. Scope uses `en`/`hi`; articles keep `english`/`hindi` (D5, §3) |
| `section` | `NULL` (all) or a category key, check `^[a-z_]+$`. Matched against the article's primary section, `category[0]` (D6, ADR 0003) |
| `is_break_glass` | Check: if true, `expires_at <= granted_at + interval '2 hours'` and a reason is given |
| `granted_by`, `approved_by` | `uuid NULL` |
| `reason` | `text NOT NULL` |
| `granted_at` | `timestamptz NOT NULL DEFAULT now()` |
| `expires_at` | `timestamptz NOT NULL`: every assignment expires (plan) |
| `revoked_at`, `revoked_by`, `revoke_reason` | Revoking sets these. Rows are never deleted |

Index: one active row per (user, role, language, section): a partial unique index
`WHERE revoked_at IS NULL`, with `COALESCE` for the nullable scope columns. Plus `(user_id)`.

A `BEFORE INSERT OR UPDATE` trigger, `SECURITY INVOKER` so `current_user` is the caller, enforces
in the database what no app code can bypass:
1. **Two admins for a privileged role** (D3, D4). For a role with `is_privileged`, `granted_by` and
   `approved_by` must both be set, must differ, and must both hold an active, unexpired
   `super_admin` assignment.
2. **Bootstrap only by the owner** (D4). The single exception to rule 1 is a row with `granted_by`
   and `approved_by` NULL, `role_key = 'super_admin'`, `reason LIKE 'bootstrap:%'`, inserted while
   `current_user = 'postgres'`, which is the SQL editor. The app connects as `service_role`, so it
   cannot take this path, and no "single-admin mode" exists anywhere.
3. **Scope shape.** If `roles.scope_required`, `language` must not be NULL.
4. **Rows are history.** An `UPDATE` may only set `revoked_at`, `revoked_by`, `revoke_reason`, and
   only once. `DELETE` and `TRUNCATE` are revoked from every app role.

If only one Super Admin exists, granting a privileged role waits until the owner creates a second
one by SQL (D4).

**`audit_log`**: append-only, and it supersedes `admin_logs` (§6).

| Column | Notes |
|---|---|
| `id` `uuid` PK | |
| `seq` `bigint` unique | Assigned by the trigger under a lock (below); the chain's order |
| `at` | `timestamptz NOT NULL DEFAULT now()`: the database clock, one clock for every row |
| `actor_type` | `staff`, `system`, `legacy`, `bootstrap` |
| `actor_id` | `uuid NULL`: the staff user. NULL for `system`, `legacy`, `bootstrap` |
| `actor_label` | `system:cron` (D11), `legacy:shared-password`, `owner:sql-editor:postgres`, or the staff display name at the time |
| `actor_roles` | `jsonb`: a snapshot of the actor's active assignments when they acted |
| `aal` | `aal1` / `aal2` / NULL |
| `action` | e.g. `article.unpublish`, `auth.sign_in`, `breaking_banner.set` |
| `outcome` | `attempted`, `succeeded`, `failed`, `denied` |
| `entity_type`, `entity_id` | What was acted on |
| `language`, `section` | The target's scope, for scoped reads (`audit.read` is "S (own desk)" for Managing Editor) |
| `before`, `after` | `jsonb NULL`: the changed fields only, never whole rows |
| `reason` | Free text, or a reason code |
| `ip`, `user_agent`, `request_id` | From the request; `request_id` from `x-vercel-id`, else a UUID |
| `prev_hash`, `row_hash` | `bytea`: the tamper-evidence chain |

- **Chain.** A `BEFORE INSERT` trigger takes `pg_advisory_xact_lock`, reads the last row's `seq` and
  `row_hash`, and sets `seq = last + 1`, `prev_hash = last row_hash`, and
  `row_hash = sha256(canonical text of the row || prev_hash)`. `sha256()` is built into Postgres 11
  and later, so no extension is needed. The lock serialises inserts. `id` cannot be the chain
  order, because its default is assigned before the lock is taken.
- **Append-only.** `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM service_role, authenticated,
  anon`. `service_role` bypasses RLS but not table privileges. In addition, `BEFORE UPDATE OR
  DELETE` (row) and `BEFORE TRUNCATE` (statement) triggers raise an exception. The database owner
  can still drop a trigger; the chain makes that visible.
- **Check.** `public.audit_verify_chain()` walks `seq` order and returns the first broken `seq`, or
  NULL. The owner runs it; Panel 8 shows it.
- **Retention.** The app never deletes. Rows are kept at least one year (DPDP's floor, more than
  CERT-In's 180 days). Archiving after that is a future owner procedure, not built here.

##### RLS and grants

- RLS is enabled on all six tables. No policy is created for `anon` or `authenticated`, and
  `REVOKE ALL ... FROM anon, authenticated` on each, so both get nothing.
- The app reads and writes them as `service_role` through `backend/` only (plan: "Phase 1 can ship
  with DAL enforcement alone and add RLS in Phase 2"). A SQL `has_permission()` function and
  `aal2` restrictive policies come with the user-context client in Phase 2. Writing it now would
  mean two copies of the same rule, in SQL and TypeScript, with nothing yet calling the SQL one.
- **Why this matters with `@supabase/ssr`.** A signed-in staff member now holds a real Supabase
  access token for the `authenticated` role. With the public anon key, that token could call
  PostgREST directly. Today's grants already limit `authenticated` to `SELECT` on `articles` and
  `breaking_news` (public data) and nothing on `admin_logs`; the new tables add nothing. A test
  reads the SQL files and fails if any grant to `authenticated` appears on a staff table.

##### `admin_logs`

Recommended: **read-only, not migrated.** After the deploy, nothing writes it. The step C SQL
revokes `INSERT`/`UPDATE`/`DELETE` from `service_role`, so it becomes a frozen record of the
shared-password era, queryable in SQL and kept for at least one year. Copying its rows into
`audit_log` was considered and rejected: the copies would carry no actor and would enter the hash
chain as if the new system had recorded them. The activity log in `/admin` reads `audit_log` from
the deploy on.

#### 2. Permission catalogue

`database/migrations/<date>-access-catalog.sql` seeds the 15 roles, 39 permissions and the
`role_permissions` rows, generated from the matrix by a script kept in `scripts/`. A test parses the
matrix out of `docs/PANEL_PLAN.md` and the inserts out of the SQL file and requires them to agree
cell for cell, in both directions. `shared/config/permissions.ts` holds the 39 keys as a typed
constant (plan: "so frontend and backend cannot drift"). A test checks it against the SQL too.

**How the cell codes are enforced** in Panel 0. Each check asks for `act` (change something) or
`read` (look at something):

| Code | `read` | `act` | Panel 0 |
|---|---|---|---|
| `F` | ✅ | ✅ | Within the assignment's scope |
| `S` | ✅ | ✅ | Within the assignment's scope. Same rule as `F`; the difference is who may hold it unscoped (`scope_required`) |
| `R` | ✅ | ❌ | So `R` on "sync.run / sync.view" allows `sync.view` reads and refuses `sync.run` |
| `M` | ✅ masked | ❌ | No reader data exists yet; nothing uses it |
| `Own` | ❌ | ❌ | Refused until Panel 2 adds `created_by`. Deny by default |
| `A` | ❌ | ❌ | Refused with "needs a second approver" until the panel that builds the approval queue |
| `F (break-glass)` | only via an `is_break_glass` assignment | same | |

Who holds what is exactly the matrix. Panel 0 routes use these rows:

| Permission | Holders (from the matrix) |
|---|---|
| `article.view_admin` | Super Admin F · Managing Editor F · Desk Editor S · Sub-editor S · Writer S · Ingestion Ops R · Analyst R · Grievance Officer R · Legal/Compliance R · Brand Studio Own |
| `article.edit` | Managing Editor F · Desk Editor S · Sub-editor S · Writer Own · Brand Studio Own (sponsored) |
| `article.create` | as `article.edit` |
| `article.publish_direct` | Managing Editor F · Desk Editor S |
| `article.unpublish` | Super Admin F (break-glass) · Managing Editor F · Desk Editor S · Legal/Compliance F |
| `article.bulk_action` | Managing Editor F · Desk Editor S |
| `breaking_banner.manage` | Managing Editor F · Desk Editor S |
| `sync.run` / `sync.view` | Super Admin F · Managing Editor R · Desk Editor R · Ingestion Ops F · Analyst R · Security Lead R |
| `content.purge` | Super Admin A · Ingestion Ops A |
| `stats.view` | Super Admin F · Managing Editor F · Desk Editor S · Sub-editor S · Writer S · Ingestion Ops R · Analyst F · CRM Mgr R · Ad Ops R |
| `audit.read` | Super Admin F · Managing Editor S (own desk) · Legal/Compliance F · Privacy Officer F · Security Lead F |
| `settings.manage` / `health.view` | Super Admin F · Managing Editor R · Ingestion Ops R · Security Lead F |
| `user.manage` / `role.assign` | Super Admin A · Managing Editor S (assign ≤ Desk Editor in own scope). Seeded now; used in Panel 1 |

#### 3. How a request is checked

```
browser ──cookie sb-<ref>-auth-token──▶ proxy.ts (matcher unchanged: /admin/:path*, /api/admin/:path*)
   public allowlist? ──yes──▶ next
   getClaims(): valid, unexpired JWT?  (refreshes the token if due, sets cookies, no DB call)
   or a valid legacy cookie, before the cut-off date (§7)?
   neither ──▶ 401 JSON for /api/admin/*, redirect to /admin/login for pages
   ──▶ route body in backend/api/admin/*
         requirePermission(request, "article.unpublish", { mode: "act", target })
           1. staff session: getClaims() for sub, aal, session_id; getUser() to confirm the
              session still exists (a signed-out JWT stays valid until expiry; getUser catches it)
           2. staff record: staff_profiles + assignments + role_permissions,
              read live from Supabase (service role) on every request (Approval: no cache)
           3. decide(): pure function, deny by default
         ✗ ──▶ 401 / 403 (and an audit row, outcome "denied", for a signed-in staff member)
         ✓ ──▶ audit row "attempted" (if this write fails, stop: 503, nothing changed)
               ──▶ the change ──▶ audit row "succeeded" or "failed"
```

**Where the identity comes from.** Supabase Auth issues the session. `@supabase/ssr` stores it in
the `sb-<project-ref>-auth-token` cookie. There is no browser Supabase client: sign-in, MFA and
sign-out all run in server routes. So the cookie is set by the server, and our `setAll` forces
`HttpOnly`, `Secure` (in production) and `SameSite=Lax` on it. Supabase says `HttpOnly` is "not
necessary". For an admin session it is cheap protection against a script reading the token, and
nothing in the browser needs to read it. Route bodies get the identity only from
`requirePermission`'s return value, never from a header, a body field or a query parameter.

**Modules** (all `backend/auth/`, all `import "server-only"`; `proxy.ts` may import them, P1):

| Module | Job |
|---|---|
| `supabaseServer.ts` | `createServerClient` for route bodies (`cookies()` from `next/headers`) and for the proxy (request and response cookies). One per request, never at module scope (Supabase: "Always initialize the Supabase client inside the request handler") |
| `publicAdminRoutes.ts` | The allowlist (D10) as data: `PUBLIC` = `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/breaking-news`, page `/admin/login`. `SESSION_ONLY` = `POST /api/admin/mfa`, `GET /api/admin/me` (a session, but no permission). The proxy and the tests both import it |
| `staffSession.ts` | `getStaffSession(request)`: the user, `aal`, `session_id`, profile and active assignments, or null |
| `decide.ts` | Pure: `(staff, catalogue, permission, mode, target, now) → { allowed, reason }`. No I/O, so every rule is unit-tested |
| `requirePermission.ts` | Ties them together and returns `{ ok: true, staff }` or `{ ok: false, response }` |
| `scope.ts` | `toScopeLanguage("english") → "en"`, `"hindi" → "hi"`, anything else → null (D5, the one place this happens); `articleScope(article) → { language, section: category[0] ?? null }` (D6) |
| `legacySession.ts` | Today's HMAC cookie, kept until the cut-over (§7), then deleted |

**`decide()`, in order. The first "no" wins:**
1. No staff session, or no profile → 401.
2. Profile `suspended` → 403.
3. Keep the assignments that are not revoked, have `expires_at > now`, and whose role grants the
   permission with a code that allows the mode (table in §2). A break-glass-only cell needs an
   `is_break_glass` assignment.
4. Keep those whose scope covers the target. A scope covers a target when each scope field is NULL
   or equals the target's. A target field that is NULL (an article whose language is not
   `english`/`hindi`, an article with no category, or a site-wide object like the breaking banner)
   is covered only by a NULL scope field. A `read` with no target (a list, a stats page) needs the
   permission in any scope.
5. Keep those whose role does not need `aal2`, or the session is `aal2`. If an assignment was
   dropped only for `aal`, answer 403 with `code: "mfa_required"`, so the UI can send the user to
   the MFA step. Profiles with `mfa_required` need `aal2` for everything (§5).
6. None left → 403 `{ error, required: "<permission>" }`. The permission key is not a secret, and
   it tells the user what to ask for.

Any failure while loading the staff record (Supabase down, a malformed row) is a "no": 503 "Could
not check your permissions. Nothing was changed." An unknown permission key cannot be written,
because the key parameter is the typed union from `shared/config/permissions.ts`. At runtime it
finds no matching row anyway.

**Caching.** *Superseded by the approval: there is no cache in Panel 0, and the record is read live
on every request.* As first proposed (plan: "about 60 s", Upstash): key `staff:v1:<user_id>` would
hold the profile and assignments with their permission rows. That is data, not a decision: expiry
would be evaluated at check time, against the current clock. Any assignment or profile change made
by the app would delete the key in the same request, and a change the owner made by SQL would take
effect within 60 seconds. If Redis were down, the check would read Supabase; a cache failure would
never turn into "allowed".

**What the proxy no longer does.** It stops being the only line of defence, but keeps its job: the
optimistic check, the redirect to `/admin/login`, and the refresh of the Supabase token. The
matcher does not change (CR-05). The Sentry `tunnelRoute` stays off (D12).

#### 4. Today's admin routes and what each will require

| Route | Method | Today | Permission | Mode, target |
|---|---|---|---|---|
| `/api/admin/login` | POST | Shared password → HMAC cookie | public (D10) | Staff: email and password through Supabase. Legacy password until the cut-off (§7). Both rate-limited (D1 limiter, unchanged) |
| `/api/admin/logout` | POST | Clears the cookie | public (D10) | Supabase `signOut({ scope: "local" })` and clears the legacy cookie |
| `/api/admin/breaking-news` | GET | Public banner read | public (D10, CR-08) | — |
| `/api/admin/breaking-news` | POST | Set the banner | `breaking_banner.manage` | act, site-wide target → Managing Editor, or a Desk Editor with no language scope |
| `/api/admin/breaking-news` | DELETE | Remove the banner | `breaking_banner.manage` | as POST |
| `/api/admin/articles` | GET | List and search | `article.view_admin` | read, any scope. Panel 2 adds the desk filter (articles are public data) |
| `/api/admin/articles` | PATCH | Edit one article | `article.edit` | act, `articleScope(article)`. Changing `category[0]` needs the scope of both the old and the new section (ADR 0003) |
| `/api/admin/articles` | DELETE | Delete one article | `article.unpublish` | act, `articleScope(article)` |
| `/api/admin/articles/bulk` | DELETE | Delete many | `article.bulk_action` **and** `article.unpublish` | act, every article in scope, or the whole request is refused |
| `/api/admin/publish-article` | POST | Publish an editorial article | `article.publish_direct` (and `article.create`) | act, the new article's language and `category[0]`. It publishes immediately, so it is the direct path; Panel 2 adds review |
| `/api/admin/seed-supabase` | POST | Fetch every category from NewsData | `sync.run` | act, no scope (site-wide) |
| `/api/admin/db-stats` | GET | Database stats | `stats.view` | read, any scope |
| `/api/admin/db-stats` | POST | Purge articles older than 7 days | `content.purge` | **Refused for everyone**: both holders have `A`, and the approval flow is Panel 4. The cron's own purge continues (BL-033) |
| `/api/admin/stats` | GET | Category stats | `stats.view` | read, any scope |
| `/api/admin/health` | GET | Dependency detail | `health.view` | read, no scope |
| `/api/admin/logs` | GET | Activity log | `audit.read` | read. Rows are filtered to the holder's scope when their cell is `S` |
| `/api/admin/logs` | DELETE | **Clears the whole log** | none | **Removed.** The handler is deleted, so Next answers 405, and the UI loses its "clear" button. An append-only log cannot have a clear button |

**New routes** (route table 28 → 30; `docs/_baseline-routes.txt` is updated in the same commit):

| Route | Method | Guard | Job |
|---|---|---|---|
| `/api/admin/mfa` | POST | session only | `{ action: "enroll" }` → QR code and secret; `{ action: "verify", code }` → challenge and verify, which upgrades the session to `aal2` and sets new cookies. Rate-limited per user and IP |
| `/api/admin/me` | GET | session only | Display name, `aal`, active roles and scopes, and the permission keys held, so the UI can hide what the user cannot do. UX only, never a security boundary |

**Pages.** `/admin` and `/admin/login` stay static and keep their URLs. The proxy guards `/admin`.
The login view gains the staff form (email and password), then the MFA step (enrol on first sign-in,
then a code on each sign-in). While the cut-over runs it keeps a "shared password" option that shows
its end date. The admin view reads `/api/admin/me` to show who is signed in and to hide controls the
user lacks.

#### 5. MFA

- **Factor.** TOTP (authenticator app): free, on by default. Phone/SMS is not used.
- **Who needs `aal2`.** Every assignment of a role with `requires_aal2` (D3) counts only in an
  `aal2` session (decide(), step 5). In addition, `staff_profiles.mfa_required` defaults to **true**,
  so every staff member uses a second factor unless the owner turns it off for one person. The role
  list is the floor nobody can switch off.
  - Why default true: the matrix gives Sub-editor `article.publish` (S), and Sub-editor is not on the
    `requires_aal2` list. The plan treats an unauthorised publish as a CERT-In incident ("the publish
    permission a security control"). Defaulting `mfa_required` covers that without changing D3.
    **Owner decision needed (Q1).**
- **Enrolment.** First sign-in: email and password give an `aal1` session. `/api/admin/me` reports
  "MFA required, not enrolled", and the login view shows the enrol step: `mfa.enroll({ factorType:
  "totp" })` returns a QR code and a secret, and the user confirms one code (`challenge` + `verify`).
  The session becomes `aal2`. Recommend each Super Admin enrols two devices (Supabase allows several
  factors), so one lost phone is not a lockout.
- **Each sign-in.** Password, then a code. The `aal1` session can reach only the session-only routes
  (`/api/admin/mfa`, `/api/admin/me`) until it is upgraded.
- **The check.** `aal` comes from the verified JWT (`getClaims()`), never from a request field. A
  removed factor downgrades `aal2` only at the next token refresh (Supabase). Removing a factor is
  therefore done together with signing the user out (Panel 1, and the owner runbook).
- **Lost device.** Owner action: delete the factor in the dashboard (Authentication → Users), then
  the user enrols again. Audited by the next sign-in's `auth.mfa_enrolled` row. Panel 1 adds an
  in-app reset that needs two admins.
- **Database side.** Restrictive `aal2` RLS policies need the user-context client, so they come in
  Phase 2 (§1, RLS).

#### 6. Audit log

**What is recorded.** For every staff action that changes something, two rows: `attempted` before
the change, then `succeeded` or `failed`. Each carries actor, actor's roles (snapshot), `aal`,
action, target, the target's scope, reason, before/after (changed fields only), IP, user agent,
request id and time. Also recorded:
- sign-in, sign-out, MFA enrolment and every failed MFA code;
- every refusal of a signed-in staff member (`denied`). Unauthenticated 401s are not recorded: the
  proxy refuses them and the login limiter covers brute force;
- every bootstrap grant (`actor_type` `bootstrap`);
- every cron run (`system:cron`, D11), including its purge count.

Reads are not recorded, except `audit.read` itself.

**Why two rows, not one transaction.** The plan asks for the audit row "in the same transaction as
the change". Through supabase-js (PostgREST) each call is its own transaction, so that needs every
action rewritten as a Postgres function. **Panel 0 instead fails closed:** if the `attempted` row
cannot be written, the action does not run and the user gets 503. A crash between the change and
its outcome row leaves an `attempted` row with no outcome, which is visible, rather than a change
with no record. New actions built in Panels 2–4 can be Postgres functions that do both in one
transaction. **Owner decision needed (Q2).**

**Writers.** `backend/repositories/auditLog.ts` gets `recordStaffAudit()`, which throws on failure
(the caller refuses the action), and `recordSystemAudit()` for the cron, which logs and reports to
Sentry but never stops a run: the same contract `logAdminAction` has today. `logAdminAction` and its
callers move to the new writers.

**Append-only and retention.** §1: no `UPDATE`/`DELETE`/`TRUNCATE` for any app role, triggers that
raise, a hash chain, and at least one year.

#### 7. Cut-over from the shared password

| Step | Who | What | The way back in |
|---|---|---|---|
| A | Owner | Apply the two migrations (tables, catalogue). Turn off "Allow new users to sign up". Confirm TOTP MFA is enabled | Nothing has changed for users yet |
| Deploy | Owner | Deploy Panel 0. Both logins work: staff accounts, and the shared password | The shared password, unchanged |
| B | Owner | Invite two Super Admins (Dashboard → Authentication → Invite user). Each accepts and sets a password. Run `database/bootstrap/super-admin.sql` once per account. Each signs in and enrols MFA | The shared password; and the SQL editor |
| C | Owner | Verify the step B checks; apply the `admin_logs` freeze | As above |
| Run | Everyone | Editorial work continues on the shared password, now audited as `legacy:shared-password`. Super Admins work on their accounts | As above |
| Removal | Me, then owner | When the conditions below hold, one deletion commit removes the legacy path; the owner deletes `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from Vercel | The SQL editor (below) |

**What a legacy session may do during the run** (amended by the approval, Q3). A fixed list, in
code (`LEGACY_PERMISSIONS`), with every scope:
- `article.view_admin`, `article.create`, `article.edit`, `article.unpublish`,
  `article.bulk_action`, `article.publish_direct`;
- `breaking_banner.manage`;
- `sync.run`, `sync.view`;
- `stats.view`.

That is today's editorial and sync work. It loses three things it can do today:
- clearing the log (no one can);
- the purge (Q5);
- the activity log and admin health (`audit.read`, `health.view`: no audit or settings permission
  for the shared password).

It never holds `user.manage` or `role.assign`. It is recorded as `legacy:shared-password`, so the
audit shows which actions were still anonymous. It is not mapped to a role, because it is not a
person, and it never needs MFA.

**How long.** Until Panel 1 is done. Panel 0 has no screen for granting roles, so without the shared
password nobody could edit, publish or set the banner: Super Admin holds no editorial verbs (plan).
A **hard end date** is a constant in `backend/auth/legacySession.ts`. After it, the legacy cookie and
login are refused even if the code is never changed. Proposed: **2026-12-31**. An env switch,
`ADMIN_LEGACY_LOGIN=off`, ends it earlier with no deploy. **Owner decision needed (Q3).**

**The exact removal step.** One deletion commit:
- deletes `legacySession.ts` and the legacy branches in `proxy.ts` and `backend/api/admin/login.ts`;
- removes `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from `.env.local.example` and its sync test;
- removes the "shared password" option from the login view.

Its conditions: two Super Admins have signed in with `aal2` in production, Panel 1 can grant roles,
and the owner says go.

**No lockout, ever.** The owner's own way in does not depend on the app: the Supabase dashboard
(reset a password, delete a lost factor, invite a user) plus the SQL editor (the bootstrap script,
which works as `postgres` and nothing else). That is the sealed break-glass. It is written up as an
owner runbook, `docs/runbooks/staff-access.md`: bootstrap, lost MFA device, locked-out last Super
Admin, suspected stolen session (sign out all sessions from the dashboard).

#### 8. Owner actions

1. Approve the `@supabase/ssr` version (below).
2. Supabase dashboard: turn off "Allow new users to sign up"; confirm TOTP MFA is enabled
   (Authentication → MFA); confirm the JWT expiry is the default 1 hour.
3. Apply `<date>-access-foundation.sql`, then `<date>-access-catalog.sql`, with the runbook's
   verification queries. Before the deploy.
4. Deploy Panel 0.
5. Invite two Super Admins; run `database/bootstrap/super-admin.sql` for each; each enrols MFA.
6. Apply `<date>-freeze-admin-logs.sql` once step 5 checks out.
7. Run `select public.audit_verify_chain();` once a week, or on any doubt; it returns NULL when the
   chain is intact.
8. At the end of the cut-over: delete `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from Vercel and
   from `.env.local`. Also `ADMIN_SECRET_TOKEN`, which nothing reads (HANDOFF §3.9).

No new secret is needed. `@supabase/ssr` uses `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, which are already set.

##### The new dependency (D8)

The docs say it is needed (§0). The official package is `@supabase/ssr`, published by Supabase.

| Option | Versions | Published | Cost |
|---|---|---|---|
| **A (recommended)** | `@supabase/ssr@0.12.7`, and `@supabase/supabase-js` 2.109.0 → **2.116.0** | 2026-09-08 and 2026-09-07, both about 8 weeks old | 0.12.7 needs `supabase-js` `^2.114.0` (its `peerDependencies`), so `supabase-js` moves up 7 minor versions. That touches every database call, so it is its own commit with the full test suite |
| B | `@supabase/ssr@0.12.0`, `supabase-js` unchanged | 2026-06-09 | Its peer range `^2.108.0` accepts the installed 2.109.0. But it is five months behind seven releases |

Both are older than two weeks, and both are minor versions. A is recommended because the install is
pinned exact and the package sits on the authentication path, where the newest patch matters more
than the smallest diff. `@supabase/ssr` adds one dependency, `cookie` (`^1.0.2`). It runs on the
server only, so no client bundle grows from it. **Owner decision needed (Q4).**

#### 9. Test plan

Tests come first for every authorization module (master prompt rule 4).

| Test | Proves |
|---|---|
| `backend/auth/decide.test.ts` | Each code: `F`, `S`, `R`, `M`, `Own`, `A`, break-glass, both `read` and `act`. Expired, revoked and future assignments. Suspended profile. Unknown role. A role without the permission. Language and section match and mismatch, NULL scope, NULL target fields. `aal1` vs `aal2` for `requires_aal2` roles and for `mfa_required` profiles. Every "no" path, and the allowed path for each |
| `shared/config/permissions.test.ts` | The matrix parsed out of `docs/PANEL_PLAN.md` (31 rows × 15 roles) equals the catalogue SQL's `role_permissions`, and the 39 keys equal the typed constant |
| `backend/auth/scope.test.ts` | `english ↔ en`, `hindi ↔ hi`, anything else → NULL; `category[0]`, empty and NULL categories (D5, D6) |
| `backend/auth/requirePermission.test.ts` | Session errors → 401; staff-record lookup failure → 503 and no handler call; Redis down → falls back to Supabase, never to "allowed"; a denial writes a `denied` row |
| `backend/api/admin/accessWalk.test.ts` | **The route walk.** It lists every `app/api/admin/**/route.ts` from disk and each method the backend module exports. Each must appear either in `publicAdminRoutes.ts` or in the §4 mapping table (also data in that module). The test fails on a route or method that is in neither, so a new route cannot ship unguarded. For every guarded method it calls the handler with (1) no session → 401, (2) a signed-in staff member with no assignments → 403, and (3) an `aal1` session holding the right role → 403 `mfa_required`. The Supabase mock asserts the handler wrote nothing |
| One allowed test per route | The least-privileged role in the matrix gets 2xx, e.g. a Desk Editor `hi` + `sports` can edit a `hindi` article whose `category[0]` is `sports`, and gets 403 on an `english` one |
| `proxy.test.ts` | Characterization first (proxy is at 0% today): public paths, method-aware breaking-news, 401 vs redirect. Then the Supabase session, the legacy cookie before and after the end date, the allowlist read from the shared module |
| `backend/api/admin/login.test.ts`, `mfa.test.ts`, `me.test.ts` | Staff sign-in, MFA enrol and verify, rate limits, legacy cut-off, cookie flags (`HttpOnly`, `SameSite=Lax`) |
| `backend/repositories/auditLog.test.ts` | Staff writer throws on failure; system writer never throws; a privileged route whose `attempted` write fails returns 503 and does not act |
| `backend/repositories/schema.test.ts` (extended) | The SQL files: `REVOKE UPDATE, DELETE, TRUNCATE` on `audit_log`; the append-only triggers; no grant to `anon`/`authenticated` on the new tables; the bootstrap path tied to `current_user = 'postgres'`; every rollback drops what its file creates |
| UI | Characterization tests before changing `AdminLoginView` and `ActivityLog` (no tests today), then the MFA steps and the removed clear button |

Database behaviour (triggers, the chain, the two-admin rule) cannot run in jest, which has no
database. It is proven by the verification queries the owner runs, including negative ones that
must fail (Appendix A).

##### Build order for Step 3, after approval

Small commits, tests first, each through the full gate:
1. `@supabase/supabase-js` upgrade alone (option A only).
2. `@supabase/ssr`.
3. The SQL files and their repo tests.
4. The permission catalogue constant and its matrix test.
5. `scope.ts` and `decide.ts`.
6. `staffSession`, `requirePermission`, `publicAdminRoutes`.
7. The proxy: characterization first, then the change.
8. `/api/admin/me` and `/api/admin/mfa`, with the baseline routes file.
9. Each admin route, one commit per route: test, then the guard.
10. The audit writers.
11. The cron moves to `system:cron`.
12. The login view, then the admin view.
13. The runbooks.

Then PANEL_DOCS, HANDOFF, CODEMAP, architecture.

#### 10. Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | `staff_profiles.mfa_required` defaults to true, so Sub-editors (who can publish) also use MFA? | Yes |
| Q2 | The audit log is "attempted, then outcome", fail closed, instead of one transaction per change? | Yes for Panel 0; Postgres functions for new actions from Panel 2 |
| Q3 | The legacy password runs until Panel 1 is done, with a hard end date of 2026-12-31 and `ADMIN_LEGACY_LOGIN=off` to end it sooner? | Yes |
| Q4 | `@supabase/ssr` 0.12.7 with `supabase-js` 2.116.0 (A), or 0.12.0 alone (B)? | A |
| Q5 | The admin purge button is refused until Panel 4 builds its approval flow (both holders have `A`)? The cron's purge continues | Yes: the matrix says purge needs two people |
| Q6 | `DELETE /api/admin/logs` (clear the activity log) is removed? | Yes: an append-only log cannot be cleared |
| Q7 | `admin_logs` is frozen and kept, not copied into `audit_log`? | Yes |
| Q8 | The bootstrap script lives in `database/bootstrap/`, not `database/migrations/`? | Yes |

#### Appendix A: the bootstrap script

`database/bootstrap/super-admin.sql`. The owner runs it in the SQL editor (as `postgres`), once per
account, after inviting the user and after they accept the invite. It changes nothing unless both
values at the top are filled in.

```sql
-- TimesPrime: make one invited user a Super Admin (owner only; D4).
-- Run in Dashboard -> SQL Editor as postgres. Edit the two values below first.
-- Safe to re-run: a user who is already an active Super Admin is left alone.

BEGIN;

DO $$
DECLARE
  v_email     text := 'REPLACE_ME@example.com';                       -- the invited user
  v_name      text := 'REPLACE ME';                                   -- their display name
  v_reason    text := 'bootstrap: first Super Admins, owner, ' || to_char(now(), 'YYYY-MM-DD');
  v_expires   timestamptz := now() + interval '365 days';             -- renewed at the access review
  v_user      uuid;
  v_confirmed timestamptz;
  v_status    text;
  v_id        uuid;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this as postgres in the SQL editor (current_user is %)', current_user;
  END IF;
  IF v_email LIKE 'REPLACE_ME%' OR v_name = 'REPLACE ME' THEN
    RAISE EXCEPTION 'Fill in v_email and v_name first';
  END IF;

  SELECT id, email_confirmed_at INTO v_user, v_confirmed
    FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No auth user with email %: invite them first (Authentication -> Invite user)', v_email;
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'User % has not accepted the invite yet', v_email;
  END IF;

  INSERT INTO public.staff_profiles (user_id, display_name, status, mfa_required, created_by)
    VALUES (v_user, v_name, 'active', true, NULL)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT status INTO v_status FROM public.staff_profiles WHERE user_id = v_user;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Staff profile for % is %; reactivating is not a bootstrap', v_email, v_status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.role_assignments
               WHERE user_id = v_user AND role_key = 'super_admin'
                 AND revoked_at IS NULL AND expires_at > now()) THEN
    RAISE NOTICE '% is already an active Super Admin; nothing changed', v_email;
    RETURN;
  END IF;

  -- granted_by and approved_by stay NULL: the role_assignments trigger accepts that only for
  -- super_admin, only with a 'bootstrap:' reason, and only when current_user is postgres.
  INSERT INTO public.role_assignments (user_id, role_key, language, section, reason, expires_at)
    VALUES (v_user, 'super_admin', NULL, NULL, v_reason, v_expires)
    RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_type, actor_label, action, outcome,
                                entity_type, entity_id, after, reason)
    VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'role.assign', 'succeeded',
            'role_assignment', v_id::text,
            jsonb_build_object('user_id', v_user, 'role_key', 'super_admin',
                               'language', NULL, 'section', NULL, 'expires_at', v_expires),
            v_reason);

  RAISE NOTICE 'Super Admin granted to % (assignment %), expires %', v_email, v_id, v_expires;
END $$;

COMMIT;
```

**Verification** (run after each account; each line says what to expect):

```sql
-- 1. The active Super Admins: exactly the accounts bootstrapped so far.
SELECT u.email, p.status, p.mfa_required, a.id, a.reason, a.granted_at, a.expires_at
  FROM public.role_assignments a
  JOIN public.staff_profiles p ON p.user_id = a.user_id
  JOIN auth.users u ON u.id = a.user_id
 WHERE a.role_key = 'super_admin' AND a.revoked_at IS NULL
 ORDER BY a.granted_at;

-- 2. One bootstrap audit row per grant, and the chain intact (expect NULL).
SELECT seq, at, actor_label, action, entity_id, reason FROM public.audit_log
 WHERE actor_type = 'bootstrap' ORDER BY seq;
SELECT public.audit_verify_chain();

-- 3. Negative: the app's role cannot bootstrap. Expect an ERROR from the trigger, then ROLLBACK.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.role_assignments (user_id, role_key, reason, expires_at)
  SELECT user_id, 'super_admin', 'bootstrap: must fail', now() + interval '1 day'
    FROM public.staff_profiles LIMIT 1;
ROLLBACK;

-- 4. Negative: the audit log cannot be edited. Expect an ERROR, then ROLLBACK.
BEGIN;
SET LOCAL ROLE service_role;
UPDATE public.audit_log SET reason = 'tampered' WHERE actor_type = 'bootstrap';
ROLLBACK;
```

5. In the app: the user signs in at `/admin/login`, enrols TOTP, and `/api/admin/me` lists
   `super_admin` with `aal2`. An `auth.sign_in` and an `auth.mfa_enrolled` row appear in the
   activity log.

**Rollback.** Grants are history, so a rollback revokes; it does not delete:

```sql
BEGIN;
UPDATE public.role_assignments
   SET revoked_at = now(), revoked_by = NULL, revoke_reason = 'bootstrap rollback: <why>'
 WHERE id = '<assignment id from verification 1>' AND revoked_at IS NULL;
INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, entity_type, entity_id, reason)
  VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'role.revoke', 'succeeded',
          'role_assignment', '<assignment id>', 'bootstrap rollback: <why>');
-- Optional, to stop the person signing in to the admin at all:
-- UPDATE public.staff_profiles SET status = 'suspended' WHERE user_id = '<user id>';
COMMIT;
```

The revocation takes effect within 60 seconds (the permission cache). For an immediate effect, also
sign the user out of all sessions in the dashboard. Rolling back the whole access foundation
(dropping the tables) is in the migration's own rollback section. It is safe only before go-live:
once `audit_log` holds real rows, it is never dropped.
