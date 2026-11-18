"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { embedProvider, isAllowedHref, EMPTY_DOC } from "@timesprime/editor/schema";
import { wordCount } from "@timesprime/editor/text";
import { checklist, CORRECTION_NOTE_MAX, move, PRE_PUBLISH_STATES, PUBLISH_TICK_MINUTES, TAKEDOWN_REASONS, type ChecklistProblem, type DeskAction, type StoryState } from "@timesprime/shared/config/desk";
import { storyImageIds } from "@timesprime/shared/config/media";
import { SITE_URL } from "@timesprime/shared/config/site";
import { deskStoryPath, storySlug } from "@timesprime/shared/lib/storyUrl";
import { canAct, canAsk, deskCall, STATE_LABELS, STATE_STYLES, useAdminMe, when } from "./deskClient";
import CreditsPanel, { type Credit } from "./CreditsPanel";
import { editorExtensions } from "./editorImage";
import ImagePicker from "./ImagePicker";
import RevisionsPanel, { type FullRevision } from "./RevisionsPanel";

// The story screen (Panel 2 design §4 and §5): the editor, the story's details, the pre-publish
// checklist, the moves its state allows, its open two-person requests, its revisions and its
// history. The server decides every request; this screen only shows what the person might do.

interface Story {
  id: string;
  public_id: number;
  language: "en" | "hi";
  section: string;
  workflow_state: StoryState;
  slug: string | null;
  embargo_until: string | null;
  legal_review_required: boolean;
  current_revision_id: string | null;
  published_revision_id: string | null;
  scheduled_at: string | null;
  post_hoc_review_due: boolean;
  correction_note: string | null;
}
interface Revision {
  id: string;
  headline: string;
  dek: string | null;
  seo_title: string | null;
  seo_description: string | null;
  body: unknown;
}
interface HistoryEntry {
  action: string;
  to_state: StoryState;
  actor_label: string;
  reason: string | null;
  at: string;
}
interface Pending {
  id: string;
  action: string;
  requested_by: string;
  reason: string;
}
interface Loaded {
  story: Story;
  revision: Revision | null;
  history: HistoryEntry[];
  pending: Pending[];
  credits: Credit[];
}

const PROBLEM_TEXT: Record<ChecklistProblem, string> = {
  headline_missing: "A headline",
  headline_too_long: "A headline of at most 110 characters",
  dek_missing: "A dek (the line under the headline)",
  seo_title_missing: "An SEO title",
  seo_title_too_long: "An SEO title of at most 65 characters",
  slug_missing: "A slug (the story's address)",
  legal_review_pending: "The legal review cleared",
  translation_missing: "The other language's version",
  image_unavailable: "Every image in the media library, not retired, its licence not ended",
  image_rights_missing: "Every image's credit, source, licence and cleared rights",
  image_text_missing: "Every image's alt text and caption in the story's language",
};

/** The moves the screen offers, in the order an editor meets them; the server decides each. */
const MOVES_SHOWN: Array<{ action: DeskAction; route: string; label: string; needs?: "reason" | "schedule" | "takedown" }> = [
  { action: "submit", route: "submit", label: "Submit" },
  { action: "send_back", route: "send-back", label: "Send back", needs: "reason" },
  { action: "approve", route: "approve", label: "Approve" },
  { action: "schedule", route: "schedule", label: "Schedule", needs: "schedule" },
  { action: "unschedule", route: "unschedule", label: "Unschedule" },
  { action: "publish", route: "publish", label: "Publish" },
  { action: "publish_direct", route: "publish-direct", label: "Publish now (breaking)" },
  { action: "unpublish", route: "unpublish", label: "Take down", needs: "takedown" },
  { action: "retract", route: "retract", label: "Retract", needs: "takedown" },
  { action: "kill", route: "kill", label: "Kill", needs: "reason" },
];

