"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Radio } from "lucide-react";
import { liveBodyProblem, liveExtensions } from "@timesprime/editor/live";
import { isAllowedHref } from "@timesprime/editor/schema";
import { textBlocks } from "@timesprime/editor/text";
import { HEADLINE_MAX } from "@timesprime/shared/config/desk";
import { storyImageIds } from "@timesprime/shared/config/media";
import { deskCall, when } from "./deskClient";
import { EditorImage } from "./editorImage";
import ImagePicker from "./ImagePicker";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { useDialog } from "../ui/Feedback";
import { badge, button, buttonDanger, buttonPrimary, card, cardTitle, field, hint, item, label, tone } from "../ui/styles";

// A live blog's updates on the story screen (Panel 3 design §4, M3): a small editor for one update
// (a headline, the text in the smaller schema, "Key event" and "Pin"), the updates newest first with
// Edit and Remove, and "End the live blog". The story screen loads this only for a live blog, so
// other stories carry none of its code. The server decides every request (requirePermission in the
// story's desk); what is offered here follows /me.

interface Update {
  id: string;
  headline: string | null;
  body: unknown;
  is_key_event: boolean;
  is_pinned: boolean;
  posted_at: string;
  edited_at: string | null;
  removed_at: string | null;
  removed_reason: string | null;
}

const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };

/** A live update's smaller schema, with the story editor's view of an image. Here, not in
 * editorImage.ts, so the story screen's own bundle does not carry it. */
const liveEditorExtensions = () => liveExtensions().map((extension) => (extension.name === "image" ? EditorImage : extension));
const REASON_MAX = 500;

/** The image checklist's problems (422 from the server), in words. */
const IMAGE_PROBLEMS: Record<string, string> = {
  image_unavailable: "the image is not in the library, or is retired",
  image_rights_missing: "its credit, source, licence or rights clearance is missing",
  image_text_missing: "it has no alt text or caption in the story's language",
};

export interface LiveUpdatesPanelProps {
  storyId: string;
  language: "en" | "hi";
  published: boolean;
  canPost: boolean;
  canRemove: boolean;
  canEnd: boolean;
  /** After the blog ends: the story screen reloads the story. */
  onEnded: () => void;
}

