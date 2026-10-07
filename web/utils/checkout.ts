import { endedWithin, STAY_SIGHT_DAYS } from "./format";
import type { Booking } from "./types";

/** The key of the instructions for a place as a whole; any other key is a room id. */
export const PLACE_KEY = "place";

/** Longest instructions the rules accept. */
export const CHECKOUT_MAX = 2000;

/** A place's check-out instructions by key: {@link PLACE_KEY} or a room id. */
export type CheckoutMap = Readonly<Record<string, string>>;

/** What a guest may read for one stay; null where nothing is written or allowed. */
export type StayCheckout = {
  readonly place: string | null;
  readonly room: string | null;
  // The room the stay is in, or null for the whole place.
  readonly roomId: string | null;
};

/** One block of instructions to show a guest; `label` is null when it needs none. */
export type CheckoutPart = {
  readonly label: string | null;
  readonly text: string;
};

/**
 * Lay out a stay's instructions: the place's first, then the room's.
 *
 * The room's part is named only when both exist, since on its own there is
 * nothing to tell it apart from.
 */
export function checkoutParts(
  place: string | null,
  room: string | null,
  roomName: string | null,
): CheckoutPart[] {
  const parts: CheckoutPart[] = [];
  if (place) parts.push({ label: null, text: place });
  if (room) parts.push({ label: place ? roomName : null, text: room });
  return parts;
}

/**
 * Whether the rules still let a stay's guest read its instructions.
 *
 * Confirmed, and no more than {@link STAY_SIGHT_DAYS} past check-out in UTC.
 */
export function stayOpensCheckout(
  stay: Pick<Booking, "status" | "end">,
  now = Date.now(),
): boolean {
  return (
    stay.status === "CONFIRMED" && endedWithin(stay.end, STAY_SIGHT_DAYS, now)
  );
}