const SAVABLE: StoryState[] = ["pitch", "assigned", "draft", "in_review", "desk_review", "approved", "published"];
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]";
const button = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 dark:border-[#3a3f47] dark:hover:bg-[#2b2f36]";

function Toolbar({ editor, disabled, onImage }: { editor: Editor | null; disabled: boolean; onImage: () => void }) {
  if (!editor) return null;
  const run = (fn: () => void) => () => !disabled && fn();
  const tool = (label: string, onClick: () => void, active = false) => (
    <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={`${button} ${active ? "bg-slate-200 dark:bg-[#33373d]" : ""}`}>
      {label}
    </button>
  );
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1.5">
      {tool("Bold", run(() => editor.chain().focus().toggleBold().run()), editor.isActive("bold"))}
      {tool("Italic", run(() => editor.chain().focus().toggleItalic().run()), editor.isActive("italic"))}
      {tool("Heading", run(() => editor.chain().focus().toggleHeading({ level: 2 }).run()), editor.isActive("heading", { level: 2 }))}
      {tool("Subheading", run(() => editor.chain().focus().toggleHeading({ level: 3 }).run()), editor.isActive("heading", { level: 3 }))}
      {tool("• List", run(() => editor.chain().focus().toggleBulletList().run()), editor.isActive("bulletList"))}
      {tool("1. List", run(() => editor.chain().focus().toggleOrderedList().run()), editor.isActive("orderedList"))}
      {tool("Quote", run(() => editor.chain().focus().toggleBlockquote().run()), editor.isActive("blockquote"))}
      {tool("Link", run(() => {
        const href = window.prompt("Link (https://… or /section/…). Leave empty to remove.") ?? "";
        if (!href) editor.chain().focus().unsetLink().run();
        else if (isAllowedHref(href)) editor.chain().focus().setLink({ href }).run();
        else window.alert("Only https links, site paths or mailto are allowed.");
      }), editor.isActive("link"))}
      {tool("Factbox", run(() => editor.chain().focus().insertContent({ type: "factbox", content: [{ type: "paragraph" }] }).run()))}
      {tool("Related story", run(() => {
        const href = window.prompt("The story's address (https://… or /section/…)") ?? "";
        if (!isAllowedHref(href)) return void (href && window.alert("Only https links or site paths are allowed."));
        const title = window.prompt("Its headline") ?? "";
        editor.chain().focus().insertContent({ type: "relatedLink", attrs: { href, title } }).run();
      }))}
      {tool("Embed", run(() => {
        const url = window.prompt("A YouTube, X or Instagram post (https://…)") ?? "";
        if (!url) return;
        if (!embedProvider(url)) return void window.alert("Only YouTube, X and Instagram posts can be embedded.");
        editor.chain().focus().insertContent({ type: "embed", attrs: { url } }).run();
      }))}
      {tool("Image", run(onImage))}
      {tool("Ad slot", run(() => editor.chain().focus().insertContent({ type: "adSlot" }).run()))}
    </div>
  );
}