export default function LiveUpdatesPanel({ storyId, language, published, canPost, canRemove, canEnd, onEnded }: LiveUpdatesPanelProps) {
  const dialog = useDialog();
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  // The update being written: a new one, or one being changed.
  const [editing, setEditing] = useState<Update | null>(null);
  const [headline, setHeadline] = useState("");
  const [keyEvent, setKeyEvent] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(0);

  const load = useCallback(async () => {
    const res = await deskCall<{ updates: Update[]; live_ended_at: string | null }>(`/api/admin/desk/stories/${storyId}/live`);
    if (res.ok && res.data) {
      setUpdates(res.data.updates);
      setEndedAt(res.data.live_ended_at);
      setLoadError("");
    } else {
      setUpdates((current) => current ?? []);
      setLoadError(res.error ?? "Could not load the updates.");
    }
  }, [storyId]);

  // Necessary setState-in-effect: the updates come from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const open = published && !endedAt;
  const extensions = useMemo(() => liveEditorExtensions(), []);
  const editor = useEditor(
    {
      extensions,
      content: (editing?.body as object | undefined) ?? EMPTY,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "story-editor min-h-[120px] rounded-lg border border-slate-300 bg-white p-3 text-base leading-relaxed focus:outline-none dark:border-[#3a3f47] dark:bg-[#1f2226]",
          "aria-label": "The update's text",
          lang: language,
        },
      },
    },
    [draft]
  );

  function startOver(next: Update | null) {
    setEditing(next);
    setHeadline(next?.headline ?? "");
    setKeyEvent(next?.is_key_event ?? false);
    setPinned(next?.is_pinned ?? false);
    setPicking(false);
    setDraft((n) => n + 1);
  }

  async function addLink(ed: Editor) {
    const current = (ed.getAttributes("link").href as string | undefined) ?? "";
    const values = await dialog.form({
      title: current ? "Change the link" : "Add a link",
      message: "Select the words first. Leave the address empty to remove the link.",
      fields: [{ name: "href", label: "Address", placeholder: "https://… or /section/…", defaultValue: current }],
      submitLabel: "Apply",
      validate: ({ href }) => (!href.trim() || isAllowedHref(href.trim()) ? null : "Only https links, site paths or mailto are allowed."),
    });
    if (!values) return;
    const href = values.href.trim();
    if (!href) ed.chain().focus().unsetLink().run();
    else ed.chain().focus().setLink({ href }).run();
  }

  function addImage() {
    if (editor && storyImageIds(editor.getJSON()).length > 0) {
      setMessage({ ok: false, text: "An update has at most one image. Remove the one it has first." });
      return;
    }
    setPicking(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    const body = editor.getJSON();
    const problem = liveBodyProblem(body);
    if (problem) return setMessage({ ok: false, text: problem });
    setBusy(true);
    const payload = JSON.stringify({ headline: headline.trim() || null, body, is_key_event: keyEvent, is_pinned: pinned });
    const res = editing
      ? await deskCall<{ update: Update }>(`/api/admin/desk/stories/${storyId}/live/${editing.id}`, { method: "PATCH", body: payload })
      : await deskCall<{ update: Update }>(`/api/admin/desk/stories/${storyId}/live`, { method: "POST", body: payload });
    setBusy(false);
    if (!res.ok) {
      const problems = (res.data as { problems?: string[] } | null)?.problems ?? [];
      const why = problems.map((p) => IMAGE_PROBLEMS[p] ?? p).join("; ");
      return setMessage({ ok: false, text: why ? `${res.error} It needs fixing: ${why}.` : (res.error ?? "The update was not saved.") });
    }
    setMessage({ ok: true, text: editing ? "The update is changed." : "The update is posted." });
    startOver(null);
    await load();
  }

  async function remove(u: Update) {
    const values = await dialog.form({
      title: "Remove this update?",
      message: "It comes off the live page at once. It stays in the record, with your reason.",
      fields: [{ name: "reason", label: "Reason", placeholder: "Why it comes down" }],
      submitLabel: "Remove",
      validate: ({ reason }) => (!reason.trim() ? "A reason is required." : [...reason.trim()].length > REASON_MAX ? `At most ${REASON_MAX} characters.` : null),
    });
    if (!values) return;
    setBusy(true);
    const res = await deskCall(`/api/admin/desk/stories/${storyId}/live/${u.id}/remove`, { method: "POST", body: JSON.stringify({ reason: values.reason.trim() }) });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: "The update is removed." } : { ok: false, text: res.error ?? "The update was not removed." });
    if (editing?.id === u.id) startOver(null);
    await load();
  }

  async function end() {
    const sure = await dialog.confirm({
      title: "End the live blog?",
      message: "It takes no more updates, and readers see it as ended. Its updates stay, and one can still be removed.",
      confirmLabel: "End the live blog",
      tone: "danger",
    });
    if (!sure) return;
    setBusy(true);
    const res = await deskCall(`/api/admin/desk/stories/${storyId}/end-live`, { method: "POST" });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: "The live blog has ended." } : { ok: false, text: res.error ?? "The live blog was not ended." });
    if (res.ok) startOver(null);
    await load();
    if (res.ok) onEnded();
  }

  const tool = (name: string, onClick: () => void, active = false) => (
    <button type="button" aria-pressed={active} onClick={onClick} className={`${button} ${active ? "bg-slate-200 dark:bg-[#33373d]" : ""}`}>
      {name}
    </button>
  );

  return (
    <section aria-labelledby="live-heading" className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="live-heading" className={`${cardTitle} flex items-center gap-2`}>
          <Radio aria-hidden="true" className="h-5 w-5 text-red-600 dark:text-red-400" />
          Live updates
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {open && <span className={`${badge} ${tone.green}`}>Live</span>}
          {endedAt && <span className={`${badge} ${tone.slate}`}>Ended {when(endedAt)}</span>}
          {open && canEnd && (
            <button type="button" className={buttonDanger} disabled={busy} onClick={() => void end()}>
              End the live blog
            </button>
          )}
        </div>
      </div>

      {!published && <p className={hint}>Updates are posted once the live blog is published. Its text here is the intro readers see above them.</p>}
      {published && <p className={hint}>Until the reader&apos;s live page is ready, readers see the story&apos;s intro only, not its updates.</p>}

      {open && canPost && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-[#2b2f36]">
          <h3 className="text-sm font-bold">{editing ? "Change the update" : "A new update"}</h3>
          <label className={label}>
            Headline (optional)
            <input className={`${field} mt-1`} lang={language} maxLength={HEADLINE_MAX} value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </label>
          {editor && (
            <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1.5">
              {tool("Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
              {tool("Italic", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
              {tool("Link", () => void addLink(editor), editor.isActive("link"))}
              {tool("Image", addImage)}
            </div>
          )}
          {picking && (
            <ImagePicker
              mode="image"
              language={language}
              onClose={() => setPicking(false)}
              onPick={(imageId, ratio) => {
                editor?.chain().focus().insertContent({ type: "image", attrs: { id: imageId, ratio } }).run();
                setPicking(false);
              }}
            />
          )}
          <EditorContent editor={editor} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={keyEvent} onChange={(e) => setKeyEvent(e.target.checked)} /> Key event
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin it at the top
            </label>
            <div className="ml-auto flex gap-2">
              {editing && (
                <button type="button" className={button} onClick={() => startOver(null)}>
                  Cancel
                </button>
              )}
              <button type="submit" className={buttonPrimary} disabled={busy || !editor}>
                {editing ? "Save the change" : "Post the update"}
              </button>
            </div>
          </div>
        </form>
      )}

      <ActionMessage message={message} />

      {loadError && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {loadError}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}
      {updates === null && !loadError && <p role="status" className={hint}>Loading the updates…</p>}
      {updates !== null && updates.length === 0 && !loadError && <p className={hint}>No updates yet.</p>}
      {updates !== null && updates.length > 0 && (
        <ol aria-label="Updates, newest first" className="space-y-3">
          {updates.map((u) => (
            <li key={u.id} className={`${item} space-y-1.5 ${u.removed_at ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={hint}>
                  {when(u.posted_at)}
                  {u.edited_at ? " · changed" : ""}
                </span>
                {u.is_pinned && <span className={`${badge} ${tone.blue}`}>Pinned</span>}
                {u.is_key_event && <span className={`${badge} ${tone.amber}`}>Key event</span>}
                {u.removed_at && <span className={`${badge} ${tone.red}`}>Removed</span>}
              </div>
              {u.headline && (
                <p className="font-semibold" lang={language}>
                  {u.headline}
                </p>
              )}
              {textBlocks(u.body).map((text, i) => (
                <p key={i} className="text-sm" lang={language}>
                  {text}
                </p>
              ))}
              {storyImageIds(u.body).length > 0 && <p className={hint}>With an image from the library.</p>}
              {u.removed_at && (
                <p className="text-xs text-red-700 dark:text-red-300">
                  Removed {when(u.removed_at)}: {u.removed_reason}
                </p>
              )}
              {!u.removed_at && ((open && canPost) || canRemove) && (
                <div className="flex gap-2 pt-1">
                  {open && canPost && (
                    <button type="button" className={button} disabled={busy} onClick={() => startOver(u)}>
                      Edit
                    </button>
                  )}
                  {canRemove && (
                    <button type="button" className={buttonDanger} disabled={busy} onClick={() => void remove(u)}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
