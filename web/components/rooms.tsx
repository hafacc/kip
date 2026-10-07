"use client";

import type { ReactElement } from "react";
import { LuBed, LuChevronRight } from "react-icons/lu";
import { formatDateRange } from "../utils/format";
import { listingTypeIcon } from "../utils/listings";
import { roomList, roomOf, wholePlaceLabel } from "../utils/rooms";
import type {
  AvailabilityWindow,
  Listing,
  ListingPhoto,
  ListingType,
  PortalRoom,
} from "../utils/types";
import CoverPhoto from "./cover-photo";
import { Row } from "./ui/list";

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

/** What a set of dates offers, as an icon and a name. */
export function Offer({
  type,
  room,
  label,
}: {
  type: ListingType;
  room: boolean;
  label: string;
}): ReactElement {
  const Icon = room ? LuBed : listingTypeIcon(type);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold">
      <Icon size={14} className="shrink-0 text-muted" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** A room's cover, or a bed in a disc, so rows share one left edge either way. */
export function RoomThumb({
  photos,
}: {
  photos: readonly ListingPhoto[];
}): ReactElement {
  return (
    <CoverPhoto
      photo={photos[0]}
      className="h-10 w-10 shrink-0"
      fallback={
        <span className="bg-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent-ink">
          <LuBed size={18} />
        </span>
      }
    />
  );
}

/** One room in a host's list; opens that room. */
export function RoomRow({
  name,
  note,
  photos,
  onOpen,
}: {
  name: string;
  note: string;
  photos: readonly ListingPhoto[];
  onOpen: () => void;
}): ReactElement {
  return (
    <Row onClick={onOpen} ariaLabel={name}>
      <RoomThumb photos={photos} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold">
          {name}
        </span>
        {note ? (
          <span className="block truncate text-sm text-muted">{note}</span>
        ) : null}
      </span>
      <LuChevronRight className="shrink-0 text-faint" />
    </Row>
  );
}

/** The heading over one group of dates: a room with its cover and note, or the whole place. */
export function OfferHeading({
  type,
  room,
}: {
  type: ListingType;
  room: PortalRoom | null;
}): ReactElement {
  return (
    <div className="flex items-center gap-3 px-1">
      {room ? (
        <CoverPhoto
          photo={room.photos[0]}
          className="h-14 w-14 shrink-0 rounded-[1.125rem]!"
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-bold">
          {room ? room.name : wholePlaceLabel(type)}
        </span>
        {room?.note ? (
          <span className="block text-sm text-muted">{room.note}</span>
        ) : null}
      </span>
    </div>
  );
}
