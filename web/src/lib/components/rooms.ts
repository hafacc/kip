import { formatDateRange } from "../format";
import { roomList, roomOf, wholePlaceLabel } from "../rooms";
import type { AvailabilityWindow, Listing, PortalRoom } from "../types";

/** Whether a place is split into rooms at all. */
export function hasRooms(listing: Pick<Listing, "rooms">): boolean {
  return Object.keys(listing.rooms).length > 0;
}

/** A host's dates in reading order: by start, the whole place first, then room order. */
export function sortForHost(
  listing: Pick<Listing, "rooms">,
  windows: readonly AvailabilityWindow[],
  direction: "soonest" | "latest" = "soonest",
): AvailabilityWindow[] {
  const position = new Map<string, number>(
    roomList(listing).map((room, index) => [room.id, index + 1]),
  );
  const rank = (window: AvailabilityWindow): number =>
    window.roomId === null
      ? 0
      : (position.get(window.roomId) ?? position.size + 1);
  const sign = direction === "soonest" ? 1 : -1;
  return [...windows].sort(
    (left, right) =>
      sign * left.start.localeCompare(right.start) || rank(left) - rank(right),
  );
}

export type OfferGroup<W> = {
  // Null is the whole place.
  readonly room: PortalRoom | null;
  readonly windows: readonly W[];
};

/**
 * Split dates into the whole place's, then each room's in the owner's order.
 *
 * Groups with no dates are left out, and so are dates naming a room the place
 * no longer has — labelling those as the whole place would offer something
 * nobody put up.
 */
export function groupByOffer<W extends { readonly roomId: string | null }>(
  rooms: readonly PortalRoom[],
  windows: readonly W[],
): OfferGroup<W>[] {
  const groups: OfferGroup<W>[] = [
    { room: null, windows: windows.filter((window) => window.roomId === null) },
    ...rooms.map((room) => ({
      room,
      windows: windows.filter((window) => window.roomId === room.id),
    })),
  ];
  return groups.filter((group) => group.windows.length > 0);
}

/**
 * Why a set of dates can't be added, in the host's terms.
 *
 * `adding` is the room the new dates are for, or null for the whole place.
 * `several` says more than one room is being added at once, so a clash within
 * one of them has to say which.
 */
export function clashNote(
  listing: Pick<Listing, "rooms" | "type">,
  adding: string | null,
  clash: AvailabilityWindow,
  several = false,
): string {
  const range = formatDateRange(clash.start, clash.end);
  const whole = wholePlaceLabel(listing.type).toLowerCase();
  const room = roomOf(listing, clash.roomId);
  if (adding === null && clash.roomId !== null) {
    return `Overlaps ${room ? `the ${room.name}'s` : "a room's"} ${range} dates. The ${whole} can't be free while a room has its own dates.`;
  } else if (adding !== null && clash.roomId === null) {
    return `Overlaps the ${whole}'s ${range} dates. A room can't have its own dates while the ${whole} is free.`;
  } else if (several && room) {
    return `Overlaps the ${room.name}'s ${range} dates.`;
  } else {
    return `Overlaps your ${range} dates.`;
  }
}