export default function StoryEditor({ id }: { id: string }) {
  const { me, error: meError } = useAdminMe();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [headline, setHeadline] = useState("");
  const [dek, setDek] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [substantive, setSubstantive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const [lockReady, setLockReady] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState<string>(TAKEDOWN_REASONS[0]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [slug, setSlug] = useState("");
  const [embargo, setEmbargo] = useState("");
  const [correction, setCorrection] = useState("");

  // The text fields follow the story's current revision, as the editor's body does (it is rebuilt
  // when that revision changes). A details change or a move adds no revision, so it leaves unsaved
  // text alone instead of resetting the fields while the body keeps its changes.
  const shownRevision = useRef<string | null | undefined>(undefined);
  const load = useCallback(async () => {
    const res = await deskCall<Loaded>(`/api/admin/desk/stories/${id}`);
    if (!res.ok || !res.data) return setLoadError(res.error ?? "Could not load the story.");
    const data = { ...res.data, history: res.data.history ?? [], pending: res.data.pending ?? [], credits: res.data.credits ?? [] };
    setLoaded(data);
    setSlug(data.story.slug ?? "");
    setEmbargo(data.story.embargo_until ? data.story.embargo_until.slice(0, 16) : "");
    const revisionId = data.revision?.id ?? null;
    if (shownRevision.current === revisionId) return;
    shownRevision.current = revisionId;
    setHeadline(data.revision?.headline ?? "");
    setDek(data.revision?.dek ?? "");
    setSeoTitle(data.revision?.seo_title ?? "");
    setSeoDescription(data.revision?.seo_description ?? "");
    setDirty(false);
  }, [id]);

  // Necessary setState-in-effect: the story comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const story = loaded?.story ?? null;
  const mayEdit = Boolean(story && canAct(me, "article.edit") && SAVABLE.includes(story.workflow_state));
  const editable = mayEdit && lockReady && lockHolder === null;

  // The soft lock: taken when the screen opens, renewed every 30 seconds, released when it closes.
  const holdLock = useCallback(
    async (takeOver = false) => {
      const res = await deskCall<{ holder?: string }>(`/api/admin/desk/stories/${id}/lock`, {
        method: "POST",
        body: JSON.stringify(takeOver ? { take_over: true } : {}),
      });
      setLockHolder(res.status === 409 ? (res.data?.holder ?? "someone else") : null);
      setLockReady(true);
    },
    [id]
  );
  const storyLoaded = story !== null;
  useEffect(() => {
    if (!storyLoaded || !mayEdit) return;
    // Necessary setState-in-effect: the lock's state comes back from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void holdLock();
    const timer = window.setInterval(() => void holdLock(), 30_000);
    return () => {
      window.clearInterval(timer);
      void fetch(`/api/admin/desk/stories/${id}/lock`, { method: "DELETE", credentials: "include", keepalive: true });
    };
  }, [storyLoaded, mayEdit, holdLock, id]);

  const extensions = useMemo(() => editorExtensions(), []);
  const [picking, setPicking] = useState(false);
  const revisionKey = loaded?.revision?.id ?? "none";
  const editor = useEditor(
    {
      extensions,
      content: (loaded?.revision?.body as object | undefined) ?? EMPTY_DOC,
      immediatelyRender: false,
      editable,
      onUpdate: () => setDirty(true),
      editorProps: {
        attributes: {
          class: "story-editor min-h-[320px] rounded-lg border border-slate-300 bg-white p-4 text-base leading-relaxed focus:outline-none dark:border-[#3a3f47] dark:bg-[#1f2226]",
          "aria-label": "Story text",
          lang: story?.language ?? "en",
        },
      },
    },
    [revisionKey]
  );
  useEffect(() => {
    // false: no update event. Tiptap sends one by default, and onUpdate would mark an untouched
    // story as having unsaved changes.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  async function save() {
    if (!story) return;
    setBusy(true);
    const res = await deskCall<{ story: Story }>(`/api/admin/desk/stories/${id}/revisions`, {
      method: "POST",
      body: JSON.stringify({
        expected_revision_id: story.current_revision_id,
        headline,
        dek,
        seo_title: seoTitle,
        seo_description: seoDescription,
        is_substantive: substantive,
        body: editor?.getJSON() ?? EMPTY_DOC,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMessage({ ok: true, text: "Saved as a new revision." });
      await load();
    } else {
      setMessage({ ok: false, text: res.status === 409 && !res.data ? res.error ?? "" : res.error ?? "Not saved." });
    }
  }

  /** An old revision back in the editor, unsaved: Save adds it as a new revision (design §3). */
  function bringBack(revision: FullRevision, number: number): boolean {
    if (dirty && !window.confirm(`You have unsaved changes. Replace them with revision ${number}?`)) return false;
    setHeadline(revision.headline);
    setDek(revision.dek ?? "");
    setSeoTitle(revision.seo_title ?? "");
    setSeoDescription(revision.seo_description ?? "");
    editor?.commands.setContent((revision.body as object | null) ?? EMPTY_DOC);
    setDirty(true);
    setMessage(null);
    return true;
  }

  async function saveDetails() {
    if (!story) return;
    setBusy(true);
    const res = await deskCall(`/api/admin/desk/stories/${id}/details`, {
      method: "POST",
      body: JSON.stringify({ slug: slug || null, embargo_until: embargo ? new Date(embargo).toISOString() : null }),
    });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: "Details saved." } : { ok: false, text: res.error ?? "Details not saved." });
    if (res.ok) await load();
  }

  async function setLegalReview(required: boolean) {
    const res = await deskCall(`/api/admin/desk/stories/${id}/details`, { method: "POST", body: JSON.stringify({ legal_review_required: required }) });
    setMessage(res.ok ? { ok: true, text: required ? "Marked for legal review." : "Legal review cleared." } : { ok: false, text: res.error ?? "Not changed." });
    if (res.ok) await load();
  }

  async function doMove(route: string, needs?: "reason" | "schedule" | "takedown") {
    if (dirty && !window.confirm("You have unsaved changes. Take this step anyway?")) return;
    const body: Record<string, unknown> = {};
    if (needs === "reason" || needs === "takedown") body.reason = reason;
    if (needs === "takedown") body.reason_code = reasonCode;
    if (needs === "schedule") body.scheduled_at = scheduleAt ? new Date(scheduleAt).toISOString() : "";
    setBusy(true);
    const res = await deskCall<{ problems?: ChecklistProblem[] }>(`/api/admin/desk/stories/${id}/${route}`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) {
      setMessage({ ok: true, text: "Done." });
      setReason("");
      await load();
    } else {
      const problems = (res.data as { problems?: ChecklistProblem[] } | null)?.problems;
      setMessage({ ok: false, text: problems ? `${res.error} Missing: ${problems.map((p) => PROBLEM_TEXT[p]).join("; ")}.` : res.error ?? "Not done." });
    }
  }

  async function askRestore() {
    const res = await deskCall(`/api/admin/desk/stories/${id}/restore`, { method: "POST", body: JSON.stringify({ reason }) });
    setMessage(res.ok ? { ok: true, text: "Restore requested. A second person must approve it." } : { ok: false, text: res.error ?? "Not requested." });
    if (res.ok) await load();
  }

  async function decide(pending: Pending, outcome: "approved" | "declined") {
    const res = await deskCall(`/api/admin/desk/pending/${pending.id}/decide`, { method: "POST", body: JSON.stringify({ outcome }) });
    const done = pending.action === "correction" ? "Correction published." : "Restored.";
    setMessage(res.ok ? { ok: true, text: outcome === "approved" ? done : "Request declined." } : { ok: false, text: res.error ?? "Not decided." });
    if (res.ok) await load();
  }

  /** A live story's public correction note: published at once (S or F), or asked for (A). */
  async function publishCorrection() {
    setBusy(true);
    const res = await deskCall(`/api/admin/desk/stories/${id}/correct`, { method: "POST", body: JSON.stringify({ note: correction }) });
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error ?? "Not done." });
    setMessage({
      ok: true,
      text: res.status === 201 ? "Correction requested. A Desk Editor or the Managing Editor decides it." : "Correction published. Readers see it under the story.",
    });
    setCorrection("");
    await load();
  }

  if (meError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{meError}</p>;
  if (me && me.kind !== "staff") {
    return <p role="alert" className="text-sm text-red-700 dark:text-red-300">Sign in with your own staff account to use the Desk. The shared admin password cannot.</p>;
  }
  if (loadError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{loadError}</p>;
  if (!loaded || !story) return <p aria-live="polite" className="text-sm text-slate-500">Loading the story…</p>;

  const problems = checklist({ headline, dek, seoTitle, slug: story.slug, legalReviewRequired: story.legal_review_required, counterpartMissing: false });
  const moves = MOVES_SHOWN.filter((m) => {
    const step = move(m.action, story.workflow_state);
    return step !== null && canAct(me, step.permission);
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/desk" className="text-sm text-blue-700 hover:underline dark:text-blue-300">← Desk</Link>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES[story.workflow_state]}`}>{STATE_LABELS[story.workflow_state]}</span>
          <span className="text-sm text-slate-500">{story.language === "hi" ? "Hindi" : "English"} · {story.section}</span>
          <Link href={`/admin/desk/${id}/preview`} target="_blank" rel="noopener" className="text-sm text-blue-700 hover:underline dark:text-blue-300">
            Preview ↗
          </Link>
          {story.workflow_state === "published" && (
            <a href={`${SITE_URL}${deskStoryPath(story)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline dark:text-blue-300">
              View on the site ↗
            </a>
          )}
          {dirty && <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Unsaved changes</span>}
        </div>

        {lockHolder && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            Someone else is editing this story, so it is read-only for you.
            <button type="button" className={button} onClick={() => window.confirm("Take over? Their unsaved work will be lost.") && void holdLock(true)}>
              Take over
            </button>
          </div>
        )}

        <label className="block text-sm font-semibold">
          Headline
          <input className={`${field} font-serif text-lg font-bold`} lang={story.language} value={headline} disabled={!editable} onChange={(e) => { setHeadline(e.target.value); setDirty(true); }} />
        </label>
        <label className="block text-sm font-semibold">
          Dek
          <textarea className={field} rows={2} lang={story.language} value={dek} disabled={!editable} onChange={(e) => { setDek(e.target.value); setDirty(true); }} />
        </label>
        <Toolbar editor={editor} disabled={!editable} onImage={() => setPicking(true)} />
        {picking && editable && (
          <ImagePicker
            language={story.language}
            onClose={() => setPicking(false)}
            onPick={(imageId, ratio) => {
              editor?.chain().focus().insertContent({ type: "image", attrs: { id: imageId, ratio } }).run();
              setPicking(false);
            }}
          />
        )}
        <EditorContent editor={editor} />
        <p className="text-xs text-slate-500">{wordCount(editor?.getJSON() ?? loaded.revision?.body)} words</p>

        <details className="rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
          <summary className="cursor-pointer text-sm font-semibold">Search engines</summary>
          <label className="mt-2 block text-sm">SEO title<input className={field} lang={story.language} value={seoTitle} disabled={!editable} onChange={(e) => { setSeoTitle(e.target.value); setDirty(true); }} /></label>
          <label className="mt-2 block text-sm">SEO description<textarea className={field} rows={2} lang={story.language} value={seoDescription} disabled={!editable} onChange={(e) => { setSeoDescription(e.target.value); setDirty(true); }} /></label>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!editable || busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={substantive} onChange={(e) => setSubstantive(e.target.checked)} /> A substantive change</label>
        </div>
        {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>{message.text}</p>}

        <RevisionsPanel
          storyId={story.id}
          currentRevisionId={story.current_revision_id}
          publishedRevisionId={story.published_revision_id}
          language={story.language}
          canBringBack={editable}
          onBringBack={bringBack}
        />
      </div>

      <aside className="space-y-5" aria-label="The story's workflow">
        <section aria-labelledby="checklist-heading" className="rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
          <h2 id="checklist-heading" className="mb-2 text-sm font-bold">Before approval</h2>
          {problems.length === 0 ? (
            <p className="text-sm text-green-700 dark:text-green-300">The checklist is complete.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">{problems.map((p) => <li key={p}>{PROBLEM_TEXT[p]}</li>)}</ul>
          )}
          {editor && storyImageIds(editor.getJSON()).length > 0 && (
            <p className="mt-2 text-xs text-slate-500">Its images are checked when the story is approved or published: credit, source, licence, cleared rights, and alt text and a caption in the story&apos;s language.</p>
          )}
        </section>

        {mayEdit && story.workflow_state !== "published" && (
          <section aria-labelledby="details-heading" className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
            <h2 id="details-heading" className="text-sm font-bold">Details</h2>
            <label className="block text-sm">Slug
              <div className="flex gap-1">
                <input className={field} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="india-wins-the-series" />
                <button type="button" className={button} onClick={() => setSlug(storySlug(headline))}>Suggest</button>
              </div>
            </label>
            <label className="block text-sm">Embargo until (IST)<input type="datetime-local" className={field} value={embargo} onChange={(e) => setEmbargo(e.target.value)} /></label>
            <button type="button" className={button} disabled={busy} onClick={() => void saveDetails()}>Save details</button>
            <div className="pt-1">
              {story.legal_review_required ? (
                <button type="button" className={button} onClick={() => void setLegalReview(false)}>Clear legal review</button>
              ) : (
                <button type="button" className={button} onClick={() => void setLegalReview(true)}>Needs legal review</button>
              )}
            </div>
          </section>
        )}

        <CreditsPanel
          storyId={story.id}
          language={story.language}
          credits={loaded.credits}
          editable={canAct(me, "article.edit") && PRE_PUBLISH_STATES.includes(story.workflow_state)}
          onSaved={async (result) => {
            setMessage(result);
            if (result.ok) await load();
          }}
        />

        <section aria-labelledby="moves-heading" className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
          <h2 id="moves-heading" className="text-sm font-bold">Next step</h2>
          {moves.length === 0 && story.workflow_state !== "unpublished" && <p className="text-sm text-slate-500">Nothing for you to do on this story now.</p>}
          {moves.some((m) => m.needs === "reason" || m.needs === "takedown") || story.workflow_state === "unpublished" ? (
            <label className="block text-sm">Reason<textarea className={field} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          ) : null}
          {moves.some((m) => m.needs === "takedown") && (
            <label className="block text-sm">Reason code
              <select className={field} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                {TAKEDOWN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          )}
          {moves.some((m) => m.needs === "schedule") && (
            <div>
              <label className="block text-sm">
                Publish at (IST)
                <input type="datetime-local" className={field} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} aria-describedby="schedule-hint" />
              </label>
              <p id="schedule-hint" className="mt-1 text-xs text-slate-500">
                The server publishes it within {PUBLISH_TICK_MINUTES} minutes after this time, if you may still publish it then.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {moves.map((m) => (
              <button key={m.action} type="button" disabled={busy} className={button} onClick={() => void doMove(m.route, m.needs)}>{m.label}</button>
            ))}
            {story.workflow_state === "unpublished" && !loaded.pending.some((p) => p.action === "restore") && (
              <button type="button" className={button} disabled={busy || !reason.trim()} onClick={() => void askRestore()}>Ask to restore</button>
            )}
          </div>
        </section>

        {story.workflow_state === "published" && (canAct(me, "correction.publish") || canAsk(me, "correction.publish")) && (
          <section aria-labelledby="correction-heading" className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
            <h2 id="correction-heading" className="text-sm font-bold">Correction</h2>
            {story.correction_note ? (
              <p className="text-sm">Readers see: <q lang={story.language}>{story.correction_note}</q></p>
            ) : (
              <p className="text-sm text-slate-500">No correction note on this story.</p>
            )}
            <label className="block text-sm">
              Correction note, shown to readers under the story
              <textarea className={field} rows={3} lang={story.language} maxLength={CORRECTION_NOTE_MAX} value={correction} onChange={(e) => setCorrection(e.target.value)} />
            </label>
            <button type="button" className={button} disabled={busy || !correction.trim()} onClick={() => void publishCorrection()}>
              {canAct(me, "correction.publish") ? "Publish correction" : "Ask for a correction"}
            </button>
          </section>
        )}

        {loaded.pending.length > 0 && (
          <section aria-labelledby="pending-heading" className="space-y-2 rounded-lg border border-amber-300 p-3 dark:border-amber-800">
            <h2 id="pending-heading" className="text-sm font-bold">Waiting for a second person</h2>
            {loaded.pending.map((p) => (
              <div key={p.id} className="space-y-1 text-sm">
                <p>{p.action === "correction" ? "Correction requested" : "Restore requested"}: {p.reason}</p>
                <div className="flex gap-2">
                  <button type="button" className={button} onClick={() => void decide(p, "approved")}>Approve</button>
                  <button type="button" className={button} onClick={() => void decide(p, "declined")}>Decline</button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section aria-labelledby="history-heading" className="rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
          <h2 id="history-heading" className="mb-2 text-sm font-bold">History</h2>
          {loaded.history.length === 0 ? (
            <p className="text-sm text-slate-500">No history yet.</p>
          ) : (
            <ol className="space-y-1 text-xs">
              {[...loaded.history].reverse().map((h, i) => (
                <li key={i}>
                  <span className="font-semibold">{h.action.replace("_", " ")}</span> → {STATE_LABELS[h.to_state] ?? h.to_state} · {when(h.at)}
                  {h.reason ? <span className="block text-slate-500">{h.reason}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
