"use client";

import { useState } from "react";
import {
  ENTERED_CHANNELS,
  GRIEVANCE_CATEGORIES,
  GRIEVANCE_LIMITS,
  type EnteredChannel,
  type GrievanceCategory,
} from "@timesprime/shared/config/grievances";
import { deskCall } from "../desk/deskClient";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { button, buttonPrimary, field, hint, label } from "../ui/styles";
import { categoryLabel, channelLabel, type Grievance } from "./grievanceClient";

// "Add a grievance" (Panel 7 design §4): one that arrived by email, post or another way, typed in by
// the officer. Its clocks run from when it arrived, which the officer gives.

export default function AddGrievanceForm({ onAdded, onCancel }: { onAdded: (g: Grievance) => void; onCancel: () => void }) {
  const [channel, setChannel] = useState<EnteredChannel>("email");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [aboutUrl, setAboutUrl] = useState("");
  const [category, setCategory] = useState<GrievanceCategory>("factual_error");
  const [body, setBody] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await deskCall<{ grievance: Grievance }>("/api/admin/compliance/grievances", {
      method: "POST",
      body: JSON.stringify({
        channel,
        language,
        name,
        email,
        about_url: aboutUrl.trim() || null,
        category,
        body,
        received_at: receivedAt ? new Date(receivedAt).toISOString() : null,
        acknowledged,
      }),
    });
    setBusy(false);
    if (!res.ok || !res.data) return setMessage({ ok: false, text: res.error ?? "The grievance was not added." });
    onAdded(res.data.grievance);
  };

  return (
    <form onSubmit={submit} aria-label="Add a grievance" className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-[#2b2f36]">
      <div className="space-y-1">
        <h3 className="text-sm font-bold">Add a grievance received another way</h3>
        <p className={hint}>For one that came by email, post or another way. The form&apos;s grievances arrive here by themselves.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          How it arrived
          <select value={channel} onChange={(e) => setChannel(e.target.value as EnteredChannel)} className={`${field} mt-1`}>
            {ENTERED_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {channelLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          When it arrived (your clock)
          <input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={`${field} mt-1`} />
          <span className={`${hint} mt-1 block`}>Empty: now. The clocks run from this time.</span>
        </label>
        <label className={label}>
          Its language
          <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "hi")} className={`${field} mt-1`}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Complainant&apos;s name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={GRIEVANCE_LIMITS.name} required className={`${field} mt-1`} />
        </label>
        <label className={label}>
          Their email, to reply to
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={GRIEVANCE_LIMITS.email} required className={`${field} mt-1`} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          What it is about
          <select value={category} onChange={(e) => setCategory(e.target.value as GrievanceCategory)} className={`${field} mt-1`}>
            {GRIEVANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          The story&apos;s address (optional)
          <input value={aboutUrl} onChange={(e) => setAboutUrl(e.target.value)} maxLength={GRIEVANCE_LIMITS.aboutUrl} placeholder="https://timesprime247.com/india/…" className={`${field} mt-1`} />
        </label>
      </div>
      <label className={label}>
        The grievance, as they wrote it
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={GRIEVANCE_LIMITS.body} required rows={5} className={`${field} mt-1`} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        I have already acknowledged it to them
      </label>
      <ActionMessage message={message} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={button}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={buttonPrimary}>
          {busy ? "Adding…" : "Add the grievance"}
        </button>
      </div>
    </form>
  );
}
