"use client";

import { type ReactElement, useEffect, useRef, useState } from "react";
import {
  LuChevronDown,
  LuDownload,
  LuInbox,
  LuLogOut,
  LuMessageSquare,
  LuSettings,
  LuUser,
} from "react-icons/lu";
import { credentialed } from "../utils/feedback";
import { useInstall } from "../utils/install";
import { useKip } from "../utils/store";
import Avatar from "./avatar";
import { useDialog } from "./dialog";
import FeedbackSheet from "./feedback-sheet";
import { useLeave } from "./use-leave";

// Only shown once signed in (the app gates on auth). Sign-in itself lives on
// the WelcomeScreen, so this is the profile menu: your profile, Settings (the
// dock has no room for it), feedback, installing kip where that is possible,
// and sign-out.
export default function AuthMenu(): ReactElement | null {
  const {
    user,
    anonymous,
    email,
    doors,
    emailVerified,
    admin,
    unreadFeedback,
    profile,
    signOut,
    setView,
    navigate,
  } = useKip();
  const { leave, leaving } = useLeave();
  const { ready, byHand, install } = useInstall();
  const { alert } = useDialog();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);

  const name = profile?.displayName ?? user?.displayName ?? null;
  const photoURL = profile?.photoURL ?? user?.photoURL ?? null;

  async function doSignOut() {
    // Leaving is a teardown, not a sign-out, so it shares Settings' flow. The
    // menu stays open meanwhile, so "Leaving…" has somewhere to show until the
    // sign-out unmounts it.
    if (anonymous) {
      await leave();
      return;
    }
    setOpen(false);
    try {
      await signOut();
    } catch (error) {
      console.error(error);
    }
  }

  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const items = () =>
      Array.from(
        menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
    items()[0]?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const all = items();
        const at = all.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        all[(at + step + all.length) % all.length]?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // portal/continue render neither the nav stack nor Settings, so every row
  // would be a dead tap.
  if (
    typeof window !== "undefined" &&
    /\/(portal|continue)\/?$/.test(window.location.pathname)
  ) {
    return null;
  }
  // A nameless ANONYMOUS session gets no menu, and wants none: it holds no
  // profile, no ask and no friends, so leaving would swap one empty anonymous
  // account for another. A nameless account with a credential keeps it —
  // Settings and the exit live only here, and the name sheet can be dismissed.
  if (!user || (anonymous && !name)) return null;

  return (
    <div className="relative">
      <button
        type="button"
        ref={trigger}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="You"
        className="flex h-10 items-center gap-0.5 rounded-full pr-1 transition hover:opacity-80"
      >
        <Avatar
          name={name ?? email ?? ""}
          photoURL={photoURL}
          className="h-9 w-9 text-sm shadow-soft"
        />
        <LuChevronDown className="shrink-0 text-muted" size={14} />
        {unreadFeedback && !open ? (
          <span className="absolute right-5 top-0.5 size-2 rounded-full bg-accent ring-2 ring-bg" />
        ) : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            ref={menu}
            role="menu"
            aria-label="You"
            className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl bg-surface p-1.5 shadow-panel"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (user) navigate({ kind: "person", id: user.uid });
                setOpen(false);
              }}
              className="flex h-11 w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[0.9375rem] font-medium text-text hover:bg-surface-hover"
            >
              <LuUser className="text-muted" />
              <span>Your profile</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setView("settings");
                setOpen(false);
              }}
              className="flex h-11 w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[0.9375rem] font-medium text-text hover:bg-surface-hover"
            >
              <LuSettings className="text-muted" />
              <span>Settings</span>
            </button>
            {/* Only the operator, and only the rules make that true: the
                fragment this opens is guessable, and reaching it without the
                role renders an empty list rather than anything. */}
            {admin ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setView("feedback");
                  setOpen(false);
                }}
                className="flex h-11 w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[0.9375rem] font-medium text-text hover:bg-surface-hover"
              >
                <LuInbox className="text-muted" />
                <span>Feedback inbox</span>
                {/* A dot, not a count: how MANY are waiting doesn't change what
                    you do about them, and a number would cost reading the whole
                    collection to draw it. */}
                {unreadFeedback ? (
                  <span className="ml-auto size-2 shrink-0 rounded-full bg-accent">
                    {/* Read out, where an aria-label on a roleless span is
                        simply dropped. */}
                    <span className="sr-only">unread</span>
                  </span>
                ) : null}
              </button>
            ) : null}
            {/* The rules refuse a report from an identity a page load mints, so
                the row is hidden rather than offered and then denied. What that
                costs is the visitor best placed to report a broken share link,
                which is the trade the credential gate makes everywhere. */}
            {credentialed(doors, emailVerified) ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFeedback(true);
                  setOpen(false);
                }}
                className="flex h-11 w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[0.9375rem] font-medium text-text hover:bg-surface-hover"
              >
                <LuMessageSquare className="text-muted" />
                <span>Send feedback</span>
              </button>
            ) : null}
            {/* Only where it can do something. Chrome hands over a prompt and
                this opens it; Safari has no such event, so on an iPhone the row
                says where the control actually is rather than offering a button
                that cannot work. Installed already, neither shows. */}
            {ready || byHand ? (
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setOpen(false);
                  if (ready) await install();
                  else {
                    await alert({
                      title: "Add kip to your Home Screen",
                      body: "Tap the Share button in Safari, then Add to Home Screen. kip opens like an app after that, and keeps working when you have no signal.",
                    });
                  }
                }}
                className="flex h-11 w-full items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[0.9375rem] font-medium text-text hover:bg-surface-hover"
              >
                <LuDownload className="text-muted" />
                <span>Install kip</span>
              </button>
            ) : null}
            {/* Everyone gets an exit, and it is the one thing in this menu
                that reads as an action rather than a destination. What differs
                is what it MEANS: with a credential it is an ordinary sign-out;
                without one there is no way back in, so leaving is deletion and
                the word says so before the confirm does. Hiding it from
                unverified sessions left the people it matters most to with no
                way out of the menu at all. */}
            <button
              type="button"
              role="menuitem"
              onClick={doSignOut}
              className="mt-1 flex h-11 w-full items-center gap-3 whitespace-nowrap rounded-xl border-t border-border px-3 text-[0.9375rem] font-semibold text-danger hover:bg-danger-soft"
            >
              <LuLogOut />
              <span>
                {anonymous ? (leaving ? "Leaving…" : "Leave kip") : "Sign out"}
              </span>
            </button>
          </div>
        </>
      ) : null}
      <FeedbackSheet open={feedback} onClose={() => setFeedback(false)} />
    </div>
  );
}
