"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Open sheets, innermost last: a confirm raised over a sheet is its own sheet,
// and Escape or Tab belongs to the top one only.
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Portaled to <body>: a blurred/transformed ancestor becomes the containing
// block for `fixed`.
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  // Held rather than depended on: callers pass inline closures, and re-running
  // the effect would bounce focus out to the opener and back on every render.
  const close = useRef(onClose);
  close.current = onClose;
  // Read during render because a child's `autoFocus` has already moved focus
  // into the sheet by the time any effect of this one runs.
  if (open && !wasOpen.current && typeof document !== "undefined") {
    opener.current = document.activeElement;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const token = Symbol("sheet");
    stack.push(token);
    const node = panel.current;
    if (node && !node.contains(document.activeElement)) node.focus();

    function onKey(event: KeyboardEvent): void {
      if (stack[stack.length - 1] !== token || !node) return;
      if (event.key === "Escape") {
        close.current();
      } else if (event.key === "Tab") {
        const focusable = Array.from(
          node.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          node.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement;
        if (event.shiftKey && (current === first || current === node)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first.focus();
        } else if (!node.contains(current)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, [open]);

  // `document` is absent while the static export is rendered; `open` is false
  // there anyway, so this only guards the type.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className="relative flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-3xl bg-surface p-5 outline-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-panel sm:max-w-md sm:rounded-3xl sm:pb-5"
      >
        <span className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-surface-hover sm:hidden" />
        {title ? (
          <h2 className="mb-4 text-xl font-bold tracking-[-0.02em]">{title}</h2>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
