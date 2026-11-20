"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

// A password field with an eye button (the owner, 20 Nov 2026): it shows what was typed, and hides
// it again, so a person can check their password before they send it. The eye is a real button,
// reached with Tab, named "Show password" or "Hide password", and it says whether the password is
// shown (aria-pressed). The field keeps its own label and autocomplete, so password managers still
// fill it.

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Classes for the box around the field and its button (a margin, for instance). */
  wrapperClassName?: string;
};

export default function PasswordInput({ className = "", wrapperClassName = "", ...input }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input {...input} type={shown ? "text" : "password"} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setShown((now) => !now)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={input.id}
        title={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:text-slate-900 focus-visible:text-slate-900 dark:text-slate-400 dark:hover:text-white dark:focus-visible:text-white"
      >
        {shown ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
      </button>
    </div>
  );
}
