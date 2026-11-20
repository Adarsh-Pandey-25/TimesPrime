"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LIVE_LABELS, LIVE_PAGE_UPDATES, LIVE_POLL_SECONDS } from "@timesprime/shared/config/liveBlog";

// The live blog page's check for new updates (Panel 3 design §5, decision 9): every 15 seconds while
// the tab is visible, it reads the blog's feed (/api/live/[publicId], one cached copy for every
// reader). New updates are offered with a "New updates" button instead of moving the page under the
// reader; a removed update, or the blog's end, is shown at once. Showing them re-renders the page on
// the server (router.refresh), so this holds no copy of the updates and no way to draw them. The
// page remounts it with each render (its key is the updates shown).

interface Props {
  publicId: number;
  language: "en" | "hi";
  /** The updates the page shows, newest first. */
  ids: string[];
  ended: boolean;
}

export default function LiveWatcher({ publicId, language, ids, ended }: Props) {
  const router = useRouter();
  const [fresh, setFresh] = useState(0);
  const known = useRef(new Set(ids));

  useEffect(() => {
    if (ended) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/live/${publicId}`);
        if (!res.ok || stopped) return;
        const feed = (await res.json()) as { endedAt?: string | null; updates?: Array<{ id: string }> };
        if (stopped || !Array.isArray(feed.updates)) return;
        const current = new Set(feed.updates.map((u) => u.id));
        const added = feed.updates.filter((u) => !known.current.has(u.id)).length;
        // The feed holds the newest 50: as many of the oldest leave it as new ones arrive.
        const leftTheFeed = feed.updates.length >= LIVE_PAGE_UPDATES ? added : 0;
        const gone = [...known.current].filter((id) => !current.has(id)).length;
        if (gone > leftTheFeed || feed.endedAt) {
          router.refresh();
          return;
        }
        if (added > 0) setFresh(added);
      } catch {
        // A failed check changes nothing on the page; the next one tries again.
      }
    };

    const start = () => {
      if (!timer) timer = setInterval(() => void check(), LIVE_POLL_SECONDS * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else {
        void check();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [publicId, ended, router]);

  const t = LIVE_LABELS[language];
  return (
    <p aria-live="polite" className="ml-auto">
      {fresh > 0 && (
        <button
          type="button"
          onClick={() => router.refresh()}
          className="rounded-full bg-[#1E3A5F] px-3 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#16304f] dark:bg-[#4A7BAF] dark:hover:bg-[#3d6a9a]"
        >
          {t.newUpdates(fresh)} · {t.show}
        </button>
      )}
    </p>
  );
}
