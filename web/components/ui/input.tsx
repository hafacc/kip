"use client";

import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";

// text-base (≥16px) so iOS Safari doesn't zoom on focus. A suffix holding WORDS
// rather than a glyph needs the text kept further clear of it, which is what
// `wideSuffix` is for — the gutter can't just be widened for everyone, or the
// handle field's tick sits in a hole.
export default function Input({
  prefix,
  suffix,
  wideSuffix = false,
  invalid = false,
  className = "",
  ...props
  // `ComponentPropsWithRef` rather than `InputHTMLAttributes` so a caller can
  // hold the element — React 19 passes `ref` through as an ordinary prop.
}: ComponentPropsWithRef<"input"> & {
  prefix?: ReactNode;
  suffix?: ReactNode;
  wideSuffix?: boolean;
  invalid?: boolean;
}): ReactElement {
  const base =
    "h-11 w-full rounded-xl border border-border bg-surface text-base outline-none transition focus:ring-2";
  const tone = invalid
    ? "border-danger focus:border-danger focus:ring-danger/20"
    : "border-border focus:border-accent focus:ring-accent/20";
  // Always the same tree, adorned or not. Branching on `prefix || suffix` gave
  // the input two different positions in the element tree, so an adornment that
  // comes and goes — one shown only while the field is empty, say — REMOUNTED
  // the input on the first keystroke and dropped focus to the body. On a phone
  // that closes the keyboard after one character.
  return (
    <div className="relative w-full">
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">
          {prefix}
        </span>
      ) : null}
      <input
        aria-invalid={invalid || undefined}
        className={`${base} ${tone} ${prefix ? "pl-8" : "pl-3.5"} ${suffix ? (wideSuffix ? "pr-24" : "pr-10") : "pr-3.5"} ${className}`}
        {...props}
      />
      {suffix ? (
        <span className="absolute inset-y-0 right-3.5 flex items-center">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

// The same shell for prose. Not a variant of the input above: a textarea has no
// adornments, and its height is the caller's business rather than the shared
// 44px every control otherwise stands at.
export function Textarea({
  className = "",
  ...props
}: ComponentPropsWithRef<"textarea">): ReactElement {
  return (
    <textarea
      className={`w-full rounded-xl border border-border bg-surface p-3.5 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 ${className}`}
      {...props}
    />
  );
}
