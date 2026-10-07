import type {
  AvailabilityWindow,
  Listing,
  ListingType,
  PortalRoom,
  Room,
} from "./types";

type StoredRoom = Partial<Omit<Room, "id">>;

/** Read a listing's stored `rooms` map, tolerating a place that has none. */
export function toRooms(raw: unknown): Record<string, Room> {
  const stored = (raw ?? {}) as Record<string, StoredRoom | null>;
  const rooms: Record<string, Room> = {};
  for (const [id, room] of Object.entries(stored)) {
    if (room) {
      rooms[id] = {
        id,
        name: room.name ?? "",
        note: room.note ?? "",
        photos: room.photos ?? [],
        publicPortalId: room.publicPortalId ?? null,
        order: room.order ?? 0,
      };
    }
  }
  return rooms;
}

/** Whether a place of this type may be split into named rooms. */
export function canHaveRooms(type: ListingType): boolean {
  return type !== "ROOM";
}

/** A place's rooms in the owner's order. */
export function roomList(listing: Pick<Listing, "rooms">): Room[] {
  return Object.values(listing.rooms).sort(
    (left, right) =>
      left.order - right.order || left.name.localeCompare(right.name),
  );
}

/** The order value that puts a new room last. */
export function nextRoomOrder(rooms: Listing["rooms"]): number {
  return Object.values(rooms).reduce(
    (highest, room) => Math.max(highest, room.order + 1),
    0,
  );
}

/** Label for dates that offer the place whole rather than one room. */
export function wholePlaceLabel(type: ListingType): string {
  switch (type) {
    case "HOUSE":
      return "Whole house";
    case "FLAT":
      return "Whole flat";
    case "ROOM":
      return "Whole place";
  }
}

/** The room a set of dates offers, or null for the whole place or a room since removed. */
export function roomOf(
  listing: Pick<Listing, "rooms">,
  roomId: string | null,
): Room | null {
  return roomId === null ? null : (listing.rooms[roomId] ?? null);
}

/** What a set of dates offers, in words: the room's name or the whole-place label. */
export function offerLabel(
  listing: Pick<Listing, "rooms" | "type">,
  roomId: string | null,
): string {
  return roomOf(listing, roomId)?.name ?? wholePlaceLabel(listing.type);
}

/** What a set of dates counts as in a search: a room's dates are a room. */
export function offeredType(
  listing: Pick<Listing, "type">,
  window: Pick<AvailabilityWindow, "roomId">,
): ListingType {
  return window.roomId === null ? listing.type : "ROOM";
}

/** A room stripped to what a share-link visitor may see. */
export function toPortalRoom(room: Room): PortalRoom {
  return {
    id: room.id,
    name: room.name,
    note: room.note,
    photos: [...room.photos],
  };
}

export type DateRange = {
  readonly start: string;
  readonly end: string;
  // Null or absent is the whole place.
  readonly roomId?: string | null;
};

/**
 * Find the first existing range a new one would clash with.
 *
 * The whole place clashes with every range on it; a room clashes with its own
 * ranges and with whole-place ones; two different rooms overlap freely. `end`
 * is exclusive, so ranges that merely touch are allowed. The window returned
 * says what was hit: its `roomId` (null for the whole place) and its dates.
 *
 * Client-side because a rule can't query sibling documents, and the only
 * person a clash hurts is the owner whose calendar it is.
 */
export function findOverlap(
  windows: readonly AvailabilityWindow[],
  range: DateRange,
  skipId?: string,
): AvailabilityWindow | null {
  const roomId = range.roomId ?? null;
  return (
    windows.find(
      (window) =>
        window.id !== skipId &&
        range.start < window.end &&
        window.start < range.end &&
        (roomId === null || window.roomId === null || window.roomId === roomId),
    ) ?? null
  );
}

export type RoomClash = {
  // Null is the whole place being added.
  readonly roomId: string | null;
  readonly clash: AvailabilityWindow;
};

/** Clashes for one range added to each of several rooms (null = the whole place). */
export function findOverlaps(
  windows: readonly AvailabilityWindow[],
  range: { readonly start: string; readonly end: string },
  roomIds: readonly (string | null)[],
): RoomClash[] {
  const clashes: RoomClash[] = [];
  for (const roomId of roomIds) {
    const clash = findOverlap(windows, { ...range, roomId });
    if (clash) clashes.push({ roomId, clash });
  }
  return clashes;
}
