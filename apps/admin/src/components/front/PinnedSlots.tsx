"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Pin, PinOff, RefreshCw, Search } from "lucide-react";
import { DEFAULT_PIN_HOURS, PIN_HOURS, PIN_HOURS_LABELS, type PinHours, type PinLanguage } from "@timesprime/shared/config/frontPage";
import { SECTION_IDS, type SectionId } from "@timesprime/shared/config/sections";
import { SITE_URL } from "@timesprime/shared/config/site";
import { deskCall, when } from "../desk/deskClient";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { useDialog } from "../ui/Feedback";
import { badge, button, buttonDanger, buttonPrimary, card, cardTitle, field, hint, item, label, link, tone } from "../ui/styles";

// The Front page screen's pinned slots (Panel 3 design §4), in the order they are used: the page
// being arranged, its slots (what shows now, what starts later), and pinning a story. The screen
// decides nothing: the server says whether the caller may pin on the page, and decides each change.

interface PinView {
  id: string;
  slot: number;
  story_id: string;
  starts_at: string;
  ends_at: string;
  ended_at: string | null;
  headline: string | null;
  story_state: string | null;
  pinned_by_name: string;
}

interface PagePins {
  slots: number;
  pins: PinView[];
  may_pin: boolean;
}

interface Pinnable {
  id: string;
  headline: string;
  published_at: string | null;
}

const sectionName = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const until = (pin: PinView) => (pin.ended_at && Date.parse(pin.ended_at) < Date.parse(pin.ends_at) ? pin.ended_at : pin.ends_at);

