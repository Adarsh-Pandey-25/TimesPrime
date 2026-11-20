import { Fragment } from "react";
import Link from "next/link";
import { LIVE_LABELS, liveText, type LiveBlock, type LiveFeed, type LiveRun, type LiveUpdateView } from "@timesprime/shared/config/liveBlog";
import LiveWatcher from "./LiveWatcher";

// A live blog's updates on its reader page (Panel 3 design §5, M3), drawn on the server, so readers
// and search engines get them in the page itself: "Live" or "Ended", the key events as links down
// the page, the pinned update, then the updates, newest first. LiveWatcher, the page's only browser
// code for it, checks for new ones every 15 seconds.

function Run({ run }: { run: LiveRun }) {
  if ("br" in run) return <br />;
  let node: React.ReactNode = run.text;
  if (run.bold) node = <strong>{node}</strong>;
  if (run.italic) node = <em>{node}</em>;
  if (run.href) {
    node = run.href.startsWith("/") ? <Link href={run.href}>{node}</Link> : <a href={run.href} rel="noopener noreferrer nofollow">{node}</a>;
  }
  return <>{node}</>;
}

function Block({ block }: { block: LiveBlock }) {
  if (block.kind === "p") {
    return (
      <p>
        {block.runs.map((run, i) => (
          <Fragment key={i}>
            <Run run={run} />
          </Fragment>
        ))}
      </p>
    );
  }
  return (
    <figure>
      <picture>
        <source type="image/avif" srcSet={block.avif} sizes="(min-width: 768px) 720px, 100vw" />
        <source type="image/webp" srcSet={block.webp} sizes="(min-width: 768px) 720px, 100vw" />
        <img src={block.src} alt={block.alt} width={block.width} height={block.height} loading="lazy" className="w-full rounded-lg" />
      </picture>
      {(block.caption || block.credit) && (
        <figcaption className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {[block.caption, block.credit].filter(Boolean).join(" · ")}
        </figcaption>
      )}
    </figure>
  );
}

function Update({ update, language, pinned = false }: { update: LiveUpdateView; language: "en" | "hi"; pinned?: boolean }) {
  const t = LIVE_LABELS[language];
  return (
    <article
      id={pinned ? undefined : `update-${update.id}`}
      className={`scroll-mt-24 space-y-2 rounded-xl border p-4 ${pinned ? "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30" : "border-slate-200 dark:border-slate-700"}`}
    >
      <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        {pinned && <span className="font-bold uppercase tracking-wide text-red-700 dark:text-red-400">{t.pinned}</span>}
        <time dateTime={update.postedAt}>{update.time}</time>
        {update.editedAt && <span>· {t.updated}</span>}
        {update.keyEvent && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{t.keyEvent}</span>}
      </p>
      {update.headline && <h3 className="font-serif text-lg font-bold leading-snug">{update.headline}</h3>}
      <div className="story-body space-y-3">
        {update.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
    </article>
  );
}

export default function LiveBlogFeed({ publicId, language, feed }: { publicId: number; language: "en" | "hi"; feed: LiveFeed }) {
  const t = LIVE_LABELS[language];
  const pinned = feed.updates.find((u) => u.pinned) ?? null;
  const rest = feed.updates.filter((u) => u !== pinned);
  const keyEvents = feed.updates.filter((u) => u.keyEvent && u !== pinned);

  return (
    <section lang={language} aria-label={feed.endedAt ? t.ended : t.live} className="mx-auto max-w-3xl space-y-5 px-4 pb-10">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
        {feed.endedAt ? (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-200">{t.ended}</span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
            {t.live}
          </span>
        )}
        <LiveWatcher key={feed.updates.map((u) => u.id).join(",")} publicId={publicId} language={language} ids={feed.updates.map((u) => u.id)} ended={Boolean(feed.endedAt)} />
      </div>

      {keyEvents.length > 0 && (
        <nav aria-label={t.keyEvents} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="text-sm font-bold uppercase tracking-wide">{t.keyEvents}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {keyEvents.map((u) => (
              <li key={u.id}>
                <a href={`#update-${u.id}`} className="hover:underline">
                  <span className="text-slate-500 dark:text-slate-400">{u.time}</span> {u.headline ?? `${liveText(u.blocks).slice(0, 90)}…`}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {pinned && <Update update={pinned} language={language} pinned />}

      {feed.updates.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t.noUpdates}</p>
      ) : (
        <ol className="space-y-4">
          {rest.map((u) => (
            <li key={u.id}>
              <Update update={u} language={language} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
