import type { PortalWindow } from "#lib/types.ts";

// Stands in for a window id when the ask carries no dates.
export const FRIEND_ONLY = "__friend__";

// What the visitor tapped, held while they make an account. A null window means
// they asked to connect rather than for specific dates.
export type Ask = { listingId: string | null; window: PortalWindow | null };

// Why an ask never went out, and the advice differs for every one: a refused
// write may mean a revoked link, a stall never reached the server, and the four
// slot causes are the world having moved rather than anything being wrong.
export type Failure =
  | "refused"
  | "stalled"
  | "taken"
  | "moved"
  | "removed"
  | "past";

// Said in the visitor's terms, never the rule's. The four slot causes read as
// news about the dates rather than as something they did wrong, because that is
// what they are — and each names what happened, since "unavailable" would leave
// someone wondering whether to wait or ask for something else.
export const FAILURE_COPY: Record<Failure, string> = {
  refused: "That didn't go through — the link may have been turned off.",
  stalled:
    "Couldn't reach kip just now, so nothing was sent. Check your connection.",
  taken: "Someone else took those dates while you were deciding.",
  moved: "Those dates changed, so nothing was sent. Take another look.",
  removed: "Those dates aren't offered any more.",
  past: "Those dates have already been and gone.",
};

// Everything about the visitor's relationship with this host, answered in one
// go. Dates stay a LIST rather than a flag, or one pending friend request
// suppresses every Request button on the page — bookings have auto-ids and
// nothing stops a visitor asking for several ranges.
//
// Null means not answered YET, which is why the connect control waits for it
// rather than guessing: the three states are mutually exclusive, and the wrong
// guess offers an ask that can only be refused.
export type Standing = {
  windowIds: readonly string[];
  confirmed: boolean;
  connectPending: boolean;
  friend: boolean;
};

// What the connect control has to say. `none` covers the host themselves and
// anyone already connected — neither has anything left to ask for. `unknown` is
// the lookup not having answered yet, where drawing an ask would be a guess.
export type Connect = "ask" | "sent" | "none" | "unknown";

export type OnAsk = (
  listingId: string | null,
  window: PortalWindow | null,
) => void;