export default function PinnedSlots({ ownLanguage }: { ownLanguage: PinLanguage | null }) {
  const dialog = useDialog();
  const [language, setLanguage] = useState<PinLanguage>(ownLanguage ?? "en");
  const [section, setSection] = useState<SectionId | "">("");
  const [data, setData] = useState<PagePins | null>(null);
  // When the pins were read: what "showing" is measured against (a render reads no clock).
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  // The "Pin a story" form.
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Pinnable[] | null>(null);
  const [storyId, setStoryId] = useState("");
  const [slot, setSlot] = useState(1);
  const [startMode, setStartMode] = useState<"now" | "later">("now");
  const [startAt, setStartAt] = useState("");
  const [hours, setHours] = useState<PinHours>(DEFAULT_PIN_HOURS);

  const pageQuery = `language=${language}${section ? `&section=${section}` : ""}`;

  const load = useCallback(async () => {
    const res = await deskCall<PagePins>(`/api/admin/front-page/pins?${pageQuery}`);
    if (res.ok && res.data) {
      setData(res.data);
      setLoadedAt(Date.now());
      setLoadError("");
    } else {
      setData(null);
      setLoadError(res.error ?? "Could not load the page's pins.");
    }
  }, [pageQuery]);

  // Necessary setState-in-effect: the pins come from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const choosePage = (nextLanguage: PinLanguage, nextSection: SectionId | "") => {
    setLanguage(nextLanguage);
    setSection(nextSection);
    setData(null);
    setFound(null);
    setStoryId("");
    setSlot(1);
    setMessage(null);
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await deskCall<{ stories: Pinnable[] }>(`/api/admin/front-page/stories?${pageQuery}&q=${encodeURIComponent(q.trim())}`);
    if (res.ok && res.data) {
      setFound(res.data.stories);
      setStoryId(res.data.stories[0]?.id ?? "");
    } else {
      setFound([]);
      setMessage({ ok: false, text: res.error ?? "Could not search the stories." });
    }
  };

  const pin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storyId) return setMessage({ ok: false, text: "Choose a story to pin." });
    if (startMode === "later" && !startAt) return setMessage({ ok: false, text: "Choose when the pin starts." });
    setBusy(true);
    const res = await deskCall<{ replaced: string[] }>("/api/admin/front-page/pins", {
      method: "POST",
      body: JSON.stringify({
        language,
        section: section || null,
        slot,
        story_id: storyId,
        starts_at: startMode === "later" ? new Date(startAt).toISOString() : null,
        hours,
      }),
    });
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error ?? "The story was not pinned." });
    const replaced = res.data?.replaced.length ?? 0;
    setMessage({ ok: true, text: `Pinned to slot ${slot}${replaced > 0 ? `, in place of ${replaced === 1 ? "the slot's pin" : `${replaced} pins`}` : ""}.` });
    setFound(null);
    setQ("");
    setStoryId("");
    await load();
  };

  const unpin = async (p: PinView) => {
    const sure = await dialog.confirm({
      title: "Unpin this story?",
      message: `"${p.headline ?? "This story"}" leaves slot ${p.slot} at once. The story itself stays live.`,
      confirmLabel: "Unpin",
      tone: "danger",
    });
    if (!sure) return;
    setBusy(true);
    const res = await deskCall(`/api/admin/front-page/pins/${p.id}/end`, { method: "POST" });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: `Unpinned from slot ${p.slot}.` } : { ok: false, text: res.error ?? "The pin was not ended." });
    await load();
  };

  const readerPage = `${SITE_URL}/${section}`;
  const slots = data ? Array.from({ length: data.slots }, (_, i) => i + 1) : [];

  return (
    <section aria-labelledby="pins-title" className={`${card} space-y-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="pins-title" className={`${cardTitle} flex items-center gap-2`}>
            <Pin aria-hidden="true" className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Pinned stories
          </h2>
          <p className={hint}>
            Published Desk stories above the automatic order: 3 on the home page and 2 on each section page, per language. Every pin ends.
          </p>
        </div>
        <a href={readerPage} target="_blank" rel="noopener noreferrer" className={button}>
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          See the page
        </a>
      </div>

      {/* 1. The page being arranged. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Language
          <select value={language} onChange={(e) => choosePage(e.target.value as PinLanguage, section)} className={`${field} mt-1`}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </label>
        <label className={label}>
          Page
          <select value={section} onChange={(e) => choosePage(language, e.target.value as SectionId | "")} className={`${field} mt-1`}>
            <option value="">Home page</option>
            {SECTION_IDS.map((s) => (
              <option key={s} value={s}>
                {sectionName(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {language === "hi" && <p className={hint}>Hindi pins show to readers who chose Hindi, on the same page.</p>}

      {loadError && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {loadError}{" "}
          <button type="button" onClick={load} className={link}>
            Try again
          </button>
        </p>
      )}
      {!data && !loadError && <p role="status" className={hint}>Loading the page&apos;s pins…</p>}

      {/* 2. Its slots: what shows now, and what starts later. */}
      {data && (
        <ol className="grid gap-3 lg:grid-cols-3" aria-label="Slots">
          {slots.map((n) => {
            const pins = data.pins.filter((p) => p.slot === n);
            return (
              <li key={n} className={`${item} space-y-2`}>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Slot {n}</p>
                {pins.length === 0 && <p className={hint}>Empty: nothing pinned.</p>}
                {pins.map((p) => {
                  const started = Date.parse(p.starts_at) <= loadedAt;
                  // A story taken down while pinned keeps its pin, and shows nothing (design §2).
                  const live = p.story_state === "published";
                  return (
                    <div key={p.id} className="space-y-1 border-t border-slate-100 pt-2 first-of-type:border-0 first-of-type:pt-0 dark:border-[#2b2f36]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!live ? (
                          <span className={`${badge} ${tone.red}`}>Story not live: not showing</span>
                        ) : (
                          <span className={`${badge} ${started ? tone.green : tone.blue}`}>{started ? "Showing" : `From ${when(p.starts_at)}`}</span>
                        )}
                      </div>
                      <Link href={`/admin/desk/${p.story_id}`} className={`${link} block`}>
                        {p.headline ?? "A story with no live version"}
                      </Link>
                      <p className={hint}>
                        Until {when(until(p))} · pinned by {p.pinned_by_name}
                      </p>
                      {data.may_pin && (
                        <button type="button" onClick={() => unpin(p)} disabled={busy} className={buttonDanger}>
                          <PinOff aria-hidden="true" className="h-3.5 w-3.5" />
                          Unpin
                        </button>
                      )}
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ol>
      )}

      <ActionMessage message={message} />

      {/* 3. Pinning a story. */}
      {data && !data.may_pin && (
        <p className={`${hint} rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]`}>
          You can see this page&apos;s pins. Pinning here needs the front page in this page&apos;s language{section ? " and section" : ", for every section"}.
        </p>
      )}
      {data?.may_pin && (
        <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-[#2b2f36]">
          <h3 className="text-sm font-bold">Pin a story</h3>
          <form onSubmit={search} className="flex flex-wrap items-end gap-2">
            <label className={`${label} min-w-0 flex-1`}>
              Find a published story
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Words of its headline" className={`${field} mt-1`} />
            </label>
            <button type="submit" className={button}>
              <Search aria-hidden="true" className="h-4 w-4" />
              Search
            </button>
          </form>

          {found && found.length === 0 && <p className={hint}>No published story of this page matches. Only live Desk stories in its language{section ? " and section" : ""} can be pinned.</p>}
          {found && found.length > 0 && (
            <form onSubmit={pin} className="space-y-4">
              <fieldset className="space-y-1">
                <legend className={label}>Story</legend>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1 dark:border-[#2b2f36]">
                  {found.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-slate-50 dark:hover:bg-[#25282d]">
                      <input type="radio" name="story" value={s.id} checked={storyId === s.id} onChange={() => setStoryId(s.id)} className="mt-1" />
                      <span>
                        <span className="font-semibold">{s.headline}</span>
                        <span className={`${hint} block`}>Published {when(s.published_at)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>
                  Slot
                  <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} className={`${field} mt-1`}>
                    {slots.map((n) => (
                      <option key={n} value={n}>
                        Slot {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={label}>
                  Starts
                  <select value={startMode} onChange={(e) => setStartMode(e.target.value as "now" | "later")} className={`${field} mt-1`}>
                    <option value="now">Now</option>
                    <option value="later">At a time</option>
                  </select>
                </label>
                <label className={label}>
                  For
                  <select value={hours} onChange={(e) => setHours(Number(e.target.value) as PinHours)} className={`${field} mt-1`}>
                    {PIN_HOURS.map((h) => (
                      <option key={h} value={h}>
                        {PIN_HOURS_LABELS[h]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {startMode === "later" && (
                <label className={label}>
                  Start time (your clock)
                  <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`${field} mt-1`} />
                </label>
              )}
              <p className={hint}>A pin already in the slot at that time is replaced. The story stays live when its pin ends.</p>
              <div className="flex justify-end">
                <button type="submit" disabled={busy || !storyId} className={buttonPrimary}>
                  {busy ? <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Pin aria-hidden="true" className="h-4 w-4" />}
                  Pin to slot {slot}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
